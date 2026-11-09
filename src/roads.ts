import * as THREE from 'three';
import { ObstacleIndex, Strip } from './obstacles';
import { terrainAt, WATER_EPS, type RoadData } from './terrain';
import { toon } from './toon';

/** A road or path, resampled every few metres with its height (terrain or bridge deck). */
export interface Route {
  kind: 'car' | 'walk';
  name: string | null;
  width: number;
  pts: THREE.Vector3[];
  /** Running length at each point. */
  dist: number[];
  length: number;
}

/** swissTLM3D road classes (objektart) → width in metres and surface. */
const CLASSES: Record<number, { width: number; surface: 'asphalt' | 'lane' | 'path' }> = {
  8: { width: 9, surface: 'asphalt' },
  9: { width: 6, surface: 'asphalt' },
  10: { width: 4.5, surface: 'lane' },
  11: { width: 3, surface: 'lane' },
  20: { width: 6, surface: 'lane' },
  15: { width: 1.6, surface: 'path' },
};
const SURFACE = {
  asphalt: new THREE.Color('#66676c'),
  lane: new THREE.Color('#9d9384'),
  pedestrian: new THREE.Color('#b0a490'),
  path: new THREE.Color('#c8bc9f'),
  deck: new THREE.Color('#8a8a8a'),
  pavement: new THREE.Color('#bdb6a8'),
  kerb: new THREE.Color('#d8d3c8'),
};
const STEP = 2.5;
/** Hand-made: the Kapellbrücke has its own deck. */
const DECK_KAPELL = 1.8;

function resample(pts: [number, number][]) {
  const out: [number, number][] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(len / STEP));
    for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  return out;
}

/** Heights along a route: terrain on land, a straight deck between the banks over water. */
function heights(pts: [number, number][], name: string | null) {
  const ground = pts.map(([x, z]) => terrainAt(x, z));
  const water = ground.map((h) => h <= WATER_EPS);
  const y = ground.slice();
  if (name === 'Kapellbrücke') return { y: y.map((h, i) => (water[i] ? DECK_KAPELL : Math.max(h, DECK_KAPELL - 0.3))), bridged: water.map(() => false), hasDeck: false };
  for (let i = 0; i < pts.length; i++) {
    if (!water[i]) continue;
    let s = i;
    while (s > 0 && water[s - 1]) s--;
    let e = i;
    while (e < pts.length - 1 && water[e + 1]) e++;
    const h0 = s > 0 ? ground[s - 1] : 1.5;
    const h1 = e < pts.length - 1 ? ground[e + 1] : h0;
    for (let k = s; k <= e; k++) {
      const t = (k - s + 1) / (e - s + 2);
      y[k] = Math.max(1.5, h0 + (h1 - h0) * t) + 0.3;
    }
    i = e;
  }
  return { y, bridged: water, hasDeck: true };
}

