import * as THREE from 'three';
import type { Buildings3d } from './buildings3d';
import type { Landmark, SubjectPoint } from './landmarks';
import { terrainAt, type RoadData } from './terrain';

const thin = <T>(list: T[], max: number) => (list.length <= max ? list : list.filter((_, i) => i % Math.ceil(list.length / max) === 0));

function boxOf(points: SubjectPoint[]) {
  const box = new THREE.Box3();
  for (const p of points) box.expandByPoint(p.p);
  return box.expandByScalar(3);
}

/** A landmark made of the swissBUILDINGS3D triangles around a point (a castle, a hotel). */
export function buildingLandmark(houses: Buildings3d, x: number, z: number, radius: number, id: string, name: string, minY = -Infinity): Landmark | null {
  const q = houses.unit;
  const P = houses.positions;
  const pts: SubjectPoint[] = [];
  for (let t = 0; t < houses.triangles; t++) {
    const o = t * 9;
    const cx = ((P[o] + P[o + 3] + P[o + 6]) / 3) * q;
    const cy = ((P[o + 1] + P[o + 4] + P[o + 7]) / 3) * q;
    const cz = ((P[o + 2] + P[o + 5] + P[o + 8]) / 3) * q;
    if (cy >= minY && Math.hypot(cx - x, cz - z) < radius) pts.push({ p: new THREE.Vector3(cx, cy + 0.5, cz) });
  }
  if (!pts.length) return null;
  const points = thin(pts, 60);
  return { id, name, box: boxOf(points), points };
}

/** A landmark along a line in 3D (a viaduct deck), with points also part way down its piers. */
export function lineLandmark(line: THREE.Vector3[], depth: number, id: string, name: string): Landmark | null {
  if (line.length < 2) return null;
  const pts: SubjectPoint[] = [];
  for (const p of line) {
    pts.push({ p: p.clone().setY(p.y + 1.5) });
    pts.push({ p: p.clone().setY(p.y - depth * 0.5) });
  }
  const points = thin(pts, 60);
  return { id, name, box: boxOf(points), points };
}

/** A road bridge as a landmark: the road piece passing closest to a point, its deck straight between the banks. */
export function roadLandmark(roads: RoadData[], x: number, z: number, id: string, name: string): Landmark | null {
  let best: RoadData | null = null;
  let bestD = 25;
  for (const r of roads) {
    for (const [px, pz] of r.pts) {
      const d = Math.hypot(px - x, pz - z);
      if (d < bestD) (bestD = d), (best = r);
    }
  }
  if (!best) return null;
  const a = best.pts[0];
  const b = best.pts[best.pts.length - 1];
  const ya = terrainAt(a[0], a[1]);
  const yb = terrainAt(b[0], b[1]);
  const line: THREE.Vector3[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    line.push(new THREE.Vector3(a[0] + (b[0] - a[0]) * t, ya + (yb - ya) * t, a[1] + (b[1] - a[1]) * t));
  }
  return lineLandmark(line, 6, id, name);
}
