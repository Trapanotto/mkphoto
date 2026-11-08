import * as THREE from 'three';
import { addHull } from './outline';
import { toon } from './toon';

/** Upright obstacle the drone can bump into. Cones narrow towards the top. */
export interface Collider {
  kind: 'cylinder' | 'cone';
  x: number;
  z: number;
  r: number;
  h: number;
  base: number;
}

export const HOME = new THREE.Vector3(0, 0, 28.5);
export const FLIGHT_RADIUS = 185;
export const MAX_ALTITUDE = 120;

/** Terrain height in metres. Flat around the lake, hills further out. */
export function heightAt(x: number, z: number): number {
  const d = Math.hypot(x, z);
  if (d <= 30) return 0;
  const hills = Math.sin(x * 0.05) * Math.cos(z * 0.04) * 4 + Math.sin(x * 0.013 + z * 0.02) * 6;
  return Math.max(0, (d - 30) * 0.06 * (hills + 6));
}

export interface World {
  colliders: Collider[];
  lake: THREE.MeshToonMaterial;
  windows: THREE.MeshBasicMaterial;
  update(dt: number, wind: THREE.Vector3): void;
}

/** Small deterministic random generator, so the world looks the same on every load. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GRASS = new THREE.Color('#86c06c');
const MEADOW = new THREE.Color('#6aa85a');
const ROCK = new THREE.Color('#9a9488');
const SNOW = new THREE.Color('#f4f6fa');

export function createWorld(scene: THREE.Scene): World {
  const colliders: Collider[] = [];
  const rand = random(42);

  // --- Terrain, coloured by height and slope in hard bands --------------------
  const ground = new THREE.PlaneGeometry(400, 400, 128, 128);
  ground.rotateX(-Math.PI / 2);
  const pos = ground.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  ground.computeVertexNormals();
  const normals = ground.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i);
    const steep = normals.getY(i) < 0.72;
    const patch = Math.sin(pos.getX(i) * 0.09) * Math.sin(pos.getZ(i) * 0.07) > 0.25;
    if (h > 95) c.copy(SNOW);
    else if (h > 55 || (steep && h > 12)) c.copy(ROCK);
    else c.copy(patch ? MEADOW : GRASS);
    c.toArray(colors, i * 3);
  }
  ground.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const groundMat = toon('#ffffff');
  groundMat.vertexColors = true;
  scene.add(new THREE.Mesh(ground, groundMat));

  // --- Lake with a foam line along the shore -------------------------------------
  const lakeMat = toon('#3d8fd1');
  const lake = new THREE.Mesh(new THREE.CircleGeometry(26, 64), lakeMat);
  lake.rotation.x = -Math.PI / 2;
  lake.position.y = 0.05;
  const foam = new THREE.Mesh(new THREE.RingGeometry(25.3, 26, 64), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  foam.rotation.x = -Math.PI / 2;
  foam.position.y = 0.07;
  scene.add(lake, foam);

  // --- Mountains with snow caps ----------------------------------------------------
  const mountains: [number, number, number, number][] = [
    [-90, -120, 34, 70],
    [-30, -150, 40, 90],
    [40, -130, 30, 64],
    [110, -100, 36, 76],
  ];
  for (const [x, z, r, h] of mountains) {
    const base = heightAt(x, z) - 2;
    const rock = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), toon('#8a94a6'));
    rock.position.set(x, base + h / 2, z);
    const snow = new THREE.Mesh(new THREE.ConeGeometry(r * 0.38, h * 0.38, 6), toon('#ffffff'));
    snow.position.set(x, base + h - h * 0.19 + 0.1, z);
    addHull(rock, 0.9);
    scene.add(rock, snow);
    colliders.push({ kind: 'cone', x, z, r, h, base });
  }

  // --- Windows glow at night: one shared material --------------------------------
  const windows = new THREE.MeshBasicMaterial({ color: '#3a2a22' });
  const windowGeo = new THREE.PlaneGeometry(0.7, 0.8);

  // --- Tower in the lake --------------------------------------------------------------
  const tower = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 8, 8), toon('#c9a77c'));
  body.position.y = 4;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.1, 3, 8), toon('#b2442f'));
  roof.position.y = 9.5;
  addHull(body, 0.08);
  addHull(roof, 0.08);
  tower.add(body, roof);
  for (const [y, a] of [
    [5, 0.4],
    [6.6, 2.6],
    [3.4, 4.3],
  ]) {
    const w = new THREE.Mesh(windowGeo, windows);
    w.position.set(Math.sin(a) * 1.72, y, Math.cos(a) * 1.72);
    w.rotation.y = a;
    tower.add(w);
  }
  tower.position.set(-8, 0, -6);
  scene.add(tower);
  colliders.push({ kind: 'cylinder', x: -8, z: -6, r: 2.1, h: 11, base: 0 });

  // --- A few houses on the shore, facing the lake ---------------------------------
  const wallColors = ['#f2e6d0', '#e8d2b0', '#ffffff', '#d9c2a0'];
  const roofColors = ['#8a3a2a', '#5a3a2a', '#a04a32'];
  const houseSpots: [number, number][] = [
    [2.0, 35],
    [2.35, 38],
    [2.7, 34],
    [3.7, 36],
    [4.05, 40],
    [0.75, 37],
    [1.1, 34],
  ];
  for (const [angle, radius] of houseSpots) {
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const g = heightAt(x, z);
    const house = new THREE.Group();
    const walls = new THREE.Mesh(new THREE.BoxGeometry(4, 5, 5), toon(wallColors[Math.floor(rand() * wallColors.length)]));
    walls.position.y = 0.5; // 2 m sunk into the slope
    const roofMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(2.5, 2.5, 5.8, 3),
      toon(roofColors[Math.floor(rand() * roofColors.length)]),
    );
    roofMesh.rotation.x = -Math.PI / 2;
    roofMesh.scale.z = 0.55;
    roofMesh.position.y = 3 + 0.69;
    addHull(walls, 0.06);
    addHull(roofMesh, 0.06);
    house.add(walls, roofMesh);
    for (const [wx, wy] of [
      [-0.9, 1.6],
      [0.9, 1.6],
      [-0.9, 0.1],
      [0.9, 0.1],
    ]) {
      const w = new THREE.Mesh(windowGeo, windows);
      w.position.set(wx, wy, 2.51);
      house.add(w);
    }
    house.position.set(x, g, z);
    house.rotation.y = Math.atan2(-x, -z);
    scene.add(house);
    colliders.push({ kind: 'cylinder', x, z, r: 3.2, h: 7, base: g - 2 });
  }

  // --- Conifers, two instanced meshes ------------------------------------------------
  const TREES = 420;
  const crownGeo = new THREE.ConeGeometry(1.5, 4.5, 6);
  crownGeo.translate(0, 2.25 + 1, 0);
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.3, 1.2, 5);
  trunkGeo.translate(0, 0.6, 0);
  const crowns = new THREE.InstancedMesh(crownGeo, toon('#2f6b3a'), TREES);
  const trunks = new THREE.InstancedMesh(trunkGeo, toon('#6a4a32'), TREES);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  let placed = 0;
  for (let tries = 0; placed < TREES && tries < TREES * 6; tries++) {
    const a = rand() * Math.PI * 2;
    const d = 36 + rand() * 140;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const g = heightAt(x, z);
    if (g > 55) continue; // tree line
    if (Math.hypot(x - HOME.x, z - HOME.z) < 10) continue;
    if (houseSpots.some(([ha, hr]) => Math.hypot(x - Math.cos(ha) * hr, z - Math.sin(ha) * hr) < 6)) continue;
    const scale = 0.8 + rand() * 0.9;
    q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rand() * Math.PI);
    m.compose(p.set(x, g - 0.2, z), q, s.setScalar(scale));
    crowns.setMatrixAt(placed, m);
    trunks.setMatrixAt(placed, m);
    colliders.push({ kind: 'cone', x, z, r: 1.5 * scale, h: 5.5 * scale, base: g });
    placed++;
  }
  crowns.count = trunks.count = placed;
  crowns.computeBoundingSphere();
  trunks.computeBoundingSphere();
  addHull(crowns, 0.12);
  scene.add(crowns, trunks);

  // --- Home pad with an "H" ------------------------------------------------------------
  const pad = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.1, 32), toon('#2b2b2b'));
  const markMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const barL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 1.4), markMat);
  barL.position.set(-0.45, 0.06, 0);
  const barR = barL.clone();
  barR.position.x = 0.45;
  const barM = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.02, 0.18), markMat);
  barM.position.y = 0.06;
  pad.add(disc, barL, barR, barM);
  pad.position.set(HOME.x, heightAt(HOME.x, HOME.z) + 0.05, HOME.z);
  scene.add(pad);

  // --- Windsock next to the pad ----------------------------------------------------------
  const sockPole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 6), toon('#dddddd'));
  sockPole.position.set(HOME.x + 3, 1.5, HOME.z);
  const sock = new THREE.Group();
  const sockCone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.4, 12, 1, true), toon('#ff6a1a'));
  sockCone.material.side = THREE.DoubleSide;
  sockCone.rotation.z = Math.PI / 2; // tip points along +x
  sockCone.position.x = 0.7;
  sock.add(sockCone);
  sock.position.set(HOME.x + 3, 2.9, HOME.z);
  scene.add(sockPole, sock);

  // --- Clouds: flattened puffs drifting with the wind -------------------------------------
  const puffGeo = new THREE.IcosahedronGeometry(1, 1);
  const cloudMat = toon('#ffffff');
  const clouds: THREE.Group[] = [];
  for (let i = 0; i < 12; i++) {
    const cloud = new THREE.Group();
    const puffs = 3 + Math.floor(rand() * 3);
    for (let j = 0; j < puffs; j++) {
      const puff = new THREE.Mesh(puffGeo, cloudMat);
      const r = 5 + rand() * 5;
      puff.scale.set(r, r * 0.6, r);
      puff.position.set((j - puffs / 2) * 6 + rand() * 3, rand() * 2, rand() * 6 - 3);
      addHull(puff, 0.05);
      cloud.add(puff);
    }
    const a = rand() * Math.PI * 2;
    const d = rand() * 210;
    cloud.position.set(Math.cos(a) * d, 85 + rand() * 40, Math.sin(a) * d);
    scene.add(cloud);
    clouds.push(cloud);
  }

  return {
    colliders,
    lake: lakeMat,
    windows,
    update(dt, wind) {
      // windsock points downwind; hangs limp at calm, horizontal at ~8 m/s
      const strength = Math.hypot(wind.x, wind.z);
      sock.rotation.set(0, Math.atan2(-wind.z, wind.x), -Math.max(0, 1 - strength / 8) * 1.2);
      for (const cloud of clouds) {
        cloud.position.x += wind.x * 0.4 * dt;
        cloud.position.z += wind.z * 0.4 * dt;
        // wrap to the other side of the map
        if (Math.hypot(cloud.position.x, cloud.position.z) > 240) {
          cloud.position.x *= -0.95;
          cloud.position.z *= -0.95;
        }
      }
    },
  };
}
