// Material-Bibliothek: Blender-Materialnamen -> PBR-Materialien mit CC0-Fototexturen (Poly Haven).
import * as THREE from 'three';

const BASE = `${import.meta.env.BASE_URL}tex/`;

// tex = Ordner in public/tex, tint = Farbton-Multiplikator, rough = Rauheits-Faktor
export const LIBRARY = {
  roof_red: { tex: 'roof_red', tint: 0xd8a088, rough: 1.0 },
  roof_clay: { tex: 'roof_clay', tint: 0xb07a68, rough: 1.0 },
  roof_dark: { tex: 'roof_clay', tint: 0x6e5a52, rough: 1.0 },
  roof_slate: { tex: 'roof_slate', tint: 0xb0b4b8, rough: 0.9 },
  wood_weathered: { tex: 'wood_weathered', tint: 0xc09070, rough: 1.0 },
  wood_deck: { tex: 'wood_deck', tint: 0x9a8270, rough: 1.0 },
  wood_dark: { tex: 'wood_dark', tint: 0x705040, rough: 1.0 },
  wood_rough: { tex: 'wood_rough', tint: 0x807060, rough: 1.0 },
  stone_wasserturm: { tex: 'stone_medieval', tint: 0xe0caa8, rough: 1.0 },
  sandstone_bern: { tex: 'sandstone', tint: 0xbcc4b8, rough: 1.0 },
  sandstone_detail: { tex: 'sandstone', tint: 0xd8d8c8, rough: 1.0 },
  sandstone_light: { tex: 'sandstone', tint: 0xd6d6c8, rough: 1.0 },
  sandstone_old: { tex: 'sandstone_old', tint: 0xb4aea4, rough: 1.0 },
  castle_wall: { tex: 'castle_wall', tint: 0xe0d8c8, rough: 1.0 },
  stone_wall: { tex: 'stone_wall', tint: 0xe8e0d0, rough: 1.0 },
  stone_tower: { tex: 'stone_tower', tint: 0xe0d8d0, rough: 1.0 },
  plaster_white: { tex: 'plaster_old', tint: 0xf4efe4, rough: 1.0 },
  plaster_warm: { tex: 'plaster', tint: 0xfff0d8, rough: 1.0 },
  plaster_old: { tex: 'plaster_old', tint: 0xd8d0c4, rough: 1.0 },
  rock: { tex: 'rock', tint: 0xb0aaa0, rough: 1.0 },
  granite: { tex: 'granite', tint: 0x9a9894, rough: 0.9 },
  copper: { tex: 'copper', tint: 0xb8e8d0, rough: 0.75, metal: 0.0, env: 1.2 },
  iron: { tex: 'iron', tint: 0x4a4a4c, rough: 0.8, metal: 0.6 },
  metal_roof: { tex: 'iron', tint: 0x707478, rough: 0.6, metal: 0.5 },
  cobble: { tex: 'cobble', tint: 0xb0aaa0, rough: 1.0 },
  concrete_board: { tex: 'concrete_board', tint: 0xfaffee, rough: 1.0 },
  asphalt: { tex: 'asphalt', tint: 0x9a9a9a, rough: 1.0 },
  glass: { color: 0x0b1016, rough: 0.06, metal: 0.85, env: 1.6 },
  glass_church: { color: 0x14202e, rough: 0.1, metal: 0.7, env: 1.3 },
  gold: { color: 0xc8a050, rough: 0.25, metal: 1.0, env: 1.4 },
  dark: { color: 0x0a0a0c, rough: 0.8 },
  frame_white: { color: 0xe8e4dc, rough: 0.6 },
  frame_green: { color: 0x2c4a34, rough: 0.6 },
  flowers_red: { color: 0xc01010, rough: 0.8, vary: true },
  flowers_pink: { color: 0xd04880, rough: 0.8 },
  leaves: { color: 0x2a5a1c, rough: 0.9 },
  flag_red: { color: 0xd01010, rough: 0.7 },
  flag_white: { color: 0xffffff, rough: 0.7 },
  solar: { color: 0x101830, rough: 0.15, metal: 0.6 },
  plastic_grey: { color: 0x8c9094, rough: 0.45 },
  plastic_dark: { color: 0x1c1d20, rough: 0.4 },
  led_red: { color: 0xff2010, rough: 0.5, emissive: 0xff2010 },
  led_green: { color: 0x20ff40, rough: 0.5, emissive: 0x20ff40 },
};

const loader = new THREE.TextureLoader();
const texCache = new Map();
const matCache = new Map();
let small = false;
let anisotropy = 4;

export function configureMaterials({ mobile, maxAnisotropy }) {
  small = !!mobile;
  anisotropy = Math.min(maxAnisotropy || 4, mobile ? 2 : 8);
}

function tex(set, map, srgb) {
  const url = `${BASE}${set}/${map}${small ? '_s' : ''}.jpg`;
  if (texCache.has(url)) return texCache.get(url);
  const t = loader.load(url);
  t.flipY = false; // wie glTF
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = anisotropy;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(url, t);
  return t;
}

export function getMaterial(key) {
  if (matCache.has(key)) return matCache.get(key);
  const d = LIBRARY[key];
  if (!d) return null;
  const m = new THREE.MeshStandardMaterial({
    color: d.tex ? d.tint ?? 0xffffff : d.color,
    roughness: d.rough ?? 0.9,
    metalness: d.metal ?? 0,
    envMapIntensity: d.env ?? 0.7,
  });
  if (d.emissive) { m.emissive.setHex(d.emissive); m.emissiveIntensity = 2; }
  if (d.tex) {
    m.map = tex(d.tex, 'diff', true);
    m.normalMap = tex(d.tex, 'nor', false);
    m.normalScale.set(1, 1);
    m.roughnessMap = tex(d.tex, 'rough', false);
  }
  m.name = key;
  matCache.set(key, m);
  return m;
}

// Alle Materialien eines geladenen Modells ersetzen (Name = Bibliotheksschlüssel)
export function applyLibrary(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const swap = (mm) => {
      const key = (mm?.name || '').replace(/\.\d+$/, '');
      return getMaterial(key) || mm;
    };
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
  });
}

// Texturen vorladen (für den Ladebildschirm)
export function preloadKeys(keys) {
  return Promise.all(keys.map((k) => {
    const m = getMaterial(k);
    const ts = m ? [m.map, m.normalMap, m.roughnessMap].filter(Boolean) : [];
    return Promise.all(ts.map((t) => (t.image ? null : new Promise((r) => { const i = setInterval(() => { if (t.image) { clearInterval(i); r(); } }, 50); setTimeout(() => { clearInterval(i); r(); }, 8000); }))));
  }));
}

export function getTexture(set, map, srgb = true) { return tex(set, map, srgb); }
