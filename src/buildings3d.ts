import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { wallMaterial } from './buildings';
import { addHull } from './outline';
import { toon } from './toon';
import { terrainAt } from './terrain';

/** swissBUILDINGS3D for the game area, from tools/import-buildings3d.mjs. */
export interface Buildings3d {
  unit: number;
  triangles: number;
  types: string[];
  /** Type index per building. */
  buildings: number[];
  attribution: string;
  positions: Int16Array;
  owners: Uint16Array;
}

export async function loadBuildings3d(baseUrl: string): Promise<Buildings3d> {
  const meta = await (await fetch(`${baseUrl}buildings3d.json`)).json();
  let buf = await (await fetch(`${baseUrl}buildings3d.bin.gz`)).arrayBuffer();
  // some servers already unpack .gz on the way; only unpack if the gzip header is still there
  const head = new Uint8Array(buf, 0, 2);
  if (head[0] === 0x1f && head[1] === 0x8b) {
    buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }
  const n = meta.triangles as number;
  return {
    ...meta,
    positions: new Int16Array(buf, 0, n * 9),
    owners: new Uint16Array(buf, n * 18, n),
  };
}

/**
 * Highest building surface per square metre. Used for landing on roofs, hitting walls,
 * the camera and the visibility test, so all of them match the visible buildings.
 */
export class RoofMap {
  readonly size: number;
  private readonly half: number;
  private readonly cells: Uint16Array;

  /** Covers a square of 2 × halfExtent metres around (cx, cz). */
  constructor(
    halfExtent: number,
    private readonly cx = 0,
    private readonly cz = 0,
  ) {
    this.half = halfExtent;
    this.size = Math.round(halfExtent * 2);
    this.cells = new Uint16Array(this.size * this.size);
  }

  /** Top of the building at a point, or -Infinity where there is none. */
  top(x: number, z: number) {
    const i = Math.floor(x - this.cx + this.half);
    const j = Math.floor(z - this.cz + this.half);
    if (i < 0 || j < 0 || i >= this.size || j >= this.size) return -Infinity;
    const v = this.cells[j * this.size + i];
    return v === 0 ? -Infinity : v / 10 - 50;
  }

  /** Adds a triangle's upward surface: each cell centre inside it keeps the highest height. */
  addTriangle(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number) {
    // work in the map's own frame
    ax -= this.cx; bx -= this.cx; cx -= this.cx;
    az -= this.cz; bz -= this.cz; cz -= this.cz;
    const h = this.half;
    const i0 = Math.max(0, Math.floor(Math.min(ax, bx, cx) + h));
    const i1 = Math.min(this.size - 1, Math.floor(Math.max(ax, bx, cx) + h));
    const j0 = Math.max(0, Math.floor(Math.min(az, bz, cz) + h));
    const j1 = Math.min(this.size - 1, Math.floor(Math.max(az, bz, cz) + h));
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(d) < 1e-6) return;
    for (let j = j0; j <= j1; j++) {
      const pz = j - h + 0.5;
      for (let i = i0; i <= i1; i++) {
        const px = i - h + 0.5;
        const w1 = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / d;
        const w2 = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / d;
        const w3 = 1 - w1 - w2;
        if (w1 < -0.02 || w2 < -0.02 || w3 < -0.02) continue;
        const y = w1 * ay + w2 * by + w3 * cy;
        const v = Math.max(1, Math.min(65535, Math.round((y + 50) * 10)));
        const k = j * this.size + i;
        if (v > this.cells[k]) this.cells[k] = v;
      }
    }
  }
}

function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HOUSE_WALLS = ['#f2e6d0', '#e8d2b0', '#fbf6ee', '#f0d9c4', '#e6c9a8', '#d9d2c4', '#f3dcc2', '#e9e1cf', '#dcc7a5', '#efe3c8'];
const TILE_ROOFS = ['#9a4a32', '#8a3a2a', '#a65a3a', '#7a4030', '#8f4b34', '#6e3a2c'];
const FLAT_ROOFS = ['#9a968c', '#8c8a84', '#a3a097', '#7f8f6a'];

/** Wall colour and whether the walls get windows, by swisstopo object type. */
function styleFor(type: string, rand: () => number): { wall: string; windows: boolean; modern: boolean } {
  switch (type) {
    case 'Sakrales Gebaeude':
    case 'Sakraler Turm':
      return { wall: '#ebe5d6', windows: false, modern: false };
    case 'Turm':
      return { wall: '#b9a58a', windows: false, modern: false };
    case 'Mauer gross':
      return { wall: '#a9a196', windows: false, modern: false };
    case 'Flugdach':
    case 'Offenes Gebaeude':
    case 'Lagertank':
    case 'Verbindungsbrücke':
    case 'Bruecke gedeckt':
      return { wall: '#a8a49c', windows: false, modern: false };
    case 'Hochhaus':
      return { wall: '#cfd6dc', windows: true, modern: true };
    default:
      return { wall: HOUSE_WALLS[Math.floor(rand() * HOUSE_WALLS.length)], windows: true, modern: false };
  }
}

