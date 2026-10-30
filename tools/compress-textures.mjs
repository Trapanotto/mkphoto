// Komprimiert public/tex/*/{diff,nor,rough}.jpg: 1K (Desktop) + 512 (Handy, *_s.jpg)
import sharp from 'sharp';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
for (const set of readdirSync('public/tex', { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
  for (const m of ['diff', 'nor', 'rough']) {
    const p = `public/tex/${set}/${m}.jpg`;
    let src;
    try { src = readFileSync(p); } catch { continue; }
    const q = m === 'diff' ? 82 : 78;
    const big = await sharp(src).resize(1024, 1024, { fit: 'fill' }).jpeg({ quality: q, mozjpeg: true }).toBuffer();
    const small = await sharp(src).resize(512, 512, { fit: 'fill' }).jpeg({ quality: q, mozjpeg: true }).toBuffer();
    writeFileSync(p, big);
    writeFileSync(`public/tex/${set}/${m}_s.jpg`, small);
  }
  console.log('ok', set);
}
