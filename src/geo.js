// Geodaten von swisstopo (geo.admin.ch), gestreamt über 3d-tiles-renderer.
// Lokales Koordinatensystem pro Level: x = Ost, y = oben, -z = Nord (Meter).
import * as THREE from 'three';
import { TilesRenderer, WGS84_ELLIPSOID } from '3d-tiles-renderer';
import {
  QuantizedMeshPlugin,
  ImageOverlayPlugin,
  XYZTilesOverlay,
  TilesFadePlugin,
  GLTFExtensionsPlugin,
} from '3d-tiles-renderer/plugins';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

export const dracoLoader = new DRACOLoader().setDecoderPath(`${import.meta.env.BASE_URL}draco/`);

export const SWISSTOPO = {
  terrain: 'https://3d.geo.admin.ch/ch.swisstopo.terrain.3d/v1/',
  buildings: 'https://3d.geo.admin.ch/ch.swisstopo.swissbuildings3d.3d/v1/tileset.json',
  vegetation: 'https://3d.geo.admin.ch/ch.swisstopo.vegetation.3d/v1/tileset.json',
  swissimage: 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg',
};

const DEG = Math.PI / 180;

const swissimage = () => new XYZTilesOverlay({ url: SWISSTOPO.swissimage, levels: 20, projection: 'EPSG:3857' });

export class GeoFrame {
  // lat/lon in Grad, h = Höhe des Ursprungs
  constructor(lat, lon, h) {
    this.lat = lat; this.lon = lon; this.h = h;
    const enu = new THREE.Matrix4();
    WGS84_ELLIPSOID.getEastNorthUpFrame(lat * DEG, lon * DEG, h, enu);
    const toEnu = enu.clone().invert();
    // ENU (x Ost, y Nord, z oben) -> three (x Ost, y oben, z Süd)
    const rot = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
    this.ecefToLocal = rot.multiply(toEnu);
    this.localToEcef = this.ecefToLocal.clone().invert();
  }
  toLocal(latDeg, lonDeg, h = 0, target = new THREE.Vector3()) {
    WGS84_ELLIPSOID.getCartographicToPosition(latDeg * DEG, lonDeg * DEG, h, target);
    return target.applyMatrix4(this.ecefToLocal);
  }
  toLatLon(v) {
    const p = v.clone().applyMatrix4(this.localToEcef);
    const res = {};
    WGS84_ELLIPSOID.getPositionToCartographic(p, res);
    return { lat: res.lat / DEG, lon: res.lon / DEG, h: res.height };
  }
  applyTo(object) {
    this.ecefToLocal.decompose(object.position, object.quaternion, object.scale);
    object.updateMatrixWorld(true);
  }
}

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

export async function buildOrthoAtlas(frame, radius, zoom, onProgress) {
  ortho.on.value = 0;
  const n = 2 ** zoom;
  const lat = frame.lat, lon = frame.lon;
  const dLat = radius / 111320, dLon = radius / (111320 * Math.cos(lat * DEG));
  const tx = (lo) => Math.floor(((lo + 180) / 360) * n);
  const ty = (la) => Math.floor(((1 - Math.log(Math.tan(la * DEG) + 1 / Math.cos(la * DEG)) / Math.PI) / 2) * n);
  const x0 = tx(lon - dLon), x1 = tx(lon + dLon), y0 = ty(lat + dLat), y1 = ty(lat - dLat);
  const cols = x1 - x0 + 1, rows = y1 - y0 + 1;
  const canvas = document.createElement('canvas');
  canvas.width = cols * 256; canvas.height = rows * 256;
  const g = canvas.getContext('2d');
  g.fillStyle = '#7a6a60'; g.fillRect(0, 0, canvas.width, canvas.height);
  let done = 0;
  const jobs = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const url = SWISSTOPO.swissimage.replace('{z}', zoom).replace('{x}', x).replace('{y}', y);
    jobs.push(new Promise((res) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => { g.drawImage(img, (x - x0) * 256, (y - y0) * 256); done++; onProgress?.(done / jobs.length); res(); };
      img.onerror = () => { done++; res(); };
      img.src = url;
    }));
  }
  await Promise.all(jobs);
  const tileLon = (x) => (x / n) * 360 - 180;
  const tileLat = (y) => Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) / DEG;
  const west = frame.toLocal(lat, tileLon(x0), frame.h).x;
  const east = frame.toLocal(lat, tileLon(x1 + 1), frame.h).x;
  const north = frame.toLocal(tileLat(y0), lon, frame.h).z;
  const south = frame.toLocal(tileLat(y1 + 1), lon, frame.h).z;
  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  ortho.tex.value?.dispose?.();
  ortho.tex.value = tex;
  ortho.rect.value.set(west, north, 1 / (east - west), 1 / (south - north));
  ortho.on.value = 1;
  return { canvas, west, east, north, south };
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

