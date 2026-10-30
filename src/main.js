import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { N8AOPass } from 'n8ao';
import { GeoWorld, dracoLoader, setHideBoxes, buildOrthoAtlas, firstRealHit, setFacadeTextures, setFacadeStyle } from './geo.js';
import { Drone, MODE_ORDER } from './drone.js';
import { Input } from './input.js';
import { LEVELS, TIMES } from './levels.js';
import { evaluate, grabImage, samplePoints, starsFor, CRITERIA } from './photo.js';
import { Sound } from './sound.js';
import { configureMaterials, applyLibrary, getTexture } from './materials.js';
import { t, tx, setLang, getLang, detectLang, applyI18n, LANGS } from './i18n.js';
import { MissionHelp, idealShot, refineShot } from './help.js';
import { Minimap } from './minimap.js';
import { Tutorial } from './tutorial.js';
import { submitScore, topScores, online as lbOnline } from './leaderboard.js';

const $ = (s) => document.querySelector(s);
const DEG = Math.PI / 180;
const BATTERY_S = 360;
const MAX_SHOTS = 24;

function nextFrame(fn) {
  let done = false;
  const run = () => { if (!done) { done = true; fn(); } };
  requestAnimationFrame(run);
  setTimeout(run, 120);
}

// ---------- Einstellungen & Qualitätsstufen ----------
const isMobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
const SETTINGS_KEY = 'mkphoto.settings.v1';
const settings = Object.assign(
  { quality: isMobile ? 'medium' : 'high', lang: detectLang(), name: '', wind: true, help: true },
  (() => { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { return {}; } })(),
);
function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* privat */ } }
setLang(settings.lang);

const PRESETS = {
  low: { pixelRatio: 1, antialias: false, overlayRes: 256, terrainError: 10, buildings: true, buildingError: 14, buildingRadius: 1200,
    trees: true, treeRadius: 450, treeError: 24, atlasZoom: 16, atlasRadius: 800, shadows: false, ao: false, water: 'simple', smallTex: true, pip: false },
  medium: { pixelRatio: 1.25, antialias: true, overlayRes: 256, terrainError: 6, buildings: true, buildingError: 9, buildingRadius: 1800,
    trees: true, treeRadius: 800, treeError: 14, atlasZoom: 16, atlasRadius: 1000, shadows: 'focus', shadowSize: 1024, ao: false, water: 'simple', smallTex: true, pip: true },
  high: { pixelRatio: 1.5, antialias: true, overlayRes: 512, terrainError: 2, buildings: true, buildingError: 4, buildingRadius: 2500,
    trees: true, treeRadius: 1600, treeError: 6, treeShadows: true, buildingShadows: true, atlasZoom: 17, atlasRadius: 1100,
    shadows: 'follow', shadowSize: 4096, ao: true, water: 'reflect', smallTex: false, pip: true },
};
const quality = { ...(PRESETS[settings.quality] || PRESETS.medium) };
quality.pixelRatio = Math.min(devicePixelRatio, quality.pixelRatio);

// ---------- Renderer / Szene ----------
const canvas = $('#view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality.antialias, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(quality.pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.6;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = !!quality.shadows;
renderer.shadowMap.type = THREE.PCFShadowMap;
configureMaterials({ mobile: quality.smallTex, maxAnisotropy: renderer.capabilities.getMaxAnisotropy() });
setFacadeTextures({ plaster: getTexture('plaster_old', 'diff'), roof: getTexture('roof_clay', 'diff'), sand: getTexture('sandstone', 'diff') });

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.5, 120000);   // Drohnenkamera
const chaseCam = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.3, 120000); // 3rd Person
scene.add(camera, chaseCam);

const sky = new Sky();
sky.scale.setScalar(200000);
scene.add(sky);
const skyU = sky.material.uniforms;

const sunLight = new THREE.DirectionalLight(0xffffff, 2.2);
sunLight.castShadow = !!quality.shadows;
if (quality.shadows) {
  sunLight.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
  const r = quality.shadows === 'follow' ? 320 : 200;
  Object.assign(sunLight.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 3000 });
  sunLight.shadow.bias = -0.0004;
  sunLight.shadow.normalBias = 0.06;
}
scene.add(sunLight, sunLight.target);
const hemi = new THREE.HemisphereLight(0xc8d8f0, 0x6a5e50, 0.6);
scene.add(hemi);
scene.fog = new THREE.FogExp2(0xb8c8d8, 0.00004);

// Nachbearbeitung: weiche Schatten in Ecken (N8AO) auf "Hoch"
let composer = null, aoPass = null;
if (quality.ao) {
  composer = new EffectComposer(renderer);
  aoPass = new N8AOPass(scene, camera, innerWidth, innerHeight);
  aoPass.configuration.aoRadius = 4.0;
  aoPass.configuration.distanceFalloff = 1.0;
  aoPass.configuration.intensity = 2.2;
  aoPass.configuration.gammaCorrection = false;
  aoPass.setQualityMode('Medium');
  composer.addPass(aoPass);
  composer.addPass(new OutputPass());
}
function render(cam) {
  if (composer) { aoPass.camera = cam; composer.render(); } else renderer.render(scene, cam);
}

