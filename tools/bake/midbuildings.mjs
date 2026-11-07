// Gebäude im Mittelring (ausserhalb des swissBUILDINGS3D-Kerns) aus den Grundrissen der swisstopo-Basiskarte:
// Grundriss + Höhe (render_height) -> Wände, Satteldach bei kleinen rechteckigen Bauten, sonst Flachdach mit Brüstung.
// Ausgabe: public/world/<id>/buildings_mid.glb (+ _s mit kleinerem Radius) mit _BATCHID/_RELH wie die Kerngebäude.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { NodeIO, Document } from '@gltf-transform/core';
import { KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { weld } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { bakeConfig, ALL_IDS } from './config.mjs';
import { toWGS84 } from './lv95.mjs';
import { features } from './vt.mjs';

const SKIP = new Set(['roof', 'underground', 'coverage', 'storage_tank', 'chimney', 'ventilation_shaft', 'covered_bridge']);

function demSampler(id) {
  const dir = `.cache/bake/${id}`;
  const meta = JSON.parse(readFileSync(`${dir}/meta.json`));
  const grids = ['core', 'mid', 'far'].map((n) => ({ ...meta.dem[n], data: new Float32Array(readFileSync(`${dir}/dem_${n}.f32`).buffer.slice(0)) }));
  const one = (g, x, y) => {
    const fx = (x + g.half) / g.step, fy = (g.half - y) / g.step;
    if (fx < 0 || fy < 0 || fx > g.n - 1.001 || fy > g.n - 1.001) return null;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, n = g.n, a = g.data;
    return (a[y0 * n + x0] * (1 - tx) + a[y0 * n + x0 + 1] * tx) * (1 - ty) + (a[(y0 + 1) * n + x0] * (1 - tx) + a[(y0 + 1) * n + x0 + 1] * tx) * ty;
  };
  return { meta, h: (x, y) => { for (const g of grids) { const v = one(g, x, y); if (v !== null) return v; } return null; } };
}

const area = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };

function clean(r) {
  const out = [];
  for (const p of r) { const q = out[out.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.25) out.push(p); }
  if (out.length > 2 && Math.hypot(out[0][0] - out.at(-1)[0], out[0][1] - out.at(-1)[1]) < 0.25) out.pop();
  return out;
}

