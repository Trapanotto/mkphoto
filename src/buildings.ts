import * as THREE from 'three';
import { ObstacleIndex, Prism } from './obstacles';
import { addHull } from './outline';
import type { BuildingData } from './terrain';
import { toon } from './toon';

/** Rises 1.1 m per metre inwards: steep old-town roofs. */
const ROOF_SLOPE = 1.1;
const EAVES = 0.5;

/** Shared night factor for lit windows, 0 by day, 1 at night. */
export const windowNight = { value: 0 };

function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Pt = [number, number];

/** Offsets a ring inwards (positive d) or outwards (negative d) with mitred corners. */
function offsetRing(pts: Pt[], d: number): Pt[] {
  const n = pts.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const [px, pz] = pts[(i - 1 + n) % n];
    const [cx, cz] = pts[i];
    const [nx, nz] = pts[(i + 1) % n];
    // inward normal of each edge for this winding is (ez, -ex)
    let ax = cx - px, az = cz - pz;
    let al = Math.hypot(ax, az) || 1;
    ax /= al; az /= al;
    let bx = nx - cx, bz = nz - cz;
    let bl = Math.hypot(bx, bz) || 1;
    bx /= bl; bz /= bl;
    const n1x = az, n1z = -ax;
    const n2x = bz, n2z = -bx;
    const mx = n1x + n2x;
    const mz = n1z + n2z;
    const k = Math.max(0.35, 1 + n1x * n2x + n1z * n2z);
    // miter length capped so sharp corners don't shoot out
    out.push([cx + (mx / k) * d, cz + (mz / k) * d]);
    void al; void bl;
  }
  return out;
}

const area = (pts: Pt[]) => {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] - pts[i][0]) * (pts[j][1] + pts[i][1]);
  return a / 2;
};

/** An inset ring is usable if it keeps its winding, every edge keeps its direction and it doesn't collapse. */
function validInset(outer: Pt[], inner: Pt[]) {
  const ao = area(outer);
  const ai = area(inner);
  if (Math.sign(ao) !== Math.sign(ai) || Math.abs(ai) < Math.abs(ao) * 0.05) return false;
  for (let i = 0; i < outer.length; i++) {
    const j = (i + 1) % outer.length;
    const dx = outer[j][0] - outer[i][0], dz = outer[j][1] - outer[i][1];
    const ix = inner[j][0] - inner[i][0], iz = inner[j][1] - inner[i][1];
    if (dx * ix + dz * iz <= 0) return false;
  }
  return true;
}

const WALLS = ['#f2e6d0', '#e8d2b0', '#fbf6ee', '#f0d9c4', '#e6c9a8', '#d9d2c4', '#f3dcc2', '#e9e1cf', '#dcc7a5'];
const ROOFS = ['#9a4a32', '#8a3a2a', '#a65a3a', '#7a4030', '#8f4b34', '#6e3a2c'];
const MODERN_WALL = '#cfd6dc';
const MODERN_ROOF = '#7c8288';

