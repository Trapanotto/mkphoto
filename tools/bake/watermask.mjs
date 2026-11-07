// Wassermaske pro Level: See-/Flussflächen der swisstopo-Basiskarte (Vektor), nur wo das Gelände auf Wasserhöhe liegt.
// Ausgabe: public/world/<level>/water_mask.png (Norden oben, Quadrat um level.water.at mit Halbkante radius)
//   R = Wasser (weiche Kante), G = Abstand zum Ufer (0..255 = 0..80 m) für Flachwasserfarbe
import sharp from 'sharp';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { bakeConfig, ALL_IDS } from './config.mjs';
import { toLV95, toWGS84 } from './lv95.mjs';
import { features } from './vt.mjs';

function dem(dir, meta, name) {
  const d = meta.dem[name];
  return { ...d, data: new Float32Array(readFileSync(`${dir}/dem_${name}.f32`).buffer.slice(0)) };
}
function sampleDem(g, x, y) {
  const fx = (x + g.half) / g.step, fy = (g.half - y) / g.step;
  if (fx < 0 || fy < 0 || fx > g.n - 1.001 || fy > g.n - 1.001) return null;
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, n = g.n, a = g.data;
  return (a[y0 * n + x0] * (1 - tx) + a[y0 * n + x0 + 1] * tx) * (1 - ty) + (a[(y0 + 1) * n + x0] * (1 - tx) + a[(y0 + 1) * n + x0 + 1] * tx) * ty;
}

const imgCache = new Map();
async function rawImg(path) {
  if (!imgCache.has(path)) {
    imgCache.set(path, existsSync(path) ? await sharp(path).removeAlpha().raw().toBuffer({ resolveWithObject: true }) : null);
  }
  return imgCache.get(path);
}

async function orthoColor(dir, meta, x, y) {
  const { core, chunk, mid, midChunk, far } = meta;
  let file, u, v;
  if (Math.abs(x) < core && Math.abs(y) < core) {
    const i = Math.floor((x + core) / chunk), j = Math.floor((core - y) / chunk);
    file = `core_${i}_${j}.jpg`; u = (x + core - i * chunk) / chunk; v = (core - y - j * chunk) / chunk;
  } else if (Math.abs(x) < mid && Math.abs(y) < mid) {
    const i = Math.floor((x + mid) / midChunk), j = Math.floor((mid - y) / midChunk);
    file = `mid_${i}_${j}.jpg`; u = (x + mid - i * midChunk) / midChunk; v = (mid - y - j * midChunk) / midChunk;
  } else {
    file = 'far.jpg'; u = (x + far) / (2 * far); v = (far - y) / (2 * far);
  }
  const im = await rawImg(`${dir}/ortho/${file}`);
  if (!im) return null;
  const { width: W, height: H } = im.info;
  const px = Math.min(W - 1, Math.max(0, Math.floor(u * W))), py = Math.min(H - 1, Math.max(0, Math.floor(v * H)));
  const k = (py * W + px) * 3;
  return [im.data[k], im.data[k + 1], im.data[k + 2]];
}

const isWaterColor = ([r, g, b]) => b > r * 0.95 && g > r * 0.95 && (b + g) / 2 - r > 6 && r < 150;

