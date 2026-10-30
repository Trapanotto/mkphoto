import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GeoWorld, dracoLoader, setHideBoxes, buildOrthoAtlas, firstRealHit } from './geo.js';
import { Drone } from './drone.js';
import { Input } from './input.js';
import { LEVELS } from './levels.js';
import { evaluate, grabImage, samplePoints, starsFor, CRITERIA } from './photo.js';
import { Sound } from './sound.js';

const $ = (s) => document.querySelector(s);
const DEG = Math.PI / 180;
const BATTERY_S = 360;
const MAX_SHOTS = 24;

// rAF mit Fallback (z. B. wenn der Tab im Hintergrund ist)
function nextFrame(fn) {
  let done = false;
  const run = () => { if (!done) { done = true; fn(); } };
  requestAnimationFrame(run);
  setTimeout(run, 120);
}

// ---------- Qualität ----------
const isMobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
const quality = isMobile
  ? { overlayRes: 256, terrainError: 6, buildingError: 10, buildings: true, atlasZoom: 16, atlasRadius: 1000, pixelRatio: Math.min(devicePixelRatio, 1.25), shadows: false }
  : { overlayRes: 512, terrainError: 2, buildingError: 4, buildings: true, atlasZoom: 17, atlasRadius: 1100, pixelRatio: Math.min(devicePixelRatio, 1.5), shadows: true };

// ---------- Renderer / Szene ----------
const canvas = $('#view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(quality.pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.55;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = quality.shadows;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.5, 120000);
scene.add(camera);

const sky = new Sky();
sky.scale.setScalar(200000);
scene.add(sky);
const skyU = sky.material.uniforms;
skyU.turbidity.value = 4;
skyU.rayleigh.value = 1.4;
skyU.mieCoefficient.value = 0.004;
skyU.mieDirectionalG.value = 0.8;

const sunLight = new THREE.DirectionalLight(0xffffff, 2.2);
sunLight.castShadow = quality.shadows;
sunLight.shadow.mapSize.set(2048, 2048);
Object.assign(sunLight.shadow.camera, { left: -220, right: 220, top: 220, bottom: -220, near: 1, far: 2000 });
sunLight.shadow.bias = -0.0005;
sunLight.shadow.normalBias = 0.05;
scene.add(sunLight, sunLight.target);
const hemi = new THREE.HemisphereLight(0xbcd4ff, 0x5a5040, 0.7);
scene.add(hemi);
scene.fog = new THREE.FogExp2(0xb8c8d8, 0.000045);

const pmrem = new THREE.PMREMGenerator(renderer);
const sunDir = new THREE.Vector3();

function setSun(az, el) {
  sunDir.set(Math.sin(az * DEG) * Math.cos(el * DEG), Math.sin(el * DEG), -Math.cos(az * DEG) * Math.cos(el * DEG)).normalize();
  skyU.sunPosition.value.copy(sunDir);
  // Umgebungslicht aus dem Himmel
  const envScene = new THREE.Scene();
  const s2 = new Sky(); s2.scale.setScalar(1000);
  for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) s2.material.uniforms[k].value = skyU[k].value;
  s2.material.uniforms.sunPosition.value.copy(sunDir);
  envScene.add(s2);
  if (scene.environment) scene.environment.dispose();
  scene.environment = pmrem.fromScene(envScene).texture;
  scene.environmentIntensity = 0.12;
  const warm = THREE.MathUtils.clamp((el - 5) / 30, 0, 1);
  sunLight.color.setRGB(1, 0.78 + 0.2 * warm, 0.6 + 0.35 * warm);
  scene.fog.color.setRGB(0.62 + 0.1 * (1 - warm), 0.70, 0.80);
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// ---------- Speicher ----------
const SAVE_KEY = 'mkphoto.v1';
const save = (() => { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { return {}; } })();
save.best ??= {};
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* Speicher voll / privat */ } }

// ---------- UI-Navigation ----------
document.querySelector('#title').style.backgroundImage = `url(${import.meta.env.BASE_URL}previews/matterhorn.jpg)`;
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

const starStr = (n, max = 3) => '★'.repeat(n) + '☆'.repeat(max - n);

