// Land cover and water areas from the swisstopo base map vector tiles (swissTLM3D content),
// rasterised for the detailed and the middle height grid of a region:
//
//   node tools/import-landcover.mjs bern
//
// Writes public/data/<region>/landcover.json and one gzipped Uint8 class raster per grid.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gunzipSync, gzipSync } from 'node:zlib';
import { decodeTile, lv95ToWgs, tileLat, tileLon, tileX, tileY, wgsToLv95 } from './mvt.mjs';

const ID = process.argv[2];
if (!ID) throw new Error('usage: node tools/import-landcover.mjs <region>');
const OUT = new URL(`../public/data/${ID}/`, import.meta.url);
const CACHE = new URL('./.cache/vt/', import.meta.url);
const meta = JSON.parse(await readFile(new URL('meta.json', OUT), 'utf8'));
// Luzern still has the older meta format: a core and a far grid around the origin
if (!meta.grids) meta.grids = [{ name: 'core', center: { x: 0, z: 0 }, ...meta.core }, { name: 'far', center: { x: 0, z: 0 }, ...meta.far }];
const origin = meta.origin ?? { e: 2666010, n: 1211541 };
const Z = 14;

/** Class ids shared with src/landcover.ts. */
export const CLASSES = [
  'none', 'forest', 'bushes', 'park', 'farmland', 'vineyard', 'orchard', 'rock', 'scree', 'ice',
  'wetland', 'sand', 'residential', 'industrial', 'cemetery', 'sports', 'parking', 'campus', 'river', 'lake', 'pool', 'rail',
];
const C = Object.fromEntries(CLASSES.map((c, i) => [c, i]));

const LANDUSE = {
  residential: C.residential, industrial: C.industrial, commercial: C.industrial, retail: C.industrial, military: C.industrial,
  cemetery: C.cemetery, sports: C.sports, pitch: C.sports, stadium: C.sports, recreation: C.park, playground: C.park,
  parking: C.parking, school: C.campus, college: C.campus, university: C.campus, hospital: C.campus, railway: C.rail,
  allotments: C.orchard, zoo: C.park, camp_site: C.park, golf_course: C.park, quarry: C.sand, landfill: C.sand,
};
const LANDCOVER = {
  forest: C.forest, woody_plant: C.bushes, wood: C.forest, scrub: C.bushes, park: C.park, grass: C.farmland, meadow: C.farmland,
  farmland: C.farmland, vineyard: C.vineyard, orchard: C.orchard, tree_nursery: C.orchard, rock: C.rock, bare_rock: C.rock,
  scree: C.scree, glacier: C.ice, ice: C.ice, wetland: C.wetland, swamp: C.wetland, sand: C.sand, gravel: C.sand,
};
const WATER = { river: C.river, lake: C.lake, pool: C.pool, basin: C.pool, pond: C.lake, reservoir: C.lake };
const unknown = new Map();

async function tile(x, y) {
  await mkdir(CACHE, { recursive: true });
  const file = new URL(`${Z}-${x}-${y}.pbf`, CACHE);
  let buf = await readFile(file).catch(() => null);
  if (!buf) {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`https://vectortiles${(x + y) % 5}.geo.admin.ch/tiles/ch.swisstopo.base.vt/v1.0.0/${Z}/${x}/${y}.pbf`).catch(() => null);
      if (res?.ok) {
        buf = Buffer.from(await res.arrayBuffer());
        break;
      }
      if (res?.status === 404 || attempt > 4) return {};
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
    await writeFile(file, buf);
  }
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = gunzipSync(buf);
  return decodeTile(new Uint8Array(buf));
}

