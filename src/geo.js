// Gebäude-Shader, Ausblend-Boxen und Hilfen für die vorberechnete Welt (keine Streaming-Abhängigkeiten).
import * as THREE from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { lifeTime } from './life.js';

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
const facadeTex = { plaster: { value: null }, roof: { value: null }, sand: { value: null }, plasterN: { value: null }, roofN: { value: null }, style: { value: 0 } };
export function setFacadeTextures(t) {
  facadeTex.plaster.value = t.plaster; facadeTex.roof.value = t.roof; facadeTex.sand.value = t.sand;
  facadeTex.plasterN.value = t.plasterN; facadeTex.roofN.value = t.roofN;
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
  shader.uniforms.uPlasterN = facadeTex.plasterN;
  shader.uniforms.uRoofN = facadeTex.roofN;
  shader.uniforms.uLifeT = lifeTime;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;\nflat varying float vBid;\nvarying float vRel;\n#ifdef HAS_BATCHID\nattribute float _batchid;\n#endif\n#ifdef HAS_RELH\nattribute float _relh;\n#endif')
    .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vWNrm = normalize(mat3(modelMatrix) * objectNormal);
      #ifdef HAS_BATCHID
        vBid = _batchid;
      #else
        vBid = 0.0;
      #endif
      #ifdef HAS_RELH
        vRel = _relh;
      #else
        vRel = vWPos.y + 60.0;
      #endif`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
      varying vec3 vWPos;
      varying vec3 vWNrm;
      flat varying float vBid;
      varying float vRel;
      uniform vec4 uHideA[${MAX_HIDE}];
      uniform vec4 uHideB[${MAX_HIDE}];
      uniform sampler2D uOrtho;
      uniform vec4 uOrthoRect;
      uniform float uOrthoOn;
      uniform sampler2D uPlaster;
      uniform sampler2D uRoofTex;
      uniform sampler2D uSand;
      uniform float uStyle;
      uniform sampler2D uPlasterN, uRoofN;
      ${CLOUD_GLSL}
      vec2 bUVw, bUVr; vec3 bTw; float bRoof, bGlass;
      float hash2(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }`)
    .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + HIDE_GLSL)
    .replace('#include <alphamap_fragment>', `#include <alphamap_fragment>
      {
        vec3 n = normalize(vWNrm);
        float isRoof = smoothstep(0.25, 0.45, n.y);
        // Wandrichtung auf 0.5° gerastert: sonst verstärken winzige Normalenschwankungen (× Weltkoordinate) das Fensterraster zu Pixelrauschen
        float wa = floor(atan(n.x, -n.z) * 114.59156 + 0.5) / 114.59156;
        vec2 t2 = vec2(cos(wa), sin(wa));
        float s = dot(vWPos.xz, t2);
        float h = hash2(vec2(vBid * 0.618 + floor(vWPos.x / 300.0), floor(vWPos.z / 300.0) + vBid * 0.31));
        float h2 = hash2(vec2(h * 91.3, vBid + 7.0));
        float rel = vRel;
        // ---------- Fassade
        // Schweizer Altstadtfarben: Ocker, Lachs, Hellgelb, Salbei, Taubenblau, Terrakotta, Creme, gebrochenes Weiss
        int pi = int(floor(h * 12.0));
        vec3 wall = pi == 0 ? vec3(0.86, 0.66, 0.36) : pi == 1 ? vec3(0.85, 0.58, 0.50) : pi == 2 ? vec3(0.92, 0.83, 0.56)
          : pi == 3 ? vec3(0.64, 0.72, 0.56) : pi == 4 ? vec3(0.62, 0.70, 0.78) : pi == 5 ? vec3(0.74, 0.45, 0.33)
          : pi == 6 ? vec3(0.90, 0.86, 0.74) : pi == 7 ? vec3(0.80, 0.52, 0.40) : pi == 8 ? vec3(0.93, 0.90, 0.84)
          : pi == 9 ? vec3(0.78, 0.74, 0.66) : pi == 10 ? vec3(0.88, 0.76, 0.58) : vec3(0.70, 0.66, 0.72);
        vec3 plasterT = texture2D(uPlaster, vec2(s, vWPos.y) / 3.5).rgb;
        wall *= (0.5 + 0.55 * plasterT) * 0.88;
        if (uStyle > 0.5) {
          vec3 sandT = texture2D(uSand, vec2(s, vWPos.y) / 4.0).rgb;
          wall = mix(wall, sandT * vec3(0.78, 0.80, 0.72) * 1.15, 0.85);
        }
        // Fensterraster relativ zum Sockel des Gebäudes, kantengeglättet (kein Flimmern)
        float h3 = hash2(vec2(vBid * 1.37, h2 * 17.0));
        float fh = 2.95 + 0.45 * h3;                       // Geschosshöhe je Gebäude
        float cw = 2.6 + 0.9 * fract(h2 * 5.3);            // Fensterachse je Gebäude
        float cx = (s + h2 * 1.3) / cw;
        float cy = (rel - 3.6) / fh + 1.0;
        float fx = fract(cx), fy = fract(cy);
        vec2 fw = max(fwidth(vec2(cx, cy)), vec2(1e-4));
        #define BOX(f, a, b, w) (smoothstep((a) - (w), (a) + (w), f) - smoothstep((b) - (w), (b) + (w), f))
        float ground = 1.0 - step(3.6, rel);
        float ww = 0.17 + 0.05 * h3;                        // halbe Fensterbreite
        float x0 = 0.5 - ww, x1 = 0.5 + ww, y0 = 0.26, y1 = 0.78;
        float up = 1.0 - ground;
        float win = BOX(fx, x0, x1, fw.x) * BOX(fy, y0, y1, fw.y) * up;
        float frame = BOX(fx, x0 - 0.035, x1 + 0.035, fw.x) * BOX(fy, y0 - 0.03, y1 + 0.03, fw.y) * up - win;
        float sill = BOX(fx, x0 - 0.06, x1 + 0.06, fw.x) * BOX(fy, y0 - 0.075, y0 - 0.03, fw.y) * up;
        // Ein schmaler Sturz und ein Schatten unter der Fensterbank geben der
        // ansonsten flachen Gebäudefläche auch aus der Nähe mehr Tiefe.
        float lintel = BOX(fx, x0 - 0.05, x1 + 0.05, fw.x) * BOX(fy, y1 + 0.03, y1 + 0.065, fw.y) * up;
        float sillShadow = BOX(fx, x0 - 0.055, x1 + 0.055, fw.x) * BOX(fy, y0 - 0.105, y0 - 0.075, fw.y) * up;
        // Sprossen (Fensterkreuz)
        float mull;
        // Fensternische per Parallaxe: Glas 17 cm hinter der Fassade, die Laibung wird je nach Blickwinkel sichtbar
        vec3 Tw = vec3(t2.x, 0.0, t2.y);
        vec3 vd0 = normalize(vWPos - cameraPosition);
        float vz = min(dot(vd0, n), -0.08);
        vec2 po = vec2(dot(vd0, Tw), vd0.y) / -vz * 0.17;
        vec2 gq = vec2(fx + po.x / cw, fy + po.y / fh);
        float inG = BOX(gq.x, x0, x1, fw.x * 1.5) * BOX(gq.y, y0, y1, fw.y * 1.5);
        float revS = win * (1.0 - inG);
        float revTop = step(y1 - 0.01, gq.y);
        mull = (BOX(gq.x, 0.492, 0.508, fw.x) + BOX(gq.y, 0.6, 0.62, fw.y)) * win * inG;
        // Fensterläden (typisch Schweiz) bei etwa der Hälfte der Gebäude
        float hasSh = step(0.5, h3) * up;
        float sw = ww * 0.95;
        float shut = (BOX(fx, x0 - 0.04 - sw, x0 - 0.04, fw.x) + BOX(fx, x1 + 0.04, x1 + 0.04 + sw, fw.x)) * BOX(fy, y0 - 0.02, y1 + 0.02, fw.y) * hasSh;
        float sp = fract(h2 * 11.0);
        vec3 shutC = sp < 0.45 ? vec3(0.13, 0.27, 0.16) : sp < 0.7 ? vec3(0.38, 0.13, 0.08) : sp < 0.85 ? vec3(0.45, 0.44, 0.40) : vec3(0.62, 0.55, 0.40);
        shutC *= 0.85 + 0.15 * step(0.5, fract(rel * 9.0));   // Lamellen
        // Gesims je Geschoss bei manchen Gebäuden, Schattenkante darunter
        float hasC = step(0.35, fract(h2 * 3.1));
        float corn = BOX(fy, 0.0, 0.05, fw.y) * hasC * up;
        float cornSh = BOX(fy, 0.93, 1.0, fw.y) * hasC * up;
        // Schmutzfahnen unter den Fensterbänken
        float grime = BOX(fx, x0, x1, fw.x) * smoothstep(y0 - 0.32, y0 - 0.08, fy) * (1.0 - step(y0 - 0.075, fy)) * up;
        // Fachwerk bei etwa jedem achten kleineren Gebäude: dunkle Balken auf hellem Putz
        float hasFw = step(0.875, fract(h2 * 23.7)) * step(uStyle, 0.5);
        float bw = 0.035;
        float beams = max(max(BOX(fx, 0.0, bw, fw.x) + BOX(fx, 1.0 - bw, 1.0, fw.x), BOX(fy, 0.0, bw * 1.6, fw.y) + BOX(fy, 0.97, 1.0, fw.y)),
                          BOX(fx, x0 - 0.1, x0 - 0.1 + bw, fw.x) + BOX(fx, x1 + 0.1 - bw, x1 + 0.1, fw.x));
        float dg = abs((fx < x0 - 0.1 ? fx / max(x0 - 0.1, 0.01) : (1.0 - fx) / max(1.0 - x1 - 0.1, 0.01)) - fy);
        beams = max(beams, (1.0 - smoothstep(0.03, 0.06, dg)) * step(fy, y0 - 0.02 + 0.8) * (1.0 - BOX(fx, x0 - 0.1, x1 + 0.1, fw.x)));
        beams *= hasFw * up;
        // Blumenkisten mit Geranien unter den Fenstern
        float hasFl = step(0.6, fract(h2 * 31.3)) * up;
        float fbox = BOX(fx, x0 - 0.02, x1 + 0.02, fw.x) * BOX(fy, y0 - 0.17, y0 - 0.075, fw.y) * hasFl;
        float fn = hash2(floor(vec2(s * 9.0, rel * 9.0)));
        vec3 flC = fn < 0.45 ? vec3(0.75, 0.06, 0.05) : fn < 0.6 ? vec3(0.85, 0.30, 0.50) : vec3(0.10, 0.28, 0.07);
        // Fenstergewände: Sandstein, Weiss oder Grau je Gebäude
        float gp = fract(h2 * 41.0);
        vec3 frameStone = gp < 0.4 ? vec3(0.93, 0.92, 0.88) : gp < 0.7 ? vec3(0.74, 0.66, 0.52) : vec3(0.58, 0.58, 0.56);
        // Erdgeschoss: Schaufenster und Türen
        float shop = BOX(fract(cx * 0.5), 0.1, 0.9, fw.x * 0.5) * BOX(rel, 0.55, 2.95, fw.y * fh) * ground;
        float door = step(0.82, hash2(floor(vec2(cx * 0.5, 3.0)) + vBid)) * shop;
        // Markisen und Ladenschilder über den Schaufenstern
        float sCell = floor(cx * 0.5);
        float hasAw = step(0.55, hash2(vec2(sCell, vBid * 0.7))) * ground;
        float awn = BOX(fract(cx * 0.5), 0.08, 0.92, fw.x * 0.5) * BOX(rel, 2.95, 3.45, fw.y * fh) * hasAw;
        vec3 awC = mix(vec3(0.62, 0.12, 0.10), vec3(0.12, 0.30, 0.20), step(0.5, hash2(vec2(sCell * 1.3, vBid))));
        awC = mix(awC, vec3(0.92, 0.9, 0.85), step(0.5, fract(fract(cx * 0.5) * 10.0)) * step(0.4, hash2(vec2(vBid, sCell))));
        float shopSign = BOX(fract(cx * 0.5), 0.2, 0.8, fw.x * 0.5) * BOX(rel, 3.05, 3.4, fw.y * fh) * ground * (1.0 - hasAw) * step(0.4, hash2(vec2(sCell, vBid * 1.9)));
        float letters = step(0.5, hash2(floor(vec2(s * 5.0, rel * 6.0)))) * BOX(rel, 3.12, 3.32, fw.y * fh);
        vec3 vdir = normalize(vWPos - cameraPosition);
        float fres = pow(1.0 - abs(dot(vdir, n)), 3.0);
        vec3 rd = reflect(vdir, n);
        vec3 skyR = mix(vec3(0.30, 0.33, 0.36), vec3(0.62, 0.74, 0.88), clamp(rd.y * 1.6 + 0.35, 0.0, 1.0));
        float wh = hash2(floor(vec2(cx, cy)) + vBid);
        vec3 inter = wh < 0.25 ? vec3(0.55, 0.50, 0.42) * 0.55 : wh < 0.4 ? vec3(0.78, 0.74, 0.66) * 0.6 : vec3(0.05, 0.05, 0.06) + 0.04 * wh;
        // Einzelne helle Vorhänge statt identischer leerer Fenster.
        float curtains = step(0.55, wh) * (BOX(gq.x, x0 + 0.025, x0 + ww * 0.48, fw.x)
          + BOX(gq.x, x1 - ww * 0.48, x1 - 0.025, fw.x)) * inG;
        inter = mix(inter, vec3(0.56, 0.53, 0.47), clamp(curtains * 0.55, 0.0, 1.0));
        vec3 glass = mix(inter, skyR, 0.18 + 0.7 * fres);
        vec3 frameC = mix(frameStone, vec3(0.35, 0.24, 0.16), step(0.8, fract(h2 * 13.0)));
        glass = mix(glass, frameC * 0.85, clamp(mull, 0.0, 1.0));
        glass = mix(glass, wall * mix(0.72, 0.42, revTop), clamp(revS, 0.0, 1.0));
        vec3 shopG = mix(vec3(0.08, 0.08, 0.09), skyR, 0.25 + 0.6 * fres);
        shopG = mix(shopG, vec3(0.22, 0.15, 0.1), door);
        // in der Ferne: gemittelter Eindruck statt Muster
        float far = smoothstep(0.18, 0.45, max(fw.x, fw.y));
        vec3 fac = wall;
        fac *= 1.0 - 0.18 * grime;
        fac *= 1.0 - 0.22 * sillShadow;
        fac = mix(fac, fac * 1.12 + 0.03, clamp(corn, 0.0, 1.0));
        fac *= 1.0 - 0.25 * cornSh;
        fac = mix(fac, mix(vec3(0.92, 0.9, 0.86) * (0.8 + 0.3 * plasterT), fac, 0.25), hasFw * up);
        fac = mix(fac, vec3(0.20, 0.13, 0.08), clamp(beams, 0.0, 1.0));
        fac = mix(fac, frameC, clamp(frame + sill * 0.7 + lintel * 0.65, 0.0, 1.0));
        fac = mix(fac, mix(vec3(0.30, 0.18, 0.10), flC, step(0.3, fn)), clamp(fbox, 0.0, 1.0));
        fac = mix(fac, shutC, clamp(shut, 0.0, 1.0));
        fac = mix(fac, glass, clamp(win, 0.0, 1.0));
        fac = mix(fac, shopG, clamp(shop, 0.0, 1.0));
        fac = mix(fac, awC * (0.85 + 0.15 * fract(rel * 7.0)), clamp(awn, 0.0, 1.0));
        fac = mix(fac, mix(vec3(0.12, 0.14, 0.18), vec3(0.95, 0.9, 0.75), letters), clamp(shopSign, 0.0, 1.0));
        fac = mix(fac, mix(wall, glass, 0.2) * (1.0 - 0.1 * hasSh), far);
        // Sockel und Bodenschatten
        fac = mix(vec3(0.42, 0.41, 0.39) * (0.7 + 0.5 * plasterT), fac, smoothstep(0.55, 0.75, rel));
        fac *= mix(0.72, 1.0, smoothstep(0.0, 3.0, rel));
        // ---------- Dach: Ziegelstruktur, Farbe aus dem (unscharfen) Luftbild
        vec2 ouv = (vWPos.xz - uOrthoRect.xy) * uOrthoRect.zw;
        float inO = uOrthoOn * step(0.0, ouv.x) * step(ouv.x, 1.0) * step(0.0, ouv.y) * step(ouv.y, 1.0);
        float rp = fract(h * 7.31 + h2 * 3.7);
        vec3 roofFallback = rp < 0.32 ? vec3(0.42, 0.20, 0.13) : rp < 0.52 ? vec3(0.34, 0.17, 0.12) : rp < 0.66 ? vec3(0.50, 0.30, 0.20)
          : rp < 0.82 ? vec3(0.24, 0.23, 0.23) : rp < 0.93 ? vec3(0.33, 0.30, 0.28) : vec3(0.22, 0.36, 0.30);
        roofFallback *= 0.9 + 0.2 * hash2(vec2(vBid, floor(dot(vWPos.xz, normalize(n.xz + 1e-5)) / 4.0)));   // Verwitterung in Bahnen
        vec3 oc = texture2D(uOrtho, ouv, 2.5).rgb;
        vec3 roofTint = mix(roofFallback, oc, inO);
        vec2 ruv = vec2(dot(vWPos.xz, normalize(vec2(n.z, -n.x) + 1e-5)), dot(vWPos.xz, normalize(n.xz + 1e-5)) * 1.15) / 2.2;
        vec3 tile = texture2D(uRoofTex, ruv).rgb;
        float tileL = dot(tile, vec3(0.333));
        float flatR = smoothstep(0.9, 0.97, n.y);
        vec3 roof = roofTint * (0.3 + 1.7 * tileL);
        vec3 flatC = mix(vec3(0.30, 0.29, 0.27), vec3(0.16, 0.22, 0.10), step(0.75, h2)) * (0.75 + 0.5 * tileL);  // Kies oder begrünt
        roof = mix(roof, flatC, flatR);
        diffuseColor.rgb = mix(fac, roof, isRoof) * (1.0 - 0.3 * cloudShadow(vWPos.xz));
        bUVw = vec2(s, vWPos.y) / 3.5; bUVr = ruv; bTw = Tw; bRoof = isRoof;
        bGlass = clamp(win * inG + shop, 0.0, 1.0) * (1.0 - far) * (1.0 - isRoof);
      }`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.1, bGlass);`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      {
        vec3 nW = normalize(vWNrm);
        float fadeN = 1.0 - smoothstep(40.0, 260.0, length(vWPos - cameraPosition));
        vec3 T, B, pn;
        if (bRoof > 0.5) {
          T = normalize(vec3(nW.z, 0.0, -nW.x) + 1e-5); B = cross(nW, T);
          pn = texture2D(uRoofN, bUVr).xyz * 2.0 - 1.0;
          pn.xy *= 0.9;
        } else {
          T = bTw; B = vec3(0.0, 1.0, 0.0);
          pn = texture2D(uPlasterN, bUVw).xyz * 2.0 - 1.0;
          pn.xy *= 0.55 * (1.0 - bGlass);
        }
        vec3 pw = normalize(nW + (T * pn.x + B * pn.y) * fadeN);
        normal = normalize((viewMatrix * vec4(pw, 0.0)).xyz);
      }`);
}


// Wolkenschatten: grossräumiges, langsam ziehendes Rauschen (Gelände und Gebäude)
const CLOUD_GLSL = `
      uniform float uLifeT;
      float cH(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
      float cN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(cH(i), cH(i + vec2(1, 0)), f.x), mix(cH(i + vec2(0, 1)), cH(i + vec2(1, 1)), f.x), f.y); }
      float cloudShadow(vec2 p) {
        vec2 q = p / 900.0 + uLifeT * vec2(0.0045, 0.0025);
        float n = cN(q) * 0.55 + cN(q * 2.3 + 7.1) * 0.3 + cN(q * 5.1 + 3.3) * 0.15;
        return smoothstep(0.52, 0.68, n);
      }`;

// ---------- Gelände ohne Luftbild: Oberflächen aus der swisstopo-Basiskarte (Strassen, Gehwege, Wege, Wald,
// Wasser, Gletscher, Siedlung) + Hang/Höhe (Fels, Schnee), gezeichnet mit PBR-Texturen aus einem Textur-Array.
export const TERRAIN_LAYERS = ['grass', 'leaves', 'asphalt', 'pavers', 'path', 'cobble', 'rock', 'snow', 'dirt'];
const TL_SCALE = [3.5, 3.0, 5.0, 2.6, 2.4, 2.2, 7.0, 6.0, 4.0]; // Meter pro Texturwiederholung
const terrainU = {
  tDiff: { value: null }, tNor: { value: null },
  sCoreR: { value: null }, sCoreN: { value: null }, sCoreE: { value: null },
  sMidR: { value: null }, sMidN: { value: null }, sMidE: { value: null }, sFarN: { value: null },
  uRing: { value: new THREE.Vector3(1200, 5000, 30000) }, uH0: { value: 0 }, uCoreWater: { value: 1 },
};
let terrainLite = false;

async function loadArray(urls, size, srgb) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d', { willReadFrequently: true });
  const data = new Uint8Array(size * size * 4 * urls.length);
  const imgs = await Promise.all(urls.map(async (u) => createImageBitmap(await (await fetch(u)).blob())));
  imgs.forEach((img, i) => {
    g.clearRect(0, 0, size, size);
    g.drawImage(img, 0, 0, size, size);
    data.set(g.getImageData(0, 0, size, size).data, i * size * size * 4);
  });
  const t = new THREE.DataArrayTexture(data, size, size, urls.length);
  t.format = THREE.RGBAFormat;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true; t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

export async function initTerrainTextures(small) {
  if (terrainU.tDiff.value) return;
  terrainLite = small;
  const B = `${import.meta.env.BASE_URL}tex/`, sfx = small ? '_s' : '', size = small ? 512 : 1024;
  const [d, n] = await Promise.all([
    loadArray(TERRAIN_LAYERS.map((l) => `${B}${l}/diff${sfx}.jpg`), size, true),
    small ? Promise.resolve(null) : loadArray(TERRAIN_LAYERS.map((l) => `${B}${l}/nor${sfx}.jpg`), size, false),
  ]);
  terrainU.tDiff.value = d; terrainU.tNor.value = n;
}

export async function setTerrainSurface(dir, meta, small, hasWaterPlane = false) {
  terrainU.uCoreWater.value = hasWaterPlane ? 0 : 1;
  const L = new THREE.TextureLoader();
  const s = small ? '_s' : '';
  const ld = async (f) => {
    const t = await L.loadAsync(`${dir}${f}${s}.png`).catch(() => null);
    if (!t) return null;
    t.colorSpace = THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  };
  const names = ['surf_core_roads', 'surf_core_nat', 'surf_core_ext', 'surf_mid_roads', 'surf_mid_nat', 'surf_mid_ext', 'surf_far_nat'];
  const [a, b, c, d, e, f, g] = await Promise.all(names.map(ld));
  terrainU.sCoreR.value = a; terrainU.sCoreN.value = b; terrainU.sCoreE.value = c;
  terrainU.sMidR.value = d; terrainU.sMidN.value = e; terrainU.sMidE.value = f; terrainU.sFarN.value = g;
  terrainU.uRing.value.set(meta.core, meta.mid, meta.far);
  terrainU.uH0.value = meta.H0;
}

const TERRAIN_HEAD = CLOUD_GLSL + `
      varying vec3 vTPos;
      varying vec3 vTNrm;
      precision highp sampler2DArray;
      uniform sampler2DArray tDiff, tNor;
      uniform sampler2D sCoreR, sCoreN, sCoreE, sMidR, sMidN, sMidE, sFarN;
      uniform vec3 uRing;
      uniform float uH0, uCoreWater;
      const float TLS[9] = float[9](__SCALES__);
      float tW[9];
      vec2 tP, tPx, tPy;
      vec3 tP3, tPx3, tPy3, tNb;
      float tRough, tWater;
      float hashT(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hashT(i), hashT(i + vec2(1, 0)), f.x), mix(hashT(i + vec2(0, 1)), hashT(i + vec2(1, 1)), f.x), f.y); }
      // zwei gegeneinander gedrehte Massstäbe gegen sichtbare Kachelung; textureGrad, weil in Verzweigungen gelesen wird
      vec4 arr(sampler2DArray t, int l) {
        float k = TLS[l];
        mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
        vec2 a = tP * k, b = rot * tP * k * 0.37;
        vec4 x = textureGrad(t, vec3(a, float(l)), tPx * k, tPy * k);
        vec4 y = textureGrad(t, vec3(b, float(l)), rot * tPx * k * 0.37, rot * tPy * k * 0.37);
        vec4 top = mix(x, y, 0.35);
        if (l < 6) return top;
        // Fels/Schnee: Triplanar-Projektion, sonst wird die Textur an Steilwänden zu Streifen gezogen
        vec4 sx = textureGrad(t, vec3(tP3.zy * k, float(l)), tPx3.zy * k, tPy3.zy * k);
        vec4 sz = textureGrad(t, vec3(tP3.xy * k, float(l)), tPx3.xy * k, tPy3.xy * k);
        return top * tNb.y + sx * tNb.x + sz * tNb.z;
      }
      float edge(float c) { float w = max(fwidth(c) * 0.75, 0.04); return smoothstep(0.5 - w, 0.5 + w, c); }`;

const TERRAIN_COLOR = `
      {
        tP = vTPos.xz; tPx = dFdx(tP); tPy = dFdy(tP);
        tP3 = vTPos; tPx3 = dFdx(tP3); tPy3 = dFdy(tP3);
        tNb = pow(abs(normalize(vTNrm)), vec3(4.0)); tNb /= (tNb.x + tNb.y + tNb.z);
        vec2 p = vTPos.xz;
        vec3 R = vec3(0.0), N = vec3(0.0), E = vec3(0.0);
        float mx = max(abs(p.x), abs(p.y));
        if (mx < uRing.x) {
          vec2 uv = vec2((p.x + uRing.x) / (2.0 * uRing.x), 1.0 - (p.y + uRing.x) / (2.0 * uRing.x));
          R = texture2D(sCoreR, uv).rgb; N = texture2D(sCoreN, uv).rgb; E = texture2D(sCoreE, uv).rgb;
          N.g *= uCoreWater;   // Wasserfläche vorhanden -> kein Wasser auf dem Gelände (Quaimauern)
        } else if (mx < uRing.y) {
          vec2 uv = vec2((p.x + uRing.y) / (2.0 * uRing.y), 1.0 - (p.y + uRing.y) / (2.0 * uRing.y));
          R = texture2D(sMidR, uv).rgb; N = texture2D(sMidN, uv).rgb; E = texture2D(sMidE, uv).rgb;
        } else {
          vec2 uv = vec2((p.x + uRing.z) / (2.0 * uRing.z), 1.0 - (p.y + uRing.z) / (2.0 * uRing.z));
          N = texture2D(sFarN, uv).rgb;
        }
        vec3 n = normalize(vTNrm);
        float alt = vTPos.y + uH0;
        float mac = vnoise(p / 90.0) * 0.6 + vnoise(p / 23.0) * 0.4;
        float asph = edge(R.r), pav = edge(R.g), grav = edge(R.b), cob = edge(E.r);
        float forest = smoothstep(0.3, 0.7, N.r), water = smoothstep(0.35, 0.65, N.g) * smoothstep(0.9, 0.97, normalize(vTNrm).y), ice = smoothstep(0.3, 0.7, N.b);
        float urban = E.g;
        float rock = smoothstep(0.78, 0.58, n.y + (mac - 0.5) * 0.12);
        rock = max(rock, smoothstep(2200.0, 2700.0, alt + mac * 200.0) * smoothstep(0.97, 0.85, n.y));
        float snow = max(ice * smoothstep(0.55, 0.7, n.y + 0.1), smoothstep(3400.0, 3800.0, alt + mac * 300.0) * smoothstep(0.72, 0.86, n.y));
        // Wanderwege im Fels und auf Gletschern nicht als helle Kiesbänder zeichnen
        grav *= (1.0 - max(rock, snow)) * (1.0 - smoothstep(2200.0, 2500.0, alt));
        for (int i = 0; i < 9; i++) tW[i] = 0.0;
        float bare = smoothstep(0.62, 0.8, vnoise(p / 7.0) * 0.5 + mac * 0.5) * 0.6;
        tW[8] = bare * (1.0 - forest) * 0.6 + urban * 0.08 * (1.0 - forest);
        tW[0] = 1.0 - forest - tW[8]; tW[1] = forest;
        for (int i = 0; i < 9; i++) tW[i] *= (1.0 - rock);
        tW[6] += rock;
        for (int i = 0; i < 9; i++) tW[i] *= (1.0 - snow);
        tW[7] += snow;
        float top = clamp(asph + pav + grav + cob, 0.0, 1.0);
        for (int i = 0; i < 9; i++) tW[i] *= (1.0 - top);
        tW[2] += asph; tW[5] += cob * (1.0 - asph);
        tW[3] += pav * (1.0 - asph - cob); tW[4] += max(0.0, grav * (1.0 - asph - pav - cob));
        vec3 col = vec3(0.0);
        float wsum = 0.0;
        float dist = length(vTPos - cameraPosition);
        // Wiese: Farbe aus einer abgestimmten Palette, Struktur (Helligkeit) aus der Textur
        vec3 meadow = mix(vec3(0.075, 0.15, 0.035), vec3(0.125, 0.18, 0.05), mac) * (1.0 - 0.12 * urban);
        meadow = mix(meadow, vec3(0.14, 0.17, 0.07), smoothstep(1500.0, 2300.0, alt) * 0.6);   // Alpweiden
        vec3 canopy = vec3(0.028, 0.06, 0.025) * (0.7 + 0.6 * vnoise(p / 6.0)) * (0.85 + 0.3 * mac);
        for (int i = 0; i < 9; i++) if (tW[i] > 0.003) {
          vec3 t = arr(tDiff, i).rgb;
          if (i == 0) { vec3 m = textureLod(tDiff, vec3(0.5, 0.5, 0.0), 12.0).rgb; t = meadow * clamp(dot(t, vec3(0.333)) / max(dot(m, vec3(0.333)), 0.02), 0.4, 1.8); }
          if (i == 1) t = mix(t * 0.8, canopy, smoothstep(60.0, 300.0, dist));
          col += t * tW[i]; wsum += tW[i];
        }
        col /= max(wsum, 1e-3);
        col *= 0.85 + 0.3 * mac;
        // Randstein zwischen Fahrbahn und Gehweg, Rinne auf der Fahrbahnseite, Bankett an Landstrassen
        float side = step(0.15, R.g + E.r);
        float curb = (smoothstep(0.12, 0.3, R.r) - smoothstep(0.38, 0.5, R.r)) * side;
        float gutter = (smoothstep(0.5, 0.58, R.r) - smoothstep(0.62, 0.75, R.r)) * side;
        float shoulder = (smoothstep(0.08, 0.3, R.r) - smoothstep(0.4, 0.5, R.r)) * (1.0 - side);
        col = mix(col, vec3(0.36, 0.355, 0.34), clamp(curb, 0.0, 1.0) * 0.85);
        col *= 1.0 - 0.3 * clamp(gutter, 0.0, 1.0);
        col = mix(col, arr(tDiff, 8).rgb * 0.8, clamp(shoulder, 0.0, 1.0) * 0.7);
        col = mix(col, vec3(0.025, 0.07, 0.075), water);
        tWater = water;
        tRough = mix(mix(0.95, 0.8, clamp(asph + pav + cob, 0.0, 1.0)), 0.08, water);
        col *= 1.0 - 0.33 * cloudShadow(p);
        diffuseColor.rgb = col;
      }`;

const TERRAIN_NORMAL = `
      #ifndef TERRAIN_LITE
      {
        vec3 nt = vec3(0.0);
        float ws = 0.0;
        for (int i = 0; i < 9; i++) if (tW[i] > 0.05) { nt += (arr(tNor, i).xyz * 2.0 - 1.0) * tW[i]; ws += tW[i]; }
        nt /= max(ws, 1e-3);
        float fade = (1.0 - smoothstep(60.0, 900.0, length(vTPos - cameraPosition))) * (1.0 - tWater);
        vec3 Nw = normalize(vTNrm);
        vec3 Tr = vec3(1.0, 0.0, 0.0) - Nw * Nw.x;
        vec3 T = dot(Tr, Tr) > 1e-4 ? normalize(Tr) : vec3(0.0, 0.0, 1.0);   // senkrechte Flächen: kein NaN
        vec3 Bt = cross(Nw, T);
        vec3 pw = normalize(Nw + (T * nt.x - Bt * nt.y) * 1.1 * fade);
        normal = normalize((viewMatrix * vec4(pw, 0.0)).xyz);
      }
      #endif`;

export function patchTerrainShader(shader) {
  Object.assign(shader.uniforms, terrainU, { uLifeT: lifeTime });
  shader.defines = shader.defines || {};
  if (terrainLite) shader.defines.TERRAIN_LITE = '';
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vTPos;\nvarying vec3 vTNrm;')
    .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      vTPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vTNrm = normalize(mat3(modelMatrix) * objectNormal);`);
  const scales = TL_SCALE.map((v) => (1 / v).toFixed(4)).join(', ');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n' + TERRAIN_HEAD.replace('__SCALES__', scales))
    .replace('#include <map_fragment>', '#include <map_fragment>\n' + TERRAIN_COLOR)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n      roughnessFactor = tRough;')
    .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + TERRAIN_NORMAL);
}
