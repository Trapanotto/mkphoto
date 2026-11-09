// Bridges, tunnels, steps and open waterways from the swisstopo base map vector tiles, for the
// detailed area of a region. The game uses them to decide where roads run on a deck, where they
// disappear underground, and where brooks really flow in the open.
//
//   node tools/import-structures.mjs bern
//
// Writes public/data/<region>/structures.json.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { decodeTile, lv95ToWgs, tileLat, tileLon, tileX, tileY, wgsToLv95 } from './mvt.mjs';

const ID = process.argv[2];
if (!ID) throw new Error('usage: node tools/import-structures.mjs <region>');
const OUT = new URL(`../public/data/${ID}/`, import.meta.url);
const CACHE = new URL('./.cache/vt/', import.meta.url);
const meta = JSON.parse(await readFile(new URL('meta.json', OUT), 'utf8'));
if (!meta.grids) meta.grids = [{ name: 'core', center: { x: 0, z: 0 }, ...meta.core }];
const origin = meta.origin ?? { e: 2666010, n: 1211541 };
const Z = 14;
const core = meta.grids[0];
const half = core.size / 2;

async function tile(x, y) {
  await mkdir(CACHE, { recursive: true });
  const file = new URL(`${Z}-${x}-${y}.pbf`, CACHE);
  let buf = await readFile(file).catch(() => null);
  if (!buf) {
    const res = await fetch(`https://vectortiles${(x + y) % 5}.geo.admin.ch/tiles/ch.swisstopo.base.vt/v1.0.0/${Z}/${x}/${y}.pbf`);
    if (!res.ok) return {};
    buf = Buffer.from(await res.arrayBuffer());
    await writeFile(file, buf);
  }
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = gunzipSync(buf);
  return decodeTile(new Uint8Array(buf));
}

const corners = [
  [core.center.x - half, core.center.z - half],
  [core.center.x + half, core.center.z + half],
].map(([x, z]) => lv95ToWgs(origin.e + x, origin.n - z));
const tx0 = Math.floor(tileX(corners[0][0], Z)), tx1 = Math.floor(tileX(corners[1][0], Z));
const ty0 = Math.floor(tileY(corners[0][1], Z)), ty1 = Math.floor(tileY(corners[1][1], Z));

const inCore = ([x, z]) => Math.abs(x - core.center.x) <= half + 20 && Math.abs(z - core.center.z) <= half + 20;
const out = { bridges: [], tunnels: [], steps: [], waterways: [], attribution: 'swisstopo (Basiskarte Vektor, swissTLM3D)' };
const ROADS = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service', 'footway', 'path', 'track']);

for (let ty = ty0; ty <= ty1; ty++)
  for (let tx = tx0; tx <= tx1; tx++) {
    const t = await tile(tx, ty);
    const lines = (f) =>
      f.geom
        .map((ring) =>
          ring
            // drop the part in the tile's buffer zone: the neighbour tile has it too
            .filter(([px, py]) => px >= 0 && py >= 0 && px <= f.extent && py <= f.extent)
            .map(([px, py]) => {
              const [e, n] = wgsToLv95(tileLon(tx + px / f.extent, Z), tileLat(ty + py / f.extent, Z));
              return [+(e - origin.e).toFixed(1), +(origin.n - n).toFixed(1)];
            })
            .filter(inCore),
        )
        .filter((l) => l.length >= 2);
    for (const f of t.transportation ?? []) {
      if (f.type !== 2 || !ROADS.has(f.props.class)) continue;
      const list = f.props.brunnel === 'bridge' ? out.bridges : f.props.brunnel === 'tunnel' ? out.tunnels : f.props.subclass === 'steps' ? out.steps : null;
      if (list) list.push(...lines(f));
    }
    for (const f of t.waterway ?? []) {
      if (f.type !== 2 || (f.props.class !== 'stream' && f.props.class !== 'river')) continue;
      for (const pts of lines(f)) out.waterways.push({ cls: f.props.class, width: f.props.width ?? 1, dry: f.props.intermittent ? 1 : 0, pts });
    }
  }
await writeFile(new URL('structures.json', OUT), JSON.stringify(out));
console.log(`${ID}: ${out.bridges.length} bridge pieces, ${out.tunnels.length} tunnel pieces, ${out.steps.length} steps, ${out.waterways.length} waterways`);
