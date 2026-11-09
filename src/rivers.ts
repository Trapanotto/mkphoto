import * as THREE from 'three';
import { isWater, terrainAt, type Grid, type Structures } from './terrain';
import { LC, type Landcover } from './landcover';
import { sunDirection } from './world';

export interface RiverData {
  name: string | null;
  type: number;
  pts: [number, number][];
}

/** Typical width of the bigger rivers; streams are narrow. */
const WIDTHS: Record<string, number> = { Aare: 55, Rhein: 80, Reuss: 40, Rhone: 60, Limmat: 35, Landwasser: 14, Stadtbach: 1.2 };
function riverWidth(name: string | null) {
  if (!name) return 2.5;
  // bilingual names in the data, e.g. "Aare | L'Aar"
  const main = name.split('|')[0].trim();
  // other named waters are mostly brooks; the big rivers are drawn as areas from the land cover
  return WIDTHS[main] ?? 4;
}

/** True on the wide rivers (Aare, Reuss…): roads crossing them get a bridge deck. */
export function riverMask(rivers: RiverData[], lc: Landcover | null = null) {
  const CELL = 20;
  const cells = new Map<string, [number, number, number, number, number][]>();
  for (const r of rivers) {
    const w = riverWidth(r.name);
    if (w < 14) continue;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i];
      const [bx, bz] = r.pts[i + 1];
      const seg: [number, number, number, number, number] = [ax, az, bx, bz, w / 2];
      for (let x = Math.floor((Math.min(ax, bx) - w) / CELL); x <= Math.floor((Math.max(ax, bx) + w) / CELL); x++)
        for (let z = Math.floor((Math.min(az, bz) - w) / CELL); z <= Math.floor((Math.max(az, bz) + w) / CELL); z++) {
          const k = `${x},${z}`;
          (cells.get(k) ?? cells.set(k, []).get(k)!).push(seg);
        }
    }
  }
  return (x: number, z: number) => {
    if (lc && lc.classAt(x, z) === LC.river) return true;
    for (const [ax, az, bx, bz, r] of cells.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) ?? []) {
      const dx = bx - ax, dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      if (Math.hypot(x - ax - dx * t, z - az - dz * t) < r) return true;
    }
    return false;
  };
}

/** True inside the detailed land cover raster (where rivers are drawn as areas). */
function inCore(lc: Landcover, x: number, z: number) {
  const g = lc.grids[0];
  return x > g.x0 && z > g.z0 && x < g.x0 + g.count * g.res && z < g.z0 + g.count * g.res;
}

/** Nearest centre line point: running length along the river and signed distance across it. */
function flowField(rivers: RiverData[]) {
  const CELL = 40;
  const cells = new Map<string, number[][]>();
  for (const r of rivers) {
    let along = 0;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i];
      const [bx, bz] = r.pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const seg = [ax, az, bx, bz, along, len, r.name ? 1 : 0];
      for (let x = Math.floor((Math.min(ax, bx) - 60) / CELL); x <= Math.floor((Math.max(ax, bx) + 60) / CELL); x++)
        for (let z = Math.floor((Math.min(az, bz) - 60) / CELL); z <= Math.floor((Math.max(az, bz) + 60) / CELL); z++) {
          const k = `${x},${z}`;
          (cells.get(k) ?? cells.set(k, []).get(k)!).push(seg);
        }
      along += len;
    }
  }
  return (x: number, z: number): [number, number] => {
    let best = Infinity;
    let out: [number, number] = [x * 0.3 + z * 0.3, 0];
    for (const [ax, az, bx, bz, along, len, named] of cells.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) ?? []) {
      const dx = bx - ax, dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (len * len || 1)));
      const ex = x - ax - dx * t, ez = z - az - dz * t;
      // named rivers win over side streams nearby
      const d = Math.hypot(ex, ez) - named * 8;
      if (d < best) {
        best = d;
        out = [along + t * len, (dx * ez - dz * ex) / (len || 1)];
      }
    }
    return out;
  };
}

