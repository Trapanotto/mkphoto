import * as THREE from 'three';
import { wallMaterial } from './buildings';
import { addHull } from './outline';
import { toon } from './toon';

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

/** Builds wall and roof meshes from the triangle list and fills the roof map. */
export function buildings3dMesh(data: Buildings3d, roofs: RoofMap) {
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
  const styles = data.buildings.map((type) => {
    const st = styleFor(data.types[type], rand);
    return {
      wall: new THREE.Color(st.wall),
      tile: new THREE.Color(TILE_ROOFS[Math.floor(rand() * TILE_ROOFS.length)]),
      flat: new THREE.Color(st.modern ? '#7c8288' : FLAT_ROOFS[Math.floor(rand() * FLAT_ROOFS.length)]),
      // negative seed: no windows (churches, walls, towers, canopies)
      seed: (st.windows ? 1 : -1) * (rand() * 100 + 1) + (st.modern ? 0.07 : 0),
    };
  });

  const wallPos: number[] = [];
  const wallCol: number[] = [];
  const wallAttr: number[] = [];
  const wallSeed: number[] = [];
  const roofPos: number[] = [];
  const roofCol: number[] = [];
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
      for (const p of [a, b, c]) {
        roofPos.push(p.x, p.y, p.z);
        roofCol.push(col.r, col.g, col.b);
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
      }
      if (nrm.y > 0.02) roofs.addTriangle(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    }
  }

  const wallGeo = new THREE.BufferGeometry();
  wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(wallPos, 3));
  wallGeo.setAttribute('color', new THREE.Float32BufferAttribute(wallCol, 3));
  wallGeo.setAttribute('aWall', new THREE.Float32BufferAttribute(wallAttr, 4));
  wallGeo.setAttribute('aSeed', new THREE.Float32BufferAttribute(wallSeed, 1));
  wallGeo.computeVertexNormals();
  const walls = new THREE.Mesh(wallGeo, wallMaterial());
  walls.material.side = THREE.DoubleSide;
  addHull(walls, 0.12);

  const roofGeo = new THREE.BufferGeometry();
  roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(roofPos, 3));
  roofGeo.setAttribute('color', new THREE.Float32BufferAttribute(roofCol, 3));
  roofGeo.computeVertexNormals();
  const roofMat = toon('#ffffff');
  roofMat.vertexColors = true;
  roofMat.side = THREE.DoubleSide;
  const roofMesh = new THREE.Mesh(roofGeo, roofMat);

  // walls of the roof map: every wall triangle's footprint is thin, so also stamp walls as solid
  const group = new THREE.Group();
  group.add(walls, roofMesh);
  return group;
}
