import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// --- Device & renderer -------------------------------------------------------

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
scene.fog = new THREE.Fog(skyColor, 60, 220);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(14, 9, 18);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 3, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.48;
controls.minDistance = 6;
controls.maxDistance = 80;

// --- Toon look (first pass, refined in M2) ----------------------------------

// Three hard light steps: shadow, mid, light
const toonRamp = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
toonRamp.minFilter = THREE.NearestFilter;
toonRamp.magFilter = THREE.NearestFilter;
toonRamp.needsUpdate = true;

const toon = (color: THREE.ColorRepresentation) => new THREE.MeshToonMaterial({ color, gradientMap: toonRamp });

scene.add(new THREE.HemisphereLight('#ffffff', '#5a7a5a', 1.2));
const sun = new THREE.DirectionalLight('#fff4e0', 2.4);
sun.position.set(30, 40, 20);
scene.add(sun);

// --- Test landscape -----------------------------------------------------------

const ground = new THREE.PlaneGeometry(400, 400, 80, 80);
ground.rotateX(-Math.PI / 2);
const pos = ground.attributes.position;
for (let i = 0; i < pos.count; i++) {
  const x = pos.getX(i);
  const z = pos.getZ(i);
  const d = Math.hypot(x, z);
  // flat valley around the lake, rolling hills further out
  const hills = Math.sin(x * 0.05) * Math.cos(z * 0.04) * 4 + Math.sin(x * 0.013 + z * 0.02) * 6;
  pos.setY(i, Math.max(0, d - 30) * 0.06 * (hills + 6));
}
ground.computeVertexNormals();
scene.add(new THREE.Mesh(ground, toon('#7fb86a')));

const lake = new THREE.Mesh(new THREE.CircleGeometry(26, 48), toon('#3d8fd1'));
lake.rotation.x = -Math.PI / 2;
lake.position.y = 0.05;
scene.add(lake);

// Stylised mountains in the distance with snow caps
const mountains: [number, number, number, number][] = [
  [-90, -120, 34, 70],
  [-30, -150, 40, 90],
  [40, -130, 30, 64],
  [110, -100, 36, 76],
];
for (const [x, z, r, h] of mountains) {
  const rock = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), toon('#8a94a6'));
  rock.position.set(x, h / 2 - 2, z);
  scene.add(rock);
  const snow = new THREE.Mesh(new THREE.ConeGeometry(r * 0.38, h * 0.38, 6), toon('#ffffff'));
  snow.position.set(x, h - h * 0.19 - 1.9, z);
  scene.add(snow);
}

// A simple tower as a stand-in landmark
const tower = new THREE.Group();
const body = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 8, 8), toon('#c9a77c'));
body.position.y = 4;
const roof = new THREE.Mesh(new THREE.ConeGeometry(2.1, 3, 8), toon('#b2442f'));
roof.position.y = 9.5;
tower.add(body, roof);
tower.position.set(-8, 0, -6);
scene.add(tower);

// --- Placeholder drone ----------------------------------------------------------

const drone = new THREE.Group();
const hull = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 1.2), toon('#f2f2f2'));
drone.add(hull);
const rotors: THREE.Mesh[] = [];
for (const [x, z] of [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
]) {
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 1.1), toon('#222222'));
  arm.position.set(x * 0.45, 0, z * 0.45);
  arm.rotation.y = Math.atan2(x, z);
  const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.04, 16), toon('#d23a2a'));
  rotor.position.set(x * 0.85, 0.2, z * 0.85);
  drone.add(arm, rotor);
  rotors.push(rotor);
}
const lens = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), toon('#111111'));
lens.position.set(0, -0.25, 0.5);
drone.add(lens);
drone.position.set(0, 5, 0);
scene.add(drone);

// --- Resize ---------------------------------------------------------------------

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// --- Stats overlay (helps when testing on the target devices) -----------------

const statsEl = document.querySelector<HTMLPreElement>('#stats')!;
const gl = renderer.getContext();
const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
const gpu = debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : 'unbekannt';
let frames = 0;
let lastStats = performance.now();

function updateStats(now: number) {
  frames++;
  if (now - lastStats < 500) return;
  const fps = Math.round((frames * 1000) / (now - lastStats));
  frames = 0;
  lastStats = now;
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  statsEl.textContent = [
    `${fps} fps · ${isMobile ? 'Mobile' : 'Desktop'}`,
    `${size.x}×${size.y} px · Pixel-Ratio ${renderer.getPixelRatio()}`,
    `GPU: ${gpu.slice(0, 40)}`,
  ].join('\n');
}

// --- Loop -----------------------------------------------------------------------

const timer = new THREE.Timer();
renderer.setAnimationLoop((time) => {
  timer.update(time);
  const t = timer.getElapsed();
  drone.position.y = 5 + Math.sin(t * 1.6) * 0.25;
  drone.rotation.y = t * 0.3;
  for (const r of rotors) r.rotation.y += timer.getDelta() * 50;
  controls.update();
  renderer.render(scene, camera);
  updateStats(performance.now());
});
