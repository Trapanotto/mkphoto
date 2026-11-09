import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ObstacleIndex, Tower } from './obstacles';
import { addHull } from './outline';
import { along, type Route } from './roads';
import { heightAt, terrainAt, WATER_EPS, type TreeData } from './terrain';
import { toon } from './toon';

/** Life in the city: trees, people, traffic, birds and boats. */
export interface Ambient {
  update(dt: number, time: number): void;
}

function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Geometry with one colour baked into its vertices, for merging multi-coloured models. */
function colored(geo: THREE.BufferGeometry, color: string, m?: THREE.Matrix4) {
  const g = geo.toNonIndexed();
  if (m) g.applyMatrix4(m);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(arr, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute('uv');
  return g;
}

const at = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s));
const scaled = (x: number, y: number, z: number, sx: number, sy: number, sz: number) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));

const vertexColored = () => {
  const m = toon('#ffffff');
  m.vertexColors = true;
  return m;
};

const isWater = (x: number, z: number) => Math.abs(x) < 790 && Math.abs(z) < 790 && terrainAt(x, z) <= WATER_EPS;

const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const S = new THREE.Vector3();
const P = new THREE.Vector3();
const D = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const E = new THREE.Euler();

// --- Trees ---------------------------------------------------------------------------------

function trees(scene: THREE.Scene, data: TreeData[], obstacles: ObstacleIndex, rand: () => number) {
  const crownGeo = new THREE.IcosahedronGeometry(1, 1);
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.26, 1, 6);
  trunkGeo.translate(0, 0.5, 0);
  const crowns = new THREE.InstancedMesh(crownGeo, toon('#ffffff'), data.length);
  const trunks = new THREE.InstancedMesh(trunkGeo, toon('#6a4a32'), data.length);
  const greens = ['#4f8a3c', '#5e9a46', '#3f7a35', '#6aa14a', '#47803a', '#577f2f'];
  data.forEach(([x, z, h], i) => {
    const g = heightAt(x, z);
    const r = Math.min(6, Math.max(1.8, h * 0.3));
    const crownY = g + Math.max(r + 1.2, h - r * 0.85);
    M.compose(P.set(x, crownY, z), Q.setFromEuler(E.set(0, rand() * 6, 0)), S.set(r, r * (0.85 + rand() * 0.3), r));
    crowns.setMatrixAt(i, M);
    crowns.setColorAt(i, new THREE.Color(greens[Math.floor(rand() * greens.length)]));
    M.compose(P.set(x, g, z), Q.identity(), S.set(1, crownY - g, 1));
    trunks.setMatrixAt(i, M);
    const t = new Tower(x, z, r * 0.75, g, crownY, r, g + h);
    obstacles.add(t);
  });
  addHull(crowns, 0.08);
  scene.add(crowns, trunks);
}

// --- People ---------------------------------------------------------------------------------

interface Walker {
  route: Route;
  d: number;
  speed: number;
  side: number;
  phase: number;
}