function patchBuildingShader(shader) {
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
        wall *= 0.55 + 0.6 * plasterT;
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

// Ersetzt die Materialien der Gebäude-Kacheln, bevor das Overlay-Plugin sie erweitert.
class BuildingStylePlugin {
  constructor(castShadow = false) { this.name = 'BUILDING_STYLE'; this.priority = -20; this.castShadow = castShadow; }
  processTileModel(scene) {
    scene.traverse((o) => {
      if (!o.isMesh) return;
      const old = o.material;
      const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
      m.onBeforeCompile = patchBuildingShader;
      m.customProgramCacheKey = () => 'mk-building' + (o.geometry.attributes._batchid ? 'b' : '');
      if (o.geometry.attributes._batchid) m.defines = { HAS_BATCHID: '' };
      o.material = m;
      old?.dispose?.();
      o.receiveShadow = true;
      o.castShadow = this.castShadow;
      o.userData.isBuilding = true;
    });
  }
}

// Unterdrückt Kacheln ausserhalb einer Kugel; innerhalb entscheidet die normale Kamera-Logik.
class RadiusLimitPlugin {
  constructor(sphere) { this.name = 'RADIUS_LIMIT'; this.sphere = sphere; }
  calculateTileViewError(tile, target) {
    const bv = tile.engineData?.boundingVolume;
    if (!bv || bv.intersectsSphere(this.sphere)) return false;
    target.inView = false;
    target.error = 0;
    target.distance = Infinity;
    return true;
  }
}

export class GeoWorld {
  constructor({ scene, camera, renderer, level, quality }) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.level = level;
    this.frame = new GeoFrame(level.lat, level.lon, level.h);
    this.root = new THREE.Group();
    this.root.name = 'geo';
    scene.add(this.root);
    setHideBoxes([]);

    // Gelände: swissALTI3D (quantized-mesh) + SWISSIMAGE
    const terrain = new TilesRenderer(SWISSTOPO.terrain);
    terrain.registerPlugin(new QuantizedMeshPlugin({ useRecommendedSettings: true }));
    terrain.registerPlugin(new ImageOverlayPlugin({ overlays: [swissimage()], resolution: quality.overlayRes }));
    terrain.registerPlugin(new TilesFadePlugin());
    terrain.errorTarget = quality.terrainError;
    terrain.setCamera(camera);
    terrain.setResolutionFromRenderer(camera, renderer);
    terrain.addEventListener('load-model', ({ scene: s }) => {
      s.traverse((o) => {
        if (o.isMesh) {
          o.receiveShadow = true;
          o.userData.isTerrain = true;
          if (o.material) { o.material.roughness = 0.95; o.material.metalness = 0; }
        }
      });
    });
    this.frame.applyTo(terrain.group);
    this.root.add(terrain.group);
    this.terrain = terrain;

    // Gebäude: swissBUILDINGS3D (Draco-komprimiert), Dächer mit Luftbild
    if (quality.buildings) {
      const buildings = new TilesRenderer(SWISSTOPO.buildings);
      buildings.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader, autoDispose: false }));
      buildings.registerPlugin(new BuildingStylePlugin(!!quality.buildingShadows));
      const center = new THREE.Vector3(0, 0, 0).applyMatrix4(this.frame.localToEcef);
      buildings.registerPlugin(new RadiusLimitPlugin(new THREE.Sphere(center, quality.buildingRadius || 2500)));
      buildings.registerPlugin(new TilesFadePlugin());
      buildings.errorTarget = quality.buildingError;
      buildings.setCamera(camera);
      buildings.setResolutionFromRenderer(camera, renderer);
      this.frame.applyTo(buildings.group);
      this.root.add(buildings.group);
      this.buildings = buildings;
    }

    // Vegetation: swisstopo-Bäume (instanzierte 3D-Modelle, i3dm)
    if (quality.trees) {
      const veg = new TilesRenderer(SWISSTOPO.vegetation);
      veg.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader, autoDispose: false }));
      const center = new THREE.Vector3(0, 0, 0).applyMatrix4(this.frame.localToEcef);
      veg.registerPlugin(new RadiusLimitPlugin(new THREE.Sphere(center, quality.treeRadius)));
      veg.registerPlugin(new TilesFadePlugin());
      veg.errorTarget = quality.treeError;
      veg.setCamera(camera);
      veg.setResolutionFromRenderer(camera, renderer);
      veg.addEventListener('load-model', ({ scene: s }) => {
        s.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = !!quality.treeShadows;
          o.receiveShadow = true;
          o.userData.isTree = true;
          const m = o.material;
          if (m) {
            m.roughness = 0.95; m.metalness = 0;
            if (m.map) m.alphaTest = 0.4;
            m.onBeforeCompile = patchHideShader;
            m.customProgramCacheKey = () => 'mk-tree';
            m.needsUpdate = true;
          }
        });
      });
      this.frame.applyTo(veg.group);
      this.root.add(veg.group);
      this.vegetation = veg;
    }

    this.raycaster = new THREE.Raycaster();
    this.raycaster.firstHitOnly = true;
  }

  update() {
    this.camera.updateMatrixWorld();
    this.terrain.setResolutionFromRenderer(this.camera, this.renderer);
    this.terrain.update();
    for (const t of [this.buildings, this.vegetation]) {
      if (!t) continue;
      t.setResolutionFromRenderer(this.camera, this.renderer);
      t.update();
    }
  }

  get loadProgress() {
    const a = this.terrain.loadProgress;
    const b = this.buildings ? this.buildings.loadProgress : 1;
    const c = this.vegetation ? this.vegetation.loadProgress : 1;
    return (a + b + c) / 3;
  }

  // Höhe des Geländes (und optional Gebäude/Objekte) unter einem Punkt
  groundHeight(x, z, includeBuildings = false, extra = []) {
    const r = this.raycaster;
    r.set(new THREE.Vector3(x, 9000, z), new THREE.Vector3(0, -1, 0));
    r.far = 20000;
    const targets = [this.terrain.group];
    if (includeBuildings && this.buildings) targets.push(this.buildings.group);
    for (const e of extra) targets.push(e);
    const hits = r.intersectObjects(targets, true);
    return hits.length ? hits[0].point.y : null;
  }

  dispose() {
    this.terrain.dispose();
    if (this.buildings) this.buildings.dispose();
    if (this.vegetation) this.vegetation.dispose();
    this.scene.remove(this.root);
  }
}
