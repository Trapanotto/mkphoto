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
        '#include <common>\nattribute vec4 aWall;\nattribute float aSeed;\nattribute vec2 aStyle;\nattribute float aTotal;\nvarying float vTotal;\nvarying vec4 vWall;\nvarying float vSeed;\nvarying vec2 vStyle;',
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWall = aWall;\nvSeed = aSeed;\nvStyle = aStyle;\nvTotal = aTotal;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform float uNight;
        varying vec4 vWall;
        varying float vSeed;
        varying vec2 vStyle;
        varying float vTotal;
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
        int style = int(vStyle.x + 0.5);
        float far = smoothstep(180.0, 420.0, length(vViewPosition));
        float lit = 0.0;
        if (style == 1 || style == 2) {
          // stone landmarks: ashlar courses, Gothic lancet windows (1) or castle slits (2)
          float rows = h / (style == 1 ? 0.55 : 0.75);
          float row = floor(rows);
          float bu = u / (style == 1 ? 1.15 : 0.9) + mod(row, 2.0) * 0.5;
          vec2 aa2 = fwidth(vec2(bu, rows));
          float joint = max(1.0 - smoothstep(0.0, aa2.y * 1.5, min(fract(rows), 1.0 - fract(rows))), 1.0 - smoothstep(0.0, aa2.x * 1.5, min(fract(bu), 1.0 - fract(bu))));
          float tone = hash3(vec3(floor(bu), row, 3.0));
          diffuseColor.rgb *= (style == 1 ? 0.93 : 0.86) + tone * (style == 1 ? 0.1 : 0.2);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.72, joint * 0.6 * (1.0 - far));
          float bay = u / 6.5;
          float bx = fract(bay) - 0.5;
          float wall = step(0.9, rest) * step(1.5, roof);
          if (style == 1) {
            // buttresses between the bays, tall pointed windows with tracery between them
            diffuseColor.rgb *= 1.0 - 0.12 * (1.0 - smoothstep(0.04, 0.07, 0.5 - abs(bx)));
            float top = max(min(h + roof - 3.0, 15.0), 6.0);
            float py = h - (top - 1.6);
            float wdt = py < 0.0 ? 0.11 : 0.11 * sqrt(max(0.0, 1.0 - py / 1.6));
            float lancet = step(abs(bx), wdt) * step(3.2, h) * step(h, top);
            float mullion = 1.0 - smoothstep(0.008, 0.016, abs(bx));
            float tracery = step(top - 2.2, h) * (1.0 - smoothstep(0.02, 0.05, abs(length(vec2(bx * 6.5, (h - top + 1.4))) - 0.45)));
            float glassMask = lancet * wall * (1.0 - far);
            vec3 stained = mix(vec3(0.16, 0.2, 0.32), vec3(0.32, 0.18, 0.22), hash3(vec3(floor(bay), floor(h * 1.5), 5.0)));
            diffuseColor.rgb = mix(diffuseColor.rgb, stained, glassMask * (1.0 - max(mullion, tracery) * 0.85));
            lit = glassMask * uNight * 0.6;
          } else {
            // castle: few small windows and arrow slits, unevenly spread
            vec2 cell = vec2(u / 4.2, h / 3.6);
            vec2 f = fract(cell);
            float k = hash3(vec3(floor(cell), vSeed));
            float small = box(f, vec2(0.38, 0.3), vec2(0.62, 0.72), fwidth(cell) * 1.2) * step(0.55, k);
            float slit = box(f, vec2(0.47, 0.2), vec2(0.53, 0.8), fwidth(cell) * 1.2) * step(k, 0.25);
            float m = max(small, slit) * wall * step(2.0, h) * (1.0 - far);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 0.09, 0.09), m);
            lit = small * wall * uNight * step(0.75, k);
          }
        } else {
        float sd = abs(vSeed);
        float r1 = hash3(vec3(sd, 3.0, 7.0)), r2 = hash3(vec3(sd, 5.0, 1.0)), r3 = hash3(vec3(sd, 9.0, 4.0));
        float modern = style == 0 ? step(0.5, fract(sd * 7.0)) * step(24.0, h + roof) : 0.0;
        // house type: 0 classic with shutters, 1 stone surrounds and balconies, 2 chalet, 3 modern flats,
        // 4 half-timbered, 5 painted old-town front
        int kind = 0;
        if (style == 4) kind = r1 < 0.78 ? 2 : 0;
        else if (style == 5) kind = r1 < 0.3 ? 0 : r1 < 0.55 ? 5 : r1 < 0.78 ? 4 : 1;
        else if (style == 3) kind = r1 < 0.7 ? 1 : 5;
        else kind = r1 < 0.38 ? 0 : r1 < 0.62 ? 1 : r1 < 0.92 ? 3 : 4;
        if (modern > 0.5) kind = 6;
        // floors and window columns are fitted to this wall: nothing is cut at a corner or under the eaves
        float floorH = kind == 6 ? 3.6 : kind == 3 ? 2.9 : 2.9 + r3 * 0.5;
        float colW = kind == 6 ? 3.0 : kind == 3 ? 3.4 : kind == 4 ? 2.3 + r2 * 0.4 : 2.5 + r2 * 0.9;
        float wallLen = vWall.z;
        // height of the whole wall face (the old footprint builder has none: use this triangle's)
        float total = vTotal > 0.5 ? vTotal : h + roof;
        float fh = total / max(1.0, floor(total / floorH + 0.2));
        float cw = wallLen / max(1.0, floor(wallLen / colW));
        vec2 cell = vec2(u / cw, h / fh);
        vec2 f = fract(cell);
        vec2 id = floor(cell);
        // position inside the cell in metres: x from the middle, y from the floor
        vec2 m = vec2((f.x - 0.5) * cw, f.y * fh);
        vec2 aa = fwidth(vec2(u, h)) * 1.1;
        bool ground = id.y < 1.0;
        float wk = hash3(vec3(id, sd));
        float inWall = step(0.0, vSeed) * step(1.9, wallLen) * step(2.3, total);
        float arcade = style == 3 ? 1.0 : 0.0;
        float near = 1.0 - far;
        vec3 wallCol = diffuseColor.rgb;
        vec3 trim = vec3(0.8, 0.77, 0.7);
        float s = hash3(vec3(sd, 1.0, 2.0));
        vec3 shutterCol = s < 0.3 ? vec3(0.07, 0.2, 0.1) : s < 0.55 ? vec3(0.32, 0.06, 0.05) : s < 0.75 ? vec3(0.2, 0.11, 0.06) : s < 0.9 ? vec3(0.08, 0.15, 0.26) : vec3(0.4, 0.4, 0.37);
        vec3 wood = mix(vec3(0.24, 0.13, 0.07), vec3(0.34, 0.2, 0.1), r2);

        // --- wall surface -------------------------------------------------------------------
        if (kind == 2 && !ground) {
          // chalet: sun-browned timber above a plastered ground floor
          wallCol = wood * (0.9 + 0.18 * step(0.5, fract(h / 0.24)) * near);
        } else if (kind == 4 && !ground) {
          // half-timbered: posts, beams and braces on white infill
          vec3 timber = r3 < 0.5 ? vec3(0.13, 0.07, 0.045) : vec3(0.27, 0.06, 0.05);
          float post = 1.0 - smoothstep(0.0, aa.x, cw * 0.5 - abs(m.x) - 0.09);
          float beam = 1.0 - smoothstep(0.0, aa.y, min(m.y, fh - m.y) - 0.1);
          float d = abs((wk > 0.81 ? m.x / cw + 0.5 : 0.5 - m.x / cw) - m.y / fh) * min(cw, fh) * 0.7;
          float brace = step(0.62, wk) * (1.0 - smoothstep(0.07, 0.07 + aa.x, d));
          wallCol = mix(vec3(0.78, 0.74, 0.66), timber, max(max(post, beam), brace) * near * inWall);
        } else if (kind == 3) {
          // modern flats: light render with darker bands between the floors
          wallCol = mix(wallCol, wallCol * 0.82, step(m.y, 0.35) * step(1.0, id.y) * step(0.0, vSeed));
        }
        // a stone plinth, a cornice under the eaves and thin cornices between floors
        float old = (kind == 6 || kind == 3) ? 0.0 : 1.0;
        float plinth = old * step(h, 0.7);
        float cornice = old * (1.0 - smoothstep(0.25, 0.32, roof)) * step(0.0, vSeed);
        float course = old * (kind == 4 || kind == 2 ? 0.0 : 1.0) * step(1.0, id.y) * (1.0 - smoothstep(0.03, 0.03 + aa.y, m.y)) * near * step(0.0, vSeed);
        wallCol = mix(wallCol, wallCol * 0.62, plinth);
        wallCol = mix(wallCol, wallCol * 0.8, cornice);
        wallCol = mix(wallCol, wallCol * 1.07 + 0.02, course * 0.8);

        // --- openings, all in metres ---------------------------------------------------------
        // window: width, height and sill height by house type
        vec3 ws = kind == 1 ? vec3(1.05, 1.65, 0.8) : kind == 2 ? vec3(0.95, 1.15, 1.0) : kind == 3 ? vec3(cw - 0.7, 1.45, 0.85)
          : kind == 4 ? vec3(0.9, 1.2, 0.95) : kind == 5 ? vec3(0.95, 1.6, 0.85) : kind == 6 ? vec3(cw - 0.3, fh - 0.9, 0.55) : vec3(1.0, 1.45, 0.9);
        bool shop = ground && (style == 5 || style == 3 || kind == 6);
        if (shop) ws = vec3(cw - 0.6, min(2.1, fh - 1.0), 0.45);
        ws.y = min(ws.y, fh - ws.z - 0.5);
        vec2 wc = vec2(0.0, ws.z + ws.y * 0.5);
        vec2 wh = ws.xy * 0.5;
        #define RECT(c, hs) (smoothstep(-aa.x, aa.x, (hs).x - abs(m.x - (c).x)) * smoothstep(-aa.y, aa.y, (hs).y - abs(m.y - (c).y)))
        float doorHere = ground ? step(wk, 0.16) : 0.0;
        float open = (kind == 4 && !ground) ? step(wk, 0.62) : 1.0;
        float win = RECT(wc, wh) * open * (1.0 - doorHere);
        // arched heads on painted fronts
        if (kind == 5 && !ground) win *= step(length(vec2(m.x, max(0.0, m.y - (wc.y + wh.y - wh.x)))), wh.x);
        float door = RECT(vec2(0.0, 1.05), vec2(0.5, 1.05)) * doorHere;
        float fancy = (kind == 3 || kind == 6 || shop) ? 0.0 : 1.0;
        float frame = RECT(wc, wh + 0.07) * open * (1.0 - doorHere) * fancy;
        float sill = RECT(vec2(0.0, ws.z - 0.1), vec2(wh.x + 0.16, 0.045)) * open * (1.0 - doorHere) * fancy;
        float shutter = 0.0, balcony = 0.0, awning = 0.0, flowers = 0.0, bars = 0.0;
        if (!ground) {
          if (kind == 0 || kind == 2) shutter = (RECT(vec2(-wh.x - 0.3, wc.y), vec2(0.21, wh.y)) + RECT(vec2(wh.x + 0.3, wc.y), vec2(0.21, wh.y))) * open;
          // flower boxes on some sills
          flowers = RECT(vec2(0.0, ws.z + 0.03), vec2(wh.x, 0.1)) * open * fancy * step(0.72, hash3(vec3(id, sd + 2.0)));
          // balconies: on some window columns, or right across a chalet or a block of flats
          float colK = hash3(vec3(id.x, sd, 8.0));
          bool across = (kind == 2 && mod(id.y, 2.0) < 1.0) || (kind == 3 && colK < 0.45);
          if (across || (kind == 1 && colK < 0.3)) {
            float bw = across ? cw : wh.x + 0.45;
            balcony = RECT(vec2(0.0, 0.5), vec2(bw, 0.5));
            bars = step(0.5, fract(u / 0.14)) * step(0.12, m.y) * step(m.y, 0.92);
            if (kind == 2) flowers = max(flowers, RECT(vec2(0.0, 1.05), vec2(cw, 0.09)) * step(0.3, hash3(vec3(id.y, sd, 6.0))));
          }
        } else if (shop && kind != 6) {
          // striped awnings over some shop windows
          awning = RECT(vec2(0.0, ws.z + ws.y + 0.2), vec2(wh.x + 0.15, 0.22)) * step(0.55, wk);
        }
        // Bern's Lauben: round arches over a shaded walkway on the ground floor
        float arch = 0.0;
        float hg = vStyle.y;
        if (arcade > 0.5 && hg < 3.6 && hg > -0.5) {
          float ax = fract(u / 4.0) - 0.5;
          arch = step(abs(ax), 0.38) * step(hg, 2.3 + sqrt(max(0.0, 0.1444 - ax * ax)) * 2.6);
          win = 0.0; door = 0.0; frame = 0.0; awning = 0.0; sill = 0.0;
        }
        // nothing that would poke above this piece of wall (gable tips)
        // only whole windows: the roof line (sloping under a gable) must clear both corners of the opening
        float lineH = h + roof;
        vec2 du = vec2(dFdx(u), dFdy(u));
        float slope = dot(vec2(dFdx(lineH), dFdy(lineH)), du) / max(dot(du, du), 1e-9);
        float reach = wh.x + 0.35;
        float lowest = lineH + min(slope * (-reach - m.x), slope * (reach - m.x));
        float show = inWall * near * step(id.y * fh + wc.y + wh.y + 0.3, lowest);
        win *= show; frame *= show; shutter *= show; door *= show; sill *= show; balcony *= show; awning *= show; flowers *= show;

        // --- colours ------------------------------------------------------------------------
        // glass: dark, with one lighter band of sky across the top
        vec2 g = (m - (wc - wh)) / (2.0 * wh);
        vec3 glass = mix(vec3(0.045, 0.07, 0.11), vec3(0.16, 0.25, 0.36), step(0.7, g.y));
        // curtains at the sides of some windows, thin glazing bars
        float curtain = fancy * step(0.5, hash3(vec3(id, sd + 5.0))) * (step(g.x, 0.17) + step(0.83, g.x));
        glass = mix(glass, vec3(0.62, 0.59, 0.52), curtain);
        float barV = 1.0 - smoothstep(0.02, 0.02 + aa.x, abs(m.x));
        float barH = 1.0 - smoothstep(0.02, 0.02 + aa.y, abs(m.y - (wc.y + wh.y * 0.4)));
        glass = mix(glass, trim, fancy * max(barV, kind == 5 ? 0.0 : barH));
        if (kind == 3 || kind == 6 || shop) glass = mix(glass, vec3(0.3, 0.32, 0.34), 1.0 - smoothstep(0.03, 0.03 + aa.x, abs(fract(m.x / 1.3 + 0.5) - 0.5) * 1.3));
        // closed shutters on a few windows
        float shut = (kind == 0 || kind == 2) && !ground ? step(0.9, hash3(vec3(id, sd + 7.0))) : 0.0;
        vec3 slats = shutterCol * (0.85 + 0.25 * step(0.5, fract(m.y / 0.11)));
        glass = mix(glass, slats, shut);
        vec3 c = wallCol;
        c = mix(c, kind == 2 ? wood * 0.75 : slats, shutter);
        vec3 frameCol = kind == 4 ? vec3(0.13, 0.08, 0.05) : kind == 1 || kind == 5 ? mix(wallCol, trim, 0.6) * 1.05 : trim;
        c = mix(c, frameCol, max(frame, sill));
        c = mix(c, glass, win);
        c = mix(c, mix(vec3(0.2, 0.12, 0.07), shutterCol, 0.4) * (0.85 + 0.3 * step(abs(m.x), 0.42) * step(0.25, m.y) * step(m.y, 1.9)), door);
        // balcony: railing bars in front of whatever is behind, a slab below
        vec3 rail = kind == 2 ? wood * 0.7 : kind == 3 ? vec3(0.5, 0.56, 0.62) : vec3(0.07, 0.075, 0.085);
        c = mix(c, mix(c * 0.85, rail, kind == 3 ? 0.7 : max(bars, step(0.92, m.y))), balcony);
        c = mix(c, rail * 0.8, balcony * step(m.y, 0.12));
        vec3 petal = hash3(vec3(floor(u / 0.18), id.y, sd)) < 0.5 ? vec3(0.7, 0.05, 0.08) : vec3(0.85, 0.3, 0.45);
        c = mix(c, mix(vec3(0.1, 0.27, 0.09), petal, step(0.45, hash3(vec3(floor(u / 0.09), id.y, 2.0)))), flowers);
        vec3 awn = wk < 0.7 ? vec3(0.55, 0.08, 0.07) : wk < 0.85 ? vec3(0.07, 0.22, 0.12) : vec3(0.7, 0.45, 0.1);
        c = mix(c, mix(awn, trim, step(0.5, fract(u / 0.5))), awning);
        c = mix(c, vec3(0.05, 0.04, 0.035), arch * near);
        diffuseColor.rgb = c;
        lit = step(hash3(vec3(id, vSeed)), ground ? 0.55 : 0.38) * win * (1.0 - shut) * uNight + arch * uNight * 0.5;
        }`,
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
        walls.wall.push(u, y - b.base, len, top - y);
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
