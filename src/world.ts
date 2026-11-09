import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createAmbient } from './ambient';
import { createLandmarks, type Landmark } from './landmarks';
import { buildings3dMesh, RoofMap, type Buildings3d } from './buildings3d';
import { ObstacleIndex, Tower } from './obstacles';
import { createRoads, type Route } from './roads';
import { createWater } from './water';
import { addHull } from './outline';
import { heightAt, terrainAt, WATER_EPS, type Grid, type TerrainData } from './terrain';
import { toon } from './toon';

export { heightAt };

/**
 * Launch pad on the quay south of the river: a spot with no road, path, building or tree
 * within reach of the platform (checked against the swissTLM3D routes and the roof map).
 */
export const HOME = new THREE.Vector3(12, 0, 86);
/** Heading at the start: looking at the Wasserturm and the bridge. */
export const HOME_YAW = Math.atan2(19, 48);
export const FLIGHT_RADIUS = 650;
export const MAX_ALTITUDE = 120;

export interface World {
  obstacles: ObstacleIndex;
  routes: Route[];
  landmarks: Landmark[];
  lake: { color: THREE.Color };
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

/** Pad surface: dark disc, yellow ring, the MK mark and the name around it. */
function padTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#23272d';
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = '#ffc531';
  g.lineWidth = 22;
  g.beginPath();
  g.arc(256, 256, 232, 0, Math.PI * 2);
  g.stroke();
  // landing circle in the middle, where the drone stands
  g.strokeStyle = '#ffffff';
  g.lineWidth = 5;
  g.beginPath();
  g.arc(256, 256, 58, 0, Math.PI * 2);
  g.stroke();
  // MK mark and name on the half facing the start camera, outside the drone's footprint
  g.save();
  g.translate(256 - 100 * 0.62, 372 - 100 * 0.62);
  g.scale(0.62, 0.62);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 18;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(52, 140);
  g.lineTo(52, 60);
  g.lineTo(100, 132);
  g.lineTo(150, 60);
  g.moveTo(124, 96);
  g.lineTo(150, 140);
  g.stroke();
  g.restore();
  g.fillStyle = '#ffffff';
  g.font = '800 40px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText('MKPHOTO', 256, 448);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Distance to the Kapellbrücke centre line (same path as the model). */
const BRIDGE: [number, number][] = [[58.3, -75.4], [-12.3, 29.3], [-57.3, 62.9], [-55.4, 74.4]];
function bridgeDistance(x: number, z: number) {
  let best = Infinity;
  for (let i = 0; i < BRIDGE.length - 1; i++) {
    const [ax, az] = BRIDGE[i];
    const [bx, bz] = BRIDGE[i + 1];
    const ex = bx - ax, ez = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez)));
    best = Math.min(best, Math.hypot(x - ax - ex * t, z - az - ez * t));
  }
  return best;
}

/** 1 by day, 0 at night; set by the time of day. */
export const daylightLevel = { value: 1 };
const daylight = () => daylightLevel.value;

