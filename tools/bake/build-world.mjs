// Komplette Welt eines Levels bauen: Geodaten laden (einmalig, gecacht) -> Blender -> public/world/<level>/
// Aufruf: node tools/bake/build-world.mjs <level|all> [--skip-fetch] [--skip-terrain]
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { ALL_IDS } from './config.mjs';

const BLENDER = process.env.BLENDER || ['C:/Program Files/Blender Foundation/Blender 5.2/blender.exe', '/Applications/Blender.app/Contents/MacOS/Blender', 'blender']
  .find((p) => p === 'blender' || existsSync(p));
const args = process.argv.slice(2);
const ids = (args[0] && !args[0].startsWith('--') ? args[0] : 'all') === 'all' ? ALL_IDS : args[0].split(',');
const run = (cmd, a, env = {}) => {
  const r = spawnSync(cmd, a, { stdio: 'inherit', env: { ...process.env, ...env } });
  if (r.status !== 0) throw new Error(`${cmd} ${a.join(' ')} fehlgeschlagen`);
};

for (const id of ids) {
  console.log(`\n### ${id}`);
  if (!args.includes('--skip-fetch')) {
    run('node', ['tools/bake/fetch.mjs', id]);
    run('node', ['tools/bake/fetch3d.mjs', id]);
  }
  run('node', ['tools/bake/hides.mjs', id]);
  run(BLENDER, ['-b', '--factory-startup', '-P', 'tools/blender/world.py', '--', id], args.includes('--skip-terrain') ? { MK_SKIP_TERRAIN: '1' } : {});
}
