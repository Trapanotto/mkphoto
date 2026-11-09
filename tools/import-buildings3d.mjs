// Downloads swissBUILDINGS3D 2.0 (DXF) from swisstopo for the Luzern game area and writes
// the buildings as one compressed triangle list: public/data/luzern/buildings3d.bin.gz
//
//   node tools/import-buildings3d.mjs            (Luzern)
//   node tools/import-buildings3d.mjs zermatt    (region from tools/regions/zermatt.json)
//
// Source: swissBUILDINGS3D 2.0, © swisstopo
//   https://data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.swissbuildings3d_2
//
// Output layout (little endian):
//   Int16 x, y, z per vertex, three vertices per triangle, in `unit` metres (0.05 m in Luzern), game coordinates
//   followed by Uint16 building index per triangle
// buildings3d.json holds the building types and the triangle count.
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';

const REGION = process.argv[2] ?? 'luzern';

/** Area, origin and DXF sheets per region; the newest edition of each sheet is used. */
const REGIONS = {
  luzern: {
    origin: { e: 2666010, n: 1211541 },
    base: 433.6,
    center: { x: 0, z: 0 },
    half: 800,
    sheets: ['1150-41', '1150-23'],
    replaceLandmarks: true,
  },
};
if (REGION !== 'luzern') {
  const cfg = JSON.parse(await readFile(new URL(`./regions/${REGION}.json`, import.meta.url), 'utf8'));
  const core = cfg.grids[0];
  REGIONS[REGION] = {
    origin: cfg.origin,
    base: cfg.baseLevel,
    center: { x: core.center.e - cfg.origin.e, z: cfg.origin.n - core.center.n },
    half: core.size / 2,
    sheets: cfg.buildingSheets,
    stacBbox: cfg.stacBbox,
    replaceLandmarks: false,
  };
}
const R = REGIONS[REGION];
// quantisation: 5 cm where the area fits Int16, coarser for larger areas (|coordinate| × Q must stay < 32767)
const extent = Math.max(Math.abs(R.center.x), Math.abs(R.center.z)) + R.half + 50;
const Q = Math.min(20, Math.floor(32000 / extent));
const ORIGIN = R.origin;
const LAKE_LEVEL = R.base;
const SHEETS = R.sheets;
/** Hand-made landmarks in Luzern replace these parts of the data. */
const BRIDGE_PATH = [[58.3, -75.4], [-12.3, 29.3], [-57.3, 62.9], [-55.4, 74.4]];
const TOWER = [-7, 38];

const CACHE = new URL('./.cache/', import.meta.url);
const OUT = new URL(`../public/data/${REGION}/`, import.meta.url);
const STAC = 'https://data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.swissbuildings3d_2/items';

async function sheetUrl(sheet) {
  const bbox = REGION === 'luzern' ? '8.25,47.0,8.36,47.1' : R.stacBbox ?? '7.6,45.9,7.9,46.1';
  const res = await (await fetch(`${STAC}?bbox=${bbox}&limit=100`)).json();
  const hrefs = res.features
    .flatMap((f) => Object.values(f.assets).map((a) => a.href))
    .filter((h) => h.endsWith(`_${sheet}_2056_5728.dxf.zip`))
    .sort();
  if (!hrefs.length) return null;
  return hrefs.at(-1);
}

async function dxfFor(sheet) {
  await mkdir(CACHE, { recursive: true });
  const url = await sheetUrl(sheet);
  if (!url) return null;
  const zip = new URL(url.split('/').pop(), CACHE);
  if (!existsSync(zip)) {
    console.log(`  downloading ${url.split('/').pop()}`);
    await writeFile(zip, Buffer.from(await (await fetch(url)).arrayBuffer()));
  }
  const dir = new URL(`${sheet}/`, CACHE);
  if (!existsSync(dir)) execFileSync('unzip', ['-o', '-q', zip.pathname, '-d', dir.pathname]);
  const list = execFileSync('ls', [dir.pathname]).toString().trim().split('\n').filter((f) => f.endsWith('.dxf'));
  return new URL(list[0], dir).pathname;
}

const distToPath = (x, z) => {
  let best = Infinity;
  for (let i = 0; i < BRIDGE_PATH.length - 1; i++) {
    const [ax, az] = BRIDGE_PATH[i];
    const [bx, bz] = BRIDGE_PATH[i + 1];
    const ex = bx - ax, ez = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez)));
    best = Math.min(best, Math.hypot(x - ax - ex * t, z - az - ez * t));
  }
  return best;
};

