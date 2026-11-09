import * as THREE from 'three';
import { ObstacleIndex, Strip } from './obstacles';
import { isWater, terrainAt, type RoadData, type Structures } from './terrain';
import { striped, toon } from './toon';

/** A road or path, resampled every few metres with its height (terrain or bridge deck). */
export interface Route {
  kind: 'car' | 'walk';
  name: string | null;
  width: number;
  pts: THREE.Vector3[];
  /** A car road with pavements beside it (people walk there, not on the verge). */
  pavement: boolean;
  /** Cars may use it: the main roads, and the small asphalt roads between them. */
  drivable: boolean;
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
  pavement: new THREE.Color('#a9a8a4'),
  kerb: new THREE.Color('#d8d3c8'),
  minor: new THREE.Color('#77787d'),
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

/**
 * Heights along a route: terrain on land, a straight deck between the banks on a bridge.
 * flagged: where the map data says the road is on a bridge (null: no data, guess from the terrain).
 */
function heights(pts: [number, number][], name: string | null, lakeBridges: boolean, wet: (x: number, z: number) => boolean, flagged: boolean[] | null) {
  const ground = pts.map(([x, z]) => terrainAt(x, z));
  const n = pts.length;
  if (!flagged) {
    // swissTLM3D splits roads at bridges: a piece whose middle sags far below its ends spans a valley
    const length = (n - 1) * STEP;
    const straight = Math.hypot(pts[n - 1][0] - pts[0][0], pts[n - 1][1] - pts[0][1]) > 0.9 * length;
    // only short, straight pieces: a winding mountain road dipping into a gully stays on the ground
    if (n > 4 && straight && length < 500) {
      const line = (i: number) => ground[0] + ((ground[n - 1] - ground[0]) * i) / (n - 1);
      let sag = 0;
      for (let i = 0; i < n; i++) sag = Math.max(sag, line(i) - ground[i]);
      if (sag > 6) return { y: ground.map((_, i) => line(i) + 0.3), bridged: ground.map((g, i) => line(i) - g > 2), hasDeck: true };
    }
  }
  // lake crossings only where the region wants them (Luzern); without bridge data, rivers get one too
  const water = pts.map(([x, z]) => (lakeBridges && isWater(x, z)) || (!flagged && wet(x, z)));
  // only real crossings get a deck: a path brushing the shore stays on the ground
  for (let i = 0; i < water.length; i++) {
    if (!water[i]) continue;
    let e = i;
    while (e < water.length - 1 && water[e + 1]) e++;
    if ((e - i + 1) * STEP < 12) for (let k = i; k <= e; k++) water[k] = false;
    i = e;
  }
  if (flagged) for (let i = 0; i < n; i++) water[i] ||= flagged[i];
  const y = ground.slice();
  if (name === 'Kapellbrücke') return { y: y.map((h, i) => (water[i] ? DECK_KAPELL : Math.max(h, DECK_KAPELL - 0.3))), bridged: water.map(() => false), hasDeck: false };
  for (let i = 0; i < pts.length; i++) {
    if (!water[i]) continue;
    let s = i;
    while (s > 0 && water[s - 1]) s--;
    let e = i;
    while (e < pts.length - 1 && water[e + 1]) e++;
    const lake = isWater(pts[i][0], pts[i][1]);
    const h0 = s > 0 ? ground[s - 1] : e < pts.length - 1 ? ground[e + 1] : lake ? 1.5 : ground[s];
    const h1 = e < pts.length - 1 ? ground[e + 1] : h0;
    for (let k = s; k <= e; k++) {
      const t = (k - s + 1) / (e - s + 2);
      const deck = h0 + (h1 - h0) * t;
      // never below the ground it crosses, and clear of the water on a lake
      y[k] = Math.max(lake ? 1.5 : -Infinity, deck, ground[k]) + 0.3;
    }
    i = e;
  }
  return { y, bridged: water, hasDeck: true };
}

/** Finds map lines (bridges, tunnels, steps) that run along a point of a road. */
function lineIndex(lines: [number, number][][]) {
  const CELL = 16;
  const cells = new Map<number, number[][]>();
  for (const l of lines)
    for (let i = 0; i < l.length - 1; i++) {
      const [ax, az] = l[i];
      const [bx, bz] = l[i + 1];
      const seg = [ax, az, bx, bz];
      for (let x = Math.floor((Math.min(ax, bx) - 5) / CELL); x <= Math.floor((Math.max(ax, bx) + 5) / CELL); x++)
        for (let z = Math.floor((Math.min(az, bz) - 5) / CELL); z <= Math.floor((Math.max(az, bz) + 5) / CELL); z++) {
          const k = x * 100003 + z;
          (cells.get(k) ?? cells.set(k, []).get(k)!).push(seg);
        }
    }
  /** True if a line passes within r of the point, running roughly along (tx, tz). */
  return (x: number, z: number, tx: number, tz: number, r: number) => {
    for (const [ax, az, bx, bz] of cells.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL)) ?? []) {
      const dx = bx - ax, dz = bz - az;
      const len2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
      if (Math.hypot(x - ax - dx * t, z - az - dz * t) > r) continue;
      if (Math.abs(dx * tx + dz * tz) / Math.sqrt(len2) > 0.75) return true;
    }
    return false;
  };
}

