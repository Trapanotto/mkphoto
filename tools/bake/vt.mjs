// swisstopo Basiskarte (Vektorkacheln, OGD): Laden mit Cache und Umrechnung in LV95
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';
import { toLV95 } from './lv95.mjs';

const URL = 'https://vectortiles.geo.admin.ch/tiles/ch.swisstopo.base.vt/v1.0.0/{z}/{x}/{y}.pbf';
const CACHE = '.cache/vt';

export const lonlatTile = (lon, lat, z) => {
  const n = 2 ** z, r = (lat * Math.PI) / 180;
  return { x: ((lon + 180) / 360) * n, y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n };
};

export async function getTile(z, x, y) {
  const p = `${CACHE}/${z}/${x}/${y}.pbf`;
  let buf;
  if (existsSync(p)) buf = readFileSync(p);
  else {
    const res = await fetch(URL.replace('{z}', z).replace('{x}', x).replace('{y}', y), { headers: { 'User-Agent': 'mkphoto-bake' } });
    buf = res.ok ? Buffer.from(await res.arrayBuffer()) : Buffer.alloc(0);
    mkdirSync(`${CACHE}/${z}/${x}`, { recursive: true });
    writeFileSync(p, buf);
  }
  if (!buf.length) return null;
  if (buf[0] === 0x1f) buf = gunzipSync(buf);
  return new VectorTile(new Pbf(buf));
}

// Alle Features der gewünschten Layer im LV95-Rechteck; Geometrie als Ringe/Linien in LV95 (E, N)
export async function features(e0, n0, e1, n1, z, layers, toWGS84, opts = {}) {
  const a = toWGS84(e0, n1), b = toWGS84(e1, n0);
  const t0 = lonlatTile(a.lon, a.lat, z), t1 = lonlatTile(b.lon, b.lat, z);
  const out = [];
  const jobs = [];
  for (let ty = Math.floor(t0.y); ty <= Math.floor(t1.y); ty++) for (let tx = Math.floor(t0.x); tx <= Math.floor(t1.x); tx++) jobs.push([tx, ty]);
  for (let i = 0; i < jobs.length; i += 8) {
    const tiles = await Promise.all(jobs.slice(i, i + 8).map(([x, y]) => getTile(z, x, y).then((t) => [x, y, t])));
    for (const [x, y, t] of tiles) {
      if (!t) continue;
      for (const ln of layers) {
        const L = t.layers[ln];
        if (!L) continue;
        for (let k = 0; k < L.length; k++) {
          const f = L.feature(k);
          const ext = f.extent, n = 2 ** z;
          let rings = f.loadGeometry();
          // Flächen auf die eigene Kachel beschneiden: der Puffer am Kachelrand würde sonst doppelte Objekte erzeugen
          if (opts.clip && f.type === 3) rings = rings.map((r) => clipRing(r, f.extent)).filter((r) => r.length >= 3);
          const geom = rings.map((ring) => ring.map((p) => {
            const lon = ((x + p.x / ext) / n) * 360 - 180;
            const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + p.y / ext)) / n))) * 180) / Math.PI;
            const { E, N } = toLV95(lat, lon);
            return [E, N];
          }));
          out.push({ layer: ln, type: f.type, props: f.properties, geom });
        }
      }
    }
  }
  return { list: out, tiles: jobs.length };
}

// Sutherland-Hodgman gegen das Kachelquadrat [0, ext]
function clipRing(ring, ext) {
  let pts = ring.map((p) => [p.x, p.y]);
  if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
  const edges = [[(p) => p[0] >= 0, (a, b) => { const t = (0 - a[0]) / (b[0] - a[0]); return [0, a[1] + t * (b[1] - a[1])]; }],
    [(p) => p[0] <= ext, (a, b) => { const t = (ext - a[0]) / (b[0] - a[0]); return [ext, a[1] + t * (b[1] - a[1])]; }],
    [(p) => p[1] >= 0, (a, b) => { const t = (0 - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), 0]; }],
    [(p) => p[1] <= ext, (a, b) => { const t = (ext - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), ext]; }]];
  for (const [inside, cut] of edges) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const ia = inside(a), ib = inside(b);
      if (ia) out.push(a);
      if (ia !== ib) out.push(cut(a, b));
    }
    pts = out;
    if (pts.length < 3) return [];
  }
  return pts.map(([x, y]) => ({ x, y }));
}