/** Reads all polyface meshes of one DXF file. */
async function readPolyfaces(file, onMesh) {
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  let code = null;
  let ent = null;
  let mesh = null;
  let v = null;
  const flushVertex = () => {
    if (!mesh || !v) return;
    if (v.flag & 64) mesh.verts.push([v[10], v[20], v[30]]);
    else if (v.flag & 128) mesh.faces.push([v[71], v[72], v[73], v[74]].filter((k) => k).map((k) => Math.abs(k) - 1));
  };
  for await (const line of rl) {
    if (code === null) {
      code = +line.trim();
      continue;
    }
    const val = line.trim();
    const c = code;
    code = null;
    if (c === 0) {
      if (ent === 'VERTEX') flushVertex();
      v = null;
      if (val === 'POLYLINE') mesh = { layer: '', verts: [], faces: [] };
      else if (val === 'VERTEX') v = { flag: 0 };
      else if (val === 'SEQEND' && mesh) {
        onMesh(mesh);
        mesh = null;
      }
      ent = val;
      continue;
    }
    if (ent === 'POLYLINE' && c === 8 && mesh) mesh.layer = val;
    if (ent === 'VERTEX' && v) {
      if (c === 70) v.flag = +val;
      else if (c === 10 || c === 20 || c === 30 || (c >= 71 && c <= 74)) v[c] = +val;
    }
  }
}

const types = [];
const buildings = [];
const positions = [];
const owners = [];
let skipped = 0;

for (const sheet of SHEETS) {
  const file = await dxfFor(sheet);
  if (!file) {
    console.log(`  no DXF for sheet ${sheet}, skipped`);
    continue;
  }
  console.log(`Reading ${file.split('/').pop()}`);
  await readPolyfaces(file, (mesh) => {
    if (!mesh.verts.length || mesh.layer === 'Unterirdisches Gebaeude') return;
    const local = mesh.verts.map(([e, n, h]) => [e - ORIGIN.e, h - LAKE_LEVEL, ORIGIN.n - n]);
    const cx = local.reduce((s, p) => s + p[0], 0) / local.length;
    const cz = local.reduce((s, p) => s + p[2], 0) / local.length;
    const HALF = R.half;
    if (Math.abs(cx - R.center.x) > HALF - 5 || Math.abs(cz - R.center.z) > HALF - 5) return;
    if (local.some(([x, , z]) => Math.abs(x - R.center.x) > HALF || Math.abs(z - R.center.z) > HALF)) return;
    if (R.replaceLandmarks && ((mesh.layer === 'Bruecke gedeckt' && distToPath(cx, cz) < 20) || Math.hypot(cx - TOWER[0], cz - TOWER[1]) < 10)) {
      skipped++;
      return;
    }
    let t = types.indexOf(mesh.layer);
    if (t < 0) t = types.push(mesh.layer) - 1;
    const index = buildings.length;
    buildings.push(t);
    for (const face of mesh.faces) {
      for (let k = 1; k < face.length - 1; k++) {
        const tri = [local[face[0]], local[face[k]], local[face[k + 1]]];
        if (tri.some((p) => !p)) continue;
        const [a, b, c] = tri;
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const area2 = Math.hypot(nx, ny, nz);
        if (area2 < 0.02) continue; // degenerate
        if (ny / area2 < -0.5) continue; // floors are never seen
        for (const p of tri) positions.push(Math.round(p[0] * Q), Math.round(p[1] * Q), Math.round(p[2] * Q));
        owners.push(index);
      }
    }
  });
}

const tris = owners.length;
const pos = Int16Array.from(positions);
const own = Uint16Array.from(owners);
const raw = Buffer.concat([Buffer.from(pos.buffer), Buffer.from(own.buffer)]);
await writeFile(new URL('buildings3d.bin.gz', OUT), gzipSync(raw, { level: 9 }));
await writeFile(
  new URL('buildings3d.json', OUT),
  JSON.stringify({ unit: 1 / Q, triangles: tris, types, buildings, attribution: '© swisstopo (swissBUILDINGS3D 2.0)' }),
);
const size = (await readFile(new URL('buildings3d.bin.gz', OUT))).length;
console.log(`${buildings.length} buildings, ${tris} triangles, ${(raw.length / 1e6).toFixed(1)} MB raw, ${(size / 1e6).toFixed(1)} MB gzip, ${skipped} replaced by landmarks`);
