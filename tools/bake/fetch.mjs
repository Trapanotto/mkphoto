// Lädt Geodaten EINMALIG pro Level und schreibt Rohdaten nach .cache/bake/<level>/
//   - Höhen: swissALTI3D (2 m COG), Lücken/Ausland: Terrarium (AWS Open Data)
//   - Luftbild: SWISSIMAGE (WMTS), auf das LV95-Raster umprojiziert
// Aufruf: node tools/bake/fetch.mjs <level|all>
import { fromUrl } from 'geotiff';
import sharp from 'sharp';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { bakeConfig, ALL_IDS, CHUNK, MID_CHUNK } from './config.mjs';
import { toWGS84 } from './lv95.mjs';

const STAC = 'https://data.geo.admin.ch/api/stac/v0.9';
const WMTS = 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg';
const TERRARIUM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const HTTP_CACHE = '.cache/http';
mkdirSync(HTTP_CACHE, { recursive: true });

// ---------- Hilfen ----------
async function pool(items, n, fn) {
  let i = 0;
  const run = async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } };
  await Promise.all(Array.from({ length: n }, run));
}

async function cachedFetch(url) {
  const key = url.replace(/[^a-z0-9]+/gi, '_').slice(-180);
  const p = `${HTTP_CACHE}/${key}`;
  if (existsSync(p)) { const b = readFileSync(p); return b.length ? b : null; }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url);
      if (r.status === 404 || r.status === 400) { writeFileSync(p, Buffer.alloc(0)); return null; }
      if (!r.ok) throw new Error(r.status);
      const b = Buffer.from(await r.arrayBuffer());
      writeFileSync(p, b);
      return b;
    } catch (e) { if (attempt === 2) { console.warn('fetch fail', url, e.message); return null; } }
  }
}

// ---------- Höhen ----------
async function stacItems(collection, bbox) {
  const out = [];
  let url = `${STAC}/collections/${collection}/items?bbox=${bbox.join(',')}&limit=100`;
  while (url) {
    const j = await (await fetch(url)).json();
    out.push(...(j.features || []));
    url = (j.links || []).find((l) => l.rel === 'next')?.href;
  }
  return out;
}

function bboxWGS(E0, N0, half) {
  const a = toWGS84(E0 - half, N0 - half), b = toWGS84(E0 + half, N0 + half);
  const c = toWGS84(E0 - half, N0 + half), d = toWGS84(E0 + half, N0 - half);
  return [Math.min(a.lon, c.lon), Math.min(a.lat, d.lat), Math.max(b.lon, d.lon), Math.max(b.lat, c.lat)];
}

// swissALTI3D-Kacheln (1 km) mit 2 m Auflösung; neuestes Jahr je Kachel
async function demTiles(cfg, half) {
  const items = await stacItems('ch.swisstopo.swissalti3d', bboxWGS(cfg.E0, cfg.N0, half));
  const best = new Map();
  for (const f of items) {
    const m = f.id.match(/_(\d{4})_(\d{4})-(\d{4})$/);
    if (!m) continue;
    const [_, year, e, n] = m;
    const href = Object.values(f.assets).find((a) => /_2_2056_5728\.tif$/.test(a.href))?.href;
    if (!href) continue;
    const k = `${e}-${n}`;
    if (!best.has(k) || best.get(k).year < +year) best.set(k, { year: +year, href, e: +e * 1000, n: +n * 1000 });
  }
  return best;
}

// Terrarium (Mapzen, Open Data): globale Höhen als Rückfall
const terrCache = new Map();
async function terrariumTile(z, x, y) {
  const k = `${z}/${x}/${y}`;
  if (terrCache.has(k)) return terrCache.get(k);
  const buf = await cachedFetch(TERRARIUM.replace('{z}', z).replace('{x}', x).replace('{y}', y));
  let data = null;
  if (buf) {
    const { data: raw } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    data = new Float32Array(256 * 256);
    for (let i = 0; i < 256 * 256; i++) data[i] = raw[i * 3] * 256 + raw[i * 3 + 1] + raw[i * 3 + 2] / 256 - 32768;
  }
  terrCache.set(k, data);
  return data;
}
const merc = (lat, lon, z) => {
  const n = 2 ** z * 256;
  const x = ((lon + 180) / 360) * n;
  const s = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
  return { x, y };
};
async function terrariumSampler(cfg, half, z) {
  // alle benötigten Kacheln vorladen
  const bb = bboxWGS(cfg.E0, cfg.N0, half);
  const a = merc(bb[3], bb[0], z), b = merc(bb[1], bb[2], z);
  const tiles = [];
  for (let ty = Math.floor(a.y / 256); ty <= Math.floor(b.y / 256); ty++) for (let tx = Math.floor(a.x / 256); tx <= Math.floor(b.x / 256); tx++) tiles.push([tx, ty]);
  await pool(tiles, 8, ([x, y]) => terrariumTile(z, x, y));
  return (E, N) => {
    const { lat, lon } = toWGS84(E, N);
    const p = merc(lat, lon, z);
    const px = p.x - 0.5, py = p.y - 0.5;
    const x0 = Math.floor(px), y0 = Math.floor(py), fx = px - x0, fy = py - y0;
    const get = (X, Y) => {
      const t = terrCache.get(`${z}/${Math.floor(X / 256)}/${Math.floor(Y / 256)}`);
      return t ? t[(((Y % 256) + 256) % 256) * 256 + (((X % 256) + 256) % 256)] : 0;
    };
    return (get(x0, y0) * (1 - fx) + get(x0 + 1, y0) * fx) * (1 - fy) + (get(x0, y0 + 1) * (1 - fx) + get(x0 + 1, y0 + 1) * fx) * fy;
  };
}