function people(scene: THREE.Scene, routes: Route[], count: number, rand: () => number) {
  const body = mergeGeometries([
    colored(new THREE.CapsuleGeometry(0.2, 0.75, 2, 6), '#ffffff', at(0, 0.6, 0)),
    colored(new THREE.CylinderGeometry(0.09, 0.09, 0.45, 5), '#2f3540', at(-0.1, 0.22, 0)),
    colored(new THREE.CylinderGeometry(0.09, 0.09, 0.45, 5), '#2f3540', at(0.1, 0.22, 0)),
  ]);
  const head = colored(new THREE.SphereGeometry(0.13, 8, 6), '#e8c4a0', at(0, 1.38, 0));
  const torsos = new THREE.InstancedMesh(body, vertexColored(), count);
  const heads = new THREE.InstancedMesh(head, vertexColored(), count);
  torsos.frustumCulled = heads.frustumCulled = false;
  const clothes = ['#c0392b', '#2e86c1', '#f1c40f', '#27ae60', '#8e44ad', '#ecf0f1', '#34495e', '#e67e22', '#16a085', '#d35400', '#7f8c8d', '#1abc9c'];
  const skin = ['#f1d0b0', '#e8c4a0', '#c99a72', '#8d5a3b', '#f5dcc2'];

  // walk routes near the centre; the Kapellbrücke always gets its share
  const near = routes.filter((r) => r.length > 8 && r.pts.some((p) => Math.hypot(p.x, p.z) < 500));
  const bridge = routes.filter((r) => r.name === 'Kapellbrücke');
  const pool = near.flatMap((r) => Array(Math.ceil(r.length / 25)).fill(r) as Route[]);
  const walkers: Walker[] = [];
  for (let i = 0; i < count; i++) {
    const route = bridge.length && i < count * 0.08 ? bridge[i % bridge.length] : pool[Math.floor(rand() * pool.length)];
    walkers.push({
      route,
      d: rand() * route.length,
      speed: (1.0 + rand() * 0.5) * (rand() < 0.5 ? -1 : 1),
      // pedestrians stay at the edges of car roads, anywhere on lanes and paths
      side: route.kind === 'car' ? (rand() < 0.5 ? -1 : 1) * (route.width / 2 + 0.9) : (rand() - 0.5) * route.width * 0.7,
      phase: rand() * 10,
    });
    torsos.setColorAt(i, new THREE.Color(clothes[Math.floor(rand() * clothes.length)]));
    heads.setColorAt(i, new THREE.Color(skin[Math.floor(rand() * skin.length)]));
  }
  scene.add(torsos, heads);

  return (dt: number, time: number) => {
    walkers.forEach((w, i) => {
      w.d += w.speed * dt;
      if (w.d < 0 || w.d > w.route.length) {
        w.speed = -w.speed;
        w.d = Math.min(w.route.length, Math.max(0, w.d));
      }
      along(w.route, w.d, P, D);
      if (w.speed < 0) D.negate();
      P.x += -D.z * w.side;
      P.z += D.x * w.side;
      P.y += Math.abs(Math.sin(time * 6 + w.phase)) * 0.05 - (w.route.name === 'Kapellbrücke' ? 0 : 0.15);
      Q.setFromAxisAngle(UP, Math.atan2(D.x, D.z));
      M.compose(P, Q, S.set(1, 1, 1));
      torsos.setMatrixAt(i, M);
      heads.setMatrixAt(i, M);
    });
    torsos.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
  };
}

// --- Traffic ----------------------------------------------------------------------------------

interface Car {
  route: Route;
  d: number;
  speed: number;
  bus: boolean;
}