const pmrem = new THREE.PMREMGenerator(renderer);
const sunDir = new THREE.Vector3();
let sunAz = 180;

function setSun(az, el) {
  sunAz = az;
  sunDir.set(Math.sin(az * DEG) * Math.cos(el * DEG), Math.sin(el * DEG), -Math.cos(az * DEG) * Math.cos(el * DEG)).normalize();
  const low = THREE.MathUtils.clamp(1 - (el - 5) / 30, 0, 1); // 1 = tiefe Sonne
  skyU.turbidity.value = 3 + low * 5;
  skyU.rayleigh.value = 1.2 + low * 1.6;
  skyU.mieCoefficient.value = 0.004 + low * 0.004;
  skyU.mieDirectionalG.value = 0.8;
  skyU.sunPosition.value.copy(sunDir);
  const envScene = new THREE.Scene();
  const s2 = new Sky(); s2.scale.setScalar(1000);
  for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) s2.material.uniforms[k].value = skyU[k].value;
  s2.material.uniforms.sunPosition.value.copy(sunDir);
  envScene.add(s2);
  if (scene.environment) scene.environment.dispose();
  scene.environment = pmrem.fromScene(envScene).texture;
  scene.environmentIntensity = 0.14;
  sunLight.color.setRGB(1, 0.92 - 0.3 * low, 0.85 - 0.5 * low);
  sunLight.intensity = 1.6 + 1.0 * Math.sin(Math.max(el, 3) * DEG);
  hemi.intensity = 0.45 + 0.25 * (1 - low);
  hemi.color.setRGB(0.78 + 0.1 * low, 0.85 - 0.05 * low, 0.95 - 0.2 * low);
  scene.fog.color.setRGB(0.70 + 0.15 * low, 0.74, 0.80 - 0.15 * low);
  renderer.toneMappingExposure = 0.58 + 0.08 * low;
  if (game?.water?.material.uniforms?.sunDirection) game.water.material.uniforms.sunDirection.value.copy(sunDir);
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  composer?.setSize(innerWidth, innerHeight);
  for (const c of [camera, chaseCam]) { c.aspect = innerWidth / innerHeight; c.updateProjectionMatrix(); }
});

// ---------- Speicher ----------
const SAVE_KEY = 'mkphoto.v1';
const save = (() => { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { return {}; } })();
save.best ??= {};
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* voll/privat */ } }

// ---------- UI ----------
applyI18n();
$('#title').style.backgroundImage = `url(${import.meta.env.BASE_URL}previews/matterhorn.jpg)`;
function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
}
document.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => {
  const to = b.dataset.goto;
  if (to === 'levels') renderLevels();
  show(to);
}));
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('.screen').classList.remove('active')));
$('#btnPlay').addEventListener('click', () => { sound.unlock(); renderLevels(); show('levels'); });
$('#btnHelp').addEventListener('click', () => $('#help').classList.add('active'));
$('#btnSchool').addEventListener('click', () => { sound.unlock(); currentLevel = LEVELS[0]; currentTod = 'noon'; startLevel(LEVELS[0], { tutorial: true }); });

const starStr = (n, max = 3) => '★'.repeat(n) + '☆'.repeat(max - n);
const levelStars = (level) => level.missions.reduce((s, m) => s + starsFor(save.best[m.id]?.score || 0), 0);

function renderLevels() {
  const grid = $('#levelGrid');
  grid.innerHTML = '';
  let total = 0, max = 0;
  for (const lv of LEVELS) {
    const st = levelStars(lv);
    total += st; max += lv.missions.length * 3;
    const thumb = lv.missions.map((m) => save.best[m.id]).filter(Boolean).sort((a, b) => b.score - a.score)[0]?.thumb;
    const card = document.createElement('button');
    card.className = 'card';
    card.innerHTML = `<img src="${thumb || `previews/${lv.id}.jpg`}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'ph'}))">
      <div class="st">${st}/${lv.missions.length * 3} ★</div>
      <div class="meta"><b>${tx(lv.name)}</b><span>${lv.place}</span></div>`;
    card.addEventListener('click', () => openBriefing(lv));
    grid.appendChild(card);
  }
  $('#totalStars').textContent = `${total}/${max} ★`;
}

function missionListHTML(level, current = null) {
  return level.missions.map((m) => {
    const best = save.best[m.id]?.score;
    const now = current?.[m.id]?.result.total;
    const tag = now != null ? `<span class="best">${now} · ${starStr(starsFor(now))}</span>` : best != null ? `<span class="best">${starStr(starsFor(best))}</span>` : '';
    return `<li>${tag}<b>${tx(m.title)}</b><span class="d">${tx(m.desc)}</span></li>`;
  }).join('');
}

let currentLevel = null;
let currentTod = 'noon';
function openBriefing(level) {
  currentLevel = level;
  currentTod = level.tod || 'noon';
  $('#briefTitle').textContent = tx(level.name);
  $('#briefPlace').textContent = `${level.place} · ${t('missionsN', { n: level.missions.length })}`;
  $('#briefMissions').innerHTML = missionListHTML(level);
  updateTod();
  show('briefing');
}
function updateTod() { document.querySelectorAll('#todSeg button').forEach((b) => b.classList.toggle('on', b.dataset.tod === currentTod)); }
document.querySelectorAll('#todSeg button').forEach((b) => b.addEventListener('click', () => { currentTod = b.dataset.tod; updateTod(); }));
$('#btnStart').addEventListener('click', () => startLevel(currentLevel));

