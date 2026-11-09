// Imports a region from geo.admin.ch (swisstopo) using tools/regions/<id>.json:
//   height grids     profile service (swissALTI3D, DHM25 outside Switzerland)
//   roads and paths  swissTLM3D Strassen
//   railways         swissTLM3D Eisenbahn
//   rivers           swissTLM3D Gewässernetz
//   trees            swissSURFACE3D minus swissALTI3D in the core, crowns found as uneven high points
//
//   node tools/import-region.mjs chillon
//
// Heights are Int16 decimetres relative to the region's baseLevel; already imported grids are kept.
import { fromArrayBuffer, fromUrl } from 'geotiff';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';

const ID = process.argv[2];
if (!ID) throw new Error('usage: node tools/import-region.mjs <region>');
const config = JSON.parse(await readFile(new URL(`./regions/${ID}.json`, import.meta.url), 'utf8'));
const OUT = new URL(`../public/data/${ID}/`, import.meta.url);
const STAC = 'https://data.geo.admin.ch/api/stac/v0.9/collections';
const { origin, baseLevel } = config;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const toDm = (h) => Math.max(-32768, Math.min(32767, Math.round((h - baseLevel) * 10)));
const local = (e, n) => [+(e - origin.e).toFixed(2), +(origin.n - n).toFixed(2)];

async function json(url) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
      if (attempt >= 4) throw new Error(`${res.status} ${url}`);
    } catch (e) {
      if (attempt >= 4) throw e;
    }
    await sleep(800 * (attempt + 1));
  }
}

await mkdir(OUT, { recursive: true });

// --- Height grids --------------------------------------------------------------------------
const grids = [];
for (const g of config.grids) {
  const count = Math.round(g.size / g.step) + 1;
  const e0 = g.center.e - g.size / 2;
  const n1 = g.center.n + g.size / 2;
  const [gx, gz] = local(g.center.e, g.center.n);
  const info = { name: g.name, file: `${g.name}.bin`, center: { x: gx, z: gz }, size: g.size, step: g.step, count };
  const done = await stat(new URL(info.file, OUT)).catch(() => null);
  if (done && done.size === count * count * 2) {
    console.log(`${g.name}: already imported`);
    grids.push(info);
    continue;
  }
  const heights = new Int16Array(count * count);
  const perCall = Math.min(count, 400);
  console.log(`${g.name}: ${count} x ${count} at ${g.step} m`);
  for (let j = 0; j < count; j++) {
    const n = n1 - j * g.step;
    for (let i0 = 0; i0 < count; i0 += perCall) {
      const i1 = Math.min(count - 1, i0 + perCall - 1);
      const pts = i1 - i0 + 1;
      const geom = JSON.stringify({ type: 'LineString', coordinates: [[e0 + i0 * g.step, n], [e0 + i1 * g.step, n]] });
      const profile =
        pts === 1
          ? [{ dist: 0, alts: { COMB: (await json(`https://api3.geo.admin.ch/rest/services/height?easting=${e0 + i0 * g.step}&northing=${n}&sr=2056`)).height } }]
          : await json(`https://api3.geo.admin.ch/rest/services/profile.json?${new URLSearchParams({ geom, sr: '2056', nb_points: String(pts) })}`);
      const row = new Array(pts).fill(null);
      for (const p of profile) {
        const k = pts === 1 ? 0 : Math.round((p.dist ?? 0) / g.step);
        if (k >= 0 && k < pts) row[k] = +(p.alts.COMB ?? p.alts.DTM25 ?? baseLevel);
      }
      for (let k = 0; k < pts; k++) if (row[k] === null) row[k] = row[k - 1] ?? row.find((v) => v !== null) ?? baseLevel;
      row.forEach((h, k) => (heights[j * count + i0 + k] = toDm(h)));
      await sleep(50);
    }
    if (j % 100 === 0) process.stdout.write(`  row ${j}/${count}\n`);
  }
  await writeFile(new URL(info.file, OUT), Buffer.from(heights.buffer));
  grids.push(info);
}