function traffic(scene: THREE.Scene, routes: Route[], count: number, rand: () => number) {
  const carGeo = mergeGeometries([
    colored(new THREE.BoxGeometry(1.8, 0.7, 4.3), '#ffffff', at(0, 0.6, 0)),
    colored(new THREE.BoxGeometry(1.6, 0.55, 2.2), '#2b3440', at(0, 1.2, -0.2)),
    ...[-1, 1].flatMap((sx) => [-1.35, 1.35].map((z) => colored(new THREE.CylinderGeometry(0.33, 0.33, 0.25, 8), '#1a1a1a', at(sx * 0.85, 0.33, z, 0, 0, Math.PI / 2)))),
  ]);
  const busGeo = mergeGeometries([
    colored(new THREE.BoxGeometry(2.5, 2.6, 12), '#ffffff', at(0, 1.7, 0)),
    colored(new THREE.BoxGeometry(2.55, 0.9, 11), '#2b3440', at(0, 2.2, 0)),
    ...[-1, 1].flatMap((sx) => [-4, 4].map((z) => colored(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 8), '#1a1a1a', at(sx * 1.2, 0.5, z, 0, 0, Math.PI / 2)))),
  ]);
  const carRoutes = routes.filter((r) => r.kind === 'car' && r.length > 30);
  if (!carRoutes.length) return () => {};
  const pool = carRoutes.flatMap((r) => Array(Math.ceil(r.length / 40)).fill(r) as Route[]);
  const cars: Car[] = [];
  for (let i = 0; i < count; i++) {
    const route = pool[Math.floor(rand() * pool.length)];
    cars.push({ route, d: rand() * route.length, speed: (7 + rand() * 4) * (rand() < 0.5 ? -1 : 1), bus: i % 9 === 0 });
  }
  const carList = cars.filter((c) => !c.bus);
  const busList = cars.filter((c) => c.bus);
  const carMesh = new THREE.InstancedMesh(carGeo, vertexColored(), carList.length);
  const busMesh = new THREE.InstancedMesh(busGeo, vertexColored(), busList.length);
  carMesh.frustumCulled = busMesh.frustumCulled = false;
  const paints = ['#c0392b', '#ecf0f1', '#2c3e50', '#7f8c8d', '#2e86c1', '#bdc3c7', '#1b1b1b', '#f39c12', '#27ae60', '#ffffff'];
  carList.forEach((_, i) => carMesh.setColorAt(i, new THREE.Color(paints[Math.floor(rand() * paints.length)])));
  // city buses in blue
  busList.forEach((_, i) => busMesh.setColorAt(i, new THREE.Color('#1f5fa8')));
  addHull(carMesh, 0.04);
  scene.add(carMesh, busMesh);

  const place = (list: Car[], mesh: THREE.InstancedMesh, dt: number) => {
    list.forEach((c, i) => {
      c.d += c.speed * dt;
      if (c.d < 0 || c.d > c.route.length) {
        c.speed = -c.speed;
        c.d = Math.min(c.route.length, Math.max(0, c.d));
      }
      along(c.route, c.d, P, D);
      if (c.speed < 0) D.negate();
      // drive on the right
      const lane = Math.min(c.route.width / 4, 1.8);
      P.x += -D.z * -lane;
      P.z += D.x * -lane;
      Q.setFromAxisAngle(UP, Math.atan2(D.x, D.z));
      M.compose(P, Q, S.set(1, 1, 1));
      mesh.setMatrixAt(i, M);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  return (dt: number) => {
    place(carList, carMesh, dt);
    place(busList, busMesh, dt);
  };
}

// --- Water birds ----------------------------------------------------------------------------

interface Swimmer {
  x: number;
  z: number;
  heading: number;
  speed: number;
  turn: number;
}

function waterBirds(scene: THREE.Scene, rand: () => number, swans: number, ducks: number) {
  const swanGeo = mergeGeometries([
    colored(new THREE.SphereGeometry(0.45, 10, 8), '#ffffff', scaled(0, 0.25, 0, 0.8, 0.6, 1.3)),
    colored(new THREE.CylinderGeometry(0.07, 0.09, 0.75, 6), '#ffffff', at(0, 0.62, 0.42, -0.25, 0, 0)),
    colored(new THREE.SphereGeometry(0.11, 8, 6), '#ffffff', at(0, 1.0, 0.52)),
    colored(new THREE.ConeGeometry(0.05, 0.18, 6), '#f08a24', at(0, 0.98, 0.68, Math.PI / 2, 0, 0)),
  ]);
  const duckGeo = mergeGeometries([
    colored(new THREE.SphereGeometry(0.2, 8, 6), '#8a6a4a', scaled(0, 0.12, 0, 0.8, 0.6, 1.3)),
    colored(new THREE.SphereGeometry(0.1, 8, 6), '#2f6b3a', at(0, 0.3, 0.2)),
    colored(new THREE.ConeGeometry(0.035, 0.1, 5), '#e6b422', at(0, 0.29, 0.32, Math.PI / 2, 0, 0)),
  ]);
  // start in the river and the lake basin near the bridge
  const spots: [number, number][] = [];
  for (let tries = 0; spots.length < swans + ducks && tries < 5000; tries++) {
    const x = (rand() - 0.5) * 500;
    const z = (rand() - 0.5) * 300;
    if (isWater(x, z) && isWater(x + 3, z) && isWater(x, z + 3)) spots.push([x, z]);
  }
  const birds: Swimmer[] = spots.map(([x, z]) => ({ x, z, heading: rand() * Math.PI * 2, speed: 0.2 + rand() * 0.3, turn: 0 }));
  const swanMesh = new THREE.InstancedMesh(swanGeo, vertexColored(), Math.min(swans, birds.length));
  const duckMesh = new THREE.InstancedMesh(duckGeo, vertexColored(), Math.max(0, birds.length - swans));
  swanMesh.frustumCulled = duckMesh.frustumCulled = false;
  scene.add(swanMesh, duckMesh);

  return (dt: number, time: number) => {
    birds.forEach((b, i) => {
      b.turn += (rand() - 0.5) * dt * 0.8;
      b.turn *= 0.98;
      b.heading += b.turn * dt;
      const nx = b.x + Math.sin(b.heading) * b.speed * dt;
      const nz = b.z + Math.cos(b.heading) * b.speed * dt;
      // turn back before reaching the shore
      if (isWater(nx + Math.sin(b.heading) * 2, nz + Math.cos(b.heading) * 2)) {
        b.x = nx;
        b.z = nz;
      } else b.heading += Math.PI * (0.5 + rand() * 0.5);
      const bob = Math.sin(time * 1.5 + i) * 0.03;
      M.compose(P.set(b.x, bob, b.z), Q.setFromAxisAngle(UP, b.heading), S.set(1, 1, 1));
      if (i < swanMesh.count) swanMesh.setMatrixAt(i, M);
      else duckMesh.setMatrixAt(i - swanMesh.count, M);
    });
    swanMesh.instanceMatrix.needsUpdate = duckMesh.instanceMatrix.needsUpdate = true;
  };
}

// --- Gulls ------------------------------------------------------------------------------------

function gulls(scene: THREE.Scene, rand: () => number, count: number) {
  const bodyGeo = mergeGeometries([
    colored(new THREE.SphereGeometry(0.16, 8, 6), '#ffffff', scaled(0, 0, 0, 0.8, 0.8, 2.2)),
    colored(new THREE.ConeGeometry(0.04, 0.12, 5), '#e6b422', at(0, 0, 0.4, Math.PI / 2, 0, 0)),
  ]);
  const wingGeo = colored(new THREE.BoxGeometry(0.75, 0.03, 0.26), '#e8ecef');
  wingGeo.translate(0.38, 0, 0);
  const tip = colored(new THREE.BoxGeometry(0.2, 0.031, 0.24), '#2f3337');
  tip.translate(0.68, 0, 0);
  const wing = mergeGeometries([wingGeo, tip]);
  const bodies = new THREE.InstancedMesh(bodyGeo, vertexColored(), count);
  const left = new THREE.InstancedMesh(wing, vertexColored(), count);
  const right = new THREE.InstancedMesh(wing, vertexColored(), count);
  bodies.frustumCulled = left.frustumCulled = right.frustumCulled = false;
  scene.add(bodies, left, right);
  const centres: [number, number][] = [
    [0, 10],
    [-120, -40],
    [250, 60],
  ];
  const birds = Array.from({ length: count }, (_, i) => ({
    c: centres[i % centres.length],
    r: 30 + rand() * 60,
    h: 14 + rand() * 30,
    w: (0.12 + rand() * 0.12) * (rand() < 0.5 ? -1 : 1),
    a: rand() * Math.PI * 2,
    phase: rand() * 10,
  }));
  const wingM = new THREE.Matrix4();
  return (dt: number, time: number) => {
    birds.forEach((b, i) => {
      b.a += b.w * dt;
      const x = b.c[0] + Math.cos(b.a) * b.r;
      const z = b.c[1] + Math.sin(b.a) * b.r;
      const y = b.h + Math.sin(time * 0.5 + b.phase) * 3;
      // heading along the circle, banked into the turn
      const heading = Math.atan2(-Math.sin(b.a) * Math.sign(b.w), Math.cos(b.a) * Math.sign(b.w));
      Q.setFromEuler(E.set(0, heading, -0.35 * Math.sign(b.w), 'YXZ'));
      M.compose(P.set(x, y, z), Q, S.set(1, 1, 1));
      bodies.setMatrixAt(i, M);
      // flap in bursts, glide in between
      const flap = Math.sin(time * 9 + b.phase) * 0.6 * (Math.sin(time * 0.7 + b.phase) > 0 ? 1 : 0.15);
      wingM.makeRotationZ(flap);
      right.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(M, wingM));
      wingM.makeRotationZ(-flap).premultiply(new THREE.Matrix4().makeScale(-1, 1, 1));
      left.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(M, wingM));
    });
    bodies.instanceMatrix.needsUpdate = left.instanceMatrix.needsUpdate = right.instanceMatrix.needsUpdate = true;
  };
}

