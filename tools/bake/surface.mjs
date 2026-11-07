// Oberflächenkarten pro Level aus der swisstopo-Basiskarte (Vektor, kein Luftbild):
//   surf_<ring>_roads.png  R = Asphalt, G = Gehweg/Platten, B = Kies/Wege/Gleisschotter
//   surf_<ring>_nat.png    R = Wald, G = Wasser, B = Gletscher
//   surf_<ring>_ext.png    R = Pflaster, G = Siedlung, B = Gebäudegrundrisse (Minikarte)
// (ohne Alphakanal: Browser/sharp würden RGB bei Alpha 0 verwerfen)
// Ringe: core (Kern, fein), mid, far. Norden oben, Quadrat um (E0, N0) mit Halbkante des Rings.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { bakeConfig, ALL_IDS } from './config.mjs';
import { toWGS84 } from './lv95.mjs';
import { features } from './vt.mjs';

// Fahrbahnbreiten (m) nach Strassenklasse
const ROAD_W = { motorway: 11, trunk: 9, primary: 8, secondary: 7, tertiary: 6, minor: 5, service: 3.5, raceway: 6, busway: 6, cycleway: 2 };
const SIDEWALK = { primary: 2.2, secondary: 2.2, tertiary: 2.0, minor: 1.8 };
const PATH_W = { track: 3, path: 1.6, trail: 1.2, footway: 2.0, steps: 2.2, via_ferrata: 0 };

