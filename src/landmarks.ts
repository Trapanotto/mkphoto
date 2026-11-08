import * as THREE from 'three';
import { ObstacleIndex, Strip, Tower } from './obstacles';
import { addHull } from './outline';
import { toon } from './toon';

/** A point on a landmark used to judge photos. Points with a normal only count from the side they face. */
export interface SubjectPoint {
  p: THREE.Vector3;
  n?: THREE.Vector3;
}

export interface Landmark {
  id: string;
  name: string;
  box: THREE.Box3;
  points: SubjectPoint[];
}

/**
 * Centre line of the Kapellbrücke from swissTLM3D (LV95, converted to game metres:
 * x = east, z = south, origin at the bridge middle).
 */
const BRIDGE_PATH: [number, number][] = [
  [58.3, -75.4],
  [-12.3, 29.3],
  [-57.3, 62.9],
  [-55.4, 74.4],
];
const DECK = 1.8;
const HALF_WIDTH = 2.5;
const EAVES = DECK + 2.7;
const RIDGE = DECK + 4.6;

/** Wasserturm: octagonal stone tower in the Reuss, position from the SWISSIMAGE orthophoto. */
const TOWER = { x: -7, z: 38, radius: 6.2, wallTop: 26, roofRadius: 7.2, roofTop: 34.5 };

const WOOD = '#8a5a34';
const WOOD_DARK = '#5e3b22';
const ROOF = '#8c3a24';
const FLOWERS = '#e0283a';
const LEAVES = '#3f7a2e';

function bridgeSection(ax: number, az: number, bx: number, bz: number, materials: Record<string, THREE.Material>) {
  const length = Math.hypot(bx - ax, bz - az) + 0.6; // small overlap at the kinks
  const g = new THREE.Group();
  g.position.set((ax + bx) / 2, 0, (az + bz) / 2);
  g.rotation.y = Math.atan2(-(bz - az), bx - ax); // local +x along the bridge

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, hull = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (hull) addHull(m, hull);
    g.add(m);
    return m;
  };

  // deck and the solid lower walls
  add(new THREE.BoxGeometry(length, 0.35, HALF_WIDTH * 2), materials.woodDark, 0, DECK - 0.175, 0, 0.04);
  for (const side of [-1, 1]) {
    add(new THREE.BoxGeometry(length, 1.0, 0.16), materials.wood, 0, DECK + 0.5, side * (HALF_WIDTH - 0.08), 0.03);
    // flower boxes hanging outside: green box, red flowers on top
    add(new THREE.BoxGeometry(length, 0.3, 0.4), materials.leaves, 0, DECK + 0.75, side * (HALF_WIDTH + 0.2));
    add(new THREE.BoxGeometry(length, 0.22, 0.46), materials.flowers, 0, DECK + 0.98, side * (HALF_WIDTH + 0.2));
    // eaves beam
    add(new THREE.BoxGeometry(length, 0.2, 0.2), materials.woodDark, 0, EAVES - 0.1, side * (HALF_WIDTH - 0.1));
  }

  // posts between wall and roof, every 2.4 m on both sides
  const postCount = Math.max(2, Math.floor(length / 2.4));
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, EAVES - DECK - 1.0, 0.16), materials.wood, postCount * 2);
  const m = new THREE.Matrix4();
  for (let i = 0; i < postCount; i++) {
    const x = -length / 2 + (i + 0.5) * (length / postCount);
    for (const [k, side] of [
      [0, -1],
      [1, 1],
    ]) {
      m.makeTranslation(x, (DECK + 1.0 + EAVES) / 2, side * (HALF_WIDTH - 0.08));
      posts.setMatrixAt(i * 2 + k, m);
    }
  }
  g.add(posts);

  // gable roof: two tilted planes
  const run = HALF_WIDTH + 0.5;
  const rise = RIDGE - EAVES;
  const slope = Math.hypot(run, rise);
  const angle = Math.atan2(rise, run);
  for (const side of [-1, 1]) {
    const roof = add(new THREE.BoxGeometry(length + 0.4, 0.18, slope), materials.roof, 0, (EAVES + RIDGE) / 2 - 0.15, (side * run) / 2, 0.05);
    roof.rotation.x = side * angle;
  }

  // wooden piles in the water, pairs every ~8 m
  const pileCount = Math.max(1, Math.round(length / 8));
  const piles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.18, DECK + 3, 6), materials.woodDark, pileCount * 2);
  for (let i = 0; i < pileCount; i++) {
    const x = -length / 2 + (i + 0.5) * (length / pileCount);
    for (const [k, side] of [
      [0, -1],
      [1, 1],
    ]) {
      m.makeTranslation(x, (DECK - 3) / 2, side * (HALF_WIDTH - 0.6));
      piles.setMatrixAt(i * 2 + k, m);
    }
  }
  g.add(piles);
  return g;
}