export function createRoads(scene: THREE.Scene, roads: RoadData[], obstacles: ObstacleIndex): Route[] {
  const routes: Route[] = [];
  const pos: number[] = [];
  const col: number[] = [];
  const deckPos: number[] = [];

  const quad = (list: number[], a: number[], b: number[], c: number[], d: number[]) => list.push(...a, ...b, ...c, ...a, ...c, ...d);

  for (const r of roads) {
    const cls = CLASSES[r.type] ?? { width: 2.5, surface: 'path' as const };
    const pedestrianZone = r.kind === 'walk' && cls.surface !== 'path';
    const color = cls.surface === 'asphalt' && r.kind === 'car' ? SURFACE.asphalt : pedestrianZone ? (r.type === 10 || r.type === 20 ? SURFACE.pedestrian : SURFACE.lane) : SURFACE.path;
    const pts2 = resample(r.pts);
    if (pts2.length < 2) continue;
    const { y, bridged, hasDeck } = heights(pts2, r.name);
    // bigger roads sit a hair higher, so crossings don't flicker
    const lift = cls.surface === 'asphalt' ? 0.22 : cls.surface === 'lane' ? 0.18 : 0.14;
    const half = cls.width / 2;

    const pts = pts2.map(([x, z], i) => new THREE.Vector3(x, y[i] + (bridged[i] ? 0 : lift), z));
    const dist = [0];
    for (let i = 1; i < pts.length; i++) dist.push(dist[i - 1] + pts[i].distanceTo(pts[i - 1]));
    routes.push({ kind: r.kind, name: r.name, width: cls.width, pts, dist, length: dist.at(-1)! });

    if (r.name === 'Kapellbrücke') continue; // the model has its own deck
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = (-dz / len) * half;
      const nz = (dx / len) * half;
      const corners = [
        [a.x - nx, a.y, a.z - nz],
        [a.x + nx, a.y, a.z + nz],
        [b.x + nx, b.y, b.z + nz],
        [b.x - nx, b.y, b.z - nz],
      ];
      const onDeck = hasDeck && (bridged[i] || bridged[i + 1]);
      const c = onDeck ? SURFACE.deck : color;
      // counter-clockwise seen from above, so the surface faces up
      quad(pos, corners[0], corners[1], corners[2], corners[3]);
      for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
      if (r.kind === 'car' && !onDeck) {
        // pavements on both sides, a little higher than the road, with a kerb
        for (const s of [-1, 1]) {
          const o1 = half + 0.15, o2 = half + 2.1;
          const p = (base: THREE.Vector3, o: number, up: number) => [base.x + (nx / half) * o * s, base.y + up, base.z + (nz / half) * o * s];
          const inner = [p(a, o1, 0.14), p(b, o1, 0.14)];
          const outer = [p(a, o2, 0.14), p(b, o2, 0.14)];
          const kerb = [p(a, half, 0), p(b, half, 0)];
          const walk = s > 0 ? [inner[0], outer[0], outer[1], inner[1]] : [outer[0], inner[0], inner[1], outer[1]];
          quad(pos, walk[0], walk[1], walk[2], walk[3]);
          for (let k = 0; k < 6; k++) col.push(SURFACE.pavement.r, SURFACE.pavement.g, SURFACE.pavement.b);
          const kq = s > 0 ? [kerb[0], inner[0], inner[1], kerb[1]] : [inner[0], kerb[0], kerb[1], inner[1]];
          quad(pos, kq[0], kq[1], kq[2], kq[3]);
          for (let k = 0; k < 6; k++) col.push(SURFACE.kerb.r, SURFACE.kerb.g, SURFACE.kerb.b);
        }
      }
      if (onDeck) {
        // slab edges and an obstacle so the drone can't fly through the deck
        const drop = 0.9;
        for (const [p, q] of [
          [corners[0], corners[3]],
          [corners[2], corners[1]],
        ]) {
          quad(deckPos, p, q, [q[0], q[1] - drop, q[2]], [p[0], p[1] - drop, p[2]]);
        }
        const strip = new Strip(a.x, a.z, b.x, b.z, half, Math.min(a.y, b.y) - drop, Math.max(a.y, b.y), Math.max(a.y, b.y));
        obstacles.add(strip);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mat = toon('#ffffff');
  mat.vertexColors = true;
  mat.side = THREE.DoubleSide;
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -2;
  mat.polygonOffsetUnits = -2;
  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);

  const deckGeo = new THREE.BufferGeometry();
  deckGeo.setAttribute('position', new THREE.Float32BufferAttribute(deckPos, 3));
  deckGeo.computeVertexNormals();
  const deckMat = toon('#8f8d88');
  deckMat.side = THREE.DoubleSide;
  scene.add(new THREE.Mesh(deckGeo, deckMat));
  return routes;
}

/** Position and direction at a distance along a route. */
export function along(route: Route, d: number, out: THREE.Vector3, dir?: THREE.Vector3) {
  const dist = route.dist;
  let lo = 0;
  let hi = dist.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (dist[mid] <= d) lo = mid;
    else hi = mid;
  }
  const t = (d - dist[lo]) / ((dist[hi] - dist[lo]) || 1);
  out.lerpVectors(route.pts[lo], route.pts[hi], Math.min(1, Math.max(0, t)));
  if (dir) dir.subVectors(route.pts[hi], route.pts[lo]).normalize();
  return out;
}
