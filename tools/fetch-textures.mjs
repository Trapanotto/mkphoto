// Lädt CC0-PBR-Texturen von Poly Haven (polyhaven.com, Lizenz CC0) nach public/tex/<name>/.
// Aufruf: node tools/fetch-textures.mjs [auflösung=1k]
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';

export const SETS = {
  roof_red: 'roof_tiles',
  roof_clay: 'clay_roof_tiles_02',
  roof_slate: 'grey_roof_tiles',
  wood_weathered: 'weathered_planks',
  wood_deck: 'brown_planks_05',
  wood_dark: 'dark_wood',
  wood_rough: 'rough_wood',
  stone_tower: 'castle_wall_varriation',
  stone_medieval: 'medieval_blocks_02',
  sandstone: 'large_sandstone_blocks_01',
  sandstone_old: 'old_sandstone_02',
  castle_wall: 'castle_wall_slates',
  stone_wall: 'stone_wall_04',
  plaster: 'white_plaster_rough_01',
  plaster_old: 'plastered_wall_04',
  rock: 'rock_wall_08',
  granite: 'granite_wall',
  copper: 'green_metal_rust',
  iron: 'rusty_metal_02',
  cobble: 'cobblestone_floor_04',
  concrete_board: 'wood_textured_concrete',
  asphalt: 'asphalt_02',
};

const res = process.argv[2] || '1k';
const MAPS = { diff: ['Diffuse'], nor: ['nor_gl'], rough: ['Rough', 'rough'] };

for (const [name, id] of Object.entries(SETS)) {
  const dir = `public/tex/${name}`;
  mkdirSync(dir, { recursive: true });
  if (existsSync(`${dir}/diff.jpg`) && existsSync(`${dir}/nor.jpg`) && existsSync(`${dir}/rough.jpg`)) { console.log('vorhanden', name); continue; }
  const files = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
  for (const [key, cands] of Object.entries(MAPS)) {
    const entry = cands.map((c) => files[c]).find(Boolean);
    const url = entry?.[res]?.jpg?.url || entry?.[res]?.png?.url;
    if (!url) { console.log('fehlt', name, key); continue; }
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    writeFileSync(`${dir}/${key}.jpg`, buf);
  }
  console.log('ok', name, '<-', id);
}
writeFileSync('public/tex/LICENSE.txt', 'Texturen: Poly Haven (https://polyhaven.com), Lizenz CC0 1.0 – gemeinfrei.\n' +
  Object.entries(SETS).map(([k, v]) => `${k}: https://polyhaven.com/a/${v}`).join('\n') + '\n');