function wasserturm(windows: THREE.Material) {
  const g = new THREE.Group();
  const stone = new THREE.Mesh(new THREE.CylinderGeometry(TOWER.radius, TOWER.radius + 0.3, TOWER.wallTop + 3, 8), toon('#9c6b4e'));
  stone.position.y = (TOWER.wallTop - 3) / 2;
  addHull(stone, 0.12);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(TOWER.radius + 0.25, TOWER.radius + 0.25, 0.6, 8), toon('#c9a77c'));
  band.position.y = TOWER.wallTop - 0.3;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(TOWER.roofRadius, TOWER.roofTop - TOWER.wallTop, 8), toon('#6e3020'));
  roof.position.y = (TOWER.wallTop + TOWER.roofTop) / 2;
  addHull(roof, 0.12);
  g.add(stone, band, roof);
  // narrow windows on four sides, at two heights
  const winGeo = new THREE.PlaneGeometry(0.8, 1.6);
  const apothem = (TOWER.radius + 0.12) * Math.cos(Math.PI / 8);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 8 + (i * Math.PI) / 2;
    for (const y of [12, 20]) {
      const w = new THREE.Mesh(winGeo, windows);
      w.position.set(Math.sin(a) * apothem, y, Math.cos(a) * apothem);
      w.rotation.y = a;
      g.add(w);
    }
  }
  g.position.set(TOWER.x, 0, TOWER.z);
  return g;
}

export function createLandmarks(scene: THREE.Scene, obstacles: ObstacleIndex, windows: THREE.Material): Landmark[] {
  const materials = {
    wood: toon(WOOD),
    woodDark: toon(WOOD_DARK),
    roof: toon(ROOF),
    flowers: toon(FLOWERS),
    leaves: toon(LEAVES),
  };

  const bridge = new THREE.Group();
  for (let i = 0; i < BRIDGE_PATH.length - 1; i++) {
    const [ax, az] = BRIDGE_PATH[i];
    const [bx, bz] = BRIDGE_PATH[i + 1];
    bridge.add(bridgeSection(ax, az, bx, bz, materials));
    const strip = new Strip(ax, az, bx, bz, HALF_WIDTH + 0.5, DECK - 0.35, EAVES, RIDGE);
    strip.owner = 'kapellbruecke';
    obstacles.add(strip);
  }
  scene.add(bridge);

  const tower = wasserturm(windows);
  scene.add(tower);
  const towerObstacle = new Tower(TOWER.x, TOWER.z, TOWER.radius + 0.3, -3, TOWER.wallTop, TOWER.roofRadius, TOWER.roofTop);
  towerObstacle.owner = 'wasserturm';
  obstacles.add(towerObstacle);

  // bridge: points along the centre line every ~6 m, at wall and roof height
  const bridgePoints: SubjectPoint[] = [];
  for (let i = 0; i < BRIDGE_PATH.length - 1; i++) {
    const [ax, az] = BRIDGE_PATH[i];
    const [bx, bz] = BRIDGE_PATH[i + 1];
    const steps = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 6));
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      bridgePoints.push({ p: new THREE.Vector3(x, DECK + 1.2, z) }, { p: new THREE.Vector3(x, RIDGE - 0.3, z) });
    }
  }
  // tower: eight sides at three heights, facing outwards, plus the roof tip
  const towerPoints: SubjectPoint[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const n = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    for (const y of [4, 13, 22]) {
      towerPoints.push({ p: new THREE.Vector3(TOWER.x, y, TOWER.z).addScaledVector(n, TOWER.radius + 0.4), n });
    }
  }
  towerPoints.push({ p: new THREE.Vector3(TOWER.x, TOWER.roofTop - 0.5, TOWER.z) });

  return [
    { id: 'kapellbruecke', name: 'Kapellbrücke', box: new THREE.Box3().setFromObject(bridge), points: bridgePoints },
    { id: 'wasserturm', name: 'Wasserturm', box: new THREE.Box3().setFromObject(tower), points: towerPoints },
  ];
}
