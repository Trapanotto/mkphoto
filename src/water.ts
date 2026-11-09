import * as THREE from 'three';
import { isWater, type Grid } from './terrain';
import { sunDirection } from './world';

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
function shoreDistance(half: number, cx: number, cz: number, solids: ((x: number, z: number) => boolean)[], wet: (x: number, z: number) => boolean = isWater) {
  const n = Math.round((half * 2) / RES) + 1;
  const big = 1e6;
  const d = new Float32Array(n * n);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const x = cx - half + i * RES;
      const z = cz - half + j * RES;
      const land = !wet(x, z) || solids.some((f) => f(x, z));
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

/**
 * size: edge of the water plane. core: the detailed grid the shore distances are computed on.
 * lakeOnly: draw water only over lake cells (a mountain lake high above a dry valley).
 */
/** lakeShape: the exact lake outline (from the land cover), used instead of the height grid's water cells. */
export function createWater(size: number, core: Grid, solids: ((x: number, z: number) => boolean)[], lakeOnly = false, lakeShape?: (x: number, z: number) => boolean): Water {
  const coreHalf = core.size / 2;
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
      uCenter: { value: new THREE.Vector2(core.center.x, core.center.z) },
      uLakeOnly: { value: lakeOnly ? 1 : 0 },
      uDay: { value: 1 },
      uDeep: { value: deep },
      uShallow: { value: shallow },
      uFoam: { value: foam },
    },
  ]);
  uniforms.uDist.value = shoreDistance(coreHalf, core.center.x, core.center.z, solids, lakeShape);
  // keep our colour objects (merge clones them)
  uniforms.uDeep.value = deep;
  uniforms.uShallow.value = shallow;
  uniforms.uFoam.value = foam;
  uniforms.uSun = { value: sunDirection };

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
      uniform vec2 uCenter;
      uniform float uLakeOnly;
      uniform float uDay;
      uniform vec3 uSun;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uFoam;
      varying vec2 vWorld;
      varying float vViewDist;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      vec2 hash2(vec2 p) {
        return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
      }
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

      // moving cells: distance to the nearest and second nearest point, the vector to the nearest, and its id
      struct Cell { float f1; float f2; vec2 r; vec2 id; };
      Cell cells(vec2 p, float t) {
        vec2 n = floor(p), f = fract(p);
        Cell c; c.f1 = 8.0; c.f2 = 8.0; c.r = vec2(0.0); c.id = vec2(0.0);
        for (int j = -1; j <= 1; j++)
        for (int i = -1; i <= 1; i++) {
          vec2 g = vec2(float(i), float(j));
          vec2 o = hash2(n + g);
          o = 0.5 + 0.38 * sin(t + 6.2831 * o);
          vec2 r = g + o - f;
          float d = length(r);
          if (d < c.f1) { c.f2 = c.f1; c.f1 = d; c.r = r; c.id = n + g; }
          else if (d < c.f2) { c.f2 = d; }
        }
        return c;
      }

      // white crescent crests: an arc of a ring around each cell point, on the side the wind blows to
      float crests(vec2 p, float t, vec2 wind, float thin) {
        Cell c = cells(p, t * 0.6);
        float pulse = 0.3 + 0.05 * sin(t * 1.7 + hash(c.id) * 6.28);
        float aa = fwidth(c.f1) * 1.2;
        float ring = smoothstep(pulse - thin - aa, pulse - thin, c.f1) * (1.0 - smoothstep(pulse, pulse + aa, c.f1));
        vec2 dir = -c.r / max(c.f1, 1e-3);
        float facing = smoothstep(0.35, 0.8, dot(dir, wind));
        float keep = step(0.35, hash(c.id + 3.1));
        return ring * facing * keep;
      }

      void main() {
        vec2 uv = (vWorld - uCenter + uHalf) / (2.0 * uHalf);
        bool inside = all(greaterThan(uv, vec2(0.0))) && all(lessThan(uv, vec2(1.0)));
        float dist = inside ? texture2D(uDist, uv).r * 60.0 : 60.0;
        // a mountain lake: no water outside the lake itself
        // the edge runs along the interpolated distance, so it is smooth instead of stepped
        if (uLakeOnly > 0.5 && (!inside || dist < 1.2)) discard;
        float fade = 1.0 - smoothstep(180.0, 650.0, vViewDist);
        vec2 drift = uWind * uTime * 0.6;

        // colour: turquoise shallows, saturated blue further out, in hard steps with a wobbly border
        float wob = (noise(vWorld * 0.08 + uTime * 0.05) - 0.5) * 3.0;
        vec3 col = mix(uShallow, uDeep, step(6.0 + wob, dist) * 0.55 + step(16.0 + wob, dist) * 0.45);

        // soft lighter patches drifting slowly
        float blot = fbm(vWorld * 0.01 + drift * 0.01);
        col = mix(col, mix(col, uShallow, 0.35), step(0.64, blot));

        // fine light network in the shallows (sunlight through ripples)
        Cell net = cells(vWorld * 0.22 + drift * 0.05, uTime * 0.5);
        float edge = 1.0 - smoothstep(0.03, 0.06 + fwidth(net.f2 - net.f1), net.f2 - net.f1);
        col = mix(col, mix(col, vec3(1.0), 0.16), edge * (1.0 - smoothstep(2.0, 9.0, dist)) * fade * step(0.45, noise(vWorld * 0.05)));

        // crescent crests: a big layer and a small one, both drifting with the wind
        float big = crests(vWorld * 0.075 - drift * 0.075, uTime, uWind, 0.06);
        float small = crests(vWorld * 0.19 - drift * 0.19 + 7.3, uTime * 1.3, uWind, 0.08) * 0.75;
        col = mix(col, uFoam, max(big, small) * fade);

        // twinkles: a few sparkles that flash on and off
        vec2 sp = floor(vWorld * 0.6);
        float tw = step(0.993, hash(sp)) * step(0.85, sin(uTime * 3.0 + hash(sp + 1.7) * 30.0));
        col = mix(col, vec3(1.0), tw * fade);

        // sky sheen towards the horizon, in two steps with a wandering edge
        vec3 V = normalize(cameraPosition - vec3(vWorld.x, 0.0, vWorld.y));
        float graze = 1.0 - V.y;
        float sheenWob = (noise(vWorld * 0.02 + drift * 0.02) - 0.5) * 0.06;
        col = mix(col, mix(uShallow, vec3(1.0), 0.35), step(0.9, graze + sheenWob) * 0.25 + step(0.965, graze + sheenWob) * 0.22);
        // the sun's path: flickering glitter where it mirrors on the water
        float spec = max(dot(reflect(-V, vec3(0.0, 1.0, 0.0)), uSun), 0.0);
        float glit = smoothstep(0.88, 0.99, spec) * step(0.7, noise(vWorld * 1.5 + vec2(uTime * 1.3, -uTime * 0.9)));
        col = mix(col, vec3(1.0), glit * 0.9 * uDay);
        // the shore mirrored as a darker band just off the bank
        float mirror = smoothstep(2.5, 5.0, dist) * (1.0 - smoothstep(9.0, 16.0, dist));
        col = mix(col, uDeep * 0.75, mirror * step(0.5, noise(vec2(vWorld.x * 0.3 + uTime * 0.2, vWorld.y * 0.08))) * 0.3 * step(dist, 59.0));

        // shore foam: a wobbly solid rim, and a broken second line rolling out and fading
        float rimW = 1.4 + 0.6 * sin(uTime * 1.3 + vWorld.x * 0.05 + vWorld.y * 0.04) + (noise(vWorld * 0.3) - 0.5) * 1.2;
        float rim = 1.0 - step(rimW, dist);
        float phase = fract(uTime * 0.16);
        float ringPos = 2.5 + phase * 7.0;
        float ring = (1.0 - smoothstep(0.3, 0.5, abs(dist - ringPos))) * (1.0 - phase);
        ring *= step(0.4, noise(vWorld * 0.35 + uTime * 0.2));
        col = mix(col, uFoam, max(rim, ring * 0.9) * step(dist, 59.0));

        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
  mesh.rotation.x = -Math.PI / 2;
  if (lakeOnly) mesh.position.set(core.center.x, 0, core.center.z);

  return {
    mesh,
    color: deep,
    update(time, wind, daylight) {
      uniforms.uTime.value = time;
      uniforms.uDay.value = daylight;
      const w = Math.hypot(wind.x, wind.z) || 1;
      (uniforms.uWind.value as THREE.Vector2).set(wind.x / w, wind.z / w);
      shallow.copy(deep).lerp(turquoise, 0.35 + 0.2 * daylight);
      foam.copy(deep).lerp(white, 0.55 + 0.4 * daylight);
    },
  };
}