// Einstellungen
const setLangSel = $('#setLang');
for (const [k, v] of Object.entries(LANGS)) setLangSel.insertAdjacentHTML('beforeend', `<option value="${k}">${v}</option>`);
$('#btnSettings').addEventListener('click', () => {
  setLangSel.value = getLang();
  $('#setQuality').value = settings.quality;
  $('#setName').value = settings.name;
  $('#setWind').checked = settings.wind;
  $('#setHelp').checked = settings.help;
  $('#setNote').textContent = '';
  $('#settings').classList.add('active');
});
$('#setSave').addEventListener('click', () => {
  const q = $('#setQuality').value;
  const qChanged = q !== settings.quality;
  Object.assign(settings, { lang: setLangSel.value, quality: q, name: $('#setName').value.trim(), wind: $('#setWind').checked, help: $('#setHelp').checked });
  saveSettings();
  setLang(settings.lang);
  applyI18n();
  if (qChanged) { location.reload(); return; }
  $('#settings').classList.remove('active');
});

// Bestenliste
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
$('#btnBoard').addEventListener('click', async () => {
  $('#board').classList.add('active');
  $('#boardMode').textContent = lbOnline ? t('lbOnline') : t('lbLocal');
  const list = $('#boardList');
  list.innerHTML = '';
  for (const lv of LEVELS) {
    for (const m of lv.missions) {
      const { rows } = await topScores(lv.id, m.id);
      const el = document.createElement('div');
      el.className = 'lb';
      el.innerHTML = `<b>${tx(lv.name)} · ${tx(m.title)}</b>` + (rows.length
        ? `<ol>${rows.slice(0, 5).map((r) => `<li>${escapeHtml(r.name || 'Pilot')} <span>${r.score}</span></li>`).join('')}</ol>`
        : `<p class="muted">${t('lbEmpty')}</p>`);
      list.appendChild(el);
    }
  }
});

// PWA
let installEvt = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; $('#btnInstall').classList.remove('hidden'); });
$('#btnInstall').addEventListener('click', () => { installEvt?.prompt(); $('#btnInstall').classList.add('hidden'); });
if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

// ---------- Spielzustand ----------
const input = new Input(canvas, $('#touch'));
const drone = new Drone(camera);
const sound = new Sound();
const loader = new GLTFLoader().setDRACOLoader(dracoLoader);
const minimap = new Minimap($('#minimap'));
const tutorial = new Tutorial($('#tutorial'), () => { save.tutorialDone = true; persist(); });

// Drohnenmodell (3rd Person)
let droneModel = null;
loader.loadAsync('models/drohne.glb').then((g) => {
  droneModel = g.scene;
  applyLibrary(droneModel);
  droneModel.scale.setScalar(2.2); // gut sichtbar
  droneModel.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  droneModel.userData.props = [0, 1, 2, 3].map((i) => droneModel.getObjectByName(`Prop${i}`)).filter(Boolean);
  droneModel.visible = false;
  scene.add(droneModel);
}).catch(() => {});

let game = null;
let mode = 'menu';
let thirdPerson = false;

function applyTouchMode() {
  document.body.classList.toggle('touch-mode', input.isTouch);
  $('#touch').classList.toggle('hidden', !(input.isTouch && mode === 'fly'));
}
input.on('modechange', applyTouchMode);

