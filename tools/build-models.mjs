// Baut alle Blender-Modelle headless: node tools/build-models.mjs [name ...]
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const BLENDER = process.env.BLENDER || [
  'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe',
  '/Applications/Blender.app/Contents/MacOS/Blender',
  'blender',
].find((p) => p === 'blender' || existsSync(p));

const ALL = ['drohne', 'kapellbruecke', 'kettenbruecke', 'muenster', 'bundeshaus', 'lenzburg', 'chillon', 'hoernlihuette'];
const names = process.argv.slice(2).length ? process.argv.slice(2) : ALL;
let failed = 0;
for (const n of names) {
  const r = spawnSync(BLENDER, ['-b', '--factory-startup', '-P', 'tools/blender/build.py', '--', n, `public/models/${n}.glb`], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const ok = out.split('\n').find((l) => l.startsWith('OK '));
  if (ok) console.log(ok);
  else {
    failed++;
    console.log(`FEHLER ${n}:\n` + out.split('\n').filter((l) => /Error|Traceback|File "|line \d/.test(l)).slice(-12).join('\n'));
  }
}
process.exit(failed ? 1 : 0);
