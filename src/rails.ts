import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ObstacleIndex, Strip } from './obstacles';
import { addHull } from './outline';
import { terrainAt } from './terrain';
import { striped, toon } from './toon';

export interface RailData {
  id: number;
  type: number;
  pts: [number, number][];
}

/** A railway line with heights: on the ground, on a bridge, or in a tunnel. */
export interface Track {
  pts: THREE.Vector3[];
  dist: number[];
  length: number;
  /** Per point: inside a hill (the train is hidden there). */
  tunnel: boolean[];
}

const STEP = 4;

function resample(pts: [number, number][]) {
  const out: [number, number][] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / STEP));
    for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  return out;
}

/** Joins line pieces that touch end to end into longer lines. */
function chain(lines: [number, number][][]) {
  const pieces = lines.map((l) => l.slice());
  const near = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 3;
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < pieces.length; i++)
      for (let j = 0; j < pieces.length; j++) {
        if (i === j) continue;
        const a = pieces[i], b = pieces[j];
        if (near(a[a.length - 1], b[0])) pieces[i] = a.concat(b.slice(1));
        else if (near(a[a.length - 1], b[b.length - 1])) pieces[i] = a.concat(b.slice(0, -1).reverse());
        else if (near(a[0], b[b.length - 1])) pieces[i] = b.concat(a.slice(1));
        else if (near(a[0], b[0])) pieces[i] = b.slice().reverse().concat(a.slice(1));
        else continue;
        pieces.splice(j, 1);
        merged = true;
        break outer;
      }
  }
  return pieces;
}

/**
 * Heights for one swissTLM3D piece (pieces are split at bridges and tunnels):
 * terrain far below the straight line between the ends → a bridge on that line;
 * terrain far above it → a tunnel on that line; otherwise the smoothed ground.
 */
function profile(pts: [number, number][]) {
  const ground = pts.map(([x, z]) => terrainAt(x, z));
  const n = pts.length;
  const line = (i: number) => ground[0] + ((ground[n - 1] - ground[0]) * i) / Math.max(1, n - 1);
  let below = 0, above = 0;
  for (let i = 0; i < n; i++) {
    below = Math.max(below, line(i) - ground[i]);
    above = Math.max(above, ground[i] - line(i));
  }
  if (n > 3 && below > 8 && below > above) return { y: ground.map((_, i) => line(i)), kind: 'bridge' as const };
  if (n > 3 && above > 8) return { y: ground.map((_, i) => line(i)), kind: 'tunnel' as const };
  // on the ground: smooth out the 5 m grid a little
  const y = ground.map((_, i) => {
    let s = 0, c = 0;
    for (let k = Math.max(0, i - 3); k <= Math.min(n - 1, i + 3); k++) {
      s += ground[k];
      c++;
    }
    return s / c + 0.4;
  });
  return { y, kind: 'ground' as const };
}

