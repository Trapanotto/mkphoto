// Vorberechnete Welt (in Blender aus swisstopo-Daten gebaut): Gelände in drei Ringen, Gebäude, Bäume.
// Wird EINMAL pro Level geladen – kein Streaming von geo.admin.ch mehr.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { dracoLoader, patchBuildingShader, patchTerrainShader, setTerrainSurface, setHideBoxes } from './geo.js';
import { toLV95 } from './lv95.js';
import { applyLibrary } from './materials.js';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const BASE = `${import.meta.env.BASE_URL}world/`;
const loader = new GLTFLoader().setDRACOLoader(dracoLoader);
const texLoader = new THREE.TextureLoader();

// Lokales System: x = Ost, y = Höhe ü. M. - H0, z = Süd (wie bisher)
export class WorldFrame {
  constructor(meta) { this.E0 = meta.E0; this.N0 = meta.N0; this.H0 = meta.H0; }
  toLocal(lat, lon, h = 0, target = new THREE.Vector3()) {
    const { E, N } = toLV95(lat, lon);
    return target.set(E - this.E0, h - this.H0, -(N - this.N0));
  }
}

// Normalen an Kachelrändern über alle Kacheln mitteln: jede Kachel kennt nur ihre eigenen Dreiecke,
// sonst entsteht entlang jeder Kachelgrenze ein Streifen mit falscher Schattierung (am Matterhorn als Linien sichtbar)
function stitchNormals(group) {
  const sum = new Map(), meshes = [];
  const key = (x, y, z) => `${Math.round(x * 20)},${Math.round(z * 20)}`;
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  group.updateMatrixWorld(true);
  group.traverse((o) => { if (o.isMesh && o.geometry.attributes.normal) meshes.push(o); });
  for (const o of meshes) {
    const P = o.geometry.attributes.position, N = o.geometry.attributes.normal, keys = new Array(P.count);
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld);
      const k = key(v.x, v.y, v.z); keys[i] = k;
      n.fromBufferAttribute(N, i);
      const e = sum.get(k);
      if (e) { e[0] += n.x; e[1] += n.y; e[2] += n.z; e[3]++; } else sum.set(k, [n.x, n.y, n.z, 1]);
    }
    o.userData.nkeys = keys;
  }
  for (const o of meshes) {
    const N = o.geometry.attributes.normal, keys = o.userData.nkeys;
    let ch = false;
    for (let i = 0; i < N.count; i++) {
      const e = sum.get(keys[i]);
      if (e[3] < 2) continue;
      n.set(e[0], e[1], e[2]).normalize();
      N.setXYZ(i, n.x, n.y, n.z); ch = true;
    }
    if (ch) N.needsUpdate = true;
    delete o.userData.nkeys;
  }
}