// --- Boats --------------------------------------------------------------------------------------

function paddleSteamer() {
  const parts = [
    colored(new THREE.BoxGeometry(7, 1.6, 50), '#f4f4f0', at(0, 0.4, 0)),
    colored(new THREE.ConeGeometry(3.5, 8, 4, 1), '#f4f4f0', at(0, 0.4, 28, Math.PI / 2, Math.PI / 4, 0)),
    colored(new THREE.BoxGeometry(7.1, 0.4, 50.2), '#2f3a4a', at(0, -0.2, 0)),
    colored(new THREE.BoxGeometry(6, 2.4, 34), '#ffffff', at(0, 2.4, -2)),
    colored(new THREE.BoxGeometry(6.1, 0.8, 34.1), '#3a5a7a', at(0, 2.6, -2)),
    colored(new THREE.BoxGeometry(5, 2, 18), '#ffffff', at(0, 4.6, -4)),
    colored(new THREE.BoxGeometry(5.1, 0.6, 18.1), '#3a5a7a', at(0, 4.8, -4)),
    colored(new THREE.CylinderGeometry(0.9, 1, 5, 12), '#e9c46a', at(0, 7.6, 2)),
    colored(new THREE.CylinderGeometry(0.95, 0.95, 0.8, 12), '#1b1b1b', at(0, 9.8, 2)),
    // paddle boxes on both sides
    ...[-1, 1].map((s) => colored(new THREE.CylinderGeometry(2.4, 2.4, 1.2, 12, 1, false, 0, Math.PI), '#ffffff', at(s * 4, 1.2, 2, 0, 0, Math.PI / 2))),
    // flag at the stern: red with a white cross
    colored(new THREE.CylinderGeometry(0.06, 0.06, 4, 5), '#dddddd', at(0, 3, -25)),
    colored(new THREE.BoxGeometry(0.05, 1.2, 1.2), '#d52b1e', at(0, 4.4, -25.7)),
    colored(new THREE.BoxGeometry(0.06, 0.25, 0.8), '#ffffff', at(0, 4.4, -25.7)),
    colored(new THREE.BoxGeometry(0.06, 0.8, 0.25), '#ffffff', at(0, 4.4, -25.7)),
  ];
  const mesh = new THREE.Mesh(mergeGeometries(parts), vertexColored());
  addHull(mesh, 0.1);
  return mesh;
}