function svgPath(geom, close, tx) {
  let d = '';
  for (const ring of geom) {
    if (ring.length < 2) continue;
    d += ring.map(([E, N], i) => { const [x, y] = tx(E, N); return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`; }).join('');
    if (close) d += 'Z';
  }
  return d;
}

async function raster(size, items) {
  // items: [{ d, fill } | { d, stroke: widthPx }]
  const body = items.map((it) => it.stroke != null
    ? `<path d="${it.d}" fill="none" stroke="#fff" stroke-width="${Math.max(it.stroke, 0.6).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<path d="${it.d}" fill="#fff" fill-rule="evenodd"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="100%" height="100%" fill="#000"/>${body}</svg>`;
  const { data } = await sharp(Buffer.from(svg), { limitInputPixels: false, unlimited: true }).flatten().extractChannel(0).raw().toBuffer({ resolveWithObject: true });
  return data;
}

async function ring(cfg, name, half, size, z, withRoads) {
  const E0 = cfg.E0, N0 = cfg.N0, mpp = (2 * half) / size;
  const tx = (E, N) => [((E - (E0 - half)) / (2 * half)) * size, (((N0 + half) - N) / (2 * half)) * size];
  const pad = 60;
  const { list, tiles } = await features(E0 - half - pad, N0 - half - pad, E0 + half + pad, N0 + half + pad, z,
    ['landcover', 'landuse', 'transportation', 'water', 'waterway', 'building'], toWGS84);
  const L = { asph: [], side: [], grav: [], cob: [], wood: [], water: [], ice: [], res: [], bld: [] };
  for (const f of list) {
    const c = f.props.class, br = f.props.brunnel;
    if (f.layer === 'transportation') {
      if (br === 'tunnel' || br === 'bridge' || c === 'mask_terrain') continue;
      if (f.type === 3) { // Flächen (Plätze)
        const d = svgPath(f.geom, true, tx);
        if (c === 'pedestrian' || c === 'footway') L.cob.push({ d }); else if (ROAD_W[c]) L.asph.push({ d });
        continue;
      }
      const d = svgPath(f.geom, false, tx);
      if (ROAD_W[c]) {
        L.asph.push({ d, stroke: ROAD_W[c] / mpp });
        if (SIDEWALK[c]) L.side.push({ d, stroke: (ROAD_W[c] + 2 * SIDEWALK[c]) / mpp });
      } else if (c === 'pedestrian') L.cob.push({ d, stroke: 6 / mpp });
      else if (c === 'rail' || c === 'transit') L.grav.push({ d, stroke: 3.4 / mpp });
      else if (c === 'footway' || c === 'steps') { L.side.push({ d, stroke: PATH_W[c] / mpp, foot: true }); L.grav.push({ d, stroke: PATH_W[c] / mpp }); }
      else if (PATH_W[c]) L.grav.push({ d, stroke: PATH_W[c] / mpp });
    } else if (f.layer === 'landcover' && f.type === 3) {
      const d = svgPath(f.geom, true, tx);
      if (c === 'wood') L.wood.push({ d }); else if (c === 'ice') L.ice.push({ d });
    } else if (f.layer === 'landuse' && f.type === 3) {
      const d = svgPath(f.geom, true, tx);
      if (c === 'parking') L.asph.push({ d });
      else if (['residential', 'school', 'college', 'university', 'hospital', 'commercial', 'industrial', 'retail'].includes(c)) L.res.push({ d });
    } else if (f.layer === 'building' && f.type === 3) {
      L.bld.push({ d: svgPath(f.geom, true, tx) });
    } else if (f.layer === 'water' && f.type === 3) {
      L.water.push({ d: svgPath(f.geom, true, tx) });
    } else if (f.layer === 'waterway' && f.type === 2 && br !== 'tunnel') {
      const w = c === 'river' ? 14 : c === 'canal' ? 8 : 2;
      L.water.push({ d: svgPath(f.geom, false, tx), stroke: w / mpp });
    }
  }
  const n = size * size;
  const res = await raster(size, L.res);
  const nat = Buffer.alloc(n * 3);
  const [wood, water, ice] = await Promise.all([raster(size, L.wood), raster(size, L.water), raster(size, L.ice)]);
  for (let i = 0; i < n; i++) { nat[i * 3] = wood[i]; nat[i * 3 + 1] = water[i]; nat[i * 3 + 2] = ice[i]; }
  const out = `public/world/${cfg.id}`;
  mkdirSync(out, { recursive: true });
  const save = async (buf, file, s) => {
    await sharp(buf, { raw: { width: size, height: size, channels: 3 } }).png({ compressionLevel: 9 }).toFile(`${out}/${file}.png`);
    await sharp(buf, { raw: { width: size, height: size, channels: 3 } }).resize(s, s).png({ compressionLevel: 9 }).toFile(`${out}/${file}_s.png`);
  };
  await save(nat, `surf_${name}_nat`, size / 2);
  let stat = '';
  if (withRoads) {
    const [asph, sideAll, grav, cob] = await Promise.all([raster(size, L.asph), raster(size, L.side.filter((x) => !x.foot)), raster(size, L.grav), raster(size, L.cob)]);
    const foot = await raster(size, L.side.filter((x) => x.foot));
    const bld = await raster(size, L.bld);
    const roads = Buffer.alloc(n * 3), ext = Buffer.alloc(n * 3);
    let ca = 0, cs = 0;
    for (let i = 0; i < n; i++) {
      const a = asph[i];
      const c = Math.min(cob[i], 255 - a);
      // Gehwege nur in Siedlungen; Fusswege in Siedlungen gepflästert, sonst Kies
      const urban = res[i] / 255;
      const s = Math.min(Math.max(sideAll[i], foot[i]) * urban, 255 - a - c);
      const g = Math.min(grav[i] * (1 - urban * (foot[i] > 0 ? 1 : 0)), 255 - a - c - s);
      roads[i * 3] = a; roads[i * 3 + 1] = Math.max(0, s); roads[i * 3 + 2] = Math.max(0, g); ext[i * 3] = c; ext[i * 3 + 1] = res[i]; ext[i * 3 + 2] = bld[i];
      if (a > 127) ca++; if (s > 127) cs++;
    }
    await save(roads, `surf_${name}_roads`, size / 2);
    await save(ext, `surf_${name}_ext`, size / 2);
    stat = `, Asphalt ${(100 * ca / n).toFixed(1)} %, Gehweg ${(100 * cs / n).toFixed(1)} %`;
  }
  console.log(`${cfg.id} ${name}: ${size}px (${mpp.toFixed(2)} m/px), ${tiles} Kacheln z${z}, ${list.length} Objekte${stat}`);
}

async function build(id) {
  const cfg = { ...bakeConfig(id), id };
  await ring(cfg, 'core', cfg.core, 4096, 14, true);
  await ring(cfg, 'mid', cfg.mid, 2048, 13, true);
  await ring(cfg, 'far', cfg.far, 2048, 10, false);
}

const arg = process.argv[2] || 'all';
for (const id of arg === 'all' ? ALL_IDS : arg.split(',')) await build(id);
