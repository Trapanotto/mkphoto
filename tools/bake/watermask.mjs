// Wassermaske pro Level: Wasser nur dort, wo das Gelände auf Wasserhöhe liegt UND das Luftbild Wasser zeigt.
// Ausgabe: public/world/<level>/water_mask.png (Norden oben, Quadrat um level.water.at mit Halbkante radius)
import sharp from 'sharp';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { bakeConfig, ALL_IDS } from './config.mjs';
import { toLV95 } from './lv95.mjs';

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
  const size = R > 2500 ? 2048 : R > 800 ? 2048 : 1024;
  const out = Buffer.alloc(size * size);
  let wet = 0;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = cx - R + ((i + 0.5) / size) * 2 * R, y = cy + R - ((j + 0.5) / size) * 2 * R;
      const h = height(x, y);
      let m = h <= wl + 0.6 && h >= wl - 2.5;
      if (m) {
        const c = await orthoColor(dir, meta, x, y);
        m = c ? isWaterColor(c) || h <= wl + 0.15 : true;
      }
      if (m) { out[j * size + i] = 255; wet++; }
    }
  }
  // Schliessen kleiner Löcher (Boote, Spiegelungen) und Glätten der Ufer
  let img = sharp(out, { raw: { width: size, height: size, channels: 1 } });
  const closed = await sharp(await img.blur(2.5).threshold(70).extractChannel(0).raw().toBuffer(), { raw: { width: size, height: size, channels: 1 } })
    .blur(2.5).threshold(185).blur(1.2).extractChannel(0).png().toBuffer();
  mkdirSync(`public/world/${id}`, { recursive: true });
  await sharp(closed).toFile(`public/world/${id}/water_mask.png`);
  console.log(`${id}: Wassermaske ${size}px, Wasserspiegel ${wl.toFixed(2)} m, ${(100 * wet / (size * size)).toFixed(1)} % Wasser`);
}

const arg = process.argv[2] || 'all';
for (const id of arg === 'all' ? ALL_IDS : arg.split(',')) await build(id);
