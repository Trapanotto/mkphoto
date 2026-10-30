// Erzeugt Vorschaubilder der Levels (public/previews/<id>.jpg) direkt aus dem Spiel.
// Voraussetzung: Dev-Server läuft (MK_URL, Standard http://localhost:5174/)
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const url = process.env.MK_URL || 'http://localhost:5174/';
const VIEWS = {
  luzern: ['ensemble', 115, 10, 210],
  aarau: ['bruecke', 225, 12, 165],
  bern: ['muenster', 150, 22, 200],
  lenzburg: ['schloss', 200, 14, 270],
  chillon: ['chillon', 245, 9, 210],
  matterhorn: ['gipfel', 45, 3, 2700],
};
mkdirSync('public/previews', { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(url);
await page.waitForFunction(() => window.__mk);
for (const [id, v] of Object.entries(VIEWS)) {
  if (process.argv.length > 2 && !process.argv.includes(id)) continue;
  await page.evaluate(async ([id, v]) => {
    localStorage.setItem('mkphoto.v1', JSON.stringify({ best: {}, tutorialDone: true }));
    const L = __mk.LEVELS.find((l) => l.id === id);
    __mk.startLevel(L);
    await new Promise((r) => { const i = setInterval(() => { if (document.querySelector('#hud').classList.contains('active')) { clearInterval(i); r(); } }, 300); });
    document.querySelector('#hud').style.visibility = 'hidden';
    document.querySelector('#touch').style.visibility = 'hidden';
    const s = __mk.game.subjects.get(v[0]);
    const [_, az, el, d] = v, R = Math.PI / 180, c = s.center;
    __mk.look(c.x + d * Math.sin(az * R) * Math.cos(el * R), c.y + d * Math.sin(el * R), c.z - d * Math.cos(az * R) * Math.cos(el * R), (az + 180) % 360, -el);
    await new Promise((r) => setTimeout(r, 7000));
  }, [id, v]);
  await page.screenshot({ path: `public/previews/${id}.jpg`, type: 'jpeg', quality: 82 });
  console.log('Vorschau', id);
  await page.evaluate(() => { document.querySelector('#hud').style.visibility = ''; document.querySelector('#touch').style.visibility = ''; });
}
await browser.close();
