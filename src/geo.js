// Gebäude-Shader, Ausblend-Boxen und Hilfen für die vorberechnete Welt (keine Streaming-Abhängigkeiten).
import * as THREE from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

export const dracoLoader = new DRACOLoader().setDecoderPath(`${import.meta.env.BASE_URL}draco/`);

// ---------- Gebäude-Shader ----------
// Dächer: echte SWISSIMAGE-Farben (via Overlay), Fassaden: Putz + Fenster.
// In Ausblend-Boxen werden Gebäude verworfen – dort stehen die Blender-Modelle.
const MAX_HIDE = 8;
const hideA = Array.from({ length: MAX_HIDE }, () => new THREE.Vector4());
const hideB = Array.from({ length: MAX_HIDE }, () => new THREE.Vector4());

export function setHideBoxes(boxes) {
  for (let i = 0; i < MAX_HIDE; i++) {
    const b = boxes[i];
    if (b) {
      hideA[i].set(b.x, b.z, b.hx, b.hz);
      hideB[i].set(Math.cos(b.angle || 0), Math.sin(b.angle || 0), b.maxY ?? 1e6, 1);
    } else {
      hideA[i].set(0, 0, 0, 0);
      hideB[i].set(1, 0, 0, 0);
    }
  }
}

// Liegt ein Punkt in einer Ausblend-Box? (ausgeblendete Gebäude sollen nichts verdecken/blockieren)
export function isHiddenPoint(p) {
  for (let i = 0; i < MAX_HIDE; i++) {
    const A = hideA[i], B = hideB[i];
    if (B.w < 0.5) continue;
    const dx = p.x - A.x, dz = p.z - A.y;
    const lx = dx * B.x + dz * B.y, lz = -dx * B.y + dz * B.x;
    if (Math.abs(lx) < A.z + 0.5 && Math.abs(lz) < A.w + 0.5 && p.y < B.z + 0.5) return true;
  }
  return false;
}

// erster Treffer, der kein ausgeblendetes Gebäude ist
export function firstRealHit(hits) {
  for (const h of hits) {
    if (h.object.userData.isBuilding && isHiddenPoint(h.point)) continue;
    return h;
  }
  return null;
}

// Luftbild-Atlas für die Dächer im Kerngebiet (SWISSIMAGE, Web-Mercator-Kacheln)
const ortho = { tex: { value: null }, rect: { value: new THREE.Vector4() }, on: { value: 0 } };

// Atlas aus fertigem Canvas setzen (vorberechnete Welten); Koordinaten lokal (x Ost, z Süd)
export function setOrthoAtlas(canvas, west, east, north, south) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  ortho.tex.value?.dispose?.();
  ortho.tex.value = tex;
  ortho.rect.value.set(west, north, 1 / (east - west), 1 / (south - north));
  ortho.on.value = 1;
}

// Fototexturen für Fassaden/Dächer + Stil (0 = Putz, 1 = Sandstein wie in Bern)
const facadeTex = { plaster: { value: null }, roof: { value: null }, sand: { value: null }, style: { value: 0 } };
export function setFacadeTextures(t) {
  facadeTex.plaster.value = t.plaster; facadeTex.roof.value = t.roof; facadeTex.sand.value = t.sand;
}
export function setFacadeStyle(style) { facadeTex.style.value = style === 'sandstone' ? 1 : 0; }

const HIDE_GLSL = `
      for (int i = 0; i < ${MAX_HIDE}; i++) {
        if (uHideB[i].w < 0.5) continue;
        vec2 d = vWPos.xz - uHideA[i].xy;
        vec2 l = vec2(d.x * uHideB[i].x + d.y * uHideB[i].y, -d.x * uHideB[i].y + d.y * uHideB[i].x);
        if (abs(l.x) < uHideA[i].z && abs(l.y) < uHideA[i].w && vWPos.y < uHideB[i].z) discard;
      }`;

// nur Ausblenden (für Bäume)
export function patchHideShader(shader) {
  shader.uniforms.uHideA = { value: hideA };
  shader.uniforms.uHideB = { value: hideB };
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
    .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      #ifdef USE_INSTANCING
        vWPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
      #else
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
      #endif`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\nuniform vec4 uHideA[${MAX_HIDE}];\nuniform vec4 uHideB[${MAX_HIDE}];`)
    .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + HIDE_GLSL);
}

