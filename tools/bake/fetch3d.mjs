// Gebäude (swissBUILDINGS3D) und Bäume (Vegetation) aus den swisstopo-3D-Tiles für das Kerngebiet
// eines Levels extrahieren und ins lokale LV95-Koordinatensystem umrechnen.
// Ausgabe: .cache/bake/<level>/buildings.glb (y-up, x=Ost, z=Süd, y=Höhe ü. M.), trees.json
// Aufruf: node tools/bake/fetch3d.mjs <level|all>
import { NodeIO, Document } from '@gltf-transform/core';
import { KHRDracoMeshCompression } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { bakeConfig, ALL_IDS } from './config.mjs';
import { toLV95, toWGS84 } from './lv95.mjs';

const BUILD = 'https://3d.geo.admin.ch/ch.swisstopo.swissbuildings3d.3d/v1/';
const VEG = 'https://3d.geo.admin.ch/ch.swisstopo.vegetation.3d/v1/';
const HTTP_CACHE = '.cache/http';
mkdirSync(HTTP_CACHE, { recursive: true });

const io = new NodeIO().registerExtensions([KHRDracoMeshCompression]).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});

async function cachedFetch(url) {
  const p = `${HTTP_CACHE}/${url.replace(/[^a-z0-9]+/gi, '_').slice(-180)}`;
  if (existsSync(p)) { const b = readFileSync(p); return b.length ? b : null; }
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(url);
      if (r.status === 404) { writeFileSync(p, Buffer.alloc(0)); return null; }
      if (!r.ok) throw new Error(r.status);
      const b = Buffer.from(await r.arrayBuffer());
      writeFileSync(p, b);
      return b;
    } catch (e) { if (a === 2) { console.warn('fetch fail', url, e.message); return null; } }
  }
}
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}

// ECEF -> geodätisch (WGS84)
const A = 6378137, F = 1 / 298.257223563, E2 = F * (2 - F), B = A * (1 - F), EP2 = (A * A - B * B) / (B * B);
function ecefToGeo(x, y, z) {
  const p = Math.hypot(x, y);
  const th = Math.atan2(z * A, p * B);
  const lat = Math.atan2(z + EP2 * B * Math.sin(th) ** 3, p - E2 * A * Math.cos(th) ** 3);
  const lon = Math.atan2(y, x);
  const N = A / Math.sqrt(1 - E2 * Math.sin(lat) ** 2);
  return { lat: (lat * 180) / Math.PI, lon: (lon * 180) / Math.PI, h: p / Math.cos(lat) - N };
}

// Tileset rekursiv durchlaufen; alle Inhalte, deren Region das Rechteck schneidet
async function collect(base, url, rect, out, depth = 0) {
  const buf = await cachedFetch(base + url);
  if (!buf) return;
  const ts = JSON.parse(buf.toString());
  const dir = url.includes('/') ? url.slice(0, url.lastIndexOf('/') + 1) : '';
  const walk = async (tile) => {
    const r = tile.boundingVolume?.region;
    if (r && (r[2] < rect[0] || r[0] > rect[2] || r[3] < rect[1] || r[1] > rect[3])) return;
    const uri = tile.content?.uri || tile.content?.url;
    if (uri) {
      if (uri.endsWith('.json')) await collect(base, dir + uri, rect, out, depth + 1);
      else out.push({ url: dir + uri, region: r });
    }
    for (const c of tile.children || []) await walk(c);
  };
  await walk(ts.root);
}

function rectRad(cfg, half) {
  const a = toWGS84(cfg.E0 - half, cfg.N0 - half), b = toWGS84(cfg.E0 + half, cfg.N0 + half);
  const c = toWGS84(cfg.E0 - half, cfg.N0 + half), d = toWGS84(cfg.E0 + half, cfg.N0 - half);
  const R = Math.PI / 180;
  return [Math.min(a.lon, c.lon) * R, Math.min(a.lat, d.lat) * R, Math.max(b.lon, d.lon) * R, Math.max(b.lat, c.lat) * R];
}

const local = (cfg, x, y, z) => {
  const g = ecefToGeo(x, y, z);
  const { E, N } = toLV95(g.lat, g.lon);
  return [E - cfg.E0, g.h, -(N - cfg.N0)];
};

