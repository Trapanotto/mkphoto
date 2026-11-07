// Vorberechnete Welt (in Blender aus swisstopo-Daten gebaut): Gelände in drei Ringen, Gebäude, Bäume.
// Wird EINMAL pro Level geladen – kein Streaming von geo.admin.ch mehr.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { dracoLoader, patchBuildingShader, setOrthoAtlas, setHideBoxes } from './geo.js';
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

    const texCache = new Map();
    const ortho = (name) => {
      if (!texCache.has(name)) {
        const t = texLoader.load(`${dir}tex/${name}${s}.jpg`);
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = this.quality.smallTex ? 2 : 8;
        t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
        texCache.set(name, t);
      }
      return texCache.get(name);
    };
    const terrainPart = async (file) => {
      const g = await loader.loadAsync(`${dir}${file}${s}.glb`);
      g.scene.traverse((o) => {
        if (!o.isMesh) return;
        const name = (o.material?.name || '').replace(/^ortho:/, '');
        o.material = new THREE.MeshStandardMaterial({ map: ortho(name), roughness: 1, metalness: 0 });
        o.receiveShadow = true;
        o.userData.isTerrain = true;
        o.geometry.computeBoundsTree();
      });
      this.terrain.group.add(g.scene);
      step();
    };

    const buildingsP = loader.loadAsync(`${dir}buildings${s}.glb`).then((g) => {
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
      step();
    }).catch((e) => { console.warn('Gebäude', e.message); step(); });

    await Promise.all([terrainPart('terrain_core'), terrainPart('terrain_mid'), terrainPart('terrain_far'), buildingsP,
      this.loadTrees(dir).then(step), this.buildAtlas(dir).then(step)]);
    this.root.updateMatrixWorld(true);
  }

  // Dach-Atlas aus den Kern-Luftbildern (für Gebäudedächer und Minikarte)
  async buildAtlas(dir) {
    const { core, chunk } = this.meta;
    const n = Math.round((2 * core) / chunk);
    const px = this.quality.smallTex ? 256 : 512;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = n * px;
    const g = canvas.getContext('2d');
    const jobs = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      jobs.push(new Promise((res) => {
        const img = new Image();
        img.onload = () => { g.drawImage(img, i * px, j * px, px, px); res(); };
        img.onerror = res;
        img.src = `${dir}tex/core_${i}_${j}_s.jpg`;
      }));
    }
    await Promise.all(jobs);
    setOrthoAtlas(canvas, -core, core, -core, core);
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
