// Downloads open geodata from geo.admin.ch (swisstopo) for the Luzern region
// and writes compact game files to public/data/luzern/.
//
//   node tools/import-luzern.mjs
//
// Sources (© swisstopo, free use with attribution):
//   swissALTI3D (terrain, 2 m)        https://data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.swissalti3d
//   swissSURFACE3D Raster (surface)    https://data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.swisssurface3d-raster
//   VECTOR25 buildings                 api3.geo.admin.ch identify, layer ch.swisstopo.vec25-gebaeude
//   Height profiles (far terrain)      api3.geo.admin.ch/rest/services/profile.json
import { fromArrayBuffer, fromUrl } from 'geotiff';
import { mkdir, writeFile } from 'node:fs/promises';

// --- Area ---------------------------------------------------------------------------

/** Game origin: middle of the Kapellbrücke (LV95). */
const ORIGIN = { e: 2666010, n: 1211541 };
/** Lake Lucerne water level, becomes height 0 in the game. */
const LAKE_LEVEL = 433.6;
/** Detailed core: 1600 m square, one sample every 5 m. */
const CORE_SIZE = 1600;
const CORE_STEP = 5;
/** Far terrain for the horizon (Pilatus, Rigi): 24 km square, one sample every 200 m. */
const FAR_SIZE = 24000;
const FAR_STEP = 200;
/** The Wasserturm is modelled by hand, its footprint is skipped. */
const WASSERTURM = { e: 2666003, n: 1211503 };

const OUT = new URL('../public/data/luzern/', import.meta.url);
const STAC = 'https://data.geo.admin.ch/api/stac/v0.9/collections';

const core = {
  e0: ORIGIN.e - CORE_SIZE / 2,
  n0: ORIGIN.n - CORE_SIZE / 2,
  count: CORE_SIZE / CORE_STEP + 1,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function json(url) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url);
    if (res.ok) return res.json();
    if (attempt >= 3) throw new Error(`${res.status} ${url}`);
    await sleep(1000 * (attempt + 1));
  }
}

// --- Raster tiles (1 km, LV95) -----------------------------------------------------

function tileIds() {
  const ids = [];
  for (let e = Math.floor(core.e0 / 1000); e <= Math.floor((core.e0 + CORE_SIZE) / 1000); e++)
    for (let n = Math.floor(core.n0 / 1000); n <= Math.floor((core.n0 + CORE_SIZE) / 1000); n++) ids.push({ e, n });
  return ids;
}

/** LV95 → WGS84, swisstopo approximation (accurate to about 1 m). */
function toWgs84(e, n) {
  const y = (e - 2600000) / 1e6;
  const x = (n - 1200000) / 1e6;
  const lon = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y * y * y;
  const lat = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x - 0.0447 * y * y * x - 0.014 * x * x * x;
  return [(lon * 100) / 36, (lat * 100) / 36];
}

/** Newest asset of a collection for one km tile, picked by resolution in the file name. */
async function tileAsset(collection, { e, n }, resolution) {
  const [lon, lat] = toWgs84(e * 1000 + 500, n * 1000 + 500);
  const d = 0.001;
  const items = await json(`${STAC}/${collection}/items?bbox=${lon - d},${lat - d},${lon + d},${lat + d}&limit=100`);
  const key = `${e}-${n}`;
  const matches = items.features.filter((f) => f.id.endsWith(key)).sort((a, b) => b.id.localeCompare(a.id));
  for (const f of matches) {
    const asset = Object.values(f.assets).find((a) => a.href.endsWith('.tif') && a.href.includes(`_${resolution}_2056`));
    if (asset) return asset.href;
  }
  throw new Error(`no ${collection} tile ${key} at ${resolution} m`);
}