async function startLevel(level, opts = {}) {
  mode = 'loading';
  show('loading');
  $('#hud').classList.remove('active');
  input.enabled = false;
  $('#loadBar').style.width = '0%';
  $('#loadText').textContent = t('loadingGeo');
  if (game) disposeGame();

  const tod = TIMES[currentTod] || TIMES.noon;
  setFacadeStyle(level.facade);
  const world = new GeoWorld({ scene, camera, renderer, level, quality });
  const frame = world.frame;
  drone.wind.set(level.wind[0], 0, level.wind[1]);
  drone.windEnabled = settings.wind;
  drone.setMode('normal');

  const spawn = frame.toLocal(level.spawn.lat, level.spawn.lon, level.h);
  spawn.y = 60;
  drone.reset(spawn, level.spawn.heading, -8);
  drone.applyCamera();

  game = {
    level, world, frame,
    models: new THREE.Group(),
    subjects: new Map(),
    noFly: [], photos: [], results: {},
    battery: BATTERY_S, missionIdx: 0,
    home: spawn.clone(), water: null, t: 0,
    help: new MissionHelp(scene),
    landmarkPts: [],
    tutorial: !!opts.tutorial || !save.tutorialDone,
  };
  game.help.enabled = settings.help;
  scene.add(game.models);
  setSun(tod.az, tod.el);

  const atlasPromise = buildOrthoAtlas(frame, quality.atlasRadius, quality.atlasZoom).then((a) => minimap.setAtlas(a)).catch((e) => console.warn('Atlas', e));
  const modelPromises = level.landmarks.map((lm) => loader.loadAsync(lm.model).then((g) => ({ lm, g })).catch((e) => {
    console.warn('Modell fehlt:', lm.model, e.message);
    return { lm, g: null };
  }));

  // Auf Gelände warten
  const t0 = performance.now();
  let stable = 0;
  await new Promise((resolve) => {
    const tick = () => {
      if (!game || game.world !== world) return resolve();
      world.update();
      renderer.render(scene, camera);
      const p = world.loadProgress;
      const elapsed = (performance.now() - t0) / 1000;
      $('#loadBar').style.width = `${Math.round(Math.min(p, elapsed / 8) * 100)}%`;
      const g = world.groundHeight(spawn.x, spawn.z);
      if (g !== null && Math.abs(drone.pos.y - (g + level.spawn.agl)) > 1) {
        drone.pos.y = g + level.spawn.agl;
        drone.applyCamera();
      }
      stable = p >= 0.999 && g !== null ? stable + 1 : 0;
      if ((stable > 30 && elapsed > 2.5) || elapsed > 35) return resolve();
      nextFrame(tick);
    };
    tick();
  });
  if (!game || game.world !== world) return;

  // Wasser
  if (level.water) {
    const wp = frame.toLocal(level.water.at[0], level.water.at[1], level.h);
    const wy = world.groundHeight(wp.x, wp.z);
    if (wy !== null) {
      const water = makeWater(level.water.radius, level.water.color);
      water.position.set(wp.x, wy + 0.35, wp.z);
      scene.add(water);
      game.water = water;
    }
  }

  $('#loadText').textContent = t('placingModels');
  await atlasPromise;
  const loaded = await Promise.all(modelPromises);
  const hideBoxes = [];
  for (const { lm, g } of loaded) {
    if (!g) continue;
    const root = g.scene;
    root.name = lm.id;
    applyLibrary(root);
    const p = frame.toLocal(lm.lat, lm.lon, level.h);
    const gy = world.groundHeight(p.x, p.z);
    const baseY = lm.base === 'water' && game.water ? game.water.position.y - 0.35 : (gy ?? 0);
    root.position.set(p.x, baseY + (lm.yOffset || 0), p.z);
    root.rotation.y = -(lm.heading || 0) * DEG;
    root.updateMatrixWorld(true);
    game.landmarkPts.push(root.position.clone());
    const hides = [];
    root.traverse((o) => {
      if (o.name.startsWith('Hide')) hides.push(o);
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });
    for (const h of hides) {
      h.geometry.computeBoundingBox();
      const lb = h.geometry.boundingBox;
      const c = lb.getCenter(new THREE.Vector3()).applyMatrix4(h.matrixWorld);
      const e = h.matrixWorld.elements;
      const sx = new THREE.Vector3(e[0], e[1], e[2]).length() * (lb.max.x - lb.min.x);
      const sz = new THREE.Vector3(e[8], e[9], e[10]).length() * (lb.max.z - lb.min.z);
      const ax = new THREE.Vector3(e[0], e[1], e[2]).normalize();
      const top = new THREE.Box3().setFromObject(h).max.y;
      hideBoxes.push({ x: c.x, z: c.z, hx: sx / 2, hz: sz / 2, angle: Math.atan2(ax.z, ax.x), maxY: top });
      h.removeFromParent();
    }
    game.models.add(root);
  }
  setHideBoxes(hideBoxes);

  // Motive
  for (const sj of level.subjects) {
    if (sj.peak) {
      const pk = level.peaks.find((k) => k.id === sj.peak);
      const c = frame.toLocal(pk.lat, pk.lon, level.h);
      const top = world.groundHeight(c.x, c.z) ?? c.y;
      const pts = [];
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 400 && pts.length < 70; i++) {
        const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * pk.radius;
        const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
        const y = world.groundHeight(x, z);
        if (y !== null && y > top - pk.height) pts.push(new THREE.Vector3(x, y + 3, z));
      }
      const center = pts.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(Math.max(1, pts.length));
      game.subjects.set(sj.id, { points: pts, center, root: null });
      game.landmarkPts.push(c.clone());
    } else {
      const root = game.models.getObjectByName(sj.landmark);
      if (!root) continue;
      const filter = sj.node ? (o) => { for (let x = o; x && x !== root; x = x.parent) if (x.name.startsWith(sj.node)) return true; return false; } : null;
      const pts = samplePoints(root, 70, filter, root.position.y + 0.4);
      if (!pts.length) continue;
      const box = new THREE.Box3().setFromPoints(pts);
      game.subjects.set(sj.id, { points: pts, center: box.getCenter(new THREE.Vector3()), root });
    }
  }

  // Flugverbotszonen
  for (const nf of level.noFly || []) {
    const c = frame.toLocal(nf.lat, nf.lon, level.h);
    const gy = world.groundHeight(c.x, c.z) ?? c.y;
    const geo = new THREE.CylinderGeometry(nf.radius, nf.radius, 160, 48, 1, true);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false });
    const cyl = new THREE.Mesh(geo, mat);
    cyl.position.set(c.x, gy + 80, c.z);
    scene.add(cyl);
    game.noFly.push({ x: c.x, z: c.z, r: nf.radius, mesh: cyl, name: nf.name });
  }

  // Schatten auf das Hauptmotiv (Stufe "Mittel"); "Hoch" folgt der Kamera
  game.focus = game.subjects.values().next().value?.center || new THREE.Vector3();
  placeSunShadow(game.focus);

  const g = world.groundHeight(spawn.x, spawn.z, true, [game.models]);
  if (g !== null) drone.pos.y = g + level.spawn.agl;
  game.home.copy(drone.pos);

  $('#hudPlace').textContent = `${tx(level.name)} · ${level.place}`;
  selectMission(0);
  beginFlight();
}