/** Windows drawn in the wall shader: frames, shutters, shop fronts, and some lit at night. */
export function wallMaterial() {
  const m = toon('#ffffff');
  m.vertexColors = true;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = windowNight;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec4 aWall;\nattribute float aSeed;\nvarying vec4 vWall;\nvarying float vSeed;',
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWall = aWall;\nvSeed = aSeed;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform float uNight;
        varying vec4 vWall;
        varying float vSeed;
        float hash3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        float box(vec2 p, vec2 a, vec2 b, vec2 aa) {
          vec2 s = smoothstep(a - aa, a + aa, p) * (1.0 - smoothstep(b - aa, b + aa, p));
          return s.x * s.y;
        }`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        float u = vWall.x, h = vWall.y, rest = vWall.z, roof = vWall.w;
        float modern = step(0.5, fract(abs(vSeed) * 7.0)) * step(24.0, h + roof);
        float floorH = mix(3.1, 3.6, modern);
        float colW = mix(2.7, 3.0, modern);
        vec2 cell = vec2(u / colW, h / floorH);
        vec2 f = fract(cell);
        vec2 id = floor(cell);
        vec2 aa = fwidth(cell) * 1.2;
        bool ground = id.y < 1.0;
        // keep a margin to corners and to the roof
        float inWall = step(0.0, vSeed) * step(0.9, rest) * step(0.6, h) * step(1.2, roof);
        float win = ground
          ? box(f, vec2(0.1, 0.08), vec2(0.9, 0.7), aa)
          : modern > 0.5 ? box(f, vec2(0.08, 0.22), vec2(0.92, 0.86), aa) : box(f, vec2(0.3, 0.26), vec2(0.7, 0.8), aa);
        float frame = ground ? 0.0 : box(f, vec2(0.26, 0.22), vec2(0.74, 0.84), aa) - win;
        float shutter = (ground || modern > 0.5) ? 0.0 : box(f, vec2(0.14, 0.26), vec2(0.28, 0.8), aa) + box(f, vec2(0.72, 0.26), vec2(0.86, 0.8), aa);
        win *= inWall; frame *= inWall; shutter *= inWall;
        // fade the pattern out far away, where it would only flicker
        float far = smoothstep(180.0, 420.0, length(vViewPosition));
        win *= 1.0 - far; frame *= 1.0 - far; shutter *= 1.0 - far;
        float s = hash3(vec3(vSeed, 1.0, 2.0));
        vec3 shutterCol = s < 0.33 ? vec3(0.16, 0.36, 0.2) : s < 0.66 ? vec3(0.45, 0.14, 0.1) : vec3(0.35, 0.24, 0.14);
        vec3 glass = mix(vec3(0.12, 0.16, 0.22), vec3(0.32, 0.42, 0.52), smoothstep(0.0, 1.0, f.y));
        diffuseColor.rgb = mix(diffuseColor.rgb, shutterCol, shutter);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.93, 0.88), frame);
        diffuseColor.rgb = mix(diffuseColor.rgb, glass, win);
        float lit = step(hash3(vec3(id, vSeed)), ground ? 0.55 : 0.38) * win * uNight;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.72, 0.36) * lit * 1.4;',
      );
  };
  m.customProgramCacheKey = () => 'building-walls';
  return m;
}

export function buildingsMesh(data: BuildingData[], obstacles: ObstacleIndex) {
  const rand = random(7);
  const walls = { pos: [] as number[], col: [] as number[], wall: [] as number[], seed: [] as number[] };
  const roofs = { pos: [] as number[], col: [] as number[] };
  const chimneys: THREE.Matrix4[] = [];

  data.forEach((b, index) => {
    if (b.ring.length < 3) return;
    const bottom = b.base - 2;
    const top = b.base + b.height;
    const modern = b.height > 24;
    const wallCol = new THREE.Color(modern ? MODERN_WALL : WALLS[Math.floor(rand() * WALLS.length)]);
    const roofCol = new THREE.Color(modern ? MODERN_ROOF : ROOFS[Math.floor(rand() * ROOFS.length)]);
    const seed = rand() * 100 + (modern ? 0.07 : 0.0);

    // same winding as before: walls face outwards
    const pts: Pt[] = area(b.ring) > 0 ? b.ring : [...b.ring].reverse();

    // roof: hip roof from an inset ring; modern blocks stay flat
    let inner: Pt[] | null = null;
    let rise = 0;
    if (!modern) {
      for (const d of [4, 2.8, 1.8, 1.1]) {
        const cand = offsetRing(pts, d);
        if (validInset(pts, cand)) {
          inner = cand;
          rise = d * ROOF_SLOPE;
          break;
        }
      }
    }
    const roofTop = top + rise;

    for (let i = 0; i < pts.length; i++) {
      const [x1, z1] = pts[i];
      const [x2, z2] = pts[(i + 1) % pts.length];
      const len = Math.hypot(x2 - x1, z2 - z1);
      const quad: [number, number, number, number][] = [
        [x1, bottom, z1, 0],
        [x2, bottom, z2, len],
        [x2, top, z2, len],
        [x1, bottom, z1, 0],
        [x2, top, z2, len],
        [x1, top, z1, 0],
      ];
      for (const [x, y, z, u] of quad) {
        walls.pos.push(x, y, z);
        walls.col.push(wallCol.r, wallCol.g, wallCol.b);
        // u along the wall, height above street, metres to the wall's end, metres to the roof
        walls.wall.push(u, y - b.base, len - u, top - y);
        walls.seed.push(seed);
      }
    }

    const pushRoof = (x: number, y: number, z: number, shade = 1) => {
      roofs.pos.push(x, y, z);
      roofs.col.push(roofCol.r * shade, roofCol.g * shade, roofCol.b * shade);
    };
    const cap = (ring: Pt[], y: number, shade: number) => {
      const tris = THREE.ShapeUtils.triangulateShape(
        ring.map(([x, z]) => new THREE.Vector2(x, z)),
        [],
      );
      for (const tri of tris) {
        const [a, b2, c2] = tri.map((k) => ring[k]);
        const up = (b2[0] - a[0]) * (c2[1] - a[1]) - (b2[1] - a[1]) * (c2[0] - a[0]) < 0;
        for (const p of up ? [a, b2, c2] : [a, c2, b2]) pushRoof(p[0], y, p[1], shade);
      }
    };

    if (inner) {
      // eaves stick out a little beyond the walls
      const eave = offsetRing(pts, -EAVES);
      for (let i = 0; i < pts.length; i++) {
        const j = (i + 1) % pts.length;
        const o1 = eave[i], o2 = eave[j], i1 = inner[i], i2 = inner[j];
        const y0 = top - EAVES * ROOF_SLOPE * 0.5;
        for (const [p, y] of [
          [o1, y0], [o2, y0], [i2, roofTop],
          [o1, y0], [i2, roofTop], [i1, roofTop],
        ] as [Pt, number][]) pushRoof(p[0], y, p[1]);
      }
      cap(inner, roofTop, 0.92);
      // one or two chimneys on smaller houses
      if (Math.abs(area(pts)) < 900 && rand() < 0.7) {
        const k = Math.floor(rand() * inner.length);
        const [cx, cz] = inner[k];
        const m = new THREE.Matrix4().compose(
          new THREE.Vector3(cx, roofTop + 0.3, cz),
          new THREE.Quaternion(),
          new THREE.Vector3(0.7, 1.6 + rand(), 0.7),
        );
        chimneys.push(m);
      }
    } else {
      cap(pts, top, 1);
    }

    const prism = new Prism(b.ring, bottom, top);
    prism.roofRise = rise;
    prism.roofSlope = ROOF_SLOPE;
    obstacles.add(prism);
    void index;
  });

  const group = new THREE.Group();

  const wallGeo = new THREE.BufferGeometry();
  wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(walls.pos, 3));
  wallGeo.setAttribute('color', new THREE.Float32BufferAttribute(walls.col, 3));
  wallGeo.setAttribute('aWall', new THREE.Float32BufferAttribute(walls.wall, 4));
  wallGeo.setAttribute('aSeed', new THREE.Float32BufferAttribute(walls.seed, 1));
  wallGeo.computeVertexNormals();
  const wallMesh = new THREE.Mesh(wallGeo, wallMaterial());
  addHull(wallMesh, 0.15);

  const roofGeo = new THREE.BufferGeometry();
  roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(roofs.pos, 3));
  roofGeo.setAttribute('color', new THREE.Float32BufferAttribute(roofs.col, 3));
  roofGeo.computeVertexNormals();
  const roofMat = toon('#ffffff');
  roofMat.vertexColors = true;
  roofMat.side = THREE.DoubleSide;
  const roofMesh = new THREE.Mesh(roofGeo, roofMat);

  const chimneyMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), toon('#8a7a6a'), chimneys.length);
  chimneys.forEach((m, i) => chimneyMesh.setMatrixAt(i, m));

  group.add(wallMesh, roofMesh, chimneyMesh);
  return group;
}
