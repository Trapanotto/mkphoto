import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createAmbient } from './ambient';
import { createAlpineLandmarks } from './alpine';
import { createLandmarks, type Landmark } from './landmarks';
import type { Region } from './regions';
import { buildings3dMesh, RoofMap, type Buildings3d } from './buildings3d';
import { ObstacleIndex, Tower } from './obstacles';
import { createRoads, type Route } from './roads';
import { createWater } from './water';
import { addHull } from './outline';
import { heightAt, isWater, terrainAt, type Grid, type TerrainData } from './terrain';
import { toon } from './toon';

export { heightAt };

/** Launch pad and heading; set from the region when the world is built. */
export const HOME = new THREE.Vector3(12, 0, 86);
export let HOME_YAW = Math.atan2(19, 48);
/** Allowed flying area: a circle around FLIGHT_CENTER. */
export const FLIGHT_CENTER = new THREE.Vector2(0, 0);
export let FLIGHT_RADIUS = 650;
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
const GLACIER = new THREE.Color('#dfeef6');
const SCREE = new THREE.Color('#a8a090');
const ALPINE = new THREE.Color('#8fb069');
const DARK_ROCK = new THREE.Color('#7f7a72');

/**
 * Terrain mesh from a height grid. Water cells are pushed below the water plane; where a finer
 * grid covers this one, the vertices sink so the finer one shows. A skirt hangs from the edges.
 */
function terrainMesh(
  grid: Grid,
  colorAt: (h: number, steep: number, x: number, z: number) => THREE.Color,
  finer: Grid[],
) {
  const segments = grid.count - 1;
  const geo = new THREE.PlaneGeometry(grid.size, grid.size, segments, segments);
  geo.rotateX(-Math.PI / 2); // rows run north to south, like the grid
  geo.translate(grid.center.x, 0, grid.center.z);
  const pos = geo.attributes.position;
  const covered = (x: number, z: number) =>
    finer.some((f) => Math.abs(x - f.center.x) < f.size / 2 - f.step && Math.abs(z - f.center.z) < f.size / 2 - f.step);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    let h = grid.heights[i];
    if (isWater(x, z)) h = Math.min(h, -1.5);
    if (covered(x, z)) h -= Math.max(25, grid.step * 0.8);
    pos.setY(i, h);
  }
  geo.computeVertexNormals();
  const normals = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    (isWater(x, z) ? SHORE : colorAt(grid.heights[i], 1 - normals.getY(i), x, z)).toArray(colors, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = toon('#ffffff');
  mat.vertexColors = true;
  const mesh = new THREE.Mesh(geo, mat);

  // skirt: walls down from the outer edge, hiding gaps to the coarser grid below
  const n = grid.count;
  const edge: number[] = [];
  for (let i = 0; i < n; i++) edge.push(i);
  for (let j = 1; j < n; j++) edge.push(j * n + n - 1);
  for (let i = n - 2; i >= 0; i--) edge.push((n - 1) * n + i);
  for (let j = n - 2; j > 0; j--) edge.push(j * n);
  edge.push(0);
  const drop = Math.max(60, grid.step * 4);
  const skirt: number[] = [];
  const skirtCol: number[] = [];
  for (let k = 0; k < edge.length - 1; k++) {
    const a = edge[k], b = edge[k + 1];
    const ax = pos.getX(a), ay = pos.getY(a), az = pos.getZ(a);
    const bx = pos.getX(b), by = pos.getY(b), bz = pos.getZ(b);
    skirt.push(ax, ay, az, bx, by, bz, bx, by - drop, bz, ax, ay, az, bx, by - drop, bz, ax, ay - drop, az);
    for (let v = 0; v < 6; v++) skirtCol.push(colors[a * 3], colors[a * 3 + 1], colors[a * 3 + 2]);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(skirt, 3));
  sg.setAttribute('color', new THREE.Float32BufferAttribute(skirtCol, 3));
  sg.computeVertexNormals();
  const skirtMat = toon('#ffffff');
  skirtMat.vertexColors = true;
  skirtMat.side = THREE.DoubleSide;
  mesh.add(new THREE.Mesh(sg, skirtMat));
  return mesh;
}