/** 0 house, 1 Gothic stone church, 2 castle stone, 3 house with arcades on the ground floor. */
export type BuildingStyle = 0 | 1 | 2 | 3;
const STONE: Record<number, string> = { 1: '#c4b98f', 2: '#c3b9a6' };

/** Roof tiles in rows, a glazed pattern on church roofs, gravel and solar panels on flat roofs. */
function roofMaterial() {
  const m = toon('#ffffff');
  m.vertexColors = true;
  m.side = THREE.DoubleSide;
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aRoof;\nvarying vec2 vRoof;\nvarying vec3 vW;\nvarying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoof = aRoof;\nvW = (modelMatrix * vec4(position, 1.0)).xyz;\nvWN = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vRoof;
        varying vec3 vW;
        varying vec3 vWN;
        float rh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 n = normalize(vWN);
          float near = 1.0 - smoothstep(150.0, 380.0, length(vViewPosition));
          int st = int(vRoof.y + 0.5);
          if (abs(n.y) < 0.93) {
            vec2 t = normalize(vec2(-n.z, n.x) + 1e-5);
            float along = dot(vW.xz, t);
            float rows = vW.y / 0.32;
            float row = floor(rows);
            float tu = along / 0.26 + mod(row, 2.0) * 0.5;
            float fr = fract(rows);
            float shade = (1.0 - smoothstep(0.0, 0.22 + fwidth(rows), fr)) * 0.28;
            float joint = (1.0 - smoothstep(0.0, 0.05 + fwidth(tu), min(fract(tu), 1.0 - fract(tu)))) * 0.12;
            float tone = (rh(vec2(floor(tu), row)) - 0.5) * 0.12;
            vec3 c = diffuseColor.rgb * (1.0 + tone * near);
            if (st == 1) {
              // glazed tiles in diamonds: green, ochre and dark red
              float d = abs(fract(along / 2.4) - 0.5) + abs(fract(vW.y / 1.7) - 0.5);
              float band = floor(d * 6.0);
              vec3 glaze = mod(band, 3.0) < 1.0 ? vec3(0.2, 0.42, 0.3) : mod(band, 3.0) < 2.0 ? vec3(0.78, 0.6, 0.24) : vec3(0.5, 0.2, 0.15);
              c = mix(c, glaze, 0.85);
            }
            // weathering: darker patches and moss here and there
            float moss = smoothstep(0.62, 0.85, rh(floor(vW.xz / 3.0)) * 0.5 + rh(floor(vW.xz / 1.3)) * 0.5);
            c = mix(c, c * vec3(0.8, 0.9, 0.75), moss * 0.35 * near);
            diffuseColor.rgb = mix(c, c * (1.0 - shade - joint), near);
          } else {
            // flat roofs: gravel, and solar panels on every other one
            vec3 c = diffuseColor.rgb * (0.95 + 0.1 * rh(floor(vW.xz * 2.5)) * near);
            vec2 q = vW.xz / vec2(1.15, 1.8);
            vec2 f = fract(q);
            float panelZone = step(0.45, fract(vRoof.x * 3.7)) * step(0.35, rh(floor(vW.xz / 7.0) + vRoof.x));
            float panel = panelZone * step(0.06, f.x) * step(f.x, 0.94) * step(0.06, f.y) * step(f.y, 0.94);
            vec3 pv = mix(vec3(0.12, 0.17, 0.3), vec3(0.24, 0.3, 0.46), f.y);
            pv = mix(pv, vec3(0.5, 0.56, 0.66), (1.0 - smoothstep(0.0, 0.04, abs(f.x - 0.5))) * 0.4);
            diffuseColor.rgb = mix(c, pv, panel * near);
          }
        }`,
      );
  };
  m.customProgramCacheKey = () => 'roof-tiles';
  return m;
}

/**
 * Builds wall and roof meshes from the triangle list and fills the roof map.
 * styleAt picks a building's look from its centre and swisstopo type (landmarks in stone, arcades).
 */
export function buildings3dMesh(data: Buildings3d, roofs: RoofMap, styleAt: (x: number, z: number, type: string) => BuildingStyle = () => 0) {
  const rand = random(3);
  const q = data.unit;
  const n = data.triangles;
  const P = data.positions;

  // per building: style, colours, seed, lowest point
  const count = data.buildings.length;
  const base = new Float32Array(count).fill(Infinity);
  for (let t = 0; t < n; t++) {
    const b = data.owners[t];
    for (let k = 0; k < 3; k++) base[b] = Math.min(base[b], P[t * 9 + k * 3 + 1] * q);
  }
  // centre and top point of each building
  const sum = new Float32Array(count * 3);
  const top = new Float32Array(count * 3).fill(-Infinity);
  const roofTris = new Uint16Array(count);
  for (let t = 0; t < n; t++) {
    const b = data.owners[t];
    for (let k = 0; k < 3; k++) {
      const o = t * 9 + k * 3;
      sum[b * 3] += P[o] * q;
      sum[b * 3 + 1] += 1;
      sum[b * 3 + 2] += P[o + 2] * q;
      if (P[o + 1] * q > top[b * 3 + 1]) top.set([P[o] * q, P[o + 1] * q, P[o + 2] * q], b * 3);
    }
  }
  const look = data.buildings.map((type, b) => styleAt(sum[b * 3] / (sum[b * 3 + 1] || 1), sum[b * 3 + 2] / (sum[b * 3 + 1] || 1), data.types[type]));
  const styles = data.buildings.map((type, b) => {
    const st = styleFor(data.types[type], rand);
    const stone = STONE[look[b]];
    return {
      look: look[b],
      wall: new THREE.Color(stone ?? st.wall),
      tile: new THREE.Color(TILE_ROOFS[Math.floor(rand() * TILE_ROOFS.length)]),
      flat: new THREE.Color(st.modern ? '#7c8288' : FLAT_ROOFS[Math.floor(rand() * FLAT_ROOFS.length)]),
      // negative seed: no windows (churches, walls, towers, canopies)
      seed: (st.windows ? 1 : -1) * (rand() * 100 + 1) + (st.modern ? 0.07 : 0),
      modern: st.modern,
    };
  });

  const wallPos: number[] = [];
  const wallCol: number[] = [];
  const wallAttr: number[] = [];
  const wallSeed: number[] = [];
  const wallStyle: number[] = [];
  const roofPos: number[] = [];
  const roofCol: number[] = [];
  const roofAttr: number[] = [];
  const pinnacles: THREE.Matrix4[] = [];
  const pinnacleKeys = new Set<string>();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const u = new THREE.Vector3(), v = new THREE.Vector3(), nrm = new THREE.Vector3();

  for (let t = 0; t < n; t++) {
    const o = t * 9;
    a.set(P[o] * q, P[o + 1] * q, P[o + 2] * q);
    b.set(P[o + 3] * q, P[o + 4] * q, P[o + 5] * q);
    c.set(P[o + 6] * q, P[o + 7] * q, P[o + 8] * q);
    nrm.crossVectors(u.subVectors(b, a), v.subVectors(c, a)).normalize();
    const owner = data.owners[t];
    const st = styles[owner];

    if (nrm.y > 0.25) {
      // roof: tiles on pitched faces, gravel or green on flat ones
      const col = nrm.y > 0.93 ? st.flat : st.tile;
      if (nrm.y <= 0.93) roofTris[owner]++;
      for (const p of [a, b, c]) {
        roofPos.push(p.x, p.y, p.z);
        roofCol.push(col.r, col.g, col.b);
        roofAttr.push(Math.abs(st.seed) / 101, st.look);
      }
      roofs.addTriangle(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    } else {
      // wall: window grid runs along the wall's horizontal direction
      const len = Math.hypot(nrm.x, nrm.z) || 1;
      const tx = -nrm.z / len, tz = nrm.x / len;
      const top = Math.max(a.y, b.y, c.y);
      for (const p of [a, b, c]) {
        wallPos.push(p.x, p.y, p.z);
        wallCol.push(st.wall.r, st.wall.g, st.wall.b);
        wallAttr.push(p.x * tx + p.z * tz + 4000, p.y - base[owner], 99, top - p.y);
        wallSeed.push(st.seed);
        // style and height above the ground right there (arcades follow the street, not the back slope)
        wallStyle.push(st.look, p.y - terrainAt(p.x, p.z));
      }
      if (nrm.y > 0.02) roofs.addTriangle(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      // Gothic churches: pinnacles along the top edges of the walls (eaves, tower galleries)
      if (st.look === 1 && Math.abs(nrm.y) < 0.2) {
        const vs = [a, b, c].sort((p1, p2) => p2.y - p1.y);
        const [p1, p2] = vs;
        const len = Math.hypot(p2.x - p1.x, p2.z - p1.z);
        if (Math.abs(p1.y - p2.y) < 0.3 && len > 1.5) {
          const steps = Math.max(1, Math.round(len / 6.5));
          for (let k = 0; k <= steps; k++) {
            const f = k / steps;
            const x = p1.x + (p2.x - p1.x) * f, z = p1.z + (p2.z - p1.z) * f, y = p1.y + (p2.y - p1.y) * f;
            const key = `${Math.round(x / 2)},${Math.round(y / 2)},${Math.round(z / 2)}`;
            if (!pinnacleKeys.has(key)) {
              pinnacleKeys.add(key);
              pinnacles.push(new THREE.Matrix4().makeTranslation(x, y, z));
            }
          }
        }
      }
    }
  }

  const wallGeo = new THREE.BufferGeometry();
  wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(wallPos, 3));
  wallGeo.setAttribute('color', new THREE.Float32BufferAttribute(wallCol, 3));
  wallGeo.setAttribute('aWall', new THREE.Float32BufferAttribute(wallAttr, 4));
  wallGeo.setAttribute('aSeed', new THREE.Float32BufferAttribute(wallSeed, 1));
  wallGeo.setAttribute('aStyle', new THREE.Float32BufferAttribute(wallStyle, 2));
  wallGeo.computeVertexNormals();
  const walls = new THREE.Mesh(wallGeo, wallMaterial());
  walls.material.side = THREE.DoubleSide;
  addHull(walls, 0.12);

  const roofGeo = new THREE.BufferGeometry();
  roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(roofPos, 3));
  roofGeo.setAttribute('color', new THREE.Float32BufferAttribute(roofCol, 3));
  roofGeo.setAttribute('aRoof', new THREE.Float32BufferAttribute(roofAttr, 2));
  roofGeo.computeVertexNormals();
  const roofMesh = new THREE.Mesh(roofGeo, roofMaterial());

  // chimneys on most pitched-roof houses, just below the ridge
  const chimneys: THREE.Matrix4[] = [];
  const crand = random(11);
  for (let b = 0; b < count; b++) {
    if (roofTris[b] < 4 || styles[b].modern || styles[b].look === 1 || styles[b].look === 2 || styles[b].seed < 0 || crand() > 0.6) continue;
    const cx = sum[b * 3] / sum[b * 3 + 1], cz = sum[b * 3 + 2] / sum[b * 3 + 1];
    const [tx, ty, tz] = [top[b * 3], top[b * 3 + 1], top[b * 3 + 2]];
    const d = Math.hypot(cx - tx, cz - tz) || 1;
    const k = Math.min(1, 2 / d) * (0.3 + crand() * 0.4);
    const x = tx + (cx - tx) * k, z = tz + (cz - tz) * k;
    const y = roofs.top(x, z);
    if (!(y > ty - 4)) continue;
    chimneys.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + 0.45, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), crand() * 3), new THREE.Vector3(1, 0.9 + crand() * 0.6, 1)));
  }
  const chimneyGeo = mergeGeometries([new THREE.BoxGeometry(0.6, 1.5, 0.6), new THREE.BoxGeometry(0.78, 0.12, 0.78).translate(0, 0.78, 0)]);
  const chimneyMesh = new THREE.InstancedMesh(chimneyGeo, toon('#9a6a55'), chimneys.length);
  chimneys.forEach((mx, i) => chimneyMesh.setMatrixAt(i, mx));

  // pinnacle: a slim shaft with a gable band and a pointed cap with a finial
  const pinGeo = mergeGeometries([
    new THREE.BoxGeometry(0.55, 1.6, 0.55).translate(0, 0.8, 0),
    new THREE.BoxGeometry(0.75, 0.18, 0.75).translate(0, 1.6, 0),
    new THREE.ConeGeometry(0.42, 2.6, 4).rotateY(Math.PI / 4).translate(0, 3.0, 0),
    new THREE.SphereGeometry(0.16, 6, 4).translate(0, 4.35, 0),
  ]);
  const pinMesh = new THREE.InstancedMesh(pinGeo, toon('#c4b98f'), pinnacles.length);
  pinnacles.forEach((mx, i) => pinMesh.setMatrixAt(i, mx));
  addHull(pinMesh, 0.05);

  // walls of the roof map: every wall triangle's footprint is thin, so also stamp walls as solid
  const group = new THREE.Group();
  group.add(walls, roofMesh, chimneyMesh, pinMesh);
  return group;
}