function placeSunShadow(focus) {
  sunLight.position.copy(focus).addScaledVector(sunDir, 1200);
  sunLight.target.position.copy(focus);
  sunLight.target.updateMatrixWorld();
}

function makeWaterNormals(size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size * Math.PI * 2, v = y / size * Math.PI * 2;
    const dx = Math.cos(u * 3 + v * 2) * 0.45 + Math.cos(u * 7 - v * 5) * 0.3 + Math.cos(u * 13 + v * 11) * 0.15 + Math.cos(u * 23 - v * 19) * 0.1;
    const dy = Math.cos(v * 4 - u) * 0.45 + Math.cos(v * 9 + u * 6) * 0.3 + Math.cos(v * 15 - u * 12) * 0.15 + Math.cos(v * 21 + u * 17) * 0.1;
    const i = (y * size + x) * 4;
    img.data[i] = 128 + dx * 60; img.data[i + 1] = 128 + dy * 60; img.data[i + 2] = 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeWater(radius, color) {
  const nrm = makeWaterNormals();
  if (quality.water === 'reflect') {
    const w = new Water(new THREE.CircleGeometry(radius, 128), {
      textureWidth: 1024, textureHeight: 1024, waterNormals: nrm,
      sunDirection: sunDir.clone(), sunColor: 0xfff2e0, waterColor: color, distortionScale: 1.6, fog: true,
    });
    w.material.uniforms.size.value = 6.0;
    w.rotation.x = -Math.PI / 2;
    w.name = 'Water';
    w.userData.reflective = true;
    return w;
  }
  nrm.repeat.set(radius / 6, radius / 6);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.06, metalness: 0.0, normalMap: nrm, normalScale: new THREE.Vector2(0.25, 0.25), transparent: true, opacity: 0.92, envMapIntensity: 1.0 });
  const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 96), mat);
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  m.name = 'Water';
  return m;
}

function disposeGame() {
  if (!game) return;
  game.world.dispose();
  scene.remove(game.models);
  game.models.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  if (game.water) scene.remove(game.water);
  for (const nf of game.noFly) scene.remove(nf.mesh);
  game.help.dispose(scene);
  tutorial.active = false;
  $('#tutorial').classList.add('hidden');
  game = null;
}

function beginFlight() {
  mode = 'fly';
  show(null);
  $('#hud').classList.add('active');
  input.enabled = true;
  applyTouchMode();
  setView(false);
  updateHUD();
  sound.startMotor();
  if (game.tutorial) tutorial.start(drone, () => game?.photos.length || 0);
  else { const m = game.level.missions[0]; toast(`<b>${tx(m.title)}</b><br><span class="small">${tx(m.desc)}</span>`, 4500); }
}

function selectMission(i) {
  game.missionIdx = i;
  const m = game.level.missions[i];
  const subj = game.subjects.get(m.subject);
  if (!subj) { game.help.setTarget(null); updateMissionChip(); return; }
  const groundAt = (x, z) => game.world.groundHeight(x, z);
  const occ = [game.world.terrain.group, game.models];
  if (game.world.buildings) occ.push(game.world.buildings.group);
  game.help.setTarget(refineShot(m, subj, idealShot(m, subj, sunAz, groundAt), groundAt, occ));
  updateMissionChip();
}

function pauseGame() {
  if (mode !== 'fly') return;
  mode = 'pause';
  document.exitPointerLock?.();
  $('#pauseMissions').innerHTML = missionListHTML(game.level, game.results);
  $('#pause').classList.add('active');
  applyTouchMode();
  sound.setMotor(0);
}
function resumeGame() {
  $('#pause').classList.remove('active');
  mode = 'fly';
  if (!input.isTouch) canvas.requestPointerLock?.();
  applyTouchMode();
}
$('#btnResume').addEventListener('click', resumeGame);
$('#btnPause').addEventListener('click', pauseGame);
$('#btnLand').addEventListener('click', () => { $('#pause').classList.remove('active'); endFlight(); });
$('#btnQuit').addEventListener('click', () => { $('#pause').classList.remove('active'); stopFlight(); renderLevels(); show('levels'); });

function cycleMode(arg) {
  if (arg === 'tripod') drone.setMode(drone.mode === 'tripod' ? 'normal' : 'tripod');
  else if (arg === 'next') drone.setMode(MODE_ORDER[(MODE_ORDER.indexOf(drone.mode) + 1) % MODE_ORDER.length] || 'normal');
  else drone.setMode(arg);
  $('#hudMode').textContent = t('mode_' + drone.mode);
  toast(`${t('mode')}: <b>${t('mode_' + drone.mode)}</b>`, 1100);
}
function setView(third) {
  thirdPerson = third && !!droneModel;
  $('#frame').classList.toggle('hidden', thirdPerson);
  $('#pip').classList.toggle('hidden', !(thirdPerson && quality.pip));
  if (droneModel) droneModel.visible = thirdPerson;
  if (thirdPerson) chasePos.copy(drone.pos).add(new THREE.Vector3(0, 2, 5));
}