export function patchBuildingShader(shader) {
  shader.uniforms.uHideA = { value: hideA };
  shader.uniforms.uHideB = { value: hideB };
  shader.uniforms.uOrtho = ortho.tex;
  shader.uniforms.uOrthoRect = ortho.rect;
  shader.uniforms.uOrthoOn = ortho.on;
  shader.uniforms.uPlaster = facadeTex.plaster;
  shader.uniforms.uRoofTex = facadeTex.roof;
  shader.uniforms.uSand = facadeTex.sand;
  shader.uniforms.uStyle = facadeTex.style;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;\nvarying float vBid;\n#ifdef HAS_BATCHID\nattribute float _batchid;\n#endif')
    .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vWNrm = normalize(mat3(modelMatrix) * objectNormal);
      #ifdef HAS_BATCHID
        vBid = _batchid;
      #else
        vBid = 0.0;
      #endif`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
      varying vec3 vWPos;
      varying vec3 vWNrm;
      varying float vBid;
      uniform vec4 uHideA[${MAX_HIDE}];
      uniform vec4 uHideB[${MAX_HIDE}];
      uniform sampler2D uOrtho;
      uniform vec4 uOrthoRect;
      uniform float uOrthoOn;
      uniform sampler2D uPlaster;
      uniform sampler2D uRoofTex;
      uniform sampler2D uSand;
      uniform float uStyle;
      float hash2(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }`)
    .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + HIDE_GLSL)
    .replace('#include <alphamap_fragment>', `#include <alphamap_fragment>
      {
        vec3 n = normalize(vWNrm);
        float isRoof = smoothstep(0.25, 0.5, n.y);
        vec2 t2 = normalize(vec2(-n.z, n.x) + 1e-5);
        float s = dot(vWPos.xz, t2);
        // Farbe pro Gebäude (Batch-ID) + Kachelposition
        float h = hash2(vec2(vBid * 0.618 + floor(vWPos.x / 300.0), floor(vWPos.z / 300.0) + vBid * 0.31));
        float h2 = hash2(vec2(h * 91.3, vBid + 7.0));
        vec3 pal0 = vec3(0.86, 0.83, 0.76);   // gebrochenes Weiss
        vec3 pal1 = vec3(0.86, 0.76, 0.58);   // Ocker
        vec3 pal2 = vec3(0.84, 0.68, 0.58);   // Lachs
        vec3 pal3 = vec3(0.74, 0.77, 0.70);   // Graugrün
        vec3 pal4 = vec3(0.80, 0.80, 0.78);   // Hellgrau
        vec3 wall = h < 0.38 ? pal0 : h < 0.55 ? pal1 : h < 0.68 ? pal2 : h < 0.8 ? pal3 : pal4;
        vec2 wuv = vec2(s, vWPos.y) / 3.5;
        vec3 plasterT = texture2D(uPlaster, wuv).rgb;
        wall *= (0.42 + 0.62 * plasterT) * 0.9;
        if (uStyle > 0.5) {
          vec3 sandT = texture2D(uSand, vec2(s, vWPos.y) / 4.0).rgb;
          wall = mix(wall, sandT * vec3(0.78, 0.80, 0.72) * 1.15, 0.85);
        }
        // Fenster: Raster 2.9 m x 3.1 m, Rahmen, Sims, Glas mit Himmelsspiegelung
        float fy = fract(vWPos.y / 3.1);
        float fx = fract((s + h2 * 1.3) / 2.9);
        float inWin = step(0.30, fy) * step(fy, 0.74) * step(0.30, fx) * step(fx, 0.70);
        float inFrame = step(0.27, fy) * step(fy, 0.77) * step(0.27, fx) * step(fx, 0.73) - inWin;
        float sill = step(0.24, fy) * step(fy, 0.28) * step(0.25, fx) * step(fx, 0.75);
        vec3 vdir = normalize(vWPos - cameraPosition);
        float fres = pow(1.0 - abs(dot(vdir, n)), 2.0);
        vec3 glass = mix(vec3(0.05, 0.06, 0.08), vec3(0.45, 0.55, 0.65), 0.25 + 0.6 * fres);
        // manche Fenster mit Vorhang/Licht
        float cur = step(0.82, hash2(floor(vec2(s / 2.9, vWPos.y / 3.1))));
        glass = mix(glass, vec3(0.55, 0.50, 0.42), cur * 0.5);
        float facadeOnly = 1.0 - isRoof;
        wall = mix(wall, wall * 1.12 + 0.04, (inFrame + sill) * facadeOnly);
        wall = mix(wall, glass, inWin * facadeOnly);
        // Dach: Luftbildfarbe x Ziegelstruktur
        vec3 roofFallback = mix(vec3(0.46, 0.24, 0.17), vec3(0.38, 0.33, 0.30), step(0.7, h));
        vec2 ouv = (vWPos.xz - uOrthoRect.xy) * uOrthoRect.zw;
        float inO = uOrthoOn * step(0.0, ouv.x) * step(ouv.x, 1.0) * step(0.0, ouv.y) * step(ouv.y, 1.0);
        vec3 roof = mix(roofFallback, texture2D(uOrtho, ouv).rgb * 0.95, inO);
        vec2 ruv = vec2(dot(vWPos.xz, normalize(vec2(n.z, -n.x) + 1e-5)), dot(vWPos.xz, normalize(n.xz + 1e-5))) / 2.5;
        float tileL = dot(texture2D(uRoofTex, ruv).rgb, vec3(0.333));
        roof *= 0.7 + 0.75 * tileL;
        diffuseColor.rgb = mix(wall, roof, isRoof);
      }`);
}