const VERTEX = /* glsl */ `
  #include <fog_pars_vertex>
  varying vec2 vUv;
  varying vec3 vW;
  void main() {
    vUv = uv;
    vW = (modelMatrix * vec4(position, 1.0)).xyz;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

/** area: the land cover raster decides where the water is; ribbon: the ribbon's own edges do. */
const FRAGMENT = (area: boolean) => /* glsl */ `
  #include <fog_pars_fragment>
  uniform float uTime;
  uniform float uDay;
  uniform vec3 uSun;
  uniform sampler2D uLc;
  uniform vec4 uBox;
  varying vec2 vUv;
  varying vec3 vW;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float river(vec2 p) {
    vec2 uv = (p - uBox.xy) / uBox.z;
    return abs(texture2D(uLc, uv).r * 255.0 - 18.0) < 0.5 ? 1.0 : 0.0;
  }
  void main() {
    vec3 deep = vec3(0.13, 0.47, 0.8);
    vec3 shallow = vec3(0.36, 0.78, 0.84);
    float bank;
    float lanePos;
    ${
      area
        ? `vec2 jp = vW.xz + (vec2(vnoise(vW.xz * 0.45), vnoise(vW.xz * 0.45 + 17.0)) - 0.5) * 2.2;
    if (river(jp) < 0.5) discard;
    // distance to the bank from a few samples around: foam and lighter water along the shore
    float near = 0.0;
    for (int k = 0; k < 8; k++) {
      float a = float(k) * 0.785;
      near += 1.0 - river(jp + vec2(cos(a), sin(a)) * 2.2);
      near += (1.0 - river(jp + vec2(cos(a), sin(a)) * 5.5)) * 0.5;
    }
    bank = clamp(near / 6.0, 0.0, 1.0);
    lanePos = vUv.y / 5.0 + vnoise(vW.xz * 0.02) * 1.8;`
        : `bank = smoothstep(0.45, 1.0, abs(vUv.y));
    lanePos = (vUv.y + 1.0) * 1.5;`
    }
    // colour in steps: light over the shallows at the bank, deep blue in the channel
    float wob = (vnoise(vW.xz * 0.12) - 0.5) * 0.2;
    vec3 col = mix(deep, shallow, step(0.18, bank + wob) * 0.45 + step(0.42, bank + wob) * 0.55);
    // long bands sliding downstream: darker runs and lighter slicks
    float band = vnoise(vec2(vUv.x * 0.035 - uTime * 0.22, lanePos * 0.9));
    col = mix(col, deep * 0.82, step(0.62, band) * 0.5 * (1.0 - bank));
    col = mix(col, shallow, step(band, 0.3) * 0.28);
    // the trees and banks mirrored darkly along the shore
    float mirror = smoothstep(0.12, 0.3, bank) * (1.0 - smoothstep(0.3, 0.55, bank));
    col = mix(col, vec3(0.08, 0.3, 0.3), mirror * step(0.45, vnoise(vec2(vUv.x * 0.25, vUv.y * 0.6 + uTime * 0.3))) * 0.45);
    // flow lines: thin tapering streaks in wandering lanes
    float lane = floor(lanePos);
    float u = vUv.x * 0.07 - uTime * 0.32 + hash(vec2(lane, 1.0)) * 10.0;
    float fu = fract(u);
    float len = 0.35 + 0.4 * hash(vec2(lane, floor(u) + 3.0));
    float taper = smoothstep(0.0, 0.25, fu / len) * (1.0 - smoothstep(0.6, 1.0, fu / len));
    float streak = step(fu, len) * step(0.5, hash(vec2(lane, floor(u)))) * taper;
    float laneMid = 1.0 - smoothstep(0.0, 0.07 * taper + 0.01, abs(fract(lanePos) - 0.5));
    float fade = 1.0 - smoothstep(250.0, 600.0, length(vW - cameraPosition));
    col = mix(col, vec3(1.0), streak * laneMid * 0.8 * fade);
    // sky sheen towards the horizon and glitter towards the sun
    vec3 V = normalize(cameraPosition - vW);
    float graze = 1.0 - V.y;
    col = mix(col, vec3(0.72, 0.87, 0.96), step(0.9, graze + wob * 0.3) * 0.22 + step(0.97, graze) * 0.2);
    float spec = max(dot(reflect(-V, vec3(0.0, 1.0, 0.0)), uSun), 0.0);
    float glitter = smoothstep(0.9, 0.99, spec) * step(0.72, vnoise(vW.xz * 1.6 + vec2(uTime * 1.4, -uTime)));
    col = mix(col, vec3(1.0), glitter * 0.9);
    // foamy banks with a broken, breathing edge
    float foam = smoothstep(0.55, 0.8, bank + (vnoise(vW.xz * 0.7 + vec2(uTime * 0.6, 0.0)) - 0.5) * 0.3 + 0.05 * sin(uTime * 1.4 + vUv.x * 0.2));
    col = mix(col, vec3(1.0), foam * 0.9);
    // dusk and night
    col *= mix(vec3(0.16, 0.2, 0.36), vec3(1.0), uDay);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

function riverMaterial(area: boolean, time: { value: number }, day: { value: number }, lc: Landcover | null) {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
  uniforms.uTime = time;
  uniforms.uDay = day;
  uniforms.uSun = { value: sunDirection };
  const g = lc?.grids[0];
  uniforms.uLc = { value: g?.texture ?? null };
  uniforms.uBox = { value: g ? new THREE.Vector4(g.x0, g.z0, g.count * g.res, g.res) : new THREE.Vector4() };
  return new THREE.ShaderMaterial({
    uniforms,
    fog: true,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT(area),
  });
}

/** Water areas of the rivers in the detailed grid, shaped by the land cover raster. */
function riverAreas(core: Grid, lc: Landcover, flow: (x: number, z: number) => [number, number]) {
  const n = core.count;
  const step = core.step;
  const half = core.size / 2;
  const vx = (i: number) => core.center.x - half + i * step;
  const vz = (j: number) => core.center.z - half + j * step;
  const isRiver = (x: number, z: number) => lc.classAt(x, z) === LC.river && !isWater(x, z);
  const used = new Uint8Array((n - 1) * (n - 1));
  let any = false;
  for (let j = 0; j < n - 1; j++)
    for (let i = 0; i < n - 1; i++) {
      // any river within the cell (or just around it, for the foam)
      let hit = false;
      for (let a = -0.25; a <= 1.25 && !hit; a += 0.5) for (let b = -0.25; b <= 1.25 && !hit; b += 0.5) hit = isRiver(vx(i + a), vz(j + b));
      if (hit) (used[j * (n - 1) + i] = 1), (any = true);
    }
  if (!any) return null;
  const index = new Int32Array(n * n).fill(-1);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const vertex = (i: number, j: number) => {
    const k = j * n + i;
    if (index[k] >= 0) return index[k];
    // water level: the lowest ground around, so the surface stays flat up to the bank
    let h = Infinity;
    for (let b = -1; b <= 1; b++)
      for (let a = -1; a <= 1; a++) {
        const ii = Math.min(n - 1, Math.max(0, i + a)), jj = Math.min(n - 1, Math.max(0, j + b));
        h = Math.min(h, core.heights[jj * n + ii]);
      }
    const x = vx(i), z = vz(j);
    const [along, across] = flow(x, z);
    index[k] = pos.length / 3;
    pos.push(x, h + 0.12, z);
    uv.push(along, across);
    return index[k];
  };
  for (let j = 0; j < n - 1; j++)
    for (let i = 0; i < n - 1; i++) {
      if (!used[j * (n - 1) + i]) continue;
      const a = vertex(i, j), b = vertex(i + 1, j), c = vertex(i + 1, j + 1), d = vertex(i, j + 1);
      idx.push(a, d, c, a, c, b);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}

/**
 * Rivers and streams from the swissTLM3D water network: in the detailed area the rivers are
 * real water areas from the land cover; streams and the rivers further out are ribbons on the terrain.
 */
export function createRivers(scene: THREE.Scene, rivers: RiverData[], core: Grid, lc: Landcover | null, open: Structures['waterways'] | null = null) {
  // the base map has only the brooks that flow in the open, with their real width
  const lines: { pts: [number, number][]; width: number }[] = open
    ? open.map((w) => ({ pts: w.pts, width: Math.max(1.2, w.width * (w.cls === 'river' ? 1.5 : 1.1)) }))
    : rivers.map((r) => ({ pts: r.pts, width: riverWidth(r.name) }));
  const time = { value: 0 };
  const day = { value: 1 };
  const pos: number[] = [];
  const uv: number[] = [];
  const area = (x: number, z: number) => !!lc && inCore(lc, x, z) && lc.classAt(x, z) === LC.river;
  for (const r of lines) {
    const width = r.width;
    // densify, then follow the terrain a little above it
    const pts: [number, number][] = [r.pts[0]];
    for (let i = 1; i < r.pts.length; i++) {
      const [ax, az] = r.pts[i - 1];
      const [bx, bz] = r.pts[i];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 4));
      for (let k = 1; k <= n; k++) pts.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
    }
    let along = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const u0 = along, u1 = along + len;
      along = u1;
      if (isWater(ax, az) && isWater(bx, bz)) continue; // lakes have their own water
      if (area(ax, az) || area(bx, bz)) continue; // drawn as an area
      const nx = (-(bz - az) / len) * (width / 2);
      const nz = ((bx - ax) / len) * (width / 2);
      const ya = terrainAt(ax, az) + 0.35;
      const yb = terrainAt(bx, bz) + 0.35;
      pos.push(ax - nx, ya, az - nz, ax + nx, ya, az + nz, bx + nx, yb, bz + nz, ax - nx, ya, az - nz, bx + nx, yb, bz + nz, bx - nx, yb, bz - nz);
      uv.push(u0, -1, u0, 1, u1, 1, u0, -1, u1, 1, u1, -1);
    }
  }
  if (pos.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    scene.add(new THREE.Mesh(geo, riverMaterial(false, time, day, lc)));
  }
  if (lc) {
    const geo = riverAreas(core, lc, flowField(rivers));
    if (geo) scene.add(new THREE.Mesh(geo, riverMaterial(true, time, day, lc)));
  }
  return (t: number, daylight = 1) => {
    time.value = t;
    day.value = daylight;
  };
}