input.on('pause', () => (mode === 'fly' ? pauseGame() : mode === 'pause' ? resumeGame() : null));
input.on('unlock', () => { if (mode === 'fly' && !input.isTouch) pauseGame(); });
input.on('shutter', () => { if (mode === 'fly') takePhoto(); });
input.on('grid', () => $('#grid3').classList.toggle('hidden'));
input.on('missions', () => { if (game) selectMission((game.missionIdx + 1) % game.level.missions.length); });
input.on('land', () => { if (mode === 'fly') endFlight(); });
input.on('mode', (arg) => { if (mode === 'fly') cycleMode(arg); });
input.on('view', () => { if (mode === 'fly') setView(!thirdPerson); });
input.on('help', () => { if (!game) return; game.help.enabled = !game.help.enabled; settings.help = game.help.enabled; saveSettings(); });
$('#hudMode').addEventListener('click', () => cycleMode('next'));

function stopFlight() {
  mode = 'menu';
  input.enabled = false;
  document.exitPointerLock?.();
  $('#hud').classList.remove('active');
  applyTouchMode();
  sound.stopMotor();
  setView(false);
}

function updateMissionChip() {
  const m = game.level.missions[game.missionIdx];
  const r = game.results[m.id];
  $('#hudMission').innerHTML = `<b>${game.missionIdx + 1}/${game.level.missions.length} ${tx(m.title)}</b>${r ? ` <span class="ok">${r.result.total} ${starStr(starsFor(r.result.total))}</span>` : ''}<br><span class="small">${tx(m.desc)}</span>`;
  $('#hudMode').textContent = t('mode_' + drone.mode);
}

// ---------- Foto ----------
function takePhoto() {
  if (game.photos.length >= MAX_SHOTS) { toast(t('cardFull'), 2000); return; }
  const blur = drone.motionBlur;
  drone.applyCamera();
  for (const nf of game.noFly) nf.mesh.visible = false;
  game.help.hideForPhoto(true);
  if (droneModel) droneModel.visible = false;
  render(camera);
  const img = grabImage(canvas, blur);
  game.help.hideForPhoto(false);
  if (droneModel) droneModel.visible = thirdPerson;
  $('#flash').classList.remove('go'); void $('#flash').offsetWidth; $('#flash').classList.add('go');
  sound.shutter();

  const occluders = [game.world.terrain.group, game.models];
  if (game.world.buildings) occluders.push(game.world.buildings.group);
  const ctx = { camera, subjects: game.subjects, occluders, sunDir, blur };
  let best = null;
  for (const m of game.level.missions) {
    const r = evaluate(m, ctx);
    if (!r) continue;
    if (!best || r.total > best.result.total) best = { mission: m, result: r };
  }
  const photo = { ...img, best, blur, index: game.photos.length + 1 };
  game.photos.push(photo);

  if (!best || best.result.total < 15) {
    toast(t('noSubject'), 1600);
  } else {
    const prev = game.results[best.mission.id];
    if (!prev || best.result.total > prev.result.total) game.results[best.mission.id] = { ...best, photo };
    const tip = tipFor(best.result);
    toast(`<div class="small">${tx(best.mission.title)}</div><div class="score">${best.result.total}</div><div class="stars">${starStr(starsFor(best.result.total))}</div>${tip ? `<div class="small muted">${tip}</div>` : ''}`, 2600);
    const idx = game.level.missions.indexOf(best.mission);
    if (idx !== game.missionIdx) selectMission(idx); else updateMissionChip();
  }
}

function tipFor(r) {
  const worst = CRITERIA.map((c) => [c, r.parts[c.key]]).sort((a, b) => a[1] - b[1])[0];
  return worst[1] > 17 ? '' : t('tip_' + worst[0].key);
}

// ---------- Ende / Auswertung ----------
function endFlight() {
  stopFlight();
  const lv = game.level;
  const list = $('#resList');
  list.innerHTML = '';
  let stars = 0;
  for (const m of lv.missions) {
    const r = game.results[m.id];
    const old = save.best[m.id];
    let isNew = false;
    if (r && (!old || r.result.total > old.score)) {
      save.best[m.id] = { score: r.result.total, thumb: r.photo.thumb, parts: r.result.parts };
      isNew = true;
    }
    if (r) submitScore({ name: settings.name || 'Pilot', level: lv.id, mission: m.id, score: r.result.total });
    const b = save.best[m.id];
    stars += starsFor(b?.score || 0);
    const el = document.createElement('div');
    el.className = 'res';
    const sc = r ? r.result.total : null;
    el.innerHTML = `${r ? `<img src="${r.photo.thumb}" alt="">` : `<div class="noimg">${t('noPhoto')}</div>`}
      <div class="body">
        <div class="head"><b>${tx(m.title)}</b><span class="sc">${sc ?? '–'}</span></div>
        <div class="stars">${starStr(starsFor(sc || 0))}${isNew ? `<span class="new">${t('newRecord')}</span>` : ''}${!isNew && b ? ` <span class="small muted">${t('record')} ${b.score}</span>` : ''}</div>
        ${r ? `<div class="bars">${CRITERIA.map((c) => `<span>${t('c_' + c.key)}</span><div class="b"><i style="width:${(r.result.parts[c.key] / 20) * 100}%"></i></div><span>${Math.round(r.result.parts[c.key])}</span>`).join('')}</div>` : `<p class="small muted">${tx(m.desc)}</p>`}
      </div>`;
    if (r) el.querySelector('img').addEventListener('click', () => openViewer(r.photo));
    list.appendChild(el);
  }
  persist();
  $('#resStars').textContent = `${stars}/${lv.missions.length * 3} ★`;
  const gal = $('#gallery');
  gal.innerHTML = game.photos.length ? '' : `<p class="muted">${t('noPhotos')}</p>`;
  for (const p of game.photos) {
    const f = document.createElement('figure');
    f.innerHTML = `<img src="${p.thumb}" alt=""><figcaption>${p.best?.result.total ?? 0}</figcaption>`;
    f.addEventListener('click', () => openViewer(p));
    gal.appendChild(f);
  }
  show('results');
}
$('#btnAgain').addEventListener('click', () => startLevel(game?.level || currentLevel));