// Schürze an den Rändern der Geländekacheln: schliesst Haarrisse zwischen Kacheln (sonst helle Linien vom Himmel)
function addSkirt(geo, depth) {
  const pos = geo.attributes.position, nrm = geo.attributes.normal;
  if (!geo.index) return;
  const idx = geo.index.array, cnt = new Map();
  const k = (a, b) => (a < b ? a * 4194304 + b : b * 4194304 + a);
  for (let i = 0; i < idx.length; i += 3) for (const [a, b] of [[idx[i], idx[i + 1]], [idx[i + 1], idx[i + 2]], [idx[i + 2], idx[i]]]) {
    const key = k(a, b); const e = cnt.get(key);
    if (e) e[2]++; else cnt.set(key, [a, b, 1]);
  }
  const P = Array.from(pos.array), N = nrm ? Array.from(nrm.array) : null, I = Array.from(idx);
  let n = pos.count;
  for (const [a, b, c] of cnt.values()) {
    if (c !== 1) continue;
    const a2 = n++, b2 = n++;
    P.push(pos.getX(a), pos.getY(a) - depth, pos.getZ(a), pos.getX(b), pos.getY(b) - depth, pos.getZ(b));
    if (N) N.push(nrm.getX(a), nrm.getY(a), nrm.getZ(a), nrm.getX(b), nrm.getY(b), nrm.getZ(b));
    I.push(a, a2, b, b, a2, b2, a, b, a2, b, b2, a2);   // beidseitig
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  if (N) geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  for (const name of Object.keys(geo.attributes)) if (!['position', 'normal'].includes(name)) geo.deleteAttribute(name);
  geo.setIndex(I);
}

export class StaticWorld {
  constructor({ scene, level, quality }) {
    this.scene = scene;
    this.level = level;
    this.quality = quality;
    this.root = new THREE.Group();
    this.root.name = 'world';
    scene.add(this.root);
    this.terrain = { group: new THREE.Group() };
    this.buildings = { group: new THREE.Group() };
    this.trees = new THREE.Group();
    this.root.add(this.terrain.group, this.buildings.group, this.trees);
    this.progress = 0;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.firstHitOnly = true;
    setHideBoxes([]); // Gebäude an den Wahrzeichen wurden beim Bauen entfernt
  }

  async load(onProgress) {
    const id = this.level.id;
    const s = this.quality.smallTex ? '_s' : '';
    const dir = `${BASE}${id}/`;
    this.meta = await (await fetch(`${dir}world.json`)).json();
    this.frame = new WorldFrame(this.meta);
    let done = 0;
    const total = 6;
    const step = () => { done++; this.progress = done / total; onProgress?.(this.progress); };

    const terrainPart = async (file) => {
      const g = await loader.loadAsync(`${dir}${file}${s}.glb`);
      g.scene.traverse((o) => {
        if (!o.isMesh) return;
        addSkirt(o.geometry, 25);
        o.material = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
        o.material.onBeforeCompile = patchTerrainShader;
        o.material.customProgramCacheKey = () => 'mk-terrain';
        o.receiveShadow = true;
        o.userData.isTerrain = true;
        o.geometry.computeBoundsTree();
      });
      this.terrain.group.add(g.scene);
      step();
    };

    const loadB = (file) => loader.loadAsync(`${dir}${file}${s}.glb`).then((g) => {
      g.scene.traverse((o) => {
        if (!o.isMesh) return;
        const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
        const hasBid = !!o.geometry.attributes._batchid;
        const hasRel = !!o.geometry.attributes._relh;
        m.defines = {};
        if (hasBid) m.defines.HAS_BATCHID = '';
        if (hasRel) m.defines.HAS_RELH = '';
        m.onBeforeCompile = patchBuildingShader;
        m.customProgramCacheKey = () => 'mk-building-static' + (hasBid ? 'b' : '') + (hasRel ? 'r' : '');
        o.material = m;
        o.castShadow = !!this.quality.buildingShadows;
        o.receiveShadow = true;
        o.userData.isBuilding = true;
        o.geometry.computeBoundsTree();
      });
      this.buildings.group.add(g.scene);
    }).catch((e) => console.warn('Gebäude', file, e.message));
    // Kern: swissBUILDINGS3D; Mittelring: aus Grundrissen der Basiskarte (tools/bake/midbuildings.mjs)
    const buildingsP = Promise.all([loadB('buildings'), this.quality.smallTex && !this.quality.shadows ? null : loadB('buildings_mid')]).then(step);

    await Promise.all([terrainPart('terrain_core'), terrainPart('terrain_mid'), terrainPart('terrain_far'), buildingsP,
      this.loadTrees(dir).then(step), setTerrainSurface(dir, this.meta, !!this.quality.smallTex, !!this.level.water).then(() => this.buildAtlas(dir)).then(step)]);
    this.root.updateMatrixWorld(true);
    stitchNormals(this.terrain.group);
    if (!this.quality.smallTex) await this.loadForestRing(dir).catch((e) => console.warn('Wald', e.message));
  }

  // Wald im Mittelring (ausserhalb der Einzelbaum-Daten): einfache instanzierte Nadel- und Laubbäume
  async loadForestRing(dir) {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = `${dir}surf_mid_nat_s.png`; });
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    const D = g.getImageData(0, 0, c.width, c.height).data, W = c.width;
    const { core, mid } = this.meta, R = Math.min(mid, 3200), sp = 13;
    const pts = [];
    let seed = 99; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let z = -R; z < R; z += sp) for (let x = -R; x < R; x += sp) {
      if (Math.max(Math.abs(x), Math.abs(z)) < core - 30) continue;
      const jx = x + (rnd() - 0.5) * sp, jz = z + (rnd() - 0.5) * sp;
      const u = (jx + mid) / (2 * mid), v = (jz + mid) / (2 * mid);
      const px = Math.floor(u * W), py = Math.floor(v * W);
      if (px < 0 || py < 0 || px >= W || py >= W) continue;
      if (D[(py * W + px) * 4] < 140 || D[(py * W + px) * 4 + 1] > 60) continue;   // Wald, kein Wasser
      const y = this.groundHeight(jx, jz);
      if (y === null) continue;
      pts.push([jx, y, jz, rnd()]);
    }
    if (!pts.length) return;
    const conifer = new THREE.ConeGeometry(0.32, 0.8, 7).translate(0, 0.6, 0);
    const trunk = new THREE.CylinderGeometry(0.03, 0.04, 0.25, 5).translate(0, 0.12, 0);
    const broad = new THREE.IcosahedronGeometry(0.34, 1).scale(1, 0.9, 1).translate(0, 0.62, 0);
    const mk = (geo, color) => new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading: true }), pts.length);
    const mc = mk(conifer, 0xffffff), mb = mk(broad, 0xffffff), mt = mk(trunk, 0x3b2a1e);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), far = new THREE.Vector3(0, -1e5, 0);
    const cc = new THREE.Color(), cb = new THREE.Color();
    pts.forEach(([x, y, z, r], i) => {
      const h = 16 + r * 14, isC = r < 0.62;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r * 40);
      sc.set(h * (0.85 + 0.3 * ((r * 7) % 1)), h, h * (0.85 + 0.3 * ((r * 13) % 1)));
      p.set(x, y - 0.5, z);
      m.compose(p, q, sc);
      mt.setMatrixAt(i, m);
      mc.setMatrixAt(i, isC ? m : m.clone().setPosition(far));
      mb.setMatrixAt(i, isC ? m.clone().setPosition(far) : m);
      cc.setHSL(0.36 + r * 0.04, 0.4, 0.07 + ((r * 17) % 1) * 0.03);
      cb.setHSL(0.25 + ((r * 11) % 1) * 0.05, 0.42, 0.09 + ((r * 5) % 1) * 0.04);
      mc.setColorAt(i, cc); mb.setColorAt(i, cb);
    });
    for (const x of [mc, mb, mt]) { x.receiveShadow = true; x.computeBoundingSphere(); this.trees.add(x); }
  }

  // Kartenbild für die Minikarte aus den Oberflächenkarten (kein Luftbild)
  async buildAtlas(dir) {
    const { core } = this.meta;
    const ld = (f) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = `${dir}${f}_s.png`; });
    const [r, n, e] = await Promise.all(['surf_core_roads', 'surf_core_nat', 'surf_core_ext'].map(ld));
    if (!r || !n || !e) return;
    const S = r.width;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = S;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    const px = (img) => { g.drawImage(img, 0, 0); return g.getImageData(0, 0, S, S).data; };
    const R = px(r), N = px(n), E = px(e);
    const out = g.createImageData(S, S), o = out.data;
    const mix = (c, d, t) => [c[0] + (d[0] - c[0]) * t, c[1] + (d[1] - c[1]) * t, c[2] + (d[2] - c[2]) * t];
    for (let i = 0; i < S * S * 4; i += 4) {
      let c = [168, 190, 132];
      c = mix(c, [205, 200, 186], E[i + 1] / 255 * 0.5);
      c = mix(c, [96, 136, 86], N[i] / 255);
      c = mix(c, [236, 240, 244], N[i + 2] / 255);
      c = mix(c, [120, 170, 200], N[i + 1] / 255);
      c = mix(c, [214, 200, 168], R[i + 2] / 255);
      c = mix(c, [226, 222, 214], Math.max(R[i + 1], E[i]) / 255);
      c = mix(c, [255, 255, 255], R[i] / 255);
      c = mix(c, [178, 120, 98], E[i + 2] / 255);
      o[i] = c[0]; o[i + 1] = c[1]; o[i + 2] = c[2]; o[i + 3] = 255;
    }
    g.putImageData(out, 0, 0);
    this.atlas = { canvas, west: -core, east: core, north: -core, south: core };
  }

  async loadTrees(dir) {
    if (!this.quality.trees) return;
    const [data, g] = await Promise.all([
      fetch(`${dir}trees.json`).then((r) => r.json()),
      loader.loadAsync(`${import.meta.env.BASE_URL}models/baeume.glb`),
    ]);
    applyLibrary(g.scene);
    const H0 = this.meta.H0;
    const lim = this.quality.treeRadius;
    const kinds = { 1: 'Nadelbaum', 3: 'Laubbaum' };
    const groups = {};
    for (const t of data) {
      if (Math.abs(t[0]) > lim || Math.abs(t[2]) > lim) continue;
      const kind = kinds[t[4]] || 'Laubbaum';
      (groups[kind] ||= []).push(t);
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const col = new THREE.Color();
    for (const [kind, list] of Object.entries(groups)) {
      const src = g.scene.getObjectByName(kind);
      if (!src) continue;
      const meshes = [];
      src.traverse((o) => { if (o.isMesh) meshes.push(o); });
      for (const mesh of meshes) {
        const inst = new THREE.InstancedMesh(mesh.geometry, mesh.material, list.length);
        inst.castShadow = !!this.quality.treeShadows;
        inst.receiveShadow = true;
        let seed = 1;
        const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        list.forEach((t, i) => {
          const h = Math.max(3, t[3]);
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI * 2);
          sc.set(h * (0.85 + rnd() * 0.3), h, h * (0.85 + rnd() * 0.3));
          p.set(t[0], t[1] - H0 - 0.2, t[2]);
          m4.compose(p, q, sc);
          inst.setMatrixAt(i, m4);
          const v = 0.8 + rnd() * 0.35;
          inst.setColorAt(i, col.setRGB(v, v * (0.95 + rnd() * 0.1), v * 0.9));
        });
        inst.instanceMatrix.needsUpdate = true;
        inst.computeBoundingSphere();
        inst.userData.isTree = true;
        this.trees.add(inst);
      }
    }
  }

  get loadProgress() { return this.progress; }
  update() {}

  groundHeight(x, z, includeBuildings = false, extra = []) {
    const r = this.raycaster;
    r.set(new THREE.Vector3(x, 9000, z), new THREE.Vector3(0, -1, 0));
    r.far = 20000;
    const targets = [this.terrain.group];
    if (includeBuildings) targets.push(this.buildings.group);
    for (const e of extra) targets.push(e);
    const hits = r.intersectObjects(targets, true);
    return hits.length ? hits[0].point.y : null;
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.isMesh) { o.geometry.disposeBoundsTree?.(); o.geometry.dispose(); o.material?.map?.dispose?.(); }
    });
    this.scene.remove(this.root);
  }
}