// --- Lines from swissTLM3D: roads, railways, rivers --------------------------------------------
const core = config.grids[0];
const [ccx, ccz] = local(core.center.e, core.center.n);
const inCore = ([x, z]) => Math.abs(x - ccx) < core.size / 2 && Math.abs(z - ccz) < core.size / 2;

async function tlm(layer, cell) {
  const found = new Map();
  for (let e = core.center.e - core.size / 2; e < core.center.e + core.size / 2; e += cell) {
    for (let n = core.center.n - core.size / 2; n < core.center.n + core.size / 2; n += cell) {
      const res = await json(
        'https://api3.geo.admin.ch/rest/services/api/MapServer/identify?' +
          new URLSearchParams({
            geometry: `${e},${n},${e + cell},${n + cell}`,
            geometryType: 'esriGeometryEnvelope',
            layers: `all:${layer}`,
            tolerance: '0',
            sr: '2056',
            geometryFormat: 'geojson',
            returnGeometry: 'true',
            limit: '200',
          }),
      );
      if (res.results.length >= 200) console.warn(`  ${layer}: cell ${e},${n} hit the 200 limit`);
      for (const f of res.results) found.set(f.id, f);
      await sleep(40);
    }
  }
  return [...found.values()];
}

console.log('Roads and paths');
const roads = [];
for (const f of await tlm('ch.swisstopo.swisstlm3d-strassen', 100)) {
  const p = f.properties;
  const kind = (p.objektart === 8 || p.objektart === 9) && p.verkehrsbeschraenkung === 100 ? 'car' : 'walk';
  for (const line of f.geometry.coordinates) {
    const pts = line.map(([e, n]) => local(e, n)).filter(inCore);
    if (pts.length >= 2) roads.push({ kind, type: p.objektart, name: p.strassenname ?? null, pts });
  }
}
console.log(`  ${roads.length}`);

console.log('Railways');
const rails = [];
for (const f of await tlm('ch.swisstopo.swisstlm3d-eisenbahnnetz', 250)) {
  for (const line of f.geometry.coordinates) {
    const pts = line.map(([e, n]) => local(e, n)).filter(inCore);
    if (pts.length >= 2) rails.push({ id: f.id, type: f.properties.objektart, pts });
  }
}
console.log(`  ${rails.length}`);

console.log('Rivers');
const rivers = [];
for (const f of await tlm('ch.swisstopo.swisstlm3d-gewaessernetz', 250)) {
  for (const line of f.geometry.coordinates) {
    const pts = line.map(([e, n]) => local(e, n)).filter(inCore);
    if (pts.length >= 2) rivers.push({ name: f.properties.name ?? null, type: f.properties.objektart, pts });
  }
}
console.log(`  ${rivers.length}`);

