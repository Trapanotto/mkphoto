// Liest die Hide_*-Boxen aus den Wahrzeichen-Modellen und schreibt sie im lokalen LV95-System
// (Blender: x = Ost, y = Nord) nach .cache/bake/<level>/hide.json
import { NodeIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { writeFileSync, mkdirSync } from 'node:fs';
import { bakeConfig, ALL_IDS } from './config.mjs';
import { toLV95 } from './lv95.mjs';

const io = new NodeIO().registerExtensions([KHRDracoMeshCompression]).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
});

const arg = process.argv[2] || 'all';
for (const id of arg === 'all' ? ALL_IDS : arg.split(',')) {
  const cfg = bakeConfig(id);
  const out = [];
  for (const lm of cfg.level.landmarks) {
    const doc = await io.read(`public/${lm.model}`);
    const { E, N } = toLV95(lm.lat, lm.lon);
    const ox = E - cfg.E0, oy = N - cfg.N0;
    const hd = -(lm.heading || 0) * Math.PI / 180;
    for (const node of doc.getRoot().listNodes()) {
      if (!node.getName().startsWith('Hide') || !node.getMesh()) continue;
      const m = node.getWorldMatrix();
      const pts = [];
      for (const prim of node.getMesh().listPrimitives()) {
        const P = prim.getAttribute('POSITION');
        const v = [0, 0, 0];
        for (let i = 0; i < P.getCount(); i++) {
          P.getElement(i, v);
          const x = m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12];
          const z = m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14];
          // glTF (x Ost, z Süd) -> Blender (x Ost, y Nord), Drehung um Heading
          const bx = x, by = -z;
          pts.push([bx * Math.cos(hd) - by * Math.sin(hd) + ox, bx * Math.sin(hd) + by * Math.cos(hd) + oy]);
        }
      }
      // Hauptachse aus Kovarianz
      const n = pts.length, mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
      let sxx = 0, syy = 0, sxy = 0;
      for (const [x, y] of pts) { sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my); }
      const a = 0.5 * Math.atan2(2 * sxy, sxx - syy), c = Math.cos(a), s = Math.sin(a);
      let hx = 0, hy = 0;
      for (const [x, y] of pts) { hx = Math.max(hx, Math.abs((x - mx) * c + (y - my) * s)); hy = Math.max(hy, Math.abs(-(x - mx) * s + (y - my) * c)); }
      out.push({ name: node.getName(), x: +mx.toFixed(2), y: +my.toFixed(2), hx: +hx.toFixed(2), hy: +hy.toFixed(2), c, s });
    }
  }
  mkdirSync(`.cache/bake/${id}`, { recursive: true });
  writeFileSync(`.cache/bake/${id}/hide.json`, JSON.stringify(out, null, 1));
  console.log(id, out.length, 'Hide-Boxen');
}
