import * as THREE from 'three';
import type { RoofMap } from './buildings3d';
import { toon } from './toon';

/**
 * Land cover from the swisstopo base map (tools/import-landcover.mjs): one class per cell,
 * 2 m in the detailed area and about 12 m further out. The terrain shader paints each class
 * with its own pattern (fields, forest, gardens, vineyards …); rivers become real water areas.
 */
export const LC = {
  none: 0, forest: 1, bushes: 2, park: 3, farmland: 4, vineyard: 5, orchard: 6, rock: 7, scree: 8, ice: 9,
  wetland: 10, sand: 11, residential: 12, industrial: 13, cemetery: 14, sports: 15, parking: 16, campus: 17,
  river: 18, lake: 19, pool: 20, rail: 21,
} as const;

export interface LcGrid {
  name: string;
  x0: number;
  z0: number;
  res: number;
  count: number;
  /** R: class, G: how built-up the surroundings are (0..255), filled in once the buildings are known. */
  data: Uint8Array;
  texture: THREE.DataTexture;
}

export interface Landcover {
  grids: LcGrid[];
  classAt(x: number, z: number): number;
  /** How built-up the surroundings are, 0..1 (only in the detailed area, after bakeDensity). */
  densityAt(x: number, z: number): number;
  /** Stores how built-up each cell's surroundings are: dense old towns get paved, suburbs keep gardens. */
  bakeDensity(roofs: RoofMap): void;
}

async function gunzip(buf: ArrayBuffer) {
  const head = new Uint8Array(buf, 0, 2);
  if (head[0] !== 0x1f || head[1] !== 0x8b) return buf;
  return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}

export async function loadLandcover(baseUrl: string): Promise<Landcover | null> {
  const res = await fetch(baseUrl + 'landcover.json').catch(() => null);
  if (!res?.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null;
  const meta = await res.json();
  const grids: LcGrid[] = await Promise.all(
    meta.grids.map(async (g: Omit<LcGrid, 'data' | 'texture'> & { file: string }) => {
      const raw = new Uint8Array(await gunzip(await (await fetch(baseUrl + g.file)).arrayBuffer()));
      const data = new Uint8Array(g.count * g.count * 2);
      for (let i = 0; i < raw.length; i++) data[i * 2] = raw[i];
      const texture = new THREE.DataTexture(data, g.count, g.count, THREE.RGFormat, THREE.UnsignedByteType);
      texture.minFilter = THREE.NearestFilter;
      texture.magFilter = THREE.NearestFilter;
      texture.needsUpdate = true;
      return { ...g, data, texture };
    }),
  );
  const classAt = (x: number, z: number) => {
    for (const g of grids) {
      const i = Math.floor((x - g.x0) / g.res);
      const j = Math.floor((z - g.z0) / g.res);
      if (i >= 0 && j >= 0 && i < g.count && j < g.count) return g.data[(j * g.count + i) * 2];
    }
    return 0;
  };
  const bakeDensity = (roofs: RoofMap) => {
    const g = grids[0];
    const n = g.count;
    // roofed share within ~28 m, from a summed-area table of the roof map
    const built = new Float32Array((n + 1) * (n + 1));
    for (let j = 0; j < n; j++) {
      let row = 0;
      for (let i = 0; i < n; i++) {
        const x = g.x0 + (i + 0.5) * g.res;
        const z = g.z0 + (j + 0.5) * g.res;
        row += roofs.top(x, z) > -1e9 ? 1 : 0;
        built[(j + 1) * (n + 1) + i + 1] = built[j * (n + 1) + i + 1] + row;
      }
    }
    const r = Math.max(1, Math.round(28 / g.res));
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const a = Math.max(0, i - r), b = Math.min(n, i + r + 1);
        const c = Math.max(0, j - r), d = Math.min(n, j + r + 1);
        const sum = built[d * (n + 1) + b] - built[c * (n + 1) + b] - built[d * (n + 1) + a] + built[c * (n + 1) + a];
        g.data[(j * n + i) * 2 + 1] = Math.round((sum / ((b - a) * (d - c))) * 255);
      }
    g.texture.needsUpdate = true;
  };
  const densityAt = (x: number, z: number) => {
    const g = grids[0];
    const i = Math.floor((x - g.x0) / g.res);
    const j = Math.floor((z - g.z0) / g.res);
    return i >= 0 && j >= 0 && i < g.count && j < g.count ? g.data[(j * g.count + i) * 2 + 1] / 255 : 0;
  };
  return { grids, classAt, densityAt, bakeDensity };
}