// --- Trees from surface minus terrain in the core -----------------------------------------
function toWgs84(e, n) {
  const y = (e - 2600000) / 1e6;
  const x = (n - 1200000) / 1e6;
  const lon = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y * y * y;
  const lat = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x - 0.0447 * y * y * x - 0.014 * x * x * x;
  return [(lon * 100) / 36, (lat * 100) / 36];
}
async function tileAsset(collection, e, n, resolution) {
  const [lon, lat] = toWgs84(e * 1000 + 500, n * 1000 + 500);
  const items = await json(`${STAC}/${collection}/items?bbox=${lon - 0.001},${lat - 0.001},${lon + 0.001},${lat + 0.001}&limit=100`);
  const key = `${e}-${n}`;
  for (const f of items.features.filter((f) => f.id.endsWith(key)).sort((a, b) => b.id.localeCompare(a.id))) {
    const asset = Object.values(f.assets).find((a) => a.href.endsWith('.tif') && a.href.includes(`_${resolution}_2056`));
    if (asset) return asset.href;
  }
  return null;
}
async function rasterSampler(collection, resolution, remote) {
  const rasters = [];
  const e0 = core.center.e - core.size / 2, e1 = core.center.e + core.size / 2;
  const n0 = core.center.n - core.size / 2, n1 = core.center.n + core.size / 2;
  for (let e = Math.floor(e0 / 1000); e <= Math.floor(e1 / 1000); e++)
    for (let n = Math.floor(n0 / 1000); n <= Math.floor(n1 / 1000); n++) {
      const href = await tileAsset(collection, e, n, resolution);
      if (!href) continue;
      const tiff = remote ? await fromUrl(href) : await fromArrayBuffer(await (await fetch(href)).arrayBuffer());
      const [data] = await tiff.readRasters({ width: 500, height: 500, resampleMethod: 'bilinear' });
      rasters.push({ data, e0: e * 1000, n1: (n + 1) * 1000 });
    }
  return (e, n) => {
    for (const r of rasters) {
      const x = (e - r.e0) / 2 - 0.5, y = (r.n1 - n) / 2 - 0.5;
      if (x < -0.5 || y < -0.5 || x > 499.5 || y > 499.5) continue;
      const i = Math.min(499, Math.max(0, Math.round(x))), j = Math.min(499, Math.max(0, Math.round(y)));
      return r.data[j * 500 + i];
    }
    return NaN;
  };
}
const trees = [];
if (config.trees) {
  console.log('Trees');
  const dtm = await rasterSampler('ch.swisstopo.swissalti3d', '2', false);
  const dsm = await rasterSampler('ch.swisstopo.swisssurface3d-raster', '0.5', true);
  const step = 2;
  const nx = core.size / step;
  const ndsm = new Float32Array(nx * nx);
  for (let j = 0; j < nx; j++)
    for (let i = 0; i < nx; i++) {
      const e = core.center.e - core.size / 2 + i * step + 1, n = core.center.n + core.size / 2 - j * step - 1;
      const t = dtm(e, n);
      const d = dsm(e, n) - t;
      ndsm[j * nx + i] = Number.isNaN(d) || t <= baseLevel + 0.3 ? 0 : d;
    }
  const at = (i, j) => (i < 0 || j < 0 || i >= nx || j >= nx ? 0 : ndsm[j * nx + i]);
  const taken = new Set();
  for (let j = 2; j < nx - 2; j++)
    for (let i = 2; i < nx - 2; i++) {
      const h = at(i, j);
      if (h < 4 || h > 40) continue;
      let top = true, sum = 0, sum2 = 0, cnt = 0;
      for (let dj = -2; dj <= 2 && top; dj++)
        for (let di = -2; di <= 2; di++) {
          const v = at(i + di, j + dj);
          if (v > h) { top = false; break; }
          sum += v; sum2 += v * v; cnt++;
        }
      if (!top || sum2 / cnt - (sum / cnt) ** 2 < 1.5) continue;
      const key = `${Math.floor(i / 2)},${Math.floor(j / 2)}`;
      if (taken.has(key)) continue;
      taken.add(key);
      const e = core.center.e - core.size / 2 + i * step + 1, n = core.center.n + core.size / 2 - j * step - 1;
      const [x, z] = local(e, n);
      trees.push([x, z, +h.toFixed(1)]);
    }
  console.log(`  ${trees.length}`);
}

await writeFile(new URL('roads.json', OUT), JSON.stringify(roads));
await writeFile(new URL('rails.json', OUT), JSON.stringify(rails));
await writeFile(new URL('rivers.json', OUT), JSON.stringify(rivers));
await writeFile(new URL('trees.json', OUT), JSON.stringify(trees));
await writeFile(
  new URL('meta.json', OUT),
  JSON.stringify(
    {
      region: ID,
      origin,
      lakeLevel: baseLevel,
      grids,
      heightUnit: 'dm relative to baseLevel, Int16, rows north to south',
      attribution: '© swisstopo (swissALTI3D, swissSURFACE3D, swissBUILDINGS3D, swissTLM3D)',
      created: new Date().toISOString().slice(0, 10),
    },
    null,
    2,
  ),
);
console.log('done');