async function build(id) {
  const cfg = bakeConfig(id);
  const W = cfg.level.water;
  if (!W) return;
  const dir = `.cache/bake/${id}`;
  const meta = JSON.parse(readFileSync(`${dir}/meta.json`));
  const grids = ['core', 'mid', 'far'].map((n) => dem(dir, meta, n));
  const height = (x, y) => { for (const g of grids) { const h = sampleDem(g, x, y); if (h !== null) return h; } return 9999; };
  const { E, N } = toLV95(W.at[0], W.at[1]);
  const cx = E - cfg.E0, cy = N - cfg.N0, R = W.radius;
  const wl = height(cx, cy);
  const size = 2048;
  const mpp = (2 * R) / size;
  // Wasserflächen rastern
  const z = R > 3000 ? 12 : R > 1200 ? 13 : 14;
  const { list } = await features(E - R - 50, N - R - 50, E + R + 50, N + R + 50, z, ['water', 'waterway'], toWGS84);
  const tx = (e, n) => [((e - (E - R)) / (2 * R)) * size, ((N + R - n) / (2 * R)) * size];
  const path = (g, close) => g.map((r) => r.map(([e, n], i) => { const [x, y] = tx(e, n); return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`; }).join('') + (close ? 'Z' : '')).join('');
  const body = list.map((f) => f.layer === 'water' && f.type === 3 ? `<path d="${path(f.geom, true)}" fill="#fff" fill-rule="evenodd"/>`
    : f.layer === 'waterway' && f.type === 2 && f.props.class === 'river' && f.props.brunnel !== 'tunnel' ? `<path d="${path(f.geom, false)}" fill="none" stroke="#fff" stroke-width="${(12 / mpp).toFixed(2)}" stroke-linecap="round"/>` : '').join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="100%" height="100%" fill="#000"/>${body}</svg>`;
  const vec = (await sharp(Buffer.from(svg), { unlimited: true }).flatten().extractChannel(0).raw().toBuffer());
  const out = Buffer.alloc(size * size);
  let wet = 0;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const k = j * size + i;
      const x = cx - R + ((i + 0.5) / size) * 2 * R, y = cy + R - ((j + 0.5) / size) * 2 * R;
      const h = height(x, y);
      // jenseits der Landesgrenze fehlen die Vektorflächen: dort ebenes Gelände auf Seehöhe als Wasser
      if (vec[k] < 20 && Math.max(Math.abs(x), Math.abs(y)) > meta.core && Math.abs(h - wl) < 0.8) vec[k] = 255;
      if (vec[k] < 20) continue;
      // höheres Gelände verdeckt die Wasserfläche ohnehin; ausschliessen nur tiefer liegende Gewässer (z. B. Rotsee)
      const inMid = Math.max(Math.abs(x), Math.abs(y)) < meta.mid;
      if (!inMid || h >= wl - 3.0) { out[k] = vec[k]; wet++; }
    }
  }
  // Abstand zum Ufer (Chamfer-Distanztransformation, in Metern)
  const INF = 1e9, dist = new Float32Array(size * size);
  for (let k = 0; k < size * size; k++) dist[k] = out[k] > 127 ? INF : 0;
  const a1 = mpp, a2 = mpp * Math.SQRT2;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const k = j * size + i; if (!dist[k]) continue;
    let d = dist[k];
    if (i > 0) d = Math.min(d, dist[k - 1] + a1);
    if (j > 0) { d = Math.min(d, dist[k - size] + a1); if (i > 0) d = Math.min(d, dist[k - size - 1] + a2); if (i < size - 1) d = Math.min(d, dist[k - size + 1] + a2); }
    dist[k] = d;
  }
  for (let j = size - 1; j >= 0; j--) for (let i = size - 1; i >= 0; i--) {
    const k = j * size + i; if (!dist[k]) continue;
    let d = dist[k];
    if (i < size - 1) d = Math.min(d, dist[k + 1] + a1);
    if (j < size - 1) { d = Math.min(d, dist[k + size] + a1); if (i < size - 1) d = Math.min(d, dist[k + size + 1] + a2); if (i > 0) d = Math.min(d, dist[k + size - 1] + a2); }
    dist[k] = d;
  }
  const rgb = Buffer.alloc(size * size * 3);
  for (let k = 0; k < size * size; k++) { rgb[k * 3] = out[k]; rgb[k * 3 + 1] = Math.min(255, Math.round((dist[k] / 80) * 255)); }
  const smooth = await sharp(rgb, { raw: { width: size, height: size, channels: 3 } }).blur(1.0).png().toBuffer();
  mkdirSync(`public/world/${id}`, { recursive: true });
  await sharp(smooth).toFile(`public/world/${id}/water_mask.png`);
  console.log(`${id}: Wassermaske ${size}px, Wasserspiegel ${wl.toFixed(2)} m, ${(100 * wet / (size * size)).toFixed(1)} % Wasser`);
}

const arg = process.argv[2] || 'all';
for (const id of arg === 'all' ? ALL_IDS : arg.split(',')) await build(id);
