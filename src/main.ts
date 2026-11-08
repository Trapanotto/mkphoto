import './style.css';
import * as THREE from 'three';
import { Drone } from './drone';
import { FollowCamera } from './followCamera';
import { Hud } from './hud';
import { Input } from './input';
import { Wind } from './wind';
import { createWorld } from './world';

// --- Renderer -------------------------------------------------------------------

const isMobile = window.matchMedia('(pointer: coarse)').matches;
const maxPixelRatio = isMobile ? 1.5 : 2;

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const skyColor = new THREE.Color('#9fd3f0');
scene.background = skyColor;
scene.fog = new THREE.Fog(skyColor, 80, 260);

scene.add(new THREE.HemisphereLight('#ffffff', '#5a7a5a', 1.2));
const sun = new THREE.DirectionalLight('#fff4e0', 2.4);
sun.position.set(30, 40, 20);
scene.add(sun);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 600);

// --- Game objects ---------------------------------------------------------------

const world = createWorld(scene);
const drone = new Drone();
scene.add(drone.group);
const wind = new Wind();
const localWind = new THREE.Vector3();
const input = new Input(document.getElementById('touch')!);
const follow = new FollowCamera(camera, canvas);
const hud = new Hud();

for (const [id, action] of [
  ['btn-mode', 'toggleMode'],
  ['btn-home', 'home'],
] as const) {
  const button = document.getElementById(id)!;
  button.addEventListener('pointerdown', (e) => e.stopPropagation());
  button.addEventListener('click', () => input.trigger(action));
}

// iOS Safari: block pinch-zoom of the page
document.addEventListener('gesturestart', (e) => e.preventDefault());

// --- Resize ---------------------------------------------------------------------

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // wider view in portrait so the drone keeps some surroundings
  camera.fov = w < h ? 75 : 60;
  follow.distance = w < h ? 11 : 8;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
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
  statsEl.textContent = `${fps} fps`;
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

  wind.update(t);
  world.setWind(wind.base);
  wind.at(drone.altitude, localWind);
  drone.update(dt, controls, localWind, world.colliders);
  follow.update(drone, controls.camPitch, dt);

  renderer.render(scene, camera);
  const now = performance.now();
  hud.update(now, drone, localWind, camera, input.device);
  updateStats(now);
});