export function createWorld(scene: THREE.Scene, data: TerrainData, houses: Buildings3d, density = 1): World {
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

  // --- Water: one cel-shaded plane at lake level; bridge and tower count as shore for the foam ---
  const water = createWater(data.far.size, data.core.size / 2, [
    (x, z) => bridgeDistance(x, z) < 2.8,
    (x, z) => Math.hypot(x + 7, z - 38) < 7.2,
  ]);
  scene.add(water.mesh);
  const lake = water;

  // --- Buildings and landmarks -----------------------------------------------------
  // buildings from swissBUILDINGS3D; their roofs also drive collision
  const roofMap = new RoofMap(data.core.size / 2);
  scene.add(buildings3dMesh(houses, roofMap));
  obstacles.roofs = roofMap;
  const windows = new THREE.MeshBasicMaterial({ color: '#3a2a22' });
  const routes = createRoads(scene, data.roads, obstacles, windows);
  const landmarks = createLandmarks(scene, obstacles, windows);
  const ambient = createAmbient(scene, data, routes, obstacles, density);
  let clock = 0;

  // --- Launch pad: a raised platform with the MKPHOTO mark, above the quay's road surface ----
  HOME.y = heightAt(HOME.x, HOME.z);
  const PAD_R = 2.2;
  const PAD_H = 0.4;
  const pad = new THREE.Group();
  // the base reaches well into the ground so a sloping quay leaves no gap
  const base = new THREE.Mesh(new THREE.CylinderGeometry(PAD_R + 0.15, PAD_R + 0.3, PAD_H + 1.2, 40), toon('#3a3f46'));
  base.position.y = (PAD_H - 1.2) / 2;
  addHull(base, 0.04);
  const top = new THREE.Mesh(new THREE.CircleGeometry(PAD_R, 48), new THREE.MeshBasicMaterial({ map: padTexture() }));
  top.rotation.x = -Math.PI / 2;
  top.position.y = PAD_H + 0.01;
  // little lights around the rim
  const lights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffc531' }), 12);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    lights.setMatrixAt(i, new THREE.Matrix4().makeTranslation(Math.cos(a) * (PAD_R + 0.08), PAD_H, Math.sin(a) * (PAD_R + 0.08)));
  }
  pad.add(base, top, lights);
  pad.position.set(HOME.x, HOME.y, HOME.z);
  pad.rotation.y = HOME_YAW;
  scene.add(pad);
  // the drone stands on the platform
  obstacles.add(new Tower(HOME.x, HOME.z, PAD_R + 0.2, HOME.y - 1, HOME.y + PAD_H, PAD_R + 0.2, HOME.y + PAD_H));

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

  // --- Clouds: cumulus heaps with flat bases, white on top, blue-grey below -------------------
  const cloudMat = toon('#ffffff');
  cloudMat.vertexColors = true;
  const cloudTop = new THREE.Color('#ffffff');
  const cloudBase = new THREE.Color('#b9c6d8');
  const clouds: THREE.Mesh[] = [];
  for (let i = 0; i < 18; i++) {
    const width = 50 + rand() * 90;
    const puffs: THREE.BufferGeometry[] = [];
    const count = 7 + Math.floor(rand() * 6);
    for (let j = 0; j < count; j++) {
      // big puffs in the middle, small ones at the ends: a dome
      const t = count === 1 ? 0 : (j / (count - 1)) * 2 - 1;
      const r = width * (0.22 - 0.12 * Math.abs(t)) * (0.85 + rand() * 0.3);
      const geo = new THREE.IcosahedronGeometry(r, 2);
      geo.translate(t * width * 0.45, r * (0.35 + rand() * 0.35), (rand() - 0.5) * width * 0.25);
      puffs.push(geo);
    }
    // a few smaller puffs on top for the cauliflower look
    for (let j = 0; j < 3; j++) {
      const r = width * (0.1 + rand() * 0.06);
      const geo = new THREE.IcosahedronGeometry(r, 2);
      geo.translate((rand() - 0.5) * width * 0.5, width * 0.22 + rand() * width * 0.08, (rand() - 0.5) * width * 0.2);
      puffs.push(geo);
    }
    const geo = mergeGeometries(puffs.map((g) => g.toNonIndexed()))!;
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    let top = 0;
    for (let k = 0; k < pos.count; k++) top = Math.max(top, pos.getY(k));
    for (let k = 0; k < pos.count; k++) {
      // flat base, and a colour ramp from the blue-grey base to white tops
      const y = Math.max(0, pos.getY(k));
      pos.setY(k, y);
      c.copy(cloudBase).lerp(cloudTop, Math.min(1, Math.pow(y / top, 0.6) * 1.15));
      c.toArray(colors, k * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const cloud = new THREE.Mesh(geo, cloudMat);
    addHull(cloud, 0.6);
    const a = rand() * Math.PI * 2;
    const d = 150 + rand() * 900;
    cloud.position.set(Math.cos(a) * d, 170 + rand() * 140, Math.sin(a) * d);
    cloud.rotation.y = rand() * Math.PI;
    scene.add(cloud);
    clouds.push(cloud);
  }

  return {
    obstacles,
    routes,
    landmarks,
    lake,
    windows,
    groundAt(x, z, y) {
      return obstacles.groundAt(x, z, y, heightAt(x, z));
    },
    update(dt, wind) {
      clock += dt;
      ambient.update(dt, clock);
      water.update(clock, wind, daylight());
      // clouds stay bright by day and go dark at night
      cloudMat.emissive.setRGB(0.32, 0.34, 0.38).multiplyScalar(daylight());
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