async function buildings(cfg, dir) {
  const list = [];
  await collect(BUILD, 'tileset.json', rectRad(cfg, cfg.core), list);
  const b3dm = list.filter((t) => t.url.endsWith('.b3dm'));
  console.log(`  Gebäude: ${b3dm.length} Kacheln`);
  const pos = [], idx = [], bid = [], checks = [];
  let vbase = 0, buildingCount = 0;
  await pool(b3dm, 8, async (t) => {
    const b = await cachedFetch(BUILD + t.url);
    if (!b || b.slice(0, 4).toString() !== 'b3dm') return;
    const ftJ = b.readUInt32LE(12), ftB = b.readUInt32LE(16), btJ = b.readUInt32LE(20), btB = b.readUInt32LE(24);
    const ft = JSON.parse(b.slice(28, 28 + ftJ).toString().trim() || '{}');
    const bt = btJ ? JSON.parse(b.slice(28 + ftJ + ftB, 28 + ftJ + ftB + btJ).toString().trim() || '{}') : {};
    const rtc = ft.RTC_CENTER || [0, 0, 0];
    const glb = b.slice(28 + ftJ + ftB + btJ + btB);
    let doc;
    try { doc = await io.readBinary(new Uint8Array(glb)); } catch (e) { return; }
    const tileBuild = buildingCount; buildingCount += ft.BATCH_LENGTH || 1;
    for (const node of doc.getRoot().listNodes()) {
      const mesh = node.getMesh();
      if (!mesh) continue;
      const m = node.getWorldMatrix();
      for (const prim of mesh.listPrimitives()) {
        const P = prim.getAttribute('POSITION'), I = prim.getIndices(), BI = prim.getAttribute('_BATCHID');
        if (!P) continue;
        const n = P.getCount();
        const loc = new Float64Array(n * 3);
        const v = [0, 0, 0];
        for (let i = 0; i < n; i++) {
          P.getElement(i, v);
          // Knotenmatrix, dann y-up -> z-up, dann RTC
          const x = m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12];
          const y = m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13];
          const z = m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14];
          const [lx, ly, lz] = local(cfg, x + rtc[0], -z + rtc[1], y + rtc[2]);
          loc[i * 3] = lx; loc[i * 3 + 1] = ly; loc[i * 3 + 2] = lz;
        }
        // nur Gebäude im Kerngebiet
        let cx = 0, cz = 0;
        for (let i = 0; i < n; i++) { cx += loc[i * 3]; cz += loc[i * 3 + 2]; }
        cx /= n; cz /= n;
        if (Math.abs(cx) > cfg.core || Math.abs(cz) > cfg.core) continue;
        const start = vbase;
        // synchrones Anhängen (JS ist single-threaded zwischen awaits)
        for (let i = 0; i < n; i++) {
          pos.push(loc[i * 3], loc[i * 3 + 1], loc[i * 3 + 2]);
          bid.push(tileBuild + (BI ? BI.getScalar(i) : 0));
        }
        if (I) for (let i = 0; i < I.getCount(); i++) idx.push(start + I.getScalar(i));
        else for (let i = 0; i < n; i++) idx.push(start + i);
        vbase += n;
        if (bt.GELAENDEPUNKT && checks.length < 30) {
          let minY = Infinity; for (let i = 0; i < n; i++) minY = Math.min(minY, loc[i * 3 + 1]);
          checks.push(minY - bt.GELAENDEPUNKT[0]);
        }
      }
    }
  });
  checks.sort((a, b) => a - b);
  console.log(`  ${buildingCount} Gebäude, ${pos.length / 3} Vertices, ${idx.length / 3} Dreiecke; Sockel - Geländepunkt (Median): ${checks[checks.length >> 1]?.toFixed(2)} m`);
  // als GLB schreiben (Höhe absolut, Blender übernimmt)
  const doc = new Document();
  const buffer = doc.createBuffer();
  const P = doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buffer);
  const C = doc.createAccessor().setType('SCALAR').setArray(new Float32Array(bid)).setBuffer(buffer);
  const I = doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(idx)).setBuffer(buffer);
  const prim = doc.createPrimitive().setAttribute('POSITION', P).setAttribute('_BATCHID', C).setIndices(I)
    .setMaterial(doc.createMaterial('building'));
  const mesh = doc.createMesh('Buildings').addPrimitive(prim);
  doc.createScene().addChild(doc.createNode('Buildings').setMesh(mesh));
  await new NodeIO().write(`${dir}/buildings.glb`, doc);
}

async function trees(cfg, dir) {
  const list = [];
  await collect(VEG, 'tileset.json', rectRad(cfg, cfg.core), list);
  const i3dm = list.filter((t) => t.url.endsWith('.i3dm'));
  console.log(`  Vegetation: ${i3dm.length} Kacheln`);
  const out = [];
  const seen = new Set();
  await pool(i3dm, 8, async (t) => {
    const b = await cachedFetch(VEG + t.url);
    if (!b || b.slice(0, 4).toString() !== 'i3dm') return;
    const ftJ = b.readUInt32LE(12), ftB = b.readUInt32LE(16), btJ = b.readUInt32LE(20);
    const ft = JSON.parse(b.slice(32, 32 + ftJ).toString().trim());
    const bin = b.slice(32 + ftJ, 32 + ftJ + ftB);
    const bt = btJ ? JSON.parse(b.slice(32 + ftJ + ftB, 32 + ftJ + ftB + btJ).toString().trim() || '{}') : {};
    const n = ft.INSTANCES_LENGTH;
    const rtc = ft.RTC_CENTER || [0, 0, 0];
    const glbName = b.slice(32 + ftJ + ftB + btJ + b.readUInt32LE(24)).toString().replace(/\0/g, '').trim();
    const kind = /Tree-(\d+)/.exec(glbName)?.[1] || '0';
    for (let i = 0; i < n; i++) {
      let x, y, z;
      if (ft.POSITION) {
        const o = ft.POSITION.byteOffset + i * 12;
        x = bin.readFloatLE(o) + rtc[0]; y = bin.readFloatLE(o + 4) + rtc[1]; z = bin.readFloatLE(o + 8) + rtc[2];
      } else continue;
      const s = ft.SCALE ? bin.readFloatLE(ft.SCALE.byteOffset + i * 4) : 1;
      const [lx, ly, lz] = local(cfg, x, y, z);
      if (Math.abs(lx) > cfg.core || Math.abs(lz) > cfg.core) continue;
      const key = `${Math.round(lx * 2)},${Math.round(lz * 2)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([+lx.toFixed(1), +ly.toFixed(1), +lz.toFixed(1), +s.toFixed(2), +kind, bt.Height ? +bt.Height[i].toFixed(1) : 0]);
    }
  });
  console.log(`  ${out.length} Bäume`);
  writeFileSync(`${dir}/trees.json`, JSON.stringify(out));
}

const arg = process.argv[2] || 'luzern';
for (const id of arg === 'all' ? ALL_IDS : arg.split(',')) {
  const cfg = bakeConfig(id);
  const dir = `.cache/bake/${id}`;
  mkdirSync(dir, { recursive: true });
  console.log(`== ${id}`);
  await buildings(cfg, dir);
  await trees(cfg, dir);
}
