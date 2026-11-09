import * as THREE from 'three';
import { isWater, terrainAt } from './terrain';

export interface RiverData {
  name: string | null;
  type: number;
  pts: [number, number][];
}

/** Typical width of the bigger rivers; streams are narrow. */
const WIDTHS: Record<string, number> = { Aare: 55, Rhein: 80, Reuss: 40, Rhone: 60, Limmat: 35, Landwasser: 14 };
function riverWidth(name: string | null) {
  if (!name) return 3;
  // bilingual names in the data, e.g. "Aare | L'Aar"
  const main = name.split('|')[0].trim();
  return WIDTHS[main] ?? 10;
}

/** True on the wide rivers (Aare, Reuss…): roads crossing them get a bridge deck. */
export function riverMask(rivers: RiverData[]) {
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
    for (const [ax, az, bx, bz, r] of cells.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) ?? []) {
      const dx = bx - ax, dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      if (Math.hypot(x - ax - dx * t, z - az - dz * t) < r) return true;
    }
    return false;
  };
}

/**
 * Rivers and streams from the swissTLM3D water network as ribbons on the terrain:
 * saturated blue with white streaks drifting downstream. Named rivers are wide, brooks narrow.
 */
export function createRivers(scene: THREE.Scene, rivers: RiverData[]) {
  const pos: number[] = [];
  const uv: number[] = [];
  for (const r of rivers) {
    const width = riverWidth(r.name);
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
      if (isWater(ax, az) && isWater(bx, bz)) continue; // lakes have their own water
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const nx = (-(bz - az) / len) * (width / 2);
      const nz = ((bx - ax) / len) * (width / 2);
      const ya = terrainAt(ax, az) + 0.35;
      const yb = terrainAt(bx, bz) + 0.35;
      const u0 = along, u1 = along + len;
      pos.push(ax - nx, ya, az - nz, ax + nx, ya, az + nz, bx + nx, yb, bz + nz, ax - nx, ya, az - nz, bx + nx, yb, bz + nz, bx - nx, yb, bz - nz);
      uv.push(u0, -1, u0, 1, u1, 1, u0, -1, u1, 1, u1, -1);
      along = u1;
    }
  }
  if (!pos.length) return () => {};
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]);
  const material = new THREE.ShaderMaterial({
    uniforms,
    fog: true,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform float uTime;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        float across = abs(vUv.y);
        vec3 deep = vec3(0.16, 0.5, 0.82);
        vec3 shallow = vec3(0.38, 0.8, 0.85);
        vec3 col = mix(deep, shallow, smoothstep(0.45, 0.9, across));
        // white streaks: short dashes in lanes, drifting downstream
        float lane = floor((vUv.y + 1.0) * 3.0);
        float u = vUv.x * 0.25 - uTime * 0.8 + hash(vec2(lane, 1.0)) * 10.0;
        float dash = step(0.75, fract(u)) * step(0.4, hash(vec2(lane, floor(u))));
        float laneMid = 1.0 - smoothstep(0.08, 0.14, abs(fract((vUv.y + 1.0) * 3.0) - 0.5));
        col = mix(col, vec3(1.0), dash * laneMid * 0.85);
        // foamy banks
        col = mix(col, vec3(1.0), smoothstep(0.86, 0.95, across) * 0.9);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
  scene.add(new THREE.Mesh(geo, material));
  return (time: number) => {
    uniforms.uTime.value = time;
  };
}
