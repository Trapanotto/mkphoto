import * as THREE from 'three';
import type { Buildings3d } from './buildings3d';
import type { Landmark, SubjectPoint } from './landmarks';
import { isWater, terrainAt, type TerrainData } from './terrain';

/** Matterhorn summit, Gornergrat ridge (game metres from the Riffelsee origin, from swisstopo). */
const SUMMIT = { x: -8091, z: 774 };
const GORNERGRAT = { x: 1486, z: 56 };

/** Evenly thinned list: at most `max` items. */
const thin = <T>(list: T[], max: number) => (list.length <= max ? list : list.filter((_, i) => i % Math.ceil(list.length / max) === 0));

function boxOf(points: SubjectPoint[]) {
  const box = new THREE.Box3();
  for (const p of points) box.expandByPoint(p.p);
  return box.expandByScalar(5);
}

function normalAt(x: number, z: number, d = 15) {
  const hx = terrainAt(x + d, z) - terrainAt(x - d, z);
  const hz = terrainAt(x, z + d) - terrainAt(x, z - d);
  return new THREE.Vector3(-hx, 2 * d, -hz).normalize();
}

/**
 * Natural landmarks of the Matterhorn region. Their points come straight from the data:
 * the summit pyramid from the height grid, the lake from its water cells, the Gornergrat from its buildings.
 */
export function createAlpineLandmarks(data: TerrainData, houses: Buildings3d): Landmark[] {
  const out: Landmark[] = [];

  // Matterhorn: the top 700 m of the pyramid, lifted a little off the rock so the rock doesn't hide itself
  const grid = data.grids.find((g) => g.name === 'matterhorn') ?? data.grids[1] ?? data.core;
  let top = -Infinity;
  for (let d = 0; d < 400; d += 15)
    for (let a = 0; a < Math.PI * 2; a += 0.4) top = Math.max(top, terrainAt(SUMMIT.x + Math.cos(a) * d, SUMMIT.z + Math.sin(a) * d));
  const peak: SubjectPoint[] = [];
  const step = grid.step * 2;
  for (let z = SUMMIT.z - 1400; z <= SUMMIT.z + 1400; z += step)
    for (let x = SUMMIT.x - 1400; x <= SUMMIT.x + 1400; x += step) {
      const h = terrainAt(x, z);
      if (h < top - 700) continue;
      const n = normalAt(x, z);
      peak.push({ p: new THREE.Vector3(x, h, z).addScaledVector(n, 12), n });
    }
  peak.push({ p: new THREE.Vector3(SUMMIT.x, top + 5, SUMMIT.z) });
  const matterhorn = thin(peak, 90);
  out.push({ id: 'matterhorn', name: 'Matterhorn', box: boxOf(matterhorn), points: matterhorn });

  // Riffelsee: points on the water surface
  const lake: SubjectPoint[] = [];
  const core = data.core;
  for (let j = 0; j < core.count; j++)
    for (let i = 0; i < core.count; i++) {
      const x = core.center.x - core.size / 2 + i * core.step;
      const z = core.center.z - core.size / 2 + j * core.step;
      if (Math.hypot(x, z) < 400 && isWater(x, z)) lake.push({ p: new THREE.Vector3(x, 0.4, z), n: new THREE.Vector3(0, 1, 0) });
    }
  if (lake.length) {
    const pts = thin(lake, 40);
    out.push({ id: 'riffelsee', name: 'Riffelsee', box: boxOf(pts), points: pts });
  }

  // Gornergrat: the hotel and observatory on the ridge, from swissBUILDINGS3D
  const q = houses.unit;
  const P = houses.positions;
  const ridge: SubjectPoint[] = [];
  for (let t = 0; t < houses.triangles; t++) {
    const o = t * 9;
    const x = ((P[o] + P[o + 3] + P[o + 6]) / 3) * q;
    const y = ((P[o + 1] + P[o + 4] + P[o + 7]) / 3) * q;
    const z = ((P[o + 2] + P[o + 5] + P[o + 8]) / 3) * q;
    if (Math.hypot(x - GORNERGRAT.x, z - GORNERGRAT.z) < 180) ridge.push({ p: new THREE.Vector3(x, y + 1, z) });
  }
  if (ridge.length) {
    const pts = thin(ridge, 50);
    out.push({ id: 'gornergrat', name: 'Gornergrat', box: boxOf(pts), points: pts });
  }
  return out;
}
