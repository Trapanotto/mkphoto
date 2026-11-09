import * as THREE from 'three';
import { terrainAt, WATER_EPS } from './terrain';

/**
 * Cel-shaded water: saturated blue that turns turquoise near the shore, hard white foam
 * bands that pulse along shores and around the bridge, and drawn wave lines drifting with the wind.
 */
export interface Water {
  mesh: THREE.Mesh;
  /** Deep water colour, set by the time of day. */
  color: THREE.Color;
  update(time: number, wind: THREE.Vector3, daylight: number): void;
}

const RES = 2.5;

/** Distance from every water cell to the nearest shore or structure, in metres (0..60). */
function shoreDistance(half: number, solids: ((x: number, z: number) => boolean)[]) {
  const n = Math.round((half * 2) / RES) + 1;
  const big = 1e6;
  const d = new Float32Array(n * n);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const x = -half + i * RES;
      const z = -half + j * RES;
      const land = terrainAt(x, z) > WATER_EPS || solids.some((f) => f(x, z));
      d[j * n + i] = land ? 0 : big;
    }
  // two-pass chamfer distance transform
  const a = RES, b = RES * Math.SQRT2;
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      let v = d[k];
      if (i > 0) v = Math.min(v, d[k - 1] + a);
      if (j > 0) {
        v = Math.min(v, d[k - n] + a);
        if (i > 0) v = Math.min(v, d[k - n - 1] + b);
        if (i < n - 1) v = Math.min(v, d[k - n + 1] + b);
      }
      d[k] = v;
    }
  for (let j = n - 1; j >= 0; j--)
    for (let i = n - 1; i >= 0; i--) {
      const k = j * n + i;
      let v = d[k];
      if (i < n - 1) v = Math.min(v, d[k + 1] + a);
      if (j < n - 1) {
        v = Math.min(v, d[k + n] + a);
        if (i < n - 1) v = Math.min(v, d[k + n + 1] + b);
        if (i > 0) v = Math.min(v, d[k + n - 1] + b);
      }
      d[k] = v;
    }
  const bytes = new Uint8Array(n * n);
  for (let k = 0; k < n * n; k++) bytes[k] = Math.min(255, Math.round((d[k] / 60) * 255));
  const tex = new THREE.DataTexture(bytes, n, n, THREE.RedFormat);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

export function createWater(size: number, coreHalf: number, solids: ((x: number, z: number) => boolean)[]): Water {
  const deep = new THREE.Color('#2a7fd4');
  const shallow = new THREE.Color();
  const foam = new THREE.Color();
  const turquoise = new THREE.Color('#5fd6d8');
  const white = new THREE.Color('#ffffff');
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uWind: { value: new THREE.Vector2(1, 0) },
      uDist: { value: null },
      uHalf: { value: coreHalf },
      uDeep: { value: deep },
      uShallow: { value: shallow },
      uFoam: { value: foam },
    },
  ]);
  uniforms.uDist.value = shoreDistance(coreHalf, solids);
  // keep our colour objects (merge clones them)
  uniforms.uDeep.value = deep;
  uniforms.uShallow.value = shallow;
  uniforms.uFoam.value = foam;

  const material = new THREE.ShaderMaterial({
    uniforms,
    fog: true,
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec2 vWorld;
      varying float vViewDist;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xz;
        vec4 mvPosition = viewMatrix * world;
        vViewDist = -mvPosition.z;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform float uTime;
      uniform vec2 uWind;
      uniform sampler2D uDist;
      uniform float uHalf;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uFoam;
      varying vec2 vWorld;
      varying float vViewDist;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 3; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
        return v;
      }
      // hard-edged line where x crosses the middle of each band
      float line(float x, float width) {
        float d = abs(fract(x) - 0.5);
        float w = fwidth(x);
        return 1.0 - smoothstep(width, width + w * 1.5, d);
      }

      void main() {
        vec2 uv = (vWorld + uHalf) / (2.0 * uHalf);
        bool inside = all(greaterThan(uv, vec2(0.0))) && all(lessThan(uv, vec2(1.0)));
        float dist = inside ? texture2D(uDist, uv).r * 60.0 : 60.0;
        float fade = 1.0 - smoothstep(250.0, 700.0, vViewDist);

        // colour: turquoise shallows, saturated blue further out, in two hard steps
        vec3 col = mix(uShallow, uDeep, step(6.0, dist) * 0.55 + step(16.0, dist) * 0.45);

        // light blotches drifting with the wind
        vec2 drift = uWind * uTime * 0.02;
        float blot = fbm(vWorld * 0.012 + drift);
        col = mix(col, mix(col, uShallow, 0.45), step(0.62, blot));

        // drawn wave lines: contours of slow noise, broken into short strokes
        float n = fbm(vWorld * 0.03 + drift * 1.5 + vec2(0.0, uTime * 0.01));
        float strokes = line(n * 7.0, 0.035) * step(0.55, fbm(vWorld * 0.05 - drift));
        col = mix(col, uFoam, strokes * fade * 0.9);

        // shore foam: a solid rim that breathes, and a second ring rolling out
        float rim = 1.0 - step(1.6 + 0.7 * sin(uTime * 1.3 + vWorld.x * 0.05), dist);
        float ringPos = 2.5 + fract(uTime * 0.18) * 7.0;
        float ring = (1.0 - smoothstep(0.35, 0.55, abs(dist - ringPos))) * (1.0 - fract(uTime * 0.18));
        // the ring breaks up a little so it doesn't look like a stamp
        ring *= step(0.35, noise(vWorld * 0.25 + uTime * 0.2));
        col = mix(col, uFoam, max(rim, ring * 0.9) * step(0.01, 60.0 - dist + 0.001));

        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
  mesh.rotation.x = -Math.PI / 2;

  return {
    mesh,
    color: deep,
    update(time, wind, daylight) {
      uniforms.uTime.value = time;
      const w = Math.hypot(wind.x, wind.z) || 1;
      (uniforms.uWind.value as THREE.Vector2).set(wind.x / w, wind.z / w);
      shallow.copy(deep).lerp(turquoise, 0.35 + 0.2 * daylight);
      foam.copy(deep).lerp(white, 0.55 + 0.4 * daylight);
    },
  };
}