/** Fills polygons into a raster with the even-odd rule, row by row. */
function fill(raster, count, res, x0, z0, rings, cls) {
  let zmin = Infinity;
  let zmax = -Infinity;
  for (const r of rings) for (const p of r) (zmin = Math.min(zmin, p[1])), (zmax = Math.max(zmax, p[1]));
  const j0 = Math.max(0, Math.ceil((zmin - z0) / res - 0.5));
  const j1 = Math.min(count - 1, Math.floor((zmax - z0) / res - 0.5));
  const xs = [];
  for (let j = j0; j <= j1; j++) {
    const z = z0 + (j + 0.5) * res;
    xs.length = 0;
    for (const r of rings)
      for (let k = 0; k < r.length - 1; k++) {
        const [ax, az] = r[k];
        const [bx, bz] = r[k + 1];
        if ((az <= z && bz > z) || (bz <= z && az > z)) xs.push(ax + ((z - az) / (bz - az)) * (bx - ax));
      }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k] - x0) / res - 0.5));
      const i1 = Math.min(count - 1, Math.floor((xs[k + 1] - x0) / res - 0.5));
      for (let i = i0; i <= i1; i++) raster[j * count + i] = cls;
    }
  }
}

const layerList = [];
const grids = meta.grids.slice(0, 2);
for (const [gi, g] of grids.entries()) {
  // about 1000 cells across: 2 m in a 2 km core, 12 m in a 12 km middle grid
  const res = Math.max(2, Math.ceil(g.size / 1000));
  const count = Math.ceil(g.size / res);
  const x0 = g.center.x - (count * res) / 2;
  const z0 = g.center.z - (count * res) / 2;
  const raster = new Uint8Array(count * count);
  // tile range from the corners
  const corners = [
    [x0, z0],
    [x0 + count * res, z0 + count * res],
  ].map(([x, z]) => lv95ToWgs(origin.e + x, origin.n - z));
  const tx0 = Math.floor(tileX(corners[0][0], Z));
  const tx1 = Math.floor(tileX(corners[1][0], Z));
  const ty0 = Math.floor(tileY(corners[0][1], Z));
  const ty1 = Math.floor(tileY(corners[1][1], Z));
  console.log(`${g.name}: ${count} x ${count} at ${res} m, tiles ${tx1 - tx0 + 1} x ${ty1 - ty0 + 1}`);
  const passes = [
    ['landuse', LANDUSE],
    ['landcover', LANDCOVER],
    ['water', WATER],
  ];
  const tiles = [];
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) tiles.push([tx, ty]);
  const decoded = [];
  for (let k = 0; k < tiles.length; k += 6) {
    decoded.push(...(await Promise.all(tiles.slice(k, k + 6).map(([tx, ty]) => tile(tx, ty).then((t) => [tx, ty, t])))));
  }
  for (const [layer, table] of passes) {
    for (const [tx, ty, t] of decoded) {
      for (const f of t[layer] ?? []) {
        if (f.type !== 3) continue;
        const cls = table[f.props.subclass] ?? table[f.props.class];
        if (cls === undefined) {
          const key = `${layer}:${f.props.class}/${f.props.subclass ?? ''}`;
          unknown.set(key, (unknown.get(key) ?? 0) + 1);
          continue;
        }
        const rings = f.geom.map((ring) =>
          ring.map(([px, py]) => {
            const [e, n] = wgsToLv95(tileLon(tx + px / f.extent, Z), tileLat(ty + py / f.extent, Z));
            return [e - origin.e, origin.n - n];
          }),
        );
        fill(raster, count, res, x0, z0, rings, cls);
      }
    }
  }
  const file = `landcover-${g.name}.bin.gz`;
  await writeFile(new URL(file, OUT), gzipSync(raster, { level: 9 }));
  const hist = {};
  for (const v of raster) hist[CLASSES[v]] = (hist[CLASSES[v]] ?? 0) + 1;
  console.log('  ', Object.entries(hist).map(([k, v]) => `${k} ${((v / raster.length) * 100).toFixed(1)}%`).join(', '));
  layerList.push({ name: g.name, file, x0, z0, res, count, primary: gi === 0 });
}
await writeFile(
  new URL('landcover.json', OUT),
  JSON.stringify({ classes: CLASSES, grids: layerList, attribution: 'swisstopo (Basiskarte Vektor, swissTLM3D)' }),
);
if (unknown.size) console.log('not used:', [...unknown].map(([k, v]) => `${k} ${v}`).join(', '));