/** Lane markings on roads, cobbles in lanes, slabs on pavements and squares, gravel on paths. */
function roadMaterial() {
  const m = toon('#ffffff');
  m.vertexColors = true;
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aRoad;\nattribute float aEnd;\nvarying vec4 vRoad;\nvarying float vEnd;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoad = aRoad;\nvEnd = aEnd;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec4 vRoad;
        varying float vEnd;
        float rh2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float joints(vec2 q, float w) {
          vec2 f = abs(fract(q) - 0.5);
          vec2 fw = fwidth(q);
          return max(smoothstep(0.5 - w - fw.x, 0.5 - w, f.x), smoothstep(0.5 - w - fw.y, 0.5 - w, f.y));
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float along = vRoad.x, across = vRoad.y, width = vRoad.w;
          int kind = int(vRoad.z + 0.5);
          float near = 1.0 - smoothstep(90.0, 220.0, length(vViewPosition));
          vec3 c = diffuseColor.rgb;
          if (kind == 0) {
            float side = across * width * 0.5;
            // patched asphalt, a dashed centre line and solid edge lines on wider roads
            c *= 0.95 + 0.08 * rh2(floor(vec2(along / 3.0, across * 2.0)));
            float centre = step(5.5, width) * (1.0 - smoothstep(0.06, 0.09, abs(side))) * step(fract(along / 9.0), 0.45);
            float edge = step(6.5, width) * (1.0 - smoothstep(0.06, 0.09, abs(abs(side) - (width * 0.5 - 0.45))));
            // no markings across junctions
            float open = smoothstep(7.0, 8.0, vEnd);
            c = mix(c, vec3(0.93, 0.93, 0.9), max(centre, edge) * open * near);
          } else if (kind == 1) {
            // cobblestones in staggered rows
            vec2 q = vec2(along / 0.32, across * width * 0.5 / 0.3);
            q.x += mod(floor(q.y), 2.0) * 0.5;
            float tone = rh2(floor(q));
            c *= 0.9 + 0.16 * tone * near;
            c = mix(c, c * 0.72, joints(q, 0.1) * near);
          } else if (kind == 2) {
            vec2 q = vec2(along / 0.9, across * width * 0.5 / 0.6);
            q.x += mod(floor(q.y), 2.0) * 0.5;
            c *= 0.95 + 0.07 * rh2(floor(q)) * near;
            c = mix(c, c * 0.8, joints(q, 0.03) * near);
          } else if (kind == 3) {
            // gravel, darker along the worn edges
            c *= 0.92 + 0.14 * rh2(floor(vec2(along, across * width) * 6.0)) * near;
            c *= 1.0 - 0.12 * smoothstep(0.65, 1.0, abs(across));
          } else if (kind == 4) {
            // pavement: asphalt with a seam along the middle and across every few metres
            vec2 q = vec2(along / 4.0, across / 2.0 + 0.5);
            c *= 0.96 + 0.06 * rh2(floor(vec2(along, across) * 3.0)) * near;
            c = mix(c, c * 0.84, joints(q, 0.012) * near);
          } else if (kind == 7) {
            // zebra crossing, yellow as in Switzerland
            c = mix(c, vec3(0.96, 0.8, 0.16), step(fract(across * width * 0.5 / 1.0 + 0.25), 0.5));
          } else if (kind == 8) {
            c *= 0.96 + 0.07 * rh2(floor(vec2(along / 3.0, across * 2.0)));
          } else if (kind == 9) {
            // steps
            float st = fract(along / 0.38);
            c = mix(c * 1.06, c * 0.72, smoothstep(0.75, 0.8, st) * near);
          } else if (kind == 6) {
            c = mix(c, c * 0.75, smoothstep(0.0, fwidth(along / 12.0) + 0.002, abs(fract(along / 12.0) - 0.5) - 0.48) * near);
          }
          diffuseColor.rgb = c;
        }`,
      );
  };
  m.customProgramCacheKey = () => 'road-surface';
  return m;
}

const mat4 = (x: number, y: number, z: number, yaw: number, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(sx, sy, sz));

export interface RoadOptions {
  /** Bridge every crossing of the lake (Luzern), not only where the map data has a bridge. */
  lakeBridges: boolean;
  /** Wide rivers, used to guess bridges where there is no bridge data. */
  wet: (x: number, z: number) => boolean;
  structures: Structures | null;
  /** Dense old town: lanes are cobbled or paved with slabs there. */
  oldTown: (x: number, z: number) => boolean;
  /** Built-up land: roads get pavements and street lamps there. */
  urban: (x: number, z: number) => boolean;
  /** Mountain regions: small roads outside the villages are gravel tracks. */
  gravelLanes: boolean;
}

interface Vtx {
  p: number[];
  along: number;
  across: number;
  end: number;
}

interface Run {
  road: RoadData;
  kind: number;
  color: THREE.Color;
  half: number;
  lift: number;
  pts: THREE.Vector3[];
  /** Unit normal across the road at each point, and how much wider a bend's corner has to reach. */
  nrm: [number, number, number][];
  dist: number[];
  bridged: boolean[];
  hasDeck: boolean;
}

/** lampGlow: material of the lamp heads, lit at night by the time of day. */
export function createRoads(scene: THREE.Scene, roads: RoadData[], obstacles: ObstacleIndex, lampGlow: THREE.Material, opts: RoadOptions): Route[] {
  const rails: THREE.Matrix4[] = [];
  const posts: THREE.Matrix4[] = [];
  const piers: THREE.Matrix4[] = [];
  const poles: THREE.Matrix4[] = [];
  const lamps: THREE.Matrix4[] = [];
  const routes: Route[] = [];
  const pos: number[] = [];
  const col: number[] = [];
  /** Per vertex: distance along, position across (-1..1, or metres on pavements), surface kind, width. */
  const att: number[] = [];
  const ends: number[] = [];
  const deckPos: number[] = [];

  /** One triangle, turned so it faces up. */
  const tri = (a: Vtx, b: Vtx, c: Vtx, color: THREE.Color, kind: number, width: number) => {
    const up = (b.p[2] - a.p[2]) * (c.p[0] - a.p[0]) - (b.p[0] - a.p[0]) * (c.p[2] - a.p[2]);
    for (const v of up >= 0 ? [a, b, c] : [a, c, b]) {
      pos.push(v.p[0], v.p[1], v.p[2]);
      col.push(color.r, color.g, color.b);
      att.push(v.along, v.across, kind, width);
      ends.push(v.end);
    }
  };
  const quad4 = (a: Vtx, b: Vtx, c: Vtx, d: Vtx, color: THREE.Color, kind: number, width: number) => {
    tri(a, b, c, color, kind, width);
    tri(a, c, d, color, kind, width);
  };
  const quad = (list: number[], a: number[], b: number[], c: number[], d: number[]) => list.push(...a, ...b, ...c, ...a, ...c, ...d);

  const st = opts.structures;
  const onBridge = st ? lineIndex(st.bridges) : null;
  const inTunnel = st ? lineIndex(st.tunnels) : null;
  const onSteps = st ? lineIndex(st.steps) : null;
  const roofed = (x: number, z: number) => !!obstacles.roofs && obstacles.roofs.top(x, z) > -1e9;

  // --- Pass 1: every road as one or more runs (cut where it goes underground) ----------------
  const runs: Run[] = [];
  for (const r of roads) {
    const cls = CLASSES[r.type] ?? { width: 2.5, surface: 'path' as const };
    const pts2 = resample(r.pts);
    if (pts2.length < 2) continue;
    const dir = (i: number) => {
      const a = pts2[Math.max(0, i - 1)], b = pts2[Math.min(pts2.length - 1, i + 1)];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
    };
    const flagged = onBridge ? pts2.map(([x, z], i) => onBridge(x, z, dir(i)[0], dir(i)[1], 3)) : null;
    const hidden = inTunnel ? pts2.map(([x, z], i) => !flagged![i] && inTunnel(x, z, dir(i)[0], dir(i)[1], 3)) : pts2.map(() => false);
    const h = heights(pts2, r.name, opts.lakeBridges, opts.wet, flagged);
    const { y, bridged, hasDeck } = h;
    // without lake bridges (mountain lakes) a path just follows the shore, above the water
    if (!opts.lakeBridges) for (let i = 0; i < y.length; i++) if (!bridged[i] && isWater(pts2[i][0], pts2[i][1])) y[i] = Math.max(y[i], 0.2);
    // bigger roads sit a hair higher, so crossings don't flicker
    const lift = cls.surface === 'asphalt' ? 0.22 : cls.surface === 'lane' ? 0.18 : 0.14;
    const mid = pts2[pts2.length >> 1];
    const car = cls.surface === 'asphalt' && r.kind === 'car';
    let kind: number;
    let color: THREE.Color;
    if (car) (kind = 0), (color = SURFACE.asphalt);
    else if (cls.surface === 'path') {
      const stairs = !!onSteps && onSteps(mid[0], mid[1], dir(pts2.length >> 1)[0], dir(pts2.length >> 1)[1], 2.5);
      (kind = stairs ? 9 : 3), (color = stairs ? SURFACE.pavement : SURFACE.path);
    } else if (opts.oldTown(mid[0], mid[1])) {
      const square = r.type === 10 || r.type === 20;
      (kind = square ? 2 : 1), (color = square ? SURFACE.pedestrian : SURFACE.lane);
    } else if (opts.gravelLanes && !opts.urban(mid[0], mid[1])) (kind = 3), (color = SURFACE.lane);
    else (kind = 8), (color = SURFACE.minor);

    for (let s = 0; s < pts2.length; s++) {
      if (hidden[s]) continue;
      let e = s;
      while (e < pts2.length - 1 && !hidden[e + 1]) e++;
      if (e > s) {
        const pts = pts2.slice(s, e + 1).map(([x, z], i) => new THREE.Vector3(x, y[s + i] + (bridged[s + i] ? 0 : lift), z));
        const dist = [0];
        for (let i = 1; i < pts.length; i++) dist.push(dist[i - 1] + pts[i].distanceTo(pts[i - 1]));
        // normals across the road; in a bend the corner reaches further out, so the edges stay parallel
        const nrm: [number, number, number][] = pts.map((_, i) => {
          const a = pts[Math.max(0, i - 1)], b = pts[i], c = pts[Math.min(pts.length - 1, i + 1)];
          const l1 = Math.hypot(b.x - a.x, b.z - a.z) || 1, l2 = Math.hypot(c.x - b.x, c.z - b.z) || 1;
          const t1 = i === 0 ? [(c.x - b.x) / l2, (c.z - b.z) / l2] : [(b.x - a.x) / l1, (b.z - a.z) / l1];
          const t2 = i === pts.length - 1 ? t1 : [(c.x - b.x) / l2, (c.z - b.z) / l2];
          let nx = -(t1[1] + t2[1]), nz = t1[0] + t2[0];
          const nl = Math.hypot(nx, nz) || 1;
          (nx /= nl), (nz /= nl);
          const cos = Math.max(0.6, nx * -t1[1] + nz * t1[0]);
          return [nx, nz, 1 / cos];
        });
        runs.push({ road: r, kind, color, half: cls.width / 2, lift, pts, nrm, dist, bridged: bridged.slice(s, e + 1), hasDeck });
        routes.push({ kind: r.kind, name: r.name, width: cls.width, pavement: kind === 0 && opts.urban(mid[0], mid[1]), drivable: kind === 0 || (kind === 8 && cls.width >= 4), pts, dist, length: dist.at(-1)! });
      }
      s = e;
    }
  }

  // car roads in a grid: pavements stop where another road's asphalt lies, paths get zebra crossings
  const CELL = 14;
  const carCells = new Map<number, [number, number, number, number, number, number, number, number][]>();
  runs.forEach((run, id) => {
    if (run.kind !== 0) return;
    for (let i = 0; i < run.pts.length - 1; i++) {
      const a = run.pts[i], b = run.pts[i + 1];
      for (let x = Math.floor((Math.min(a.x, b.x) - 8) / CELL); x <= Math.floor((Math.max(a.x, b.x) + 8) / CELL); x++)
        for (let z = Math.floor((Math.min(a.z, b.z) - 8) / CELL); z <= Math.floor((Math.max(a.z, b.z) + 8) / CELL); z++) {
          const k = x * 100003 + z;
          (carCells.get(k) ?? carCells.set(k, []).get(k)!).push([a.x, a.z, b.x, b.z, run.half, id, a.y, b.y]);
        }
    }
  });
  const onOtherRoad = (x: number, z: number, self: number, margin: number) => {
    for (const [ax, az, bx, bz, half, id] of carCells.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL)) ?? []) {
      if (id === self) continue;
      const dx = bx - ax, dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      if (Math.hypot(x - ax - dx * t, z - az - dz * t) < half + margin) return true;
    }
    return false;
  };

  // an end is a junction where three or more road ends meet, or where it runs into another road
  const endCount = new Map<string, number>();
  const endKey = (p: THREE.Vector3) => `${Math.round(p.x / 2.5)},${Math.round(p.z / 2.5)}`;
  for (const run of runs) if (run.kind === 0) for (const p of [run.pts[0], run.pts.at(-1)!]) endCount.set(endKey(p), (endCount.get(endKey(p)) ?? 0) + 1);
  const isJunction = (p: THREE.Vector3, self: number) => {
    let n = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) n = Math.max(n, endCount.get(`${Math.round(p.x / 2.5) + dx},${Math.round(p.z / 2.5) + dz}`) ?? 0);
    return n !== 2 && (n >= 3 || onOtherRoad(p.x, p.z, self, 0.5));
  };

  // --- Pass 2: surfaces -------------------------------------------------------------------
  const zebraDone = new Set<string>();
  runs.forEach((run, id) => {
    const { road: r, pts, nrm, dist, bridged, half, kind, color } = run;
    if (r.name === 'Kapellbrücke') return; // the model has its own deck
    const length = dist.at(-1)!;
    const width = half * 2;
    let bridgeStep = 0;
    const j0 = kind === 0 && isJunction(pts[0], id), j1 = kind === 0 && isJunction(pts.at(-1)!, id);
    /** Distance to the nearest junction end of this piece (far away if it simply continues). */
    const toEnd = (d: number) => Math.min(j0 ? d : 999, j1 ? length - d : 999);
    /** A point across the road: o metres from the centre line, following the ground off a bridge. */
    const at = (i: number, o: number, up = 0): Vtx => {
      const p = pts[i];
      const [nx, nz, k] = nrm[i];
      const x = p.x + nx * o * k, z = p.z + nz * o * k;
      const ground = bridged[i] ? p.y : Math.min(p.y + 0.9, Math.max(p.y - 0.9, terrainAt(x, z) + run.lift));
      return { p: [x, ground + up, z], along: dist[i], across: o / half, end: toEnd(dist[i]) };
    };
    const urbanRun = kind === 0 && opts.urban(pts[pts.length >> 1].x, pts[pts.length >> 1].z);
    // where a pavement fits: not across another road, not through a house; short leftovers are dropped
    const walkable = [-1, 1].map((s) => {
      const ok = pts.slice(0, -1).map((_, i) => {
        if (!urbanRun || bridged[i] || bridged[i + 1]) return false;
        const ma = at(i, (half + 1.1) * s), mb = at(i + 1, (half + 1.1) * s);
        return !onOtherRoad(ma.p[0], ma.p[2], id, 1.4) && !onOtherRoad(mb.p[0], mb.p[2], id, 1.4) && !roofed(ma.p[0], ma.p[2]) && !roofed(mb.p[0], mb.p[2]);
      });
      for (let i = 0; i < ok.length; i++) {
        if (!ok[i]) continue;
        let e = i;
        while (e < ok.length - 1 && ok[e + 1]) e++;
        if (e - i < 3) for (let k = i; k <= e; k++) ok[k] = false;
        i = e;
      }
      return ok;
    });

    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      const onDeck = run.hasDeck && (bridged[i] || bridged[i + 1]);
      const c = onDeck ? SURFACE.deck : color;
      const k = onDeck ? 6 : kind;
      const la = at(i, -half), ra = at(i, half), rb = at(i + 1, half), lb = at(i + 1, -half);
      quad4(la, ra, rb, lb, c, k, width);

      if (kind === 0 && !onDeck && urbanRun) {
        // pavements on both sides, a little higher than the road, with a kerb
        for (const s of [-1, 1]) {
          const o1 = (half + 0.15) * s, o2 = (half + 2.1) * s;
          if (!walkable[s < 0 ? 0 : 1][i]) continue;
          const ia = at(i, o1, 0.14), ib = at(i + 1, o1, 0.14), oa = at(i, o2, 0.14), ob = at(i + 1, o2, 0.14);
          for (const v of [ia, ib]) v.across = 0;
          for (const v of [oa, ob]) v.across = 2;
          quad4(ia, oa, ob, ib, SURFACE.pavement, 4, 2);
          quad4(at(i, half * s), ia, ib, at(i + 1, half * s), SURFACE.kerb, 5, 0);
          // street lamps every 30 m or so, on alternating sides
          const slot = Math.floor(dist[i] / 30);
          if (slot !== Math.floor(dist[i + 1] / 30) && (slot % 2 === 0 ? 1 : -1) === s) {
            const yaw = Math.atan2(dx, dz);
            poles.push(mat4(oa.p[0], oa.p[1] + 2.4, oa.p[2], yaw));
            lamps.push(mat4(oa.p[0] - nrm[i][0] * 0.5 * s, oa.p[1] + 4.75, oa.p[2] - nrm[i][1] * 0.5 * s, yaw));
          }
        }
      }

      if (onDeck) {
        const nx = (-dz / len) * half, nz = (dx / len) * half;
        const corners = [la.p, ra.p, rb.p, lb.p];
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

        // railings: a post at every step and a hand rail along both edges
        const yaw = Math.atan2(dx, dz);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, mz = (a.z + b.z) / 2;
        for (const s of [-1, 1]) {
          const ex = (nx / half) * (half - 0.1) * s, ez = (nz / half) * (half - 0.1) * s;
          rails.push(mat4(mx + ex, my + 1.05, mz + ez, yaw, 1, 1, len));
          rails.push(mat4(mx + ex, my + 0.55, mz + ez, yaw, 1, 0.6, len));
          posts.push(mat4(a.x + ex, a.y + 0.55, a.z + ez, yaw));
        }
        // piers down to the ground or into the water every 20 m: two on road bridges, one under footbridges
        const below = a.y - drop - Math.max(-4, terrainAt(a.x, a.z));
        if (bridgeStep % 8 === 4 && below > 1.5) {
          const depth = below + 1;
          const cols = r.kind === 'car' ? [-0.55, 0.55] : [0];
          for (const c of cols) {
            const w = r.kind === 'car' ? 1.4 : 0.5;
            piers.push(mat4(a.x + (nx / half) * half * c, a.y - drop - depth / 2, a.z + (nz / half) * half * c, yaw, w, depth, w * 1.6));
          }
        }
        // street lamps every 25 m, alternating sides
        if (bridgeStep % 10 === 2) {
          const s = (bridgeStep / 10) % 2 < 1 ? 1 : -1;
          const ex = (nx / half) * (half - 0.25) * s, ez = (nz / half) * (half - 0.25) * s;
          poles.push(mat4(a.x + ex, a.y + 2.4, a.z + ez, yaw));
          lamps.push(mat4(a.x + ex * 0.8, a.y + 4.75, a.z + ez * 0.8, yaw));
        }
        bridgeStep++;
      }

      // a zebra crossing where a footpath crosses a road
      if (r.kind === 'walk' && !onDeck) {
        for (const [ax, az, bx, bz, h2, , ay, by] of carCells.get(Math.floor(a.x / CELL) * 100003 + Math.floor(a.z / CELL)) ?? []) {
          const ex = bx - ax, ez = bz - az;
          const d = dx * ez - dz * ex;
          if (Math.abs(d) < 1e-6) continue;
          const t = ((ax - a.x) * ez - (az - a.z) * ex) / d;
          const u = ((ax - a.x) * dz - (az - a.z) * dx) / d;
          if (t < 0 || t > 1 || u < 0 || u > 1) continue;
          const el = Math.hypot(ex, ez) || 1;
          // only crossings at a clear angle, and one per spot
          if (Math.abs(dx * ex + dz * ez) / (len * el) > 0.6) continue;
          const cx = ax + ex * u, cz = az + ez * u, cy = ay + (by - ay) * u + 0.05;
          const key = `${Math.round(cx / 12)},${Math.round(cz / 12)}`;
          if (zebraDone.has(key)) continue;
          zebraDone.add(key);
          const tx = (ex / el) * 1.7, tz = (ez / el) * 1.7;
          const wx = (-ez / el) * (h2 - 0.25), wz = (ex / el) * (h2 - 0.25);
          const v = (sx: number, sw: number): Vtx => ({ p: [cx + tx * sx + wx * sw, cy, cz + tz * sx + wz * sw], along: sx, across: sw, end: 99 });
          quad4(v(-1, -1), v(-1, 1), v(1, 1), v(1, -1), SURFACE.asphalt, 7, h2 * 2);
        }
      }
    }

    // round ends: they close the gaps where roads meet at an angle
    for (const end of [0, pts.length - 1]) {
      if (bridged[end] || kind === 9) continue;
      const p = pts[end];
      const [nx, nz] = nrm[end];
      const out = end === 0 ? 1 : -1;
      // direction away from the road
      const tx = nz * out, tz = -nx * out;
      const centre: Vtx = { p: [p.x, p.y, p.z], along: dist[end], across: 0, end: 0 };
      const rim = (k: number): Vtx => {
        const ang = (k / 6) * Math.PI;
        const cs = Math.cos(ang), sn = Math.sin(ang);
        const x = p.x + (nx * cs + tx * sn) * half, z = p.z + (nz * cs + tz * sn) * half;
        return { p: [x, Math.min(p.y + 0.5, Math.max(p.y - 0.5, terrainAt(x, z) + run.lift)), z], along: dist[end] - out * sn * half, across: cs, end: 0 };
      };
      for (let k = 0; k < 6; k++) tri(centre, rim(k), rim(k + 1), color, kind, width);
    }
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aRoad', new THREE.Float32BufferAttribute(att, 4));
  geo.setAttribute('aEnd', new THREE.Float32BufferAttribute(ends, 1));
  geo.computeVertexNormals();
  const mat = roadMaterial();
  mat.side = THREE.DoubleSide;
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -2;
  mat.polygonOffsetUnits = -2;
  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);

  const inst = (geo: THREE.BufferGeometry, m: THREE.Material, list: THREE.Matrix4[]) => {
    const mesh = new THREE.InstancedMesh(geo, m, list.length);
    list.forEach((x, i) => mesh.setMatrixAt(i, x));
    scene.add(mesh);
    return mesh;
  };
  const metal = toon('#4a5560');
  inst(new THREE.BoxGeometry(0.06, 0.06, 1), metal, rails);
  inst(new THREE.BoxGeometry(0.07, 1.1, 0.07), metal, posts);
  inst(new THREE.BoxGeometry(1, 1, 1), striped('#a7a29a', 1, 0.6, 0.15, 0.08), piers);
  inst(new THREE.CylinderGeometry(0.07, 0.1, 4.8, 6), toon('#3a4048'), poles);
  inst(new THREE.CylinderGeometry(0.28, 0.18, 0.35, 8), lampGlow, lamps);

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
