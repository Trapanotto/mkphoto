/**
 * Heights loaded from the swisstopo imports (tools/import-luzern.mjs, tools/import-zermatt.mjs).
 * A region has several square grids, most detailed first; a point uses the first grid that covers it.
 * Heights are metres relative to the region's base level (Lake Lucerne, Riffelsee).
 */

export interface GridInfo {
  name: string;
  file: string;
  center: { x: number; z: number };
  size: number;
  step: number;
  count: number;
}

export interface TerrainMeta {
  region?: string;
  origin: { e: number; n: number };
  lakeLevel: number;
  grids: GridInfo[];
  attribution: string;
}

/** Building footprint from the older VECTOR25 import (kept for the classic building builder). */
export interface BuildingData {
  ring: [number, number][];
  base: number;
  height: number;
}

export interface Grid extends GridInfo {
  heights: Float32Array;
}

/** How water is found: everything at or below the base level (a lake town), or only a lake at that level. */
export interface WaterRule {
  mode: 'below' | 'level';
  /** Points known to be in the water; connected water cells around them form the lake. */
  seeds: [number, number][];
}

/** Terrain within this much of the base level counts as water surface. */
export const WATER_EPS = 0.3;

let grids: Grid[] = [];
let waterMask: Uint8Array | null = null;
let waterRule: WaterRule = { mode: 'below', seeds: [[0, 0]] };

const inside = (g: GridInfo, x: number, z: number) =>
  Math.abs(x - g.center.x) <= g.size / 2 && Math.abs(z - g.center.z) <= g.size / 2;

function sample(g: Grid, x: number, z: number): number {
  const half = g.size / 2;
  const fx = Math.min(Math.max((x - g.center.x + half) / g.step, 0), g.count - 1);
  const fz = Math.min(Math.max((z - g.center.z + half) / g.step, 0), g.count - 1);
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

/** Raw terrain height in metres relative to the base level (below 0 under a lake or down in a valley). */
export function terrainAt(x: number, z: number): number {
  for (const g of grids) if (inside(g, x, z)) return sample(g, x, z);
  return grids.length ? sample(grids[grids.length - 1], x, z) : 0;
}

/** True where the water surface (at height 0) is. */
export function isWater(x: number, z: number): boolean {
  const core = grids[0];
  if (core && waterMask && inside(core, x, z)) {
    const i = Math.round((x - core.center.x + core.size / 2) / core.step);
    const j = Math.round((z - core.center.z + core.size / 2) / core.step);
    return waterMask[j * core.count + i] === 1;
  }
  // outside the detailed area only a lake town has water: whatever lies at or below the lake
  return waterRule.mode === 'below' && terrainAt(x, z) <= WATER_EPS;
}

/** Surface the drone can stand on: terrain, or the water surface over a lake. */
export function heightAt(x: number, z: number): number {
  const t = terrainAt(x, z);
  return isWater(x, z) ? Math.max(0, t) : t;
}

function toGrid(buffer: ArrayBuffer, info: GridInfo): Grid {
  const raw = new Int16Array(buffer);
  const heights = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) heights[i] = raw[i] / 10;
  return { ...info, heights };
}

/**
 * Finds the lake cells of the detailed grid by flooding out from the seeds.
 * 'below': all connected cells at or below the lake are water; other low spots (courtyards) are lifted.
 * 'level': only connected cells at the lake level are water; valleys below stay land.
 */
function buildWaterMask(g: Grid, rule: WaterRule) {
  const n = g.count;
  const water = new Uint8Array(n * n);
  const isLake = (h: number) => (rule.mode === 'below' ? h <= WATER_EPS : Math.abs(h) <= 0.6);
  const stack: number[] = [];
  for (const [x, z] of rule.seeds) {
    const i = Math.round((x - g.center.x + g.size / 2) / g.step);
    const j = Math.round((z - g.center.z + g.size / 2) / g.step);
    if (i >= 0 && j >= 0 && i < n && j < n) stack.push(j * n + i);
  }
  while (stack.length) {
    const k = stack.pop()!;
    if (water[k] || !isLake(g.heights[k])) continue;
    water[k] = 1;
    const i = k % n;
    const j = (k - i) / n;
    if (i > 0) stack.push(k - 1);
    if (i < n - 1) stack.push(k + 1);
    if (j > 0) stack.push(k - n);
    if (j < n - 1) stack.push(k + n);
  }
  if (rule.mode === 'below') {
    for (let k = 0; k < water.length; k++) if (!water[k] && g.heights[k] <= WATER_EPS) g.heights[k] = WATER_EPS + 0.2;
  } else {
    // keep the lake bed just under the surface, and the shore just above it
    for (let k = 0; k < water.length; k++) {
      if (water[k]) g.heights[k] = Math.min(g.heights[k], -0.3);
      else if (Math.abs(g.heights[k]) <= 0.6) g.heights[k] = 0.7;
    }
  }
  return water;
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
  /** Most detailed first. */
  grids: Grid[];
  core: Grid;
  far: Grid;
  roads: RoadData[];
  trees: TreeData[];
}

/** Old single-region files list a core and a far grid instead of a grid list. */
interface LegacyMeta {
  core?: { size: number; step: number; count: number };
  far?: { size: number; step: number; count: number };
}

export async function loadTerrain(baseUrl: string, rule: WaterRule): Promise<TerrainData> {
  const get = async (name: string) => {
    const res = await fetch(baseUrl + name);
    if (!res.ok) throw new Error(`${name}: ${res.status}`);
    return res;
  };
  const raw: TerrainMeta & LegacyMeta = await (await get('meta.json')).json();
  if (!raw.grids && raw.core && raw.far) {
    raw.grids = [
      { name: 'core', file: 'core.bin', center: { x: 0, z: 0 }, ...raw.core },
      { name: 'far', file: 'far.bin', center: { x: 0, z: 0 }, ...raw.far },
    ];
  }
  const meta = raw as TerrainMeta;
  const [buffers, roads, trees] = await Promise.all([
    Promise.all(meta.grids.map((g) => get(g.file).then((r) => r.arrayBuffer()))),
    get('roads.json').then((r) => r.json() as Promise<RoadData[]>),
    get('trees.json').then((r) => r.json() as Promise<TreeData[]>),
  ]);
  grids = meta.grids.map((info, i) => toGrid(buffers[i], info));
  waterRule = rule;
  waterMask = buildWaterMask(grids[0], rule);
  return { meta, grids, core: grids[0], far: grids[grids.length - 1], roads, trees };
}