/** Colours for a lake town: paved shores, meadows, forest, rock and snow further out. */
function cityColors(c: THREE.Color, base: number) {
  return (detailed: boolean) =>
    (h: number, steep: number, x: number, z: number) => {
      if (detailed) {
        if (h < 9 && steep < 0.25) return c.copy(PAVED);
        if (steep > 0.35) return c.copy(FOREST);
        return c.copy(Math.sin(x * 0.07) * Math.sin(z * 0.05) > 0.3 ? MEADOW : GRASS);
      }
      const abs = h + base;
      if (abs > 1930) return c.copy(SNOW);
      if (abs > 1530 || steep > 0.55) return c.copy(ROCK);
      if (abs > 780 || steep > 0.25) return c.copy(FOREST);
      return c.copy(MEADOW);
    };
}

/** Alpine colours by real altitude and slope: forest, pasture, scree, rock, snow and glacier. */
function alpineColors(c: THREE.Color, base: number) {
  return () =>
    (h: number, steep: number, x: number, z: number) => {
      const abs = h + base;
      const n = Math.sin(x * 0.013) * Math.sin(z * 0.011) * 60;
      if (steep > 0.62) return c.copy(abs > 3200 ? DARK_ROCK : ROCK);
      if (abs + n > 3350 && steep < 0.3) return c.copy(GLACIER);
      if (abs + n > 3050) return c.copy(steep > 0.4 ? ROCK : SNOW);
      if (abs + n > 2900) return c.copy(steep > 0.35 ? ROCK : SCREE);
      // alpine pasture with rocky patches up to about 2900 m
      if (abs + n > 2150) return c.copy(steep > 0.42 ? ROCK : Math.sin(x * 0.05) * Math.sin(z * 0.043) > 0.55 ? SCREE : ALPINE);
      return c.copy(steep > 0.5 ? ROCK : FOREST);
    };
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

export function createWorld(scene: THREE.Scene, data: TerrainData, houses: Buildings3d, region: Region, density = 1): World {
  const obstacles = new ObstacleIndex();
  const rand = random(42);
  HOME.set(region.home.x, 0, region.home.z);
  HOME_YAW = region.home.yaw;
  FLIGHT_CENTER.set(region.flight.x, region.flight.z);
  FLIGHT_RADIUS = region.flight.radius;
  const base = data.meta.lakeLevel;

  // --- Terrain: every grid, the coarser ones sinking under the finer ---------------
  const c = new THREE.Color();
  const palette = region.style === 'alpine' ? alpineColors(c, base) : cityColors(c, base);
  data.grids.forEach((grid, i) => {
    scene.add(terrainMesh(grid, palette(i === 0), data.grids.slice(0, i)));
  });

  // --- Water: one cel-shaded plane at the base level; structures count as shore for the foam ---
  const shoreSolids =
    region.id === 'luzern'
      ? [(x: number, z: number) => bridgeDistance(x, z) < 2.8, (x: number, z: number) => Math.hypot(x + 7, z - 38) < 7.2]
      : [];
  const water = createWater(
    region.waterPlane === 'everywhere' ? data.far.size : data.core.size,
    data.core,
    shoreSolids,
    region.waterPlane === 'lake',
  );
  scene.add(water.mesh);
  const lake = water;

  // --- Buildings and landmarks -----------------------------------------------------
  // buildings from swissBUILDINGS3D; their roofs also drive collision
  const roofMap = new RoofMap(data.core.size / 2, data.core.center.x, data.core.center.z);
  scene.add(buildings3dMesh(houses, roofMap));
  obstacles.roofs = roofMap;
  const windows = new THREE.MeshBasicMaterial({ color: '#3a2a22' });
  const routes = createRoads(scene, data.roads, obstacles, windows, region.id === 'luzern');
  const landmarks =
    region.id === 'luzern' ? createLandmarks(scene, obstacles, windows) : createAlpineLandmarks(data, houses);
  const ambient = createAmbient(scene, data, routes, obstacles, density, region);
  let clock = 0;

  // --- Launch pad: a raised platform with the MKPHOTO mark, above the quay's road surface ----
  HOME.y = heightAt(HOME.x, HOME.z);
  const PAD_R = 2.2;
  const PAD_H = 0.4;
  const pad = new THREE.Group();
  // the base reaches well into the ground so a sloping quay leaves no gap
  const padBase = new THREE.Mesh(new THREE.CylinderGeometry(PAD_R + 0.15, PAD_R + 0.3, PAD_H + 1.2, 40), toon('#3a3f46'));
  padBase.position.y = (PAD_H - 1.2) / 2;
  addHull(padBase, 0.04);
  const top = new THREE.Mesh(new THREE.CircleGeometry(PAD_R, 48), new THREE.MeshBasicMaterial({ map: padTexture() }));
  top.rotation.x = -Math.PI / 2;
  top.position.y = PAD_H + 0.01;
  // little lights around the rim
  const lights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffc531' }), 12);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    lights.setMatrixAt(i, new THREE.Matrix4().makeTranslation(Math.cos(a) * (PAD_R + 0.08), PAD_H, Math.sin(a) * (PAD_R + 0.08)));
  }
  pad.add(padBase, top, lights);
  pad.position.set(HOME.x, HOME.y, HOME.z);
  pad.rotation.y = HOME_YAW;
  scene.add(pad);
  // the drone stands on the platform
  obstacles.add(new Tower(HOME.x, HOME.z, PAD_R + 0.2, HOME.y - 1, HOME.y + PAD_H, PAD_R + 0.2, HOME.y + PAD_H));

  // --- Windsock next to the pad ----------------------------------------------------------
  // beside the pad, to the right of the start view, so it never blocks it
  const sockX = HOME.x + Math.cos(HOME_YAW) * 3.4;
  const sockZ = HOME.z - Math.sin(HOME_YAW) * 3.4;
  const sockY = heightAt(sockX, sockZ);
  const sockPole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 6), toon('#dddddd'));
  sockPole.position.set(sockX, sockY + 1.5, sockZ);
  const sock = new THREE.Group();
  const sockCone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.4, 12, 1, true), toon('#ff6a1a'));
  sockCone.material.side = THREE.DoubleSide;
  sockCone.rotation.z = Math.PI / 2; // tip points along +x
  sockCone.position.x = 0.7;
  sock.add(sockCone);
  sock.position.set(sockX, sockY + 2.9, sockZ);
  scene.add(sockPole, sock);

  // --- Clouds: cumulus heaps with flat bases, white on top, blue-grey below -------------------
  const cloudMat = toon('#ffffff');
  cloudMat.vertexColors = true;
  const cloudTop = new THREE.Color('#ffffff');
  const cloudBase = new THREE.Color('#b9c6d8');
  const clouds: THREE.Mesh[] = [];
  const cloudCount = region.style === 'alpine' ? 26 : 18;
  for (let i = 0; i < cloudCount; i++) {
    const width = (50 + rand() * 90) * region.clouds.size;
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
    const d = 150 + rand() * region.clouds.spread;
    cloud.position.set(
      FLIGHT_CENTER.x + Math.cos(a) * d,
      region.clouds.min + rand() * (region.clouds.max - region.clouds.min),
      FLIGHT_CENTER.y + Math.sin(a) * d,
    );
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
        const dx = cloud.position.x - FLIGHT_CENTER.x;
        const dz = cloud.position.z - FLIGHT_CENTER.y;
        if (Math.hypot(dx, dz) > region.clouds.spread + 200) {
          cloud.position.x = FLIGHT_CENTER.x - dx * 0.95;
          cloud.position.z = FLIGHT_CENTER.y - dz * 0.95;
        }
      }
    },
  };
}

export { terrainAt };