/** Stone arch viaduct along a bridge piece: piers about every 20 m, round arches, parapets. */
function viaduct(pts: THREE.Vector3[], scene: THREE.Scene, obstacles: ObstacleIndex) {
  const stone = striped('#b7a58c', 1, 0.55, 0.22, 0.1);
  const dark = toon('#7a6a58');
  const width = 5;
  const total = pts.reduce((s, p, i) => (i ? s + p.distanceTo(pts[i - 1]) : 0), 0);
  const spans = Math.max(1, Math.round(total / 20));
  const span = total / spans;
  const pier = 3.2;
  const group = new THREE.Group();
  const at = (d: number) => {
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const seg = pts[i].distanceTo(pts[i - 1]);
      if (acc + seg >= d) return new THREE.Vector3().lerpVectors(pts[i - 1], pts[i], (d - acc) / seg);
      acc += seg;
    }
    return pts[pts.length - 1].clone();
  };
  for (let s = 0; s < spans; s++) {
    const a = at(s * span);
    const b = at((s + 1) * span);
    const deck = (a.y + b.y) / 2 - 1.2;
    const groundA = terrainAt(a.x, a.z);
    const groundB = terrainAt(b.x, b.z);
    const low = Math.min(groundA, groundB) - 3;
    const spring = deck - span / 2 - 1.5;
    // one span as an extruded wall: full rectangle minus the arch opening
    const shape = new THREE.Shape();
    shape.moveTo(0, low);
    shape.lineTo(span, low);
    shape.lineTo(span, deck);
    shape.lineTo(0, deck);
    shape.closePath();
    const r = (span - pier) / 2;
    if (spring - low > 2) {
      const hole = new THREE.Path();
      hole.moveTo(pier / 2, low - 1);
      hole.lineTo(span - pier / 2, low - 1);
      hole.lineTo(span - pier / 2, spring);
      hole.absarc(span / 2, spring, r, 0, Math.PI, false);
      hole.lineTo(pier / 2, low - 1);
      shape.holes.push(hole);
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 14 });
    geo.translate(0, 0, -width / 2);
    const mesh = new THREE.Mesh(geo, stone);
    mesh.position.set(a.x, 0, a.z);
    mesh.rotation.y = Math.atan2(-(b.z - a.z), b.x - a.x);
    // stretch to the real distance between the span's ends
    mesh.scale.x = a.distanceTo(new THREE.Vector3(b.x, a.y, b.z)) / span;
    addHull(mesh, 0.08);
    group.add(mesh);
    // parapets and a cornice on top
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(span, 1, 0.4), dark);
      p.position.set(span / 2, deck + 0.5, side * (width / 2 - 0.2));
      const holder = new THREE.Group();
      holder.position.copy(mesh.position);
      holder.rotation.copy(mesh.rotation);
      holder.scale.copy(mesh.scale);
      holder.add(p);
      group.add(holder);
    }
    obstacles.add(new Strip(a.x, a.z, b.x, b.z, width / 2, spring, deck + 1, deck + 1));
  }
  scene.add(group);
}

/** Railway: ballast and rails on the ground and bridges, viaducts where bridges are, and track lines for trains. */
/** Tracks for trains, plus the decks of the viaducts that were built (for landmarks). */
export function createRails(scene: THREE.Scene, data: RailData[], obstacles: ObstacleIndex): { tracks: Track[]; bridges: THREE.Vector3[][] } {
  const pieces = data.map((d) => {
    const pts = resample(d.pts);
    const { y, kind } = profile(pts);
    return { pts: pts.map(([x, z], i) => new THREE.Vector3(x, y[i], z)), kind };
  });

  const ballast: number[] = [];
  const steel: number[] = [];
  const quad = (list: number[], a: number[], b: number[], c: number[], d: number[]) => list.push(...a, ...b, ...c, ...a, ...c, ...d);
  const bridges: THREE.Vector3[][] = [];
  for (const p of pieces) {
    if (p.kind === 'bridge') {
      viaduct(p.pts, scene, obstacles);
      bridges.push(p.pts);
    }
    if (p.kind === 'tunnel') continue;
    for (let i = 0; i < p.pts.length - 1; i++) {
      const a = p.pts[i], b = p.pts[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len, nz = dx / len;
      const w = 1.8;
      quad(ballast, [a.x - nx * w, a.y, a.z - nz * w], [a.x + nx * w, a.y, a.z + nz * w], [b.x + nx * w, b.y, b.z + nz * w], [b.x - nx * w, b.y, b.z - nz * w]);
      for (const off of [-0.55, 0.55]) {
        const o1 = off - 0.05, o2 = off + 0.05;
        quad(steel, [a.x + nx * o1, a.y + 0.18, a.z + nz * o1], [a.x + nx * o2, a.y + 0.18, a.z + nz * o2], [b.x + nx * o2, b.y + 0.18, b.z + nz * o2], [b.x + nx * o1, b.y + 0.18, b.z + nz * o1]);
      }
    }
  }
  const mk = (list: number[], color: string) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(list, 3));
    g.computeVertexNormals();
    const m = toon(color);
    m.side = THREE.DoubleSide;
    m.polygonOffset = true;
    m.polygonOffsetFactor = -3;
    m.polygonOffsetUnits = -3;
    scene.add(new THREE.Mesh(g, m));
  };
  mk(ballast, '#8a8378');
  mk(steel, '#4a4a4e');

  // train lines: pieces joined end to end, with heights and tunnel flags kept
  const byStart = pieces.map((p) => ({ pts: p.pts.map((v) => [v.x, v.z] as [number, number]), kind: p.kind, ys: p.pts.map((v) => v.y) }));
  const lines = chain(byStart.map((p) => p.pts));
  const tracks = lines.map((line) => {
    const pts = line.map(([x, z]) => {
      // height from the piece this point came from
      let best = { d: Infinity, y: terrainAt(x, z), tunnel: false };
      for (const p of byStart)
        p.pts.forEach(([px, pz], i) => {
          const d = Math.hypot(px - x, pz - z);
          if (d < best.d) best = { d, y: p.ys[i], tunnel: p.kind === 'tunnel' };
        });
      return best;
    });
    const v = line.map(([x, z], i) => new THREE.Vector3(x, pts[i].y, z));
    const dist = [0];
    for (let i = 1; i < v.length; i++) dist.push(dist[i - 1] + v[i].distanceTo(v[i - 1]));
    return { pts: v, dist, length: dist[dist.length - 1], tunnel: pts.map((p, i) => p.tunnel || terrainAt(v[i].x, v[i].z) > p.y + 3) };
  });
  return { tracks, bridges };
}

