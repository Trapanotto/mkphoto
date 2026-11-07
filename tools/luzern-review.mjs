// Repeatable Lucerne visual review: MK_URL=... node tools/luzern-review.mjs [high|medium|low]
// Captures fixed views plus basic renderer/frame measurements in .cache/review/.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const quality = process.argv[2] || 'high';
if (!['high', 'medium', 'low'].includes(quality)) throw new Error('quality must be high, medium or low');
const url = process.env.MK_URL || 'http://127.0.0.1:5187/';
const browser = await chromium.launch({
  executablePath: process.env.MK_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(url)) errors.push(`${r.status()} ${r.url()}`); });
  await page.addInitScript((q) => {
    localStorage.setItem('mkphoto.settings.v1', JSON.stringify({ quality: q }));
    localStorage.setItem('mkphoto.v1', JSON.stringify({ best: {}, tutorialDone: true }));
  }, quality);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__mk, { timeout: 30000 });
  await page.evaluate(() => __mk.startLevel(__mk.LEVELS.find((l) => l.id === 'luzern')));
  await page.waitForFunction(() => document.querySelector('#hud')?.classList.contains('active'), { timeout: 120000 });
  const rathaus = await page.evaluate(() => {
    const model = __mk.game.models.getObjectByName('rathausturm');
    if (!model) throw new Error('Rathaus model did not load');
    const quay = __mk.game.world.groundHeight(model.position.x + 2.9, model.position.z + 31.7);
    if (quay == null || Math.abs(model.position.y - quay) > 1.5) {
      throw new Error(`Rathaus base ${model.position.y.toFixed(2)} is not aligned with quay ${quay}`);
    }
    return { base: model.position.y, quay };
  });
  await page.evaluate(() => {
    document.querySelector('#hud').style.visibility = 'hidden';
    document.querySelector('#touch').style.visibility = 'hidden';
  });
  mkdirSync('.cache/review', { recursive: true });
  const views = [
    { name: 'uebersicht', az: 115, elevation: 10, distance: 210 },
    { name: 'reussufer', az: 115, elevation: 10, distance: 115 },
    { name: 'ufer-tief', az: 115, elevation: 3, distance: 115 },
  ];
  const results = [];
  for (const view of views) {
    await page.evaluate(({ az, elevation, distance }) => {
      const c = __mk.game.subjects.get('ensemble').center, r = Math.PI / 180;
      __mk.look(c.x + distance * Math.sin(az * r) * Math.cos(elevation * r),
        c.y + distance * Math.sin(elevation * r),
        c.z - distance * Math.cos(az * r) * Math.cos(elevation * r), (az + 180) % 360, -elevation);
    }, view);
    // Allow streaming textures and shadows to settle before each capture.
    await page.waitForTimeout(4000);
    const stats = await page.evaluate(async () => {
      const frames = [];
      await new Promise((resolve) => {
        const start = performance.now(); let prev = start;
        const frame = (now) => {
          frames.push(now - prev); prev = now;
          if (now - start >= 2000) resolve(); else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      frames.shift(); frames.sort((a, b) => a - b);
      const gl = __mk.renderer.getContext();
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      return { medianFrameMs: frames[Math.floor(frames.length / 2)],
        p95FrameMs: frames[Math.floor(frames.length * 0.95)], samples: frames.length,
        renderer: gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER) };
    });
    const file = `.cache/review/luzern-${quality}-${view.name}.png`;
    await page.screenshot({ path: file });
    results.push({ ...view, file, ...stats });
    console.log(view.name, JSON.stringify(stats));
  }
  const report = { url, quality, measuredAt: new Date().toISOString(), rathaus,
    note: 'Headless browser measurements are for comparison only, not device performance claims.', results, errors };
  writeFileSync(`.cache/review/luzern-${quality}.json`, JSON.stringify(report, null, 2));
  if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`);
} finally {
  await browser.close();
}