async function build(id, radiusFull, radiusSmall) {
  const cfg = bakeConfig(id);
  const { meta, h } = demSampler(id);
  const H0 = JSON.parse(readFileSync(`public/world/${id}/world.json`)).H0;
  const core = meta.core, R = Math.min(radiusFull, meta.mid);
  const { list } = await features(cfg.E0 - R, cfg.N0 - R, cfg.E0 + R, cfg.N0 + R, 14, ['building'], toWGS84, { clip: true });
  // Ringe je Gebäude: äussere Ringe (in LV95 negative Fläche, da MVT y nach unten) + Löcher
  const blds = [];
  for (const f of list) {
    if (f.type !== 3 || SKIP.has(f.props.class) || (f.props.render_min_height || 0) > 0.5) continue;
    const rings = f.geom.map((r) => clean(r.map(([E, N]) => [E - cfg.E0, N - cfg.N0]))).filter((r) => r.length >= 3);
    let cur = null;
    for (const r of rings) {
      const a = area(r);
      if (a < 0) { cur = { outer: r.slice().reverse(), holes: [], hgt: f.props.render_height || 8 }; blds.push(cur); }
      else if (cur && a > 4) cur.holes.push(r.slice().reverse());
    }
  }
  const pos = [], rel = [], bid = [];
  const tri = (a, b, c, base, id) => { for (const p of [a, b, c]) { pos.push(p[0], p[1], p[2]); rel.push(p[1] - base); bid.push(id); } };
  const quadV = (a, b, base, top, id, roofCut = 0) => {
    // Wand von a nach b (Grundriss gegen Uhrzeigersinn -> Aussenseite rechts)
    const A0 = [a[0], base, -a[1]], B0 = [b[0], base, -b[1]], A1 = [a[0], top, -a[1]], B1 = [b[0], top, -b[1]];
    tri(A0, B0, B1, base, id); tri(A0, B1, A1, base, id);
  };
  let nb = 0, ng = 0, kept = 0;
  const stats = { full: 0, small: 0 };
  const smallIdx = [];
  for (const b of blds) {
    const o = b.outer;
    let cx = 0, cy = 0; for (const p of o) { cx += p[0]; cy += p[1]; } cx /= o.length; cy /= o.length;
    if (Math.max(Math.abs(cx), Math.abs(cy)) < core - 15) continue;              // Kern: echte 3D-Gebäude
    if (Math.max(Math.abs(cx), Math.abs(cy)) > R) continue;
    const A = Math.abs(area(o));
    if (A < 12) continue;
    let base = Infinity; for (const p of o) { const z = h(p[0], p[1]); if (z !== null) base = Math.min(base, z); }
    if (!isFinite(base)) continue;
    base = base - H0 - 0.4;
    const H = Math.max(3, b.hgt);
    const id = ++nb;
    const start = pos.length;
    // Satteldach: nahezu rechteckig (4 Ecken), nicht zu gross
    let gable = false;
    if (o.length === 4 && A < 700 && H < 24 && b.holes.length === 0) {
      const e = [0, 1, 2, 3].map((i) => Math.hypot(o[(i + 1) % 4][0] - o[i][0], o[(i + 1) % 4][1] - o[i][1]));
      const rect = Math.abs(e[0] - e[2]) < 0.2 * e[0] && Math.abs(e[1] - e[3]) < 0.2 * e[1];
      if (rect) {
        gable = true;
        const s = e[0] >= e[1] ? 0 : 1;                      // Firstrichtung entlang der längeren Seite
        const short = Math.min(e[0], e[1]);
        const rh = Math.min(short * 0.45, 6);
        const eave = base + 0.4 + Math.max(2.6, H - rh);
        const top = eave + rh;
        const ov = 0.5;                                       // Dachüberstand
        const P = o.map((p) => [p[0], p[1]]);
        const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        // Ecken so ordnen, dass P0-P1 eine Traufseite (lang) ist
        const Q = s === 0 ? P : [P[1], P[2], P[3], P[0]];
        const r0 = mid(Q[3], Q[0]), r1 = mid(Q[1], Q[2]);     // Firstpunkte über den Giebelseiten
        // Wände bis zur Traufe
        for (let i = 0; i < 4; i++) quadV(Q[i], Q[(i + 1) % 4], base, eave, id);
        // Giebeldreiecke
        const G = (a, b, r) => tri([a[0], eave, -a[1]], [b[0], eave, -b[1]], [r[0], top, -r[1]], base, id);
        G(Q[1], Q[2], r1); G(Q[3], Q[0], r0);
        // Dachflächen mit Überstand nach aussen
        const out = (p, c) => { const dx = p[0] - c[0], dy = p[1] - c[1], l = Math.hypot(dx, dy) || 1; return [p[0] + dx / l * ov, p[1] + dy / l * ov]; };
        const C = [cx, cy];
        const q = Q.map((p) => out(p, C));
        const ed = eave - ov * rh / (short / 2);
        const T = (p, y) => [p[0], y, -p[1]];
        const R0 = out(r0, mid(r0, r1)), R1 = out(r1, mid(r0, r1));
        tri(T(q[0], ed), T(q[1], ed), T(R1, top), base, id); tri(T(q[0], ed), T(R1, top), T(R0, top), base, id);
        tri(T(q[2], ed), T(q[3], ed), T(R0, top), base, id); tri(T(q[2], ed), T(R0, top), T(R1, top), base, id);
        ng++;
      }
    }
    if (!gable) {
      const top = base + 0.4 + H;
      const walls = (r) => { for (let i = 0; i < r.length; i++) quadV(r[i], r[(i + 1) % r.length], base, top, id); };
      walls(o); for (const hr of b.holes) walls(hr);
      // Flachdach
      const contour = o.map((p) => new THREE.Vector2(p[0], p[1]));
      const holes = b.holes.map((r) => r.map((p) => new THREE.Vector2(p[0], p[1])));
      const all = [...contour, ...holes.flat()];
      for (const [a, c, d] of THREE.ShapeUtils.triangulateShape(contour, holes)) {
        const P = [all[a], all[c], all[d]];
        tri([P[0].x, top, -P[0].y], [P[1].x, top, -P[1].y], [P[2].x, top, -P[2].y], base, id);
      }
      // Brüstung (aussen hochgezogen, Kennung -1 = Bauteil ohne Fenster)
      for (let i = 0; i < o.length; i++) {
        const a = o[i], c = o[(i + 1) % o.length];
        const s0 = pos.length;
        quadV(a, c, top, top + 0.6, id);
        for (let k = s0 / 3; k < pos.length / 3; k++) rel[k] = -1;
      }
    }
    kept++;
    if (Math.max(Math.abs(cx), Math.abs(cy)) < radiusSmall) smallIdx.push([start, pos.length]);
  }
  // Dreiecke mit falscher Orientierung (Ringrichtung) anhand der Normalen korrigieren: Wände nach aussen, Dächer nach oben
  // (Grundrisse sind gegen den Uhrzeigersinn in x/-z, dadurch zeigen alle Flächen bereits richtig; hier nur Kontrolle)
  const write = async (file, ranges) => {
    const P = [], Rl = [], Bi = [];
    for (const [a, b] of ranges) { for (let i = a; i < b; i++) P.push(pos[i]); for (let i = a / 3; i < b / 3; i++) { Rl.push(rel[i]); Bi.push(bid[i]); } }
    const n = P.length / 3;
    const N = new Float32Array(n * 3);
    for (let t = 0; t < n; t += 3) {
      const ax = P[t * 3], ay = P[t * 3 + 1], az = P[t * 3 + 2];
      const ux = P[t * 3 + 3] - ax, uy = P[t * 3 + 4] - ay, uz = P[t * 3 + 5] - az;
      const vx = P[t * 3 + 6] - ax, vy = P[t * 3 + 7] - ay, vz = P[t * 3 + 8] - az;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      for (let k = 0; k < 3; k++) { N[(t + k) * 3] = nx; N[(t + k) * 3 + 1] = ny; N[(t + k) * 3 + 2] = nz; }
    }
    const doc = new Document();
    const buf = doc.createBuffer();
    const acc = (arr, type) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', acc(new Float32Array(P), 'VEC3'))
      .setAttribute('NORMAL', acc(N, 'VEC3'))
      .setAttribute('_BATCHID', acc(new Float32Array(Bi), 'SCALAR'))
      .setAttribute('_RELH', acc(new Float32Array(Rl), 'SCALAR'))
      .setMaterial(doc.createMaterial('building_mid'));
    const mesh = doc.createMesh('BuildingsMid').addPrimitive(prim);
    doc.createScene().addChild(doc.createNode('BuildingsMid').setMesh(mesh));
    await doc.transform(weld());
    doc.createExtension(KHRDracoMeshCompression).setRequired(true).setEncoderOptions({ method: KHRDracoMeshCompression.EncoderMethod.SEQUENTIAL, encodeSpeed: 5, decodeSpeed: 5 });
    const io = new NodeIO().registerExtensions([KHRDracoMeshCompression]).registerDependencies({ 'draco3d.encoder': await draco3d.createEncoderModule() });
    await io.write(file, doc);
    return n / 3;
  };
  const tF = await write(`public/world/${id}/buildings_mid.glb`, [[0, pos.length]]);
  const tS = await write(`public/world/${id}/buildings_mid_s.glb`, smallIdx);
  console.log(`${id}: ${kept} Gebäude im Mittelring (${ng} Satteldächer), ${tF} Dreiecke, Handy ${tS}`);
}

const arg = process.argv[2] || 'all';
for (const id of arg === 'all' ? ALL_IDS : arg.split(',')) await build(id, 3500, 2200);