function motorboat(color: string) {
  const mesh = new THREE.Mesh(
    mergeGeometries([
      colored(new THREE.BoxGeometry(2.2, 0.8, 6), '#ffffff', at(0, 0.3, 0)),
      colored(new THREE.ConeGeometry(1.1, 2, 4), '#ffffff', at(0, 0.3, 3.8, Math.PI / 2, Math.PI / 4, 0)),
      colored(new THREE.BoxGeometry(2.25, 0.25, 6.05), color, at(0, 0.1, 0)),
      colored(new THREE.BoxGeometry(1.6, 0.8, 1.8), '#2b3440', at(0, 1.0, 0.2)),
    ]),
    vertexColored(),
  );
  addHull(mesh, 0.04);
  return mesh;
}

/** An ellipse on the lake that stays on water, or null. */
function lakeLoop(): THREE.Vector3[] | null {
  const candidates: [number, number, number, number][] = [
    [430, 60, 250, 110],
    [400, 40, 200, 90],
    [350, 80, 150, 70],
    [450, 120, 180, 80],
  ];
  for (const [cx, cz, rx, rz] of candidates) {
    const pts = Array.from({ length: 64 }, (_, i) => {
      const a = (i / 64) * Math.PI * 2;
      return new THREE.Vector3(cx + Math.cos(a) * rx, 0, cz + Math.sin(a) * rz);
    });
    if (pts.every((p) => isWater(p.x, p.z) && isWater(p.x + 8, p.z) && isWater(p.x - 8, p.z))) return pts;
  }
  return null;
}

