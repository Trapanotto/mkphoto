// Test-Helfer: öffnet das Spiel headless in Edge, führt ein Script aus und macht Screenshots.
// Aufruf: node tools/shot.mjs <script.js> <out-prefix> [width] [height] [--touch]
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const [script, out = 'shot', w = '1280', h = '720'] = process.argv.slice(2);
const touch = process.argv.includes('--touch');
const url = process.env.MK_URL || 'http://localhost:5174/';

const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h }, hasTouch: touch, isMobile: touch });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text().slice(0, 200)}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url);
await page.waitForFunction(() => window.__mk);

// Script kann `shot(name)` aufrufen, um Zwischenbilder zu speichern
let n = 0;
await page.exposeFunction('shot', async (name) => {
  await page.screenshot({ path: `${out}-${name || n++}.png` });
});
const code = readFileSync(script, 'utf8');
const result = await page.evaluate(`(async () => { ${code} })()`);
if (result !== undefined) console.log(JSON.stringify(result, null, 1));
await page.screenshot({ path: `${out}.png` });
const uniq = [...new Set(logs)].filter((l) => process.env.MK_ALL || !/status of 400|could not be decoded|404/.test(l));
if (uniq.length) console.log(uniq.slice(0, 15).join('\n'));
await browser.close();