/** Builds one train (red narrow-gauge style by default) and drives it back and forth on the longest line. */
export function createTrain(scene: THREE.Scene, tracks: Track[], colors = { body: '#c8102e', roof: '#5a5f66', stripe: '#f2f2f2' }) {
  const track = tracks.slice().sort((a, b) => b.length - a.length)[0];
  if (!track || track.length < 100) return () => {};
  const car = (len: number, loco: boolean) => {
    const parts = [
      new THREE.BoxGeometry(2.7, 2.6, len).translate(0, 2.1, 0),
      new THREE.BoxGeometry(2.5, 0.35, len - 0.4).translate(0, 3.55, 0),
      new THREE.BoxGeometry(2.72, 0.7, len - 1).translate(0, 2.7, 0),
      new THREE.BoxGeometry(2.4, 0.6, len - 1.5).translate(0, 0.65, 0),
    ];
    if (loco) parts.push(new THREE.BoxGeometry(0.1, 0.8, 0.8).translate(0, 4.1, 0));
    const colorsOf = [colors.body, colors.roof, '#2b3440', '#2a2a2a', '#333333'];
    const geos = parts.map((g, i) => {
      const n = g.toNonIndexed();
      const c = new THREE.Color(colorsOf[i]);
      const arr = new Float32Array(n.attributes.position.count * 3);
      for (let k = 0; k < n.attributes.position.count; k++) c.toArray(arr, k * 3);
      n.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      n.deleteAttribute('uv');
      return n;
    });
    const m = toon('#ffffff');
    m.vertexColors = true;
    const mesh = new THREE.Mesh(mergeGeometries(geos), m);
    addHull(mesh, 0.06);
    return mesh;
  };
  const cars = [car(15, true), car(18, false), car(18, false), car(18, false), car(18, false)];
  const lengths = [15, 18, 18, 18, 18];
  for (const c of cars) scene.add(c);
  const P = new THREE.Vector3();
  const D = new THREE.Vector3();
  const place = (d: number) => {
    const dist = track.dist;
    let lo = 0, hi = dist.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (dist[mid] <= d) lo = mid;
      else hi = mid;
    }
    const t = (d - dist[lo]) / ((dist[hi] - dist[lo]) || 1);
    P.lerpVectors(track.pts[lo], track.pts[hi], Math.min(1, Math.max(0, t)));
    D.subVectors(track.pts[hi], track.pts[lo]).normalize();
    return track.tunnel[lo] && track.tunnel[hi];
  };
  const trainLength = lengths.reduce((a, b) => a + b + 0.8, 0);
  let s = trainLength;
  let dir = 1;
  const speed = 11;
  return (dt: number) => {
    s += speed * dir * dt;
    if (s > track.length) { s = track.length; dir = -1; }
    if (s < trainLength) { s = trainLength; dir = 1; }
    let offset = 0;
    cars.forEach((c, i) => {
      const d = s - offset - lengths[i] / 2;
      const hidden = place(Math.max(0, d));
      c.visible = !hidden;
      c.position.copy(P);
      c.rotation.set(0, Math.atan2(D.x, D.z), 0);
      offset += lengths[i] + 0.8;
    });
  };
}