function boats(scene: THREE.Scene, rand: () => number, small: number) {
  const updates: ((dt: number, time: number) => void)[] = [];
  const loop = lakeLoop();
  if (loop) {
    const steamer = paddleSteamer();
    scene.add(steamer);
    const curve = new THREE.CatmullRomCurve3(loop, true);
    const length = curve.getLength();
    let d = 0;
    updates.push((dt, time) => {
      d = (d + 4 * dt) % length;
      const t = d / length;
      curve.getPointAt(t, P);
      curve.getTangentAt(t, D);
      steamer.position.set(P.x, Math.sin(time * 0.8) * 0.05, P.z);
      steamer.rotation.set(0, Math.atan2(D.x, D.z), Math.sin(time * 0.6) * 0.01);
    });
  }
  const colors = ['#c0392b', '#2e86c1', '#16a085', '#f39c12', '#34495e'];
  for (let i = 0; i < small; i++) {
    const boat = motorboat(colors[i % colors.length]);
    scene.add(boat);
    let x = 0, z = 0;
    for (let tries = 0; tries < 400; tries++) {
      x = 150 + rand() * 500;
      z = -100 + rand() * 350;
      if (isWater(x, z)) break;
    }
    let heading = rand() * Math.PI * 2;
    const speed = 3 + rand() * 5;
    updates.push((dt, time) => {
      const nx = x + Math.sin(heading) * speed * dt;
      const nz = z + Math.cos(heading) * speed * dt;
      if (isWater(nx + Math.sin(heading) * 12, nz + Math.cos(heading) * 12)) {
        x = nx;
        z = nz;
      } else heading += Math.PI * (0.6 + rand() * 0.5);
      boat.position.set(x, Math.sin(time * 2 + i) * 0.08, z);
      boat.rotation.set(-0.04, heading, Math.sin(time * 1.3 + i) * 0.03);
    });
  }
  return (dt: number, time: number) => updates.forEach((u) => u(dt, time));
}

/** density: 1 on high graphics, less on weaker devices. */
export function createAmbient(scene: THREE.Scene, data: { trees: TreeData[] }, routes: Route[], obstacles: ObstacleIndex, density: number): Ambient {
  const rand = random(99);
  trees(scene, data.trees, obstacles, rand);
  const updates = [
    people(scene, routes, Math.round(380 * density), rand),
    traffic(scene, routes, Math.round(60 * density), rand),
    waterBirds(scene, rand, 12, Math.round(24 * density)),
    gulls(scene, rand, Math.round(36 * density)),
    boats(scene, rand, Math.round(6 * density)),
  ];
  return {
    update(dt, time) {
      for (const u of updates) u(dt, time);
    },
  };
}