// Raster einer Ebene: n x n Punkte mit Abstand step, Mitte (E0, N0); Zeile 0 = Norden
async function buildDEM(cfg, half, step, overview, fallback) {
  const n = Math.round((2 * half) / step) + 1;
  const grid = new Float32Array(n * n).fill(NaN);
  const tiles = await demTiles(cfg, half + step);
  console.log(`  DEM ${half * 2} m / ${step} m: ${tiles.size} swissALTI3D-Kacheln`);
  const list = [...tiles.values()];
  await pool(list, 6, async (t) => {
    try {
      const tif = await fromUrl(t.href);
      const count = await tif.getImageCount();
      const img = await tif.getImage(Math.min(overview, count - 1));
      const w = img.getWidth(), h = img.getHeight();
      const [r] = await img.readRasters();
      const res = 1000 / w;
      // alle Gitterpunkte in dieser Kachel
      const e0 = cfg.E0 - half, n0 = cfg.N0 + half;
      const i0 = Math.max(0, Math.ceil((t.e - e0) / step)), i1 = Math.min(n - 1, Math.floor((t.e + 1000 - e0) / step));
      const j0 = Math.max(0, Math.ceil((n0 - (t.n + 1000)) / step)), j1 = Math.min(n - 1, Math.floor((n0 - t.n) / step));
      for (let j = j0; j <= j1; j++) {
        const N = n0 - j * step;
        const py = (t.n + 1000 - N) / res - 0.5;
        for (let i = i0; i <= i1; i++) {
          const E = e0 + i * step;
          const px = (E - t.e) / res - 0.5;
          const x0 = Math.max(0, Math.min(w - 2, Math.floor(px))), y0 = Math.max(0, Math.min(h - 2, Math.floor(py)));
          const fx = Math.max(0, Math.min(1, px - x0)), fy = Math.max(0, Math.min(1, py - y0));
          const v = (r[y0 * w + x0] * (1 - fx) + r[y0 * w + x0 + 1] * fx) * (1 - fy) + (r[(y0 + 1) * w + x0] * (1 - fx) + r[(y0 + 1) * w + x0 + 1] * fx) * fy;
          if (v > -1000) grid[j * n + i] = v;
        }
      }
    } catch (e) { console.warn('  DEM-Kachel fehlgeschlagen', t.href.slice(-40), e.message); }
  });
  let filled = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i;
    if (Number.isNaN(grid[k])) { grid[k] = fallback(cfg.E0 - half + i * step, cfg.N0 + half - j * step); filled++; }
  }
  if (filled) console.log(`  ${filled} Punkte aus Terrarium ergänzt`);
  return { n, step, half, data: grid };
}

// ---------- Luftbild (WMTS -> LV95) ----------
const imgCache = new Map();
async function wmtsTile(z, x, y) {
  const k = `${z}/${x}/${y}`;
  if (imgCache.has(k)) return imgCache.get(k);
  const p = (async () => {
    const buf = await cachedFetch(WMTS.replace('{z}', z).replace('{x}', x).replace('{y}', y));
    if (!buf) return null;
    try { return (await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true })).data; } catch { return null; }
  })();
  imgCache.set(k, p);
  return p;
}

// Bild für ein LV95-Rechteck (e0..e1, n0..n1) mit size x size Pixel
async function orthoImage(e0, n0, e1, n1, size, z, fill = [92, 104, 84]) {
  const px = new Uint8Array(size * size * 3);
  const need = new Set();
  const coords = new Float64Array(size * size * 2);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const E = e0 + ((i + 0.5) / size) * (e1 - e0), N = n1 - ((j + 0.5) / size) * (n1 - n0);
    const { lat, lon } = toWGS84(E, N);
    const p = merc(lat, lon, z);
    coords[(j * size + i) * 2] = p.x; coords[(j * size + i) * 2 + 1] = p.y;
    need.add(`${Math.floor(p.x / 256)}/${Math.floor(p.y / 256)}`);
  }
  await pool([...need], 10, async (k) => { const [x, y] = k.split('/').map(Number); await wmtsTile(z, x, y); });
  const tiles = new Map();
  for (const k of need) tiles.set(k, await imgCache.get(`${z}/${k}`));
  for (let q = 0; q < size * size; q++) {
    const x = coords[q * 2] - 0.5, y = coords[q * 2 + 1] - 0.5;
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    for (let c = 0; c < 3; c++) {
      let acc = 0, wsum = 0;
      for (const [dx, dy, w] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
        const X = x0 + dx, Y = y0 + dy;
        const t = tiles.get(`${Math.floor(X / 256)}/${Math.floor(Y / 256)}`);
        if (!t) continue;
        acc += t[((Y & 255) * 256 + (X & 255)) * 3 + c] * w; wsum += w;
      }
      px[q * 3 + c] = wsum > 0.01 ? acc / wsum : fill[c];
    }
  }
  return px;
}