/** A raster sampled on a regular grid, in LV95 metres. */
class Raster {
  constructor(data, width, height, e0, n1, res) {
    Object.assign(this, { data, width, height, e0, n1, res });
  }
  /** Bilinear height at an LV95 point, or NaN outside. */
  at(e, n) {
    let x = (e - this.e0) / this.res - 0.5;
    let y = (this.n1 - n) / this.res - 0.5;
    // the tile covers half a pixel beyond the outer pixel centres
    if (x < -0.5 || y < -0.5 || x > this.width - 0.5 || y > this.height - 0.5) return NaN;
    x = Math.min(Math.max(x, 0), this.width - 1);
    y = Math.min(Math.max(y, 0), this.height - 1);
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const x1 = Math.min(x0 + 1, this.width - 1), y1 = Math.min(y0 + 1, this.height - 1);
    const fx = x - x0, fy = y - y0;
    const v = (xx, yy) => this.data[yy * this.width + xx];
    return (v(x0, y0) * (1 - fx) + v(x1, y0) * fx) * (1 - fy) + (v(x0, y1) * (1 - fx) + v(x1, y1) * fx) * fy;
  }
}

async function loadTiles(collection, resolution, outRes, remote) {
  const rasters = [];
  for (const id of tileIds()) {
    const href = await tileAsset(collection, id, resolution);
    process.stdout.write(`  ${href.split('/').pop()}\n`);
    const tiff = remote ? await fromUrl(href) : await fromArrayBuffer(await (await fetch(href)).arrayBuffer());
    const size = Math.round(1000 / outRes);
    const [data] = await tiff.readRasters({ width: size, height: size, resampleMethod: 'bilinear' });
    rasters.push(new Raster(data, size, size, id.e * 1000, (id.n + 1) * 1000, outRes));
  }
  return (e, n) => {
    for (const r of rasters) {
      const v = r.at(e, n);
      if (!Number.isNaN(v)) return v;
    }
    return NaN;
  };
}

// --- Buildings -------------------------------------------------------------------------

async function loadBuildings() {
  const seen = new Map();
  const cell = 200;
  for (let e = core.e0; e < core.e0 + CORE_SIZE; e += cell) {
    for (let n = core.n0; n < core.n0 + CORE_SIZE; n += cell) {
      const box = `${e},${n},${e + cell},${n + cell}`;
      const url =
        'https://api3.geo.admin.ch/rest/services/api/MapServer/identify?' +
        new URLSearchParams({
          geometry: box,
          geometryType: 'esriGeometryEnvelope',
          layers: 'all:ch.swisstopo.vec25-gebaeude',
          tolerance: '0',
          sr: '2056',
          geometryFormat: 'geojson',
          returnGeometry: 'true',
          limit: '200',
        });
      const res = await json(url);
      if (res.results.length >= 200) console.warn(`  cell ${box} hit the 200 limit`);
      for (const f of res.results) seen.set(f.id, f);
      await sleep(50);
    }
  }
  return [...seen.values()];
}

function insidePolygon(ring, e, n) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ei, ni] = ring[i];
    const [ej, nj] = ring[j];
    if (ni > n !== nj > n && e < ((ej - ei) * (n - ni)) / (nj - ni) + ei) inside = !inside;
  }
  return inside;
}

// --- Main -----------------------------------------------------------------------------

const local = (e, n) => [+(e - ORIGIN.e).toFixed(2), +(ORIGIN.n - n).toFixed(2)];
const toDm = (h) => Math.max(-32768, Math.min(32767, Math.round((h - LAKE_LEVEL) * 10)));

await mkdir(OUT, { recursive: true });

console.log('Terrain (swissALTI3D 2 m)');
const dtm = await loadTiles('ch.swisstopo.swissalti3d', '2', 2, false);
const coreHeights = new Int16Array(core.count * core.count);
for (let j = 0; j < core.count; j++) {
  for (let i = 0; i < core.count; i++) {
    const h = dtm(core.e0 + i * CORE_STEP, core.n0 + CORE_SIZE - j * CORE_STEP);
    coreHeights[j * core.count + i] = toDm(Number.isNaN(h) ? LAKE_LEVEL : h);
  }
}

