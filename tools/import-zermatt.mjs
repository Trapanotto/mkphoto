// Imports the Matterhorn region from geo.admin.ch (swisstopo):
// several height grids (detailed around Riffelsee and the Matterhorn, coarser further out)
// from the profile service, plus roads and paths from swissTLM3D.
//
//   node tools/import-zermatt.mjs
//
// Heights are stored as Int16 decimetres relative to the Riffelsee level (baseLevel).
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';

const config = JSON.parse(await readFile(new URL('./regions/zermatt.json', import.meta.url), 'utf8'));
const OUT = new URL(`../public/data/${config.id}/`, import.meta.url);
const { origin, baseLevel } = config;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

const toDm = (h) => Math.max(-32768, Math.min(32767, Math.round((h - baseLevel) * 10)));
const local = (e, n) => [+(e - origin.e).toFixed(2), +(origin.n - n).toFixed(2)];

await mkdir(OUT, { recursive: true });

// --- Height grids from the profile service, one row per request ---------------------
const grids = [];
for (const g of config.grids) {
  const count = Math.round(g.size / g.step) + 1;
  const e0 = g.center.e - g.size / 2;
  const n1 = g.center.n + g.size / 2;
  const heights = new Int16Array(count * count);
  const [gx, gz] = local(g.center.e, g.center.n);
  const done = await stat(new URL(`${g.name}.bin`, OUT)).catch(() => null);
  if (done && done.size === count * count * 2) {
    console.log(`${g.name}: already imported`);
    grids.push({ name: g.name, file: `${g.name}.bin`, center: { x: gx, z: gz }, size: g.size, step: g.step, count });
    continue;
  }
  // the service returns at most a few hundred points per line: split long rows
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
          ? [{ alts: { COMB: (await json(`https://api3.geo.admin.ch/rest/services/height?easting=${e0 + i0 * g.step}&northing=${n}&sr=2056`)).height }}]
          : await json(`https://api3.geo.admin.ch/rest/services/profile.json?${new URLSearchParams({ geom, sr: '2056', nb_points: String(pts) })}`);
      // place each returned point by its distance along the line; the service can drop a point
      const row = new Array(pts).fill(null);
      for (const p of profile) {
        const k = pts === 1 ? 0 : Math.round((p.dist ?? 0) / g.step);
        if (k >= 0 && k < pts) row[k] = +(p.alts.COMB ?? p.alts.DTM25 ?? baseLevel);
      }
      for (let k = 0; k < pts; k++) if (row[k] === null) row[k] = row[k - 1] ?? row.find((v) => v !== null) ?? baseLevel;
      row.forEach((h, k) => (heights[j * count + i0 + k] = toDm(h)));
      await sleep(60);
    }
    if (j % 50 === 0) process.stdout.write(`  row ${j}/${count}\n`);
  }
  await writeFile(new URL(`${g.name}.bin`, OUT), Buffer.from(heights.buffer));
  grids.push({ name: g.name, file: `${g.name}.bin`, center: { x: gx, z: gz }, size: g.size, step: g.step, count });
}

// --- Roads and paths in the core (swissTLM3D) -------------------------------------
console.log('Roads and paths (swissTLM3D)');
const core = config.grids[0];
const roadFeatures = new Map();
const cell = 200;
for (let e = core.center.e - core.size / 2; e < core.center.e + core.size / 2; e += cell) {
  for (let n = core.center.n - core.size / 2; n < core.center.n + core.size / 2; n += cell) {
    const res = await json(
      'https://api3.geo.admin.ch/rest/services/api/MapServer/identify?' +
        new URLSearchParams({
          geometry: `${e},${n},${e + cell},${n + cell}`,
          geometryType: 'esriGeometryEnvelope',
          layers: 'all:ch.swisstopo.swisstlm3d-strassen',
          tolerance: '0',
          sr: '2056',
          geometryFormat: 'geojson',
          returnGeometry: 'true',
          limit: '200',
        }),
    );
    if (res.results.length >= 200) console.warn(`  cell ${e},${n} hit the 200 limit`);
    for (const f of res.results) roadFeatures.set(f.id, f);
    await sleep(40);
  }
}
const [ccx, ccz] = local(core.center.e, core.center.n);
const roads = [];
for (const f of roadFeatures.values()) {
  const p = f.properties;
  const kind = (p.objektart === 8 || p.objektart === 9) && p.verkehrsbeschraenkung === 100 ? 'car' : 'walk';
  for (const line of f.geometry.coordinates) {
    const pts = line
      .map(([e, n]) => local(e, n))
      .filter(([x, z]) => Math.abs(x - ccx) < core.size / 2 && Math.abs(z - ccz) < core.size / 2);
    if (pts.length >= 2) roads.push({ kind, type: p.objektart, name: p.strassenname ?? null, pts });
  }
}
console.log(`  ${roads.length} road pieces`);
await writeFile(new URL('roads.json', OUT), JSON.stringify(roads));
await writeFile(new URL('trees.json', OUT), '[]');

await writeFile(
  new URL('meta.json', OUT),
  JSON.stringify(
    {
      region: config.id,
      origin,
      lakeLevel: baseLevel,
      grids,
      heightUnit: 'dm relative to baseLevel, Int16, rows north to south',
      attribution: '© swisstopo (swissALTI3D, DHM25, swissBUILDINGS3D, swissTLM3D)',
      created: new Date().toISOString().slice(0, 10),
    },
    null,
    2,
  ),
);
console.log('done');