async function saveJpg(px, size, path, quality = 82) {
  await sharp(Buffer.from(px), { raw: { width: size, height: size, channels: 3 } }).jpeg({ quality, mozjpeg: true }).toFile(path);
}

// ---------- Ablauf ----------
async function bakeLevel(id) {
  const cfg = bakeConfig(id);
  const dir = `.cache/bake/${id}`;
  mkdirSync(`${dir}/ortho`, { recursive: true });
  console.log(`== ${id}: LV95 ${cfg.E0} / ${cfg.N0}`);
  const terrFar = await terrariumSampler(cfg, cfg.far, 10);
  const terrNear = await terrariumSampler(cfg, cfg.mid, 13);

  const core = await buildDEM(cfg, cfg.core + CHUNK / 2, 2, 0, terrNear);
  const mid = await buildDEM(cfg, cfg.mid, 20, 1, terrNear);
  const farN = 401;
  const far = { n: farN, step: (2 * cfg.far) / (farN - 1), half: cfg.far, data: new Float32Array(farN * farN) };
  for (let j = 0; j < farN; j++) for (let i = 0; i < farN; i++) far.data[j * farN + i] = terrFar(cfg.E0 - cfg.far + i * far.step, cfg.N0 + cfg.far - j * far.step);
  for (const [name, g] of Object.entries({ core, mid, far })) {
    writeFileSync(`${dir}/dem_${name}.f32`, Buffer.from(g.data.buffer));
    g.data = undefined;
  }

  // Luftbilder: Kern 400-m-Kacheln (z18 ≈ 0.4 m), Mittelring 2-km-Kacheln (z15), Horizont ein Bild (z11)
  const coreN = Math.round((2 * cfg.core) / CHUNK);
  const chunks = [];
  for (let j = 0; j < coreN; j++) for (let i = 0; i < coreN; i++) chunks.push([i, j]);
  console.log(`  Luftbild Kern: ${chunks.length} Kacheln`);
  for (const [i, j] of chunks) {
    const e0 = cfg.E0 - cfg.core + i * CHUNK, n1 = cfg.N0 + cfg.core - j * CHUNK;
    const p = `${dir}/ortho/core_${i}_${j}.jpg`;
    if (existsSync(p)) continue;
    const px = await orthoImage(e0, n1 - CHUNK, e0 + CHUNK, n1, 1024, 18);
    await saveJpg(px, 1024, p);
  }
  const midN = Math.round((2 * cfg.mid) / MID_CHUNK);
  console.log(`  Luftbild Mittelring: ${midN * midN} Kacheln`);
  for (let j = 0; j < midN; j++) for (let i = 0; i < midN; i++) {
    const e0 = cfg.E0 - cfg.mid + i * MID_CHUNK, n1 = cfg.N0 + cfg.mid - j * MID_CHUNK;
    const p = `${dir}/ortho/mid_${i}_${j}.jpg`;
    if (existsSync(p)) continue;
    const px = await orthoImage(e0, n1 - MID_CHUNK, e0 + MID_CHUNK, n1, 1024, 15);
    await saveJpg(px, 1024, p);
  }
  if (!existsSync(`${dir}/ortho/far.jpg`)) {
    console.log('  Luftbild Horizont');
    const px = await orthoImage(cfg.E0 - cfg.far, cfg.N0 - cfg.far, cfg.E0 + cfg.far, cfg.N0 + cfg.far, 2048, 12, [120, 128, 118]);
    await saveJpg(px, 2048, `${dir}/ortho/far.jpg`, 85);
  }
  writeFileSync(`${dir}/meta.json`, JSON.stringify({
    id, E0: cfg.E0, N0: cfg.N0, core: cfg.core, mid: cfg.mid, far: cfg.far, chunk: CHUNK, midChunk: MID_CHUNK,
    dem: { core: { n: core.n, step: core.step, half: core.half }, mid: { n: mid.n, step: mid.step, half: mid.half }, far: { n: far.n, step: far.step, half: far.half } },
  }, null, 1));
  console.log(`  fertig -> ${dir}`);
}

const arg = process.argv[2] || 'luzern';
for (const id of arg === 'all' ? ALL_IDS : arg.split(',')) await bakeLevel(id);