/**
 * Terrain material: vertex colours (height and slope) with the land cover painted on top.
 * alpine: open land stays pasture, rock and snow from the vertex colours instead of fields.
 */
export function terrainMaterial(lc: Landcover | null, alpine: boolean) {
  const m = toon('#ffffff');
  m.vertexColors = true;
  if (!lc) return m;
  const g0 = lc.grids[0];
  const g1 = lc.grids[1] ?? lc.grids[0];
  const box = (g: LcGrid) => new THREE.Vector4(g.x0, g.z0, g.count * g.res, g.res);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uLc0 = { value: g0.texture };
    shader.uniforms.uLc1 = { value: g1.texture };
    shader.uniforms.uBox0 = { value: box(g0) };
    shader.uniforms.uBox1 = { value: box(g1) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vW;\nvarying float vUp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = (modelMatrix * vec4(position, 1.0)).xyz;\nvUp = normal.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform sampler2D uLc0, uLc1;
        uniform vec4 uBox0, uBox1;
        varying vec3 vW;
        varying float vUp;
        float lh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float lnoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(lh(i), lh(i + vec2(1, 0)), f.x), mix(lh(i + vec2(0, 1)), lh(i + vec2(1, 1)), f.x), f.y);
        }
        vec2 lcAt(vec2 p) {
          vec2 uv = (p - uBox0.xy) / uBox0.z;
          if (uv.x > 0.0 && uv.y > 0.0 && uv.x < 1.0 && uv.y < 1.0) return texture2D(uLc0, uv).rg;
          uv = (p - uBox1.xy) / uBox1.z;
          if (uv.x > 0.0 && uv.y > 0.0 && uv.x < 1.0 && uv.y < 1.0) return texture2D(uLc1, uv).rg;
          return vec2(0.0);
        }
        float lline(float v, float w) { float d = abs(fract(v) - 0.5); float fw = fwidth(v); return 1.0 - smoothstep(w - fw, w + fw, d); }`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        {
          vec2 p = vW.xz;
          float dist = length(vViewPosition);
          // wobbly borders instead of 2 m stair steps
          vec2 jp = p + (vec2(lnoise(p * 0.45), lnoise(p * 0.45 + 17.0)) - 0.5) * 2.2;
          vec2 lc = lcAt(jp);
          int cls = int(lc.r * 255.0 + 0.5);
          float dens = lc.g;
          float near = 1.0 - smoothstep(220.0, 650.0, dist);
          float steep = 1.0 - vUp;
          float n1 = lnoise(p * 0.18);
          float n2 = lnoise(p * 0.9);
          vec3 c = diffuseColor.rgb;
          if (cls == 1) {
            // forest: dark crowns and lighter gaps
            c = mix(vec3(0.17, 0.36, 0.2), vec3(0.3, 0.52, 0.3), smoothstep(0.35, 0.75, lnoise(p * 0.32)) * 0.8 + n2 * 0.2);
          } else if (cls == 2) {
            c = mix(vec3(0.3, 0.5, 0.27), vec3(0.42, 0.6, 0.32), lnoise(p * 0.5));
          } else if (cls == 3 || cls == 17) {
            // park and campus lawns, mown in stripes
            c = mix(vec3(0.5, 0.76, 0.38), vec3(0.45, 0.71, 0.34), lline(p.x / 7.0 + p.y / 13.0, 0.25) * near);
            if (cls == 17 && lnoise(p * 0.06) > 0.62) c = vec3(0.78, 0.76, 0.71);
          } else if (cls == 5) {
            // vineyard rows
            c = mix(vec3(0.62, 0.52, 0.36), vec3(0.36, 0.55, 0.22), lline(p.x / 1.9 + p.y * 0.18, 0.3 + 0.2 * (1.0 - near)));
          } else if (cls == 6) {
            vec2 q = fract(p / 7.0) - 0.5;
            c = mix(vec3(0.55, 0.74, 0.4), vec3(0.24, 0.47, 0.24), (1.0 - smoothstep(0.18, 0.24, length(q))) * near);
          } else if (cls == 7) {
            c = mix(vec3(0.6, 0.58, 0.54), vec3(0.5, 0.48, 0.45), n2);
          } else if (cls == 8) {
            c = mix(vec3(0.68, 0.64, 0.57), vec3(0.58, 0.55, 0.5), step(0.6, lh(floor(p * 1.5))));
          } else if (cls == 9) {
            c = mix(vec3(0.88, 0.94, 0.97), vec3(0.78, 0.88, 0.94), n1);
          } else if (cls == 10) {
            c = mix(vec3(0.46, 0.6, 0.42), vec3(0.37, 0.53, 0.5), lline(p.y / 3.0 + n1, 0.2));
          } else if (cls == 11) {
            c = mix(vec3(0.82, 0.77, 0.64), vec3(0.74, 0.7, 0.6), n2);
          } else if (cls == 12) {
            // residential: paved lanes and squares where the houses stand close, gardens with hedges elsewhere
            vec2 cell = floor(p / vec2(17.0, 13.0));
            float garden = smoothstep(0.44, 0.34, dens + (lh(cell) - 0.5) * 0.1);
            vec3 paved = mix(vec3(0.76, 0.73, 0.68), vec3(0.7, 0.67, 0.62), lh(floor(p * 2.2)) * near);
            vec3 lawn = mix(vec3(0.52, 0.75, 0.4), vec3(0.47, 0.68, 0.36), lh(cell + 3.0));
            vec2 f = fract(p / vec2(17.0, 13.0));
            float hedge = (1.0 - smoothstep(0.03, 0.06, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)) )) * near;
            // a few short hedges, not a lattice
            lawn = mix(lawn, vec3(0.3, 0.5, 0.27), hedge * step(0.8, lh(cell + 9.0)) * step(f.x, 0.5) * 0.7);
            c = mix(paved, lawn, garden);
          } else if (cls == 13 || cls == 21) {
            c = cls == 13 ? mix(vec3(0.66, 0.65, 0.63), vec3(0.6, 0.59, 0.57), n2) : mix(vec3(0.55, 0.5, 0.46), vec3(0.47, 0.43, 0.4), lh(floor(p * 3.0)));
          } else if (cls == 14) {
            // cemetery: lawn with rows of grave stones
            vec2 q = fract(p / vec2(2.4, 1.6));
            float stone = step(0.3, q.x) * step(q.x, 0.7) * step(0.35, q.y) * step(q.y, 0.65) * near;
            c = mix(vec3(0.47, 0.69, 0.38), vec3(0.62, 0.61, 0.58), stone);
          } else if (cls == 15) {
            c = mix(vec3(0.38, 0.72, 0.3), vec3(0.33, 0.65, 0.27), step(0.5, fract(p.x / 6.0)) * near);
          } else if (cls == 16) {
            // parking: asphalt with painted bays
            c = mix(vec3(0.2, 0.2, 0.215), vec3(0.85, 0.85, 0.83), lline(p.x / 2.6, 0.03) * step(0.3, fract(p.y / 11.0)) * step(fract(p.y / 11.0), 0.78) * near);
          } else if (cls == 18 || cls == 19) {
            c = vec3(0.42, 0.55, 0.52);
          } else if (cls == 20) {
            c = vec3(0.45, 0.82, 0.92);
          } else if ((cls == 0 || cls == 4) && ${alpine ? 'false' : 'true'} && steep < 0.3 && c.g > c.r * 1.15) {
            // open land: a patchwork of fields, each with its own crop and furrows
            vec2 q = vec2(p.x * 0.87 + p.y * 0.5, -p.x * 0.5 + p.y * 0.87);
            vec2 cell = floor(q / vec2(70.0, 38.0));
            float k = lh(cell);
            vec3 crop = k < 0.4 ? vec3(0.47, 0.7, 0.33) : k < 0.6 ? vec3(0.56, 0.74, 0.33) : k < 0.75 ? vec3(0.8, 0.74, 0.42) : k < 0.88 ? vec3(0.42, 0.62, 0.3) : vec3(0.62, 0.5, 0.36);
            float rows = lline(q.y / 1.6, 0.18) * near * step(0.6, k);
            c = mix(crop, crop * 0.86, rows);
            vec2 f = fract(q / vec2(70.0, 38.0));
            c = mix(c, c * 0.92, (1.0 - smoothstep(0.004, 0.012, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)))) * near);
          }
          diffuseColor.rgb = c;
        }`,
      );
  };
  m.customProgramCacheKey = () => `terrain-lc-${alpine}`;
  return m;
}
