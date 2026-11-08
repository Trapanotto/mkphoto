import './style.css';
import * as THREE from 'three';
import { Album, shutterSound } from './album';
import { TEST_ASSIGNMENT } from './assignments';
import { Drone, type FlightInput } from './drone';
import { FollowCamera } from './followCamera';
import { Hud } from './hud';
import { Input, type Action } from './input';
import { OutlineRenderer } from './outline';
import { PhotoCamera } from './photoCamera';
import { savePhoto } from './photos';
import { analyseSubject, ratePhoto } from './rating';
import { BriefPanel, loadBest, RatingCard, saveBest } from './ratingCard';
import { LEVELS, Quality } from './quality';
import { Sky } from './sky';
import { loadTerrain } from './terrain';
import { TimeOfDay } from './timeOfDay';
import { Wind } from './wind';
import { createWorld, heightAt } from './world';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// --- Renderer -------------------------------------------------------------------

const isMobile = window.matchMedia('(pointer: coarse)').matches;
const quality = new Quality(isMobile);

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
const outlines = new OutlineRenderer(renderer);

const scene = new THREE.Scene();
const fog = new THREE.Fog('#c4e8ff', 500, 20000);
scene.fog = fog;

const hemi = new THREE.HemisphereLight('#ffffff', '#5a7a5a', 1.2);
const sun = new THREE.DirectionalLight('#fff4e0', 2.4);
scene.add(hemi, sun);

const sky = new Sky();
scene.add(sky.group);
outlines.hideInNormalPass.push(sky.group);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.3, 25000);

// --- Loading ----------------------------------------------------------------------

const loading = $('loading');