function levelStars(level) {
  return level.missions.reduce((s, m) => s + starsFor(save.best[m.id]?.score || 0), 0);
}

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
      <div class="meta"><b>${lv.name}</b><span>${lv.place}</span></div>`;
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
    return `<li>${tag}<b>${m.title}</b><span class="d">${m.desc}</span></li>`;
  }).join('');
}

let currentLevel = null;
function openBriefing(level) {
  currentLevel = level;
  $('#briefTitle').textContent = level.name;
  $('#briefPlace').textContent = `${level.place} · ${level.missions.length} Aufträge`;
  $('#briefMissions').innerHTML = missionListHTML(level);
  show('briefing');
}
$('#btnStart').addEventListener('click', () => startLevel(currentLevel));

// ---------- Spielzustand ----------
const input = new Input(canvas, $('#touch'));
const drone = new Drone(camera);
const sound = new Sound();
const loader = new GLTFLoader().setDRACOLoader(dracoLoader);

let game = null; // aktiver Flug
let mode = 'menu'; // menu | loading | fly | pause

function applyTouchMode() {
  document.body.classList.toggle('touch-mode', input.isTouch);
  $('#touch').classList.toggle('hidden', !(input.isTouch && mode === 'fly'));
}
input.on('modechange', applyTouchMode);

async function startLevel(level) {
  mode = 'loading';
  show('loading');
  $('#hud').classList.remove('active');
  input.enabled = false;
  $('#loadBar').style.width = '0%';
  $('#loadText').textContent = 'Lade Geodaten …';
  if (game) disposeGame();

  setSun(level.sun.az, level.sun.el);
  const world = new GeoWorld({ scene, camera, renderer, level, quality });
  const frame = world.frame;
  drone.wind.set(level.wind[0], 0, level.wind[1]);

  // Start: Kamera an den Startpunkt, Blick zum ersten Wahrzeichen
  const spawn = frame.toLocal(level.spawn.lat, level.spawn.lon, level.h);
  spawn.y = 60;
  drone.reset(spawn, level.spawn.heading, -8);
  drone.applyCamera();

  game = {
    level, world, frame,
    models: new THREE.Group(),
    subjects: new Map(),
    noFly: [],
    photos: [],
    results: {},
    battery: BATTERY_S,
    missionIdx: 0,
    home: spawn.clone(),
    water: null,
    t: 0,
  };
  scene.add(game.models);

  // Luftbild-Atlas für Dächer parallel laden
  const atlasPromise = buildOrthoAtlas(frame, quality.atlasRadius, quality.atlasZoom).catch((e) => console.warn('Atlas', e));

  // Modelle parallel laden
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

  $('#loadText').textContent = 'Platziere Modelle …';
  await atlasPromise;
  const loaded = await Promise.all(modelPromises);
  const hideBoxes = [];
  for (const { lm, g } of loaded) {
    if (!g) continue;
    const root = g.scene;
    root.name = lm.id;
    const p = frame.toLocal(lm.lat, lm.lon, level.h);
    const gy = world.groundHeight(p.x, p.z);
    const baseY = lm.base === 'water' && game.water ? game.water.position.y - 0.35 : (gy ?? 0);
    root.position.set(p.x, baseY + (lm.yOffset || 0), p.z);
    root.rotation.y = -(lm.heading || 0) * DEG;
    root.updateMatrixWorld(true);
    const hides = [];
    root.traverse((o) => {
      if (o.name.startsWith('Hide')) hides.push(o);
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true;
        if (o.material) o.material.envMapIntensity = 0.6;
      }
    });
    for (const h of hides) {
      // orientierte Box: lokale Bounding-Box in Weltkoordinaten
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
    if (!hides.length) {
      const box = new THREE.Box3().setFromObject(root);
      const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
      hideBoxes.push({ x: c.x, z: c.z, hx: s.x / 2 + 2, hz: s.z / 2 + 2, angle: 0, maxY: box.max.y + 5 });
    }
    game.models.add(root);
  }
  setHideBoxes(hideBoxes);

  // Motive für die Bewertung
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

  // Sonne / Schatten auf das Hauptmotiv
  const focus = game.subjects.values().next().value?.center || new THREE.Vector3();
  sunLight.position.copy(focus).addScaledVector(sunDir, 800);
  sunLight.target.position.copy(focus);
  sunLight.target.updateMatrixWorld();

  // Startposition endgültig
  const g = world.groundHeight(spawn.x, spawn.z, true, [game.models]);
  if (g !== null) drone.pos.y = g + level.spawn.agl;
  game.home.copy(drone.pos);

  $('#hudPlace').textContent = `${level.name} · ${level.place}`;
  updateMissionChip();
  beginFlight();
}

function makeWater(radius, color) {
  const size = 256;
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  // einfache Wellen-Normalmap
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size * Math.PI * 2, v = y / size * Math.PI * 2;
    const dx = Math.cos(u * 3 + v * 2) * 0.5 + Math.cos(u * 7 - v * 5) * 0.3 + Math.cos(u * 13 + v * 11) * 0.2;
    const dy = Math.cos(v * 4 - u) * 0.5 + Math.cos(v * 9 + u * 6) * 0.3 + Math.cos(v * 15 - u * 12) * 0.2;
    const i = (y * size + x) * 4;
    img.data[i] = 128 + dx * 40; img.data[i + 1] = 128 + dy * 40; img.data[i + 2] = 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const nrm = new THREE.CanvasTexture(c);
  nrm.wrapS = nrm.wrapT = THREE.RepeatWrapping;
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
  game.models.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); } });
  if (game.water) scene.remove(game.water);
  for (const nf of game.noFly) scene.remove(nf.mesh);
  game = null;
}

function beginFlight() {
  mode = 'fly';
  show(null);
  $('#hud').classList.add('active');
  input.enabled = true;
  applyTouchMode();
  updateHUD();
  sound.startMotor();
  toast(`<b>${game.level.missions[0].title}</b><br><span class="small">${game.level.missions[0].desc}</span>`, 4500);
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
$('#btnQuit').addEventListener('click', () => {
  $('#pause').classList.remove('active');
  stopFlight();
  renderLevels(); show('levels');
});

input.on('pause', () => (mode === 'fly' ? pauseGame() : mode === 'pause' ? resumeGame() : null));
input.on('unlock', () => { if (mode === 'fly' && !input.isTouch) pauseGame(); });
input.on('shutter', () => { if (mode === 'fly') takePhoto(); });
input.on('grid', () => $('#grid3').classList.toggle('hidden'));
input.on('missions', () => { if (!game) return; game.missionIdx = (game.missionIdx + 1) % game.level.missions.length; updateMissionChip(); });
input.on('land', () => { if (mode === 'fly') endFlight(); });

function stopFlight() {
  mode = 'menu';
  input.enabled = false;
  document.exitPointerLock?.();
  $('#hud').classList.remove('active');
  applyTouchMode();
  sound.stopMotor();
}

function updateMissionChip() {
  const m = game.level.missions[game.missionIdx];
  const r = game.results[m.id];
  $('#hudMission').innerHTML = `<b>${game.missionIdx + 1}/${game.level.missions.length} ${m.title}</b>${r ? ` <span class="ok">${r.result.total} ${starStr(starsFor(r.result.total))}</span>` : ''}<br><span class="small">${m.desc}</span>`;
}

// ---------- Foto ----------
function takePhoto() {
  if (game.photos.length >= MAX_SHOTS) { toast('Speicherkarte voll – landen mit L', 2000); return; }
  const blur = drone.motionBlur;
  drone.applyCamera();
  for (const nf of game.noFly) nf.mesh.visible = false;
  renderer.render(scene, camera);
  const img = grabImage(canvas, blur);
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
    toast('Kein Auftrags-Motiv im Bild', 1600);
  } else {
    const prev = game.results[best.mission.id];
    if (!prev || best.result.total > prev.result.total) game.results[best.mission.id] = { ...best, photo };
    const tip = tipFor(best.result);
    toast(`<div class="small">${best.mission.title}</div><div class="score">${best.result.total}</div><div class="stars">${starStr(starsFor(best.result.total))}</div>${tip ? `<div class="small muted">${tip}</div>` : ''}`, 2200);
    game.missionIdx = game.level.missions.indexOf(best.mission);
    updateMissionChip();
  }
}

function tipFor(r) {
  const p = r.parts;
  const worst = CRITERIA.map((c) => [c, p[c.key]]).sort((a, b) => a[1] - b[1])[0];
  if (worst[1] > 16) return '';
  return {
    subject: 'Motiv verdeckt oder nicht ganz im Bild',
    framing: 'Motiv grösser/kleiner oder nach Drittel-Regel platzieren (G)',
    angle: 'Andere Richtung oder Höhe wählen',
    sharp: 'Verwackelt – vor dem Auslösen stillhalten',
    light: 'Gegenlicht – Sonne in den Rücken nehmen',
  }[worst[0].key];
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
    const b = save.best[m.id];
    stars += starsFor(b?.score || 0);
    const el = document.createElement('div');
    el.className = 'res';
    const sc = r ? r.result.total : null;
    el.innerHTML = `${r ? `<img src="${r.photo.thumb}" alt="">` : '<div class="noimg">Kein Foto</div>'}
      <div class="body">
        <div class="head"><b>${m.title}</b><span class="sc">${sc ?? '–'}</span></div>
        <div class="stars">${starStr(starsFor(sc || 0))}${isNew ? '<span class="new">NEUER REKORD</span>' : ''}${!isNew && b ? ` <span class="small muted">Rekord ${b.score}</span>` : ''}</div>
        ${r ? `<div class="bars">${CRITERIA.map((c) => `<span>${c.label}</span><div class="b"><i style="width:${(r.result.parts[c.key] / 20) * 100}%"></i></div><span>${Math.round(r.result.parts[c.key])}</span>`).join('')}</div>` : `<p class="small muted">${m.desc}</p>`}
      </div>`;
    if (r) el.querySelector('img').addEventListener('click', () => openViewer(r.photo));
    list.appendChild(el);
  }
  persist();
  $('#resStars').textContent = `${stars}/${lv.missions.length * 3} ★`;
  const gal = $('#gallery');
  gal.innerHTML = game.photos.length ? '' : '<p class="muted">Keine Fotos gemacht.</p>';
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
  $('#viewerDl').download = `mkphoto-${game.level.id}-${p.index}.jpg`;
  const r = p.best;
  $('#viewerInfo').innerHTML = r ? `<b>${r.mission.title}</b> · ${r.result.total} Punkte · ${starStr(starsFor(r.result.total))}` : 'Kein Auftrag erkannt';
  $('#viewer').classList.add('active');
}
$('#viewerClose').addEventListener('click', () => $('#viewer').classList.remove('active'));

// ---------- HUD ----------
let toastTimer = 0;
function toast(html, ms = 2000) {
  const t = $('#toast');
  t.innerHTML = html;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
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
colRay.firstHitOnly = false;
const downRay = new THREE.Raycaster();
downRay.firstHitOnly = false;
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

// ---------- Hauptschleife ----------
const clock = new THREE.Clock();
let titleT = 0;
function loop() {
  nextFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (mode === 'fly' && game) {
    const a = input.read(dt);
    drone.update(dt, a, env);
    game.battery -= dt * (a.sport ? 1.35 : 1);
    if (game.battery <= 0) { toast('Akku leer – automatische Landung', 2500); endFlight(); return; }
    if (game.battery < BATTERY_S * 0.2 && !game.lowWarned) { game.lowWarned = true; toast('Akku schwach – bald landen', 2500); }
    if (game.water) game.water.material.normalMap.offset.x += dt * 0.01;
    sound.setMotor(Math.min(1, drone.speed / 15 + Math.abs(drone.vel.y) / 6 + 0.25));
    updateHUD();
    game.world.update();
    renderer.render(scene, camera);
  } else if (mode === 'pause' && game) {
    renderer.render(scene, camera);
  } else if (mode === 'menu') {
    // Titel-Hintergrund: langsamer Himmel
    titleT += dt;
    if (game) {
      game.world.update();
    } else {
      camera.position.set(0, 0, 0);
      camera.rotation.set(0.12, titleT * 0.03, 0, 'YXZ');
    }
    renderer.render(scene, camera);
  }
}
setSun(230, 12);
loop();

// Dev-Hilfe
window.__mk = {
  scene, camera, drone, renderer, get game() { return game; }, LEVELS, startLevel, THREE,
  look(x, y, z, heading, gimbal) {
    drone.wind.set(0, 0, 0); drone.vel.set(0, 0, 0);
    drone.pos.set(x, y, z); drone.yaw = -heading * DEG; drone.gimbal = gimbal * DEG; drone.maxAgl = 5000;
    drone.applyCamera();
  },
};
