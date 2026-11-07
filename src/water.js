// Wasser-Shader (ersetzt den Fragment-Shader von three/addons Water.js):
// Fresnel nach Schlick, Spiegelung mit distanzabhängiger Unschärfe, mehrlagige Wellen mit Strömung,
// scharfe Sonnenglitzer, Farbe nach Uferabstand (Flachwasser türkis-grün, tief dunkel), weiche Uferkante.
import * as THREE from 'three';

export const WATER_FS = /* glsl */`
  uniform sampler2D mirrorSampler;
  uniform sampler2D normalSampler;
  uniform sampler2D maskMap;
  uniform float alpha, time, size, distortionScale;
  uniform vec3 sunColor, sunDirection, eye, waterColor, uShallow, uSkyH, uSkyZ;
  uniform vec4 maskRect;
  uniform vec2 uFlow;
  varying vec4 mirrorCoord;
  varying vec4 worldPosition;

  #include <common>
  #include <packing>
  #include <bsdfs>
  #include <fog_pars_fragment>
  #include <logdepthbuf_pars_fragment>
  #include <lights_pars_begin>
  #include <shadowmap_pars_fragment>
  #include <shadowmask_pars_fragment>

  vec2 nrm(vec2 uv) { return texture2D(normalSampler, uv).xy * 2.0 - 1.0; }

  void main() {
    #include <logdepthbuf_fragment>
    vec2 p = worldPosition.xz;
    vec2 muv = vec2((p.x - maskRect.x) * maskRect.z, 1.0 - (p.y - maskRect.y) * maskRect.w);
    vec2 m = texture2D(maskMap, muv).rg;
    if (m.r < 0.06) discard;
    vec3 toEye = eye - worldPosition.xyz;
    float dist = length(toEye);
    vec3 V = toEye / dist;

    // Wellen: vier Lagen in verschiedenen Massstäben und Richtungen, mit der Strömung verschoben
    vec2 f = uFlow * time;
    mat2 r1 = mat2(0.8, 0.6, -0.6, 0.8), r2 = mat2(0.28, -0.96, 0.96, 0.28);
    vec2 w = nrm((p - f) / 11.0 + time * vec2(0.004, 0.003)) * 0.45
           + nrm(r1 * (p - f * 0.9) / 4.3 - time * vec2(0.01, -0.006)) * 0.35
           + nrm(r2 * (p - f * 1.1) / 1.6 + time * vec2(-0.02, 0.015)) * 0.22 * (1.0 - smoothstep(25.0, 140.0, dist))
           + nrm((p - f * 0.6) / 47.0) * 0.3;
    float k = mix(0.26, 0.06, smoothstep(20.0, 2500.0, dist)) * size;
    vec3 N = normalize(vec3(w.x * k, 1.0, w.y * k));

    float cosT = clamp(dot(N, V), 0.0, 1.0);
    float F = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);

    // Spiegelung: verzerrt durch die Wellen, in der Ferne leicht weichgezeichnet
    #ifdef NO_MIRROR
      // ohne Spiegelbild (Handy): Himmel aus der Reflexionsrichtung
      vec3 rdir = reflect(-V, N);
      vec3 refl = mix(uSkyH, uSkyZ, pow(clamp(rdir.y, 0.0, 1.0), 0.5)) * 1.0;
    #else
      vec2 ruv = mirrorCoord.xy / mirrorCoord.w + N.xz * distortionScale * 0.05 / (1.0 + dist * 0.015);
    float bl = 0.0015 + 0.004 * smoothstep(50.0, 1500.0, dist);
    vec3 refl = texture2D(mirrorSampler, ruv).rgb * 0.4
              + (texture2D(mirrorSampler, ruv + vec2(bl, 0.0)).rgb + texture2D(mirrorSampler, ruv - vec2(bl, 0.0)).rgb
              + texture2D(mirrorSampler, ruv + vec2(0.0, bl)).rgb + texture2D(mirrorSampler, ruv - vec2(0.0, bl)).rgb) * 0.15;

    #endif
    // Wasserkörper: Flachwasser am Ufer heller und grüner, Tiefe dunkel; Licht von oben streut hinein
    float shore = m.g;
    vec3 body = mix(uShallow, waterColor, smoothstep(0.0, 0.55, shore));
    float sh = getShadowMask();
    float sunUp = max(sunDirection.y, 0.0);
    vec3 bodyLit = body * (0.45 + 1.1 * sunUp * mix(0.45, 1.0, sh));
    // Unterwasser-Streuung gegen die Sonne (Wellenkämme leuchten auf)
    float sss = pow(max(dot(-V, sunDirection) * 0.5 + 0.5, 0.0), 3.0) * max(w.x + w.y, 0.0) * 0.25;
    bodyLit += uShallow * sss;

    // Sonne: scharfes Glitzern + breiter Schein
    vec3 H = normalize(sunDirection + V);
    float nh = max(dot(N, H), 0.0);
    float spec = pow(nh, 900.0) * 60.0 + pow(nh, 90.0) * 0.8;
    vec3 col = mix(bodyLit, refl, F) + sunColor * spec * sh * (0.3 + F);

    // Uferlinie: schmaler, etwas hellerer Saum
    float edge = 1.0 - smoothstep(0.0, 0.035, shore);
    col = mix(col, col * 1.12 + uShallow * 0.25, edge * 0.6);

    gl_FragColor = vec4(col, alpha * smoothstep(0.06, 0.45, m.r));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

export function upgradeWater(w, { mask, rect, flow = [0, 0], shallow = 0x2a7564, mirror = true }) {
  const u = w.material.uniforms;
  u.maskMap = { value: mask };
  u.maskRect = { value: rect };
  u.uFlow = { value: new THREE.Vector2(flow[0], flow[1]) };
  u.uShallow = { value: new THREE.Color(shallow) };
  u.uSkyH = { value: new THREE.Color(0.75, 0.82, 0.9) };
  u.uSkyZ = { value: new THREE.Color(0.25, 0.42, 0.75) };
  if (!mirror) {
    w.material.defines = { ...(w.material.defines || {}), NO_MIRROR: '' };
    w.onBeforeRender = (r, s, cam) => { u.eye.value.setFromMatrixPosition(cam.matrixWorld); };   // kein zweiter Szenen-Durchlauf
  }
  w.material.fragmentShader = WATER_FS;
  w.material.transparent = true;
  w.material.needsUpdate = true;
}