async function start() {
  const data = await loadTerrain(`${import.meta.env.BASE_URL}data/luzern/`);
  $('credits').textContent = `Geodaten ${data.meta.attribution}`;

  const world = createWorld(scene, data);
  const drone = new Drone();
  scene.add(drone.group);
  const wind = new Wind();
  const localWind = new THREE.Vector3();
  const still = new THREE.Vector3();
  const clock = new TimeOfDay();
  const input = new Input($('touch'));
  const follow = new FollowCamera(camera, canvas, heightAt, (x, y, z) => world.obstacles.solidAt(x, y, z, 0.4));
  const photo = new PhotoCamera(canvas);
  const album = new Album();
  const ratingCard = new RatingCard();
  const brief = new BriefPanel();
  const assignment = TEST_ASSIGNMENT;
  brief.show(assignment, loadBest(assignment.id));
  const markedLandmarks = world.landmarks.filter((l) => assignment.subjects.includes(l.id));
  let lastMarks = 0;
  const hud = new Hud();

  const buttons: [string, Action][] = [
    ['btn-mode', 'toggleMode'],
    ['btn-home', 'home'],
    ['btn-time', 'skipTime'],
    ['btn-quality', 'cycleQuality'],
    ['btn-camera', 'toggleCamera'],
    ['btn-shutter', 'shoot'],
    ['btn-grid', 'cycleGrid'],
    ['btn-album', 'album'],
  ];
  for (const [id, action] of buttons) {
    const button = $(id);
    button.addEventListener('pointerdown', (e) => e.stopPropagation());
    button.addEventListener('click', () => input.trigger(action));
  }

  // iOS Safari: block pinch-zoom of the page
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  // --- Modes --------------------------------------------------------------------

  const stickLeft = document.querySelector('.stick.left span')!;
  const stickRight = document.querySelector('.stick.right span')!;
  function setCamera(on: boolean) {
    photo.setActive(on);
    drone.group.visible = !on;
    follow.wheelEnabled = !on;
    stickLeft.textContent = on ? 'Zoom' : 'Bewegen';
    stickRight.textContent = on ? 'Drehen · Neigen' : 'Drehen · Höhe';
    $('btn-camera').textContent = on ? 'Fliegen' : 'Kamera';
  }
  setCamera(false);

  const toast = $('toast');
  let toastTimer = 0;
  function showToast(text: string) {
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => (toast.hidden = true), 2800);
  }

  let capturing = false;

  // handle for poking at the game from the browser console during development
  if (import.meta.env.DEV) Object.assign(window, { mk: { drone, camera, scene, world, photo, follow } });

  // --- Resize & quality -------------------------------------------------------------

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, LEVELS[quality.level].pixelRatio));
    renderer.setSize(w, h, false);
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    outlines.setSize(size.x, size.y);
    camera.aspect = w / h;
    // wider view in portrait so the drone keeps some surroundings
    camera.fov = w < h ? 75 : 60;
    follow.distance = w < h ? 11 : 8;
    camera.updateProjectionMatrix();
    photo.layout();
  }

  function applyQuality() {
    outlines.setMode(LEVELS[quality.level].outline);
    resize();
  }
  quality.onChange = applyQuality;

  window.addEventListener('resize', resize);
  applyQuality();
  follow.snap(drone);

  // --- Stats overlay ----------------------------------------------------------------

  const statsEl = $('stats');
  let frames = 0;
  let lastStats = performance.now();

  function updateStats(now: number) {
    frames++;
    if (now - lastStats < 500) return;
    const fps = Math.round((frames * 1000) / (now - lastStats));
    frames = 0;
    lastStats = now;
    statsEl.textContent = `${fps} fps · ${quality.label}`;
    $('btn-quality').textContent = `Grafik: ${LEVELS[quality.level].label}`;
  }

  // --- Loop -------------------------------------------------------------------------

  const idle: FlightInput = { moveX: 0, moveY: 0, yaw: 0, lift: 0 };
  const timer = new THREE.Timer();
  loading.hidden = true;

  renderer.setAnimationLoop((time) => {
    timer.update(time);
    const dt = Math.min(timer.getDelta(), 0.05);
    const t = timer.getElapsed();
    const c = input.read();

    // menus and modes; Escape / B closes the innermost thing first
    if (ratingCard.isOpen) {
      if (c.back || c.shoot) ratingCard.close();
      c.back = c.shoot = c.album = false;
    }
    if (c.back && !album.back() && photo.active) setCamera(false);
    if (c.album) album.toggle();
    const paused = album.isOpen || ratingCard.isOpen;
    if (!paused) {
      if (c.toggleCamera) setCamera(!photo.active);
      if (photo.active) {
        if (c.cycleGrid) photo.cycleGrid();
      } else {
        if (c.toggleMode) drone.mode = drone.mode === 'assist' ? 'pro' : 'assist';
        if (c.home && !c.back) {
          drone.reset();
          follow.snap(drone);
        }
      }
      if (c.skipTime) clock.skip();
      if (c.cycleQuality) quality.cycle();
    }

    clock.update(dt);
    clock.apply({ sky, sun, hemi, fog, lake: world.lake, windows: world.windows });
    wind.update(t);
    world.update(dt, wind.base);
    wind.at(drone.altitude, localWind);

    let view = camera;
    if (paused) {
      drone.update(dt, idle, still, world);
      if (photo.active) photo.update(dt, { tilt: 0, zoom: 0 }, drone);
    } else if (photo.active) {
      // the drone holds its position; slower turning at long focal lengths for precise framing
      const turn = c.camYaw * 0.45 * (24 / photo.focal);
      drone.update(dt, { ...idle, yaw: turn }, still, world);
      photo.update(dt, { tilt: c.camTilt, zoom: c.camZoom }, drone);
      view = photo.camera;
      if (time - lastMarks > 100) {
        lastMarks = time;
        const frame = photo.frameNdc();
        photo.showMarks(markedLandmarks.map((lm) => analyseSubject(lm, photo.camera, world.obstacles, frame)));
      }
    } else {
      drone.update(dt, c, localWind, world);
    }
    follow.update(drone, c.camPitch, dt);
    sky.follow(view);

    outlines.render(scene, view);

    if (photo.active && c.shoot && !capturing && !paused) {
      capturing = true;
      shutterSound();
      // render the framed view once more at photo size, copy it, then restore the screen
      const { w, h } = photo.photoSize;
      renderer.setPixelRatio(1);
      renderer.setSize(w, h, false);
      outlines.setSize(w, h);
      const shotCamera = photo.prepareShot();
      outlines.render(scene, shotCamera);
      const shot = photo.capture(canvas, world.landmarks, { gameTime: clock.label, altitude: drone.altitude });
      resize();
      outlines.render(scene, view);
      const rating = ratePhoto({
        camera: shotCamera,
        landmarks: world.landmarks,
        obstacles: world.obstacles,
        assignment,
        hour: clock.hour,
        sunDir: sky.sunDir,
        windStrength: Math.hypot(localWind.x, localWind.z),
        turnRate: Math.min(1, Math.abs(c.camYaw)),
        focal: photo.focal,
        gimbal: photo.gimbal,
        altitude: drone.altitude,
        portrait: photo.portrait,
      });
      shot
        .then(async (p) => {
          p.tags = rating.subjects;
          p.rating = {
            stars: rating.stars,
            comment: rating.comment,
            lines: [...rating.criteria.map((cr) => `${cr.label}: ${cr.text}`), ...rating.bonus.map((b) => `Bonus: ${b}`)],
            assignment: rating.assignmentId,
            fulfilled: rating.fulfilled,
          };
          const stored = await savePhoto(p);
          saveBest(assignment.id, rating.stars);
          brief.show(assignment, loadBest(assignment.id));
          ratingCard.show(rating, p.thumb, assignment);
          if (!stored) showToast('Foto nur bis zum Neuladen gespeichert');
        })
        .catch(() => showToast('Foto konnte nicht gespeichert werden'))
        .finally(() => (capturing = false));
    }

    const now = performance.now();
    quality.frame(now);
    hud.update(now, drone, localWind, view, input.device, clock.label);
    updateStats(now);
  });
}

start().catch((err) => {
  console.error(err);
  $('loading-text').textContent = 'Luzern konnte nicht geladen werden. Bitte Seite neu laden.';
});
