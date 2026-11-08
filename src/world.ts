import * as THREE from 'three';
import { createLandmarks, type Landmark } from './landmarks';
import { buildingsMesh } from './buildings';
import { ObstacleIndex } from './obstacles';
import { addHull } from './outline';
import { heightAt, terrainAt, WATER_EPS, type Grid, type TerrainData } from './terrain';
import { toon } from './toon';

export { heightAt };

/** Start pad on the quay south of the bridge, between river and Bahnhofstrasse. */
export const HOME = new THREE.Vector3(24, 0, 79);
/** Heading at the start: looking at the bridge. */
export const HOME_YAW = Math.atan2(24, 79);
export const FLIGHT_RADIUS = 650;
export const MAX_ALTITUDE = 120;

export interface World {
  obstacles: ObstacleIndex;
  landmarks: Landmark[];
  lake: THREE.MeshToonMaterial;
  windows: THREE.MeshBasicMaterial;
  /** Highest surface under a point at height y: terrain, water or a roof below it. */
  groundAt(x: number, z: number, y: number): number;
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

const PAVED = new THREE.Color('#bdb9b0');
const GRASS = new THREE.Color('#86c06c');
const MEADOW = new THREE.Color('#6aa85a');
const FOREST = new THREE.Color('#3f7a45');
const ROCK = new THREE.Color('#9a9488');
const SNOW = new THREE.Color('#f4f6fa');
const SHORE = new THREE.Color('#b9b2a0');

/** Terrain mesh from a height grid. Water cells are pushed below the water plane. */
function terrainMesh(grid: Grid, colorAt: (h: number, steep: number, x: number, z: number) => THREE.Color, hole?: number) {
  const segments = grid.count - 1;
  const geo = new THREE.PlaneGeometry(grid.size, grid.size, segments, segments);
  geo.rotateX(-Math.PI / 2); // rows run north to south, like the grid
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let h = grid.heights[i];
    if (h <= WATER_EPS) h = -1.5;
    // far mesh: sink the part the detailed core covers
    if (hole && Math.abs(pos.getX(i)) < hole && Math.abs(pos.getZ(i)) < hole) h -= 25;
    pos.setY(i, h);
  }
  geo.computeVertexNormals();
  const normals = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    colorAt(grid.heights[i], 1 - normals.getY(i), pos.getX(i), pos.getZ(i)).toArray(colors, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = toon('#ffffff');
  mat.vertexColors = true;
  return new THREE.Mesh(geo, mat);
}

export function createWorld(scene: THREE.Scene, data: TerrainData): World {
  const obstacles = new ObstacleIndex();
  const rand = random(42);

  // --- Terrain: detailed core + coarse far ring for the horizon ---------------
  const c = new THREE.Color();
  const core = terrainMesh(data.core, (h, steep, x, z) => {
    if (h <= WATER_EPS) return c.copy(SHORE);
    if (h < 9 && steep < 0.25) return c.copy(PAVED);
    if (steep > 0.35) return c.copy(FOREST);
    return c.copy(Math.sin(x * 0.07) * Math.sin(z * 0.05) > 0.3 ? MEADOW : GRASS);
  });
  const far = terrainMesh(
    data.far,
    (h, steep) => {
      if (h > 1500) return c.copy(SNOW);
      if (h > 1100 || steep > 0.55) return c.copy(ROCK);
      if (h > 350 || steep > 0.25) return c.copy(FOREST);
      return c.copy(MEADOW);
    },
    data.core.size / 2,
  );
  scene.add(core, far);

  // --- Water: one plane at lake level ---------------------------------------------
  const lake = toon('#3d8fd1');
  const water = new THREE.Mesh(new THREE.PlaneGeometry(data.far.size, data.far.size), lake);
  water.rotation.x = -Math.PI / 2;
  scene.add(water);

  // --- Buildings and landmarks -----------------------------------------------------
  scene.add(buildingsMesh(data.buildings, obstacles));
  const windows = new THREE.MeshBasicMaterial({ color: '#3a2a22' });
  const landmarks = createLandmarks(scene, obstacles, windows);

  // --- Home pad with an "H" ------------------------------------------------------------
  HOME.y = heightAt(HOME.x, HOME.z);
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
  pad.position.set(HOME.x, HOME.y + 0.05, HOME.z);
  pad.rotation.y = HOME_YAW;
  scene.add(pad);

  // --- Windsock next to the pad ----------------------------------------------------------
  const sockX = HOME.x + 3;
  const sockY = heightAt(sockX, HOME.z);
  const sockPole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 6), toon('#dddddd'));
  sockPole.position.set(sockX, sockY + 1.5, HOME.z);
  const sock = new THREE.Group();
  const sockCone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.4, 12, 1, true), toon('#ff6a1a'));
  sockCone.material.side = THREE.DoubleSide;
  sockCone.rotation.z = Math.PI / 2; // tip points along +x
  sockCone.position.x = 0.7;
  sock.add(sockCone);
  sock.position.set(sockX, sockY + 2.9, HOME.z);
  scene.add(sockPole, sock);

  // --- Clouds: flattened puffs drifting with the wind -------------------------------------
  const puffGeo = new THREE.IcosahedronGeometry(1, 1);
  const cloudMat = toon('#ffffff');
  // clouds are mostly seen from below: lift the shadow side so they stay light
  cloudMat.emissive.set('#5c6270');
  const clouds: THREE.Group[] = [];
  for (let i = 0; i < 16; i++) {
    const cloud = new THREE.Group();
    const puffs = 3 + Math.floor(rand() * 4);
    for (let j = 0; j < puffs; j++) {
      const puff = new THREE.Mesh(puffGeo, cloudMat);
      const r = 10 + rand() * 12;
      puff.scale.set(r, r * 0.55, r);
      puff.position.set((j - puffs / 2) * 14 + rand() * 6, rand() * 4, rand() * 12 - 6);
      addHull(puff, 0.04);
      cloud.add(puff);
    }
    const a = rand() * Math.PI * 2;
    const d = rand() * 900;
    cloud.position.set(Math.cos(a) * d, 180 + rand() * 120, Math.sin(a) * d);
    scene.add(cloud);
    clouds.push(cloud);
  }

  return {
    obstacles,
    landmarks,
    lake,
    windows,
    groundAt(x, z, y) {
      return obstacles.groundAt(x, z, y, heightAt(x, z));
    },
    update(dt, wind) {
      const strength = Math.hypot(wind.x, wind.z);
      // windsock points downwind; hangs limp at calm, horizontal at ~8 m/s
      sock.rotation.set(0, Math.atan2(-wind.z, wind.x), -Math.max(0, 1 - strength / 8) * 1.2);
      for (const cloud of clouds) {
        cloud.position.x += wind.x * 0.6 * dt;
        cloud.position.z += wind.z * 0.6 * dt;
        if (Math.hypot(cloud.position.x, cloud.position.z) > 1000) {
          cloud.position.x *= -0.95;
          cloud.position.z *= -0.95;
        }
      }
    },
  };
}

export { terrainAt };