function openViewer(p) {
  $('#viewerImg').src = p.full;
  $('#viewerDl').href = p.full;
  $('#viewerDl').download = `mkphoto-${game?.level.id || 'foto'}-${p.index}.jpg`;
  const r = p.best;
  $('#viewerInfo').innerHTML = r ? `<b>${tx(r.mission.title)}</b> · ${r.result.total} ${t('points')} · ${starStr(starsFor(r.result.total))}` : t('noMission');
  $('#viewer').classList.add('active');
}
$('#viewerClose').addEventListener('click', () => $('#viewer').classList.remove('active'));

// ---------- HUD ----------
let toastTimer = 0;
function toast(html, ms = 2000) {
  const el = $('#toast');
  el.innerHTML = html;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

const compassTape = $('#compassTape');
(function buildCompass() {
  const names = { 0: 'N', 45: 'NO', 90: 'O', 135: 'SO', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
  let html = '';
  for (let d = -360; d <= 720; d += 15) {
    const n = ((d % 360) + 360) % 360;
    html += `<span style="left:${(d + 360) * 4}px" class="${names[n] ? 'c' : ''}">${names[n] || (n % 45 === 0 ? n : '·')}</span>`;
  }
  compassTape.innerHTML = html;
})();

function updateHUD() {
  if (!game) return;
  const hdg = drone.headingDeg;
  const w = compassTape.parentElement.clientWidth;
  compassTape.style.transform = `translateX(${w / 2 - (hdg + 360) * 4}px)`;
  $('#hudH').textContent = Math.round(drone.agl);
  $('#hudD').textContent = Math.round(Math.hypot(drone.pos.x - game.home.x, drone.pos.z - game.home.z));
  $('#hudS').textContent = drone.speed.toFixed(1);
  $('#hudGim').textContent = `${Math.round(drone.gimbal / DEG)}°`;
  $('#hudZoom').textContent = `${drone.zoom.toFixed(1)}×`;
  const bat = Math.max(0, Math.round((game.battery / BATTERY_S) * 100));
  $('#hudBattery').textContent = `${bat}%`;
  $('#hudBattery').style.color = bat < 20 ? 'var(--bad)' : '';
  $('#hudShots').textContent = `${game.photos.length}/${MAX_SHOTS}`;
  $('#gimbalDot').style.top = `${((25 - drone.gimbal / DEG) / 115) * 100}%`;
  $('#lockHint').classList.toggle('hidden', input.locked || input.isTouch);
}

// ---------- Kollision / Umgebung ----------
const colRay = new THREE.Raycaster();
const downRay = new THREE.Raycaster();
let groundCache = { x: 1e9, z: 1e9, y: null, t: 0 };

const env = {
  ground(x, z) {
    if (!game) return null;
    const moved = Math.hypot(x - groundCache.x, z - groundCache.z);
    groundCache.t++;
    if (moved < 0.4 && groundCache.t % 4 !== 0 && groundCache.y !== null) return groundCache.y;
    const targets = [game.world.terrain.group, game.models];
    if (game.world.buildings) targets.push(game.world.buildings.group);
    downRay.set(new THREE.Vector3(x, drone.pos.y + 2.5, z), new THREE.Vector3(0, -1, 0));
    downRay.far = 5000;
    let hit = firstRealHit(downRay.intersectObjects(targets, true));
    if (!hit) {
      downRay.set(new THREE.Vector3(x, drone.pos.y + 3000, z), new THREE.Vector3(0, -1, 0));
      downRay.far = 12000;
      hit = firstRealHit(downRay.intersectObjects(targets, true));
    }
    const y = hit ? hit.point.y : groundCache.y;
    groundCache = { x, z, y, t: groundCache.t };
    return y;
  },
  collide(pos, step) {
    const len = step.length();
    if (len < 1e-4) return false;
    const targets = [game.models];
    if (game.world.buildings) targets.push(game.world.buildings.group);
    colRay.set(pos, step.clone().divideScalar(len));
    colRay.far = len + 1.2;
    const hit = firstRealHit(colRay.intersectObjects(targets, true));
    return !!hit && !hit.object.name.startsWith('Water');
  },
  onBump() { sound.bump(); },
  fence(next, vel) {
    let inside = false;
    for (const nf of game.noFly) {
      const dx = next.x - nf.x, dz = next.z - nf.z;
      const d = Math.hypot(dx, dz);
      if (d < nf.r) {
        inside = true;
        const k = nf.r / Math.max(d, 0.01);
        next.x = nf.x + dx * k; next.z = nf.z + dz * k;
        vel.x *= 0.3; vel.z *= 0.3;
      } else if (d < nf.r + 25) inside = true;
    }
    $('#nofly').classList.toggle('hidden', !inside);
    for (const nf of game.noFly) nf.mesh.visible = Math.hypot(next.x - nf.x, next.z - nf.z) < nf.r + 120;
  },
};

// 3rd Person: Verfolgerkamera + Drohnenmodell
const chasePos = new THREE.Vector3();
function updateChase(dt) {
  if (!droneModel) return;
  droneModel.position.copy(drone.pos);
  droneModel.rotation.set(drone.tilt.x, drone.yaw, -drone.tilt.y, 'YXZ');
  for (const p of droneModel.userData.props) p.rotation.y += dt * 60;
  if (!thirdPerson) return;
  const fwd = new THREE.Vector3(-Math.sin(drone.yaw), 0, -Math.cos(drone.yaw));
  const want = drone.pos.clone().addScaledVector(fwd, -5.5).add(new THREE.Vector3(0, 1.8, 0));
  const gy = drone.groundY;
  if (gy != null) want.y = Math.max(want.y, gy + 1.0);
  chasePos.lerp(want, 1 - Math.exp(-dt * 5));
  if (chasePos.distanceTo(want) > 50) chasePos.copy(want);
  chaseCam.position.copy(chasePos);
  chaseCam.lookAt(drone.pos.clone().addScaledVector(fwd, 4));
}

function renderPip() {
  const el = $('#pip');
  const r = el.getBoundingClientRect();
  const y = innerHeight - r.bottom;
  renderer.setScissorTest(true);
  renderer.setScissor(r.left, y, r.width, r.height);
  renderer.setViewport(r.left, y, r.width, r.height);
  const asp = camera.aspect;
  camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
  droneModel.visible = false;
  game.help.hideForPhoto(true);
  renderer.render(scene, camera);
  game.help.hideForPhoto(false);
  droneModel.visible = true;
  camera.aspect = asp; camera.updateProjectionMatrix();
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, innerWidth, innerHeight);
}

// ---------- Hauptschleife ----------
const clock = new THREE.Clock();
let titleT = 0, frameN = 0;
function loop() {
  nextFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  frameN++;
  if (mode === 'fly' && game) {
    game.t += dt;
    const a = input.read(dt);
    drone.update(dt, a, env);
    game.battery -= dt * (a.sport || drone.mode === 'sport' ? 1.3 : 1);
    if (game.battery <= 0) { toast(t('batteryEmpty'), 2500); endFlight(); return; }
    if (game.battery < BATTERY_S * 0.2 && !game.lowWarned) { game.lowWarned = true; toast(t('batteryLow'), 2500); }
    if (game.water) {
      if (game.water.userData.reflective) game.water.material.uniforms.time.value += dt * 0.6;
      else game.water.material.normalMap.offset.x += dt * 0.01;
    }
    if (quality.shadows === 'follow') {
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).setY(0).normalize();
      placeSunShadow(drone.pos.clone().addScaledVector(fwd, 120).setY(drone.groundY ?? drone.pos.y));
    }
    sound.setMotor(Math.min(1, drone.speed / 15 + Math.abs(drone.vel.y) / 6 + 0.25));
    updateHUD();
    updateChase(dt);
    if (tutorial.active) tutorial.update(drone);
    const m = game.level.missions[game.missionIdx];
    game.help.update(thirdPerson ? chaseCam : camera, game.subjects.get(m.subject), game.t);
    if (frameN % 3 === 0) {
      minimap.draw({
        drone: drone.pos, heading: -drone.yaw, target: game.help.enabled ? game.help.target?.pos : null,
        landmarks: game.landmarkPts, home: game.home, noFly: game.noFly,
      });
    }
    game.world.update();
    render(thirdPerson ? chaseCam : camera);
    if (thirdPerson && quality.pip) renderPip();
  } else if (mode === 'pause' && game) {
    render(thirdPerson ? chaseCam : camera);
  } else if (mode === 'menu') {
    titleT += dt;
    if (game) game.world.update();
    else { camera.position.set(0, 0, 0); camera.rotation.set(0.12, titleT * 0.03, 0, 'YXZ'); }
    renderer.render(scene, camera);
  }
}
setSun(230, 12);
loop();

// Dev-Hilfe
window.__mk = {
  scene, camera, drone, renderer, get game() { return game; }, LEVELS, startLevel, THREE, settings, setView, selectMission, quality,
  look(x, y, z, heading, gimbal) {
    drone.wind.set(0, 0, 0); drone.vel.set(0, 0, 0);
    drone.pos.set(x, y, z); drone.yaw = drone.yawTarget = -heading * DEG; drone.gimbal = drone.gimbalTarget = gimbal * DEG; drone.maxAgl = 5000;
    drone.applyCamera();
  },
};
