import './style.css';
import * as THREE from 'three';
import { Drone } from './drone';
import { FollowCamera } from './followCamera';
import { Hud } from './hud';
import { Input, type Action } from './input';
import { OutlineRenderer } from './outline';
import { LEVELS, Quality } from './quality';
import { Sky } from './sky';
import { TimeOfDay } from './timeOfDay';
import { Wind } from './wind';
import { createWorld } from './world';

// --- Renderer -------------------------------------------------------------------

const isMobile = window.matchMedia('(pointer: coarse)').matches;
const quality = new Quality(isMobile);

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
const outlines = new OutlineRenderer(renderer);

const scene = new THREE.Scene();
const fog = new THREE.Fog('#c4e8ff', 90, 300);
scene.fog = fog;

const hemi = new THREE.HemisphereLight('#ffffff', '#5a7a5a', 1.2);
const sun = new THREE.DirectionalLight('#fff4e0', 2.4);
scene.add(hemi, sun);

const sky = new Sky();
scene.add(sky.group);
outlines.hideInNormalPass.push(sky.group);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 600);

// --- Game objects ---------------------------------------------------------------

const world = createWorld(scene);
const drone = new Drone();
scene.add(drone.group);
const wind = new Wind();
const localWind = new THREE.Vector3();
const clock = new TimeOfDay();
const input = new Input(document.getElementById('touch')!);
const follow = new FollowCamera(camera, canvas);
const hud = new Hud();

const buttons: [string, Action][] = [
  ['btn-mode', 'toggleMode'],
  ['btn-home', 'home'],
  ['btn-time', 'skipTime'],
  ['btn-quality', 'cycleQuality'],
];
for (const [id, action] of buttons) {
  const button = document.getElementById(id)!;
  button.addEventListener('pointerdown', (e) => e.stopPropagation());
  button.addEventListener('click', () => input.trigger(action));
}

// iOS Safari: block pinch-zoom of the page
document.addEventListener('gesturestart', (e) => e.preventDefault());

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

const statsEl = document.querySelector<HTMLPreElement>('#stats')!;
let frames = 0;
let lastStats = performance.now();

function updateStats(now: number) {
  frames++;
  if (now - lastStats < 500) return;
  const fps = Math.round((frames * 1000) / (now - lastStats));
  frames = 0;
  lastStats = now;
  statsEl.textContent = `${fps} fps · ${quality.label}`;
  document.getElementById('btn-quality')!.textContent = `Grafik: ${LEVELS[quality.level].label}`;
}

// --- Loop -------------------------------------------------------------------------

const timer = new THREE.Timer();
renderer.setAnimationLoop((time) => {
  timer.update(time);
  const dt = Math.min(timer.getDelta(), 0.05);
  const t = timer.getElapsed();

  const controls = input.read();
  if (controls.toggleMode) drone.mode = drone.mode === 'assist' ? 'pro' : 'assist';
  if (controls.home) {
    drone.reset();
    follow.snap(drone);
  }
  if (controls.skipTime) clock.skip();
  if (controls.cycleQuality) quality.cycle();

  clock.update(dt);
  clock.apply({ sky, sun, hemi, fog, lake: world.lake, windows: world.windows });
  wind.update(t);
  world.update(dt, wind.base);
  wind.at(drone.altitude, localWind);
  drone.update(dt, controls, localWind, world.colliders);
  follow.update(drone, controls.camPitch, dt);
  sky.follow(camera);

  outlines.render(scene, camera);
  const now = performance.now();
  quality.frame(now);
  hud.update(now, drone, localWind, camera, input.device, clock.label);
  updateStats(now);
});