console.log('Surface (swissSURFACE3D, read at 2 m)');
const dsm = await loadTiles('ch.swisstopo.swisssurface3d-raster', '0.5', 2, true);

console.log('Buildings (VECTOR25)');
const features = await loadBuildings();
const buildings = [];
for (const f of features) {
  for (const poly of f.geometry.coordinates) {
    const ring = poly[0];
    if (insidePolygon(ring, WASSERTURM.e, WASSERTURM.n)) continue;
    const es = ring.map((p) => p[0]);
    const ns = ring.map((p) => p[1]);
    const minE = Math.min(...es), maxE = Math.max(...es), minN = Math.min(...ns), maxN = Math.max(...ns);
    // keep only buildings fully inside the core area
    if (minE < core.e0 || maxE > core.e0 + CORE_SIZE || minN < core.n0 || maxN > core.n0 + CORE_SIZE) continue;
    // height = median of surface minus terrain inside the footprint
    const diffs = [];
    for (let e = minE + 1; e < maxE; e += 2)
      for (let n = minN + 1; n < maxN; n += 2) {
        if (!insidePolygon(ring, e, n)) continue;
        const d = dsm(e, n) - dtm(e, n);
        if (!Number.isNaN(d)) diffs.push(d);
      }
    diffs.sort((a, b) => a - b);
    const median = diffs.length ? diffs[Math.floor(diffs.length * 0.6)] : 12;
    const height = Math.max(5, Math.min(60, median));
    const base = Math.min(...ring.map(([e, n]) => dtm(e, n)).filter((v) => !Number.isNaN(v)));
    buildings.push({
      ring: ring.slice(0, -1).map(([e, n]) => local(e, n)),
      base: +(base - LAKE_LEVEL).toFixed(1),
      height: +height.toFixed(1),
    });
  }
}
console.log(`  ${buildings.length} buildings`);

console.log('Far terrain (profile service, 200 m)');
const farCount = FAR_SIZE / FAR_STEP + 1;
const farHeights = new Int16Array(farCount * farCount);
const farE0 = ORIGIN.e - FAR_SIZE / 2;
const farN1 = ORIGIN.n + FAR_SIZE / 2;
for (let j = 0; j < farCount; j++) {
  const n = farN1 - j * FAR_STEP;
  const geom = JSON.stringify({ type: 'LineString', coordinates: [[farE0, n], [farE0 + FAR_SIZE, n]] });
  const profile = await json(
    `https://api3.geo.admin.ch/rest/services/profile.json?${new URLSearchParams({ geom, sr: '2056', nb_points: String(farCount) })}`,
  );
  if (profile.length !== farCount) throw new Error(`profile row ${j}: ${profile.length} points`);
  profile.forEach((p, i) => (farHeights[j * farCount + i] = toDm(p.alts.COMB ?? p.alts.DTM25 ?? LAKE_LEVEL)));
  if (j % 20 === 0) process.stdout.write(`  row ${j}/${farCount}\n`);
  await sleep(80);
}

await writeFile(new URL('core.bin', OUT), Buffer.from(coreHeights.buffer));
await writeFile(new URL('far.bin', OUT), Buffer.from(farHeights.buffer));
await writeFile(new URL('buildings.json', OUT), JSON.stringify(buildings));
await writeFile(
  new URL('meta.json', OUT),
  JSON.stringify(
    {
      origin: ORIGIN,
      lakeLevel: LAKE_LEVEL,
      core: { size: CORE_SIZE, step: CORE_STEP, count: core.count },
      far: { size: FAR_SIZE, step: FAR_STEP, count: farCount },
      heightUnit: 'dm above lake level, Int16, rows north to south',
      attribution: '© swisstopo (swissALTI3D, swissSURFACE3D, VECTOR25)',
      created: new Date().toISOString().slice(0, 10),
    },
    null,
    2,
  ),
);
console.log('done');
