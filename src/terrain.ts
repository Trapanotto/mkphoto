/** Heights loaded from the swisstopo import (see tools/import-luzern.mjs). */

export interface TerrainMeta {
  origin: { e: number; n: number };
  lakeLevel: number;
  core: { size: number; step: number; count: number };
  far: { size: number; step: number; count: number };
  attribution: string;
}

export interface BuildingData {
  ring: [number, number][];
  base: number;
  height: number;
}

export interface Grid {
  size: number;
  step: number;
  count: number;
  heights: Float32Array;
}

/** Water surface sits at 0. Terrain at or below this counts as water and is pushed under it. */
export const WATER_EPS = 0.3;

let core: Grid | null = null;
let far: Grid | null = null;

function sample(g: Grid, x: number, z: number): number {
  const half = g.size / 2;
  const fx = Math.min(Math.max((x + half) / g.step, 0), g.count - 1);
  const fz = Math.min(Math.max((z + half) / g.step, 0), g.count - 1);
  const i0 = Math.floor(fx);
  const j0 = Math.floor(fz);
  const i1 = Math.min(i0 + 1, g.count - 1);
  const j1 = Math.min(j0 + 1, g.count - 1);
  const tx = fx - i0;
  const tz = fz - j0;
  const h = g.heights;
  const n = g.count;
  const top = h[j0 * n + i0] * (1 - tx) + h[j0 * n + i1] * tx;
  const bottom = h[j1 * n + i0] * (1 - tx) + h[j1 * n + i1] * tx;
  return top * (1 - tz) + bottom * tz;
}

/** Raw terrain height in metres above lake level (can be below 0 under water). */
export function terrainAt(x: number, z: number): number {
  if (core && Math.abs(x) <= core.size / 2 && Math.abs(z) <= core.size / 2) return sample(core, x, z);
  if (far) return sample(far, x, z);
  return 0;
}

/** Surface the drone can stand on: terrain or the water surface, whichever is higher. */
export function heightAt(x: number, z: number): number {
  return Math.max(0, terrainAt(x, z));
}

function toGrid(buffer: ArrayBuffer, info: { size: number; step: number; count: number }): Grid {
  const raw = new Int16Array(buffer);
  const heights = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) heights[i] = raw[i] / 10;
  return { ...info, heights };
}

/**
 * Low spots inside the city (courtyards, underpasses) sit at lake level in the data.
 * Only cells connected to the lake and the river stay water; the rest is lifted just above it.
 */
function fillInlandPits(g: Grid) {
  const n = g.count;
  const water = new Uint8Array(n * n);
  // the bridge middle is always in the river
  const seed = Math.floor(n / 2) * n + Math.floor(n / 2);
  const stack = [seed];
  while (stack.length) {
    const k = stack.pop()!;
    if (water[k] || g.heights[k] > WATER_EPS) continue;
    water[k] = 1;
    const i = k % n;
    const j = (k - i) / n;
    if (i > 0) stack.push(k - 1);
    if (i < n - 1) stack.push(k + 1);
    if (j > 0) stack.push(k - n);
    if (j < n - 1) stack.push(k + n);
  }
  for (let k = 0; k < water.length; k++) if (!water[k] && g.heights[k] <= WATER_EPS) g.heights[k] = WATER_EPS + 0.2;
}

export interface RoadData {
  kind: 'car' | 'walk';
  type: number;
  name: string | null;
  pts: [number, number][];
}

/** Tree position and height: [x, z, height]. */
export type TreeData = [number, number, number];

export interface TerrainData {
  meta: TerrainMeta;
  core: Grid;
  far: Grid;
  buildings: BuildingData[];
  roads: RoadData[];
  trees: TreeData[];
}

export async function loadTerrain(baseUrl: string): Promise<TerrainData> {
  const get = async (name: string) => {
    const res = await fetch(baseUrl + name);
    if (!res.ok) throw new Error(`${name}: ${res.status}`);
    return res;
  };
  const meta: TerrainMeta = await (await get('meta.json')).json();
  const [coreBuf, farBuf, buildings, roads, trees] = await Promise.all([
    get('core.bin').then((r) => r.arrayBuffer()),
    get('far.bin').then((r) => r.arrayBuffer()),
    get('buildings.json').then((r) => r.json() as Promise<BuildingData[]>),
    get('roads.json').then((r) => r.json() as Promise<RoadData[]>),
    get('trees.json').then((r) => r.json() as Promise<TreeData[]>),
  ]);
  core = toGrid(coreBuf, meta.core);
  far = toGrid(farBuf, meta.far);
  fillInlandPits(core);
  return { meta, core, far, buildings, roads, trees };
}
