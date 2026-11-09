import * as THREE from 'three';
import { windowNight } from './buildings';
import { daylightLevel } from './world';
import { outlineColor } from './outline';
import type { Sky } from './sky';

interface Palette {
  hour: number;
  skyTop: string;
  horizon: string;
  sun: string;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  lake: string;
  outline: string;
  stars: number;
  windows: number;
  fogNear: number;
  fogFar: number;
}

// Poster palettes: morning rose/gold, clear noon, orange/violet evening, ink-blue night
const PALETTES: Palette[] = [
  { hour: 0, skyTop: '#0b1640', horizon: '#1d2e63', sun: '#9fb4ff', sunIntensity: 0.45, hemiSky: '#3a4d8f', hemiGround: '#0f1a2e', hemiIntensity: 0.6, lake: '#1b3566', outline: '#03050f', stars: 1, windows: 1, fogNear: 200, fogFar: 7000 },
  { hour: 5.5, skyTop: '#2a2f6b', horizon: '#c77fa0', sun: '#ff9a8a', sunIntensity: 0.7, hemiSky: '#8a7ab8', hemiGround: '#2d3550', hemiIntensity: 0.75, lake: '#4a5a9a', outline: '#140a24', stars: 0.4, windows: 0.8, fogNear: 300, fogFar: 9000 },
  { hour: 7.5, skyTop: '#6fa8dc', horizon: '#ffc9a8', sun: '#ffd29a', sunIntensity: 1.9, hemiSky: '#ffe3d0', hemiGround: '#6b7a5a', hemiIntensity: 1.0, lake: '#5aa0d8', outline: '#2a1a26', stars: 0, windows: 0, fogNear: 400, fogFar: 14000 },
  { hour: 12.5, skyTop: '#3d8fe0', horizon: '#c4e8ff', sun: '#fff6e8', sunIntensity: 2.6, hemiSky: '#ffffff', hemiGround: '#5a7a5a', hemiIntensity: 1.2, lake: '#3d8fd1', outline: '#14202e', stars: 0, windows: 0, fogNear: 500, fogFar: 20000 },
  { hour: 17, skyTop: '#4a86c9', horizon: '#ffdca8', sun: '#ffcf8a', sunIntensity: 2.2, hemiSky: '#fff0d8', hemiGround: '#6a6a4a', hemiIntensity: 1.1, lake: '#4a8fc8', outline: '#22180e', stars: 0, windows: 0, fogNear: 450, fogFar: 17000 },
  { hour: 19.5, skyTop: '#4b3f8f', horizon: '#ff9a5a', sun: '#ff8040', sunIntensity: 1.6, hemiSky: '#c99ad0', hemiGround: '#4a3a50', hemiIntensity: 0.9, lake: '#6a5aa8', outline: '#2a0f2a', stars: 0, windows: 0.7, fogNear: 350, fogFar: 12000 },
  { hour: 21, skyTop: '#1f2560', horizon: '#7a4a8a', sun: '#c77aa0', sunIntensity: 0.6, hemiSky: '#6a5a9a', hemiGround: '#20203a', hemiIntensity: 0.65, lake: '#2f3a7a', outline: '#0a0618', stars: 0.6, windows: 1, fogNear: 250, fogFar: 8000 },
  { hour: 24, skyTop: '#0b1640', horizon: '#1d2e63', sun: '#9fb4ff', sunIntensity: 0.45, hemiSky: '#3a4d8f', hemiGround: '#0f1a2e', hemiIntensity: 0.6, lake: '#1b3566', outline: '#03050f', stars: 1, windows: 1, fogNear: 200, fogFar: 7000 },
];

/** Hours the "Zeit" button jumps between. */
const STOPS = [7.5, 12.5, 17, 19.5, 22];

export interface Environment {
  sky: Sky;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  fog: THREE.Fog;
  lake: { color: THREE.Color };
  windows: THREE.MeshBasicMaterial;
}

const c1 = new THREE.Color();
const c2 = new THREE.Color();
const mixColor = (out: THREE.Color, a: string, b: string, t: number) => out.copy(c1.set(a)).lerp(c2.set(b), t);
const WINDOW_OFF = new THREE.Color('#3a2a22');
const WINDOW_ON = new THREE.Color('#ffc864');

/** Game clock. One in-game day lasts 12 real minutes. */
export class TimeOfDay {
  hour = 10;
  hoursPerSecond = 24 / (12 * 60);

  update(dt: number) {
    this.hour = (this.hour + dt * this.hoursPerSecond) % 24;
  }

  /** Jump to the next interesting light. */
  skip() {
    const next = STOPS.find((h) => h > this.hour + 0.1);
    this.hour = next ?? STOPS[0];
  }

  get label() {
    const h = Math.floor(this.hour);
    const m = Math.floor((this.hour - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  apply(env: Environment) {
    const i = PALETTES.findIndex((p) => p.hour > this.hour);
    const a = PALETTES[i - 1];
    const b = PALETTES[i];
    const raw = (this.hour - a.hour) / (b.hour - a.hour);
    const t = raw * raw * (3 - 2 * raw);
    const num = (k: 'sunIntensity' | 'hemiIntensity' | 'stars' | 'windows' | 'fogNear' | 'fogFar') =>
      a[k] + (b[k] - a[k]) * t;

    mixColor(env.sky.top, a.skyTop, b.skyTop, t);
    mixColor(env.sky.horizon, a.horizon, b.horizon, t);
    mixColor(env.sky.sunColor, a.sun, b.sun, t);
    env.fog.color.copy(env.sky.horizon);
    env.fog.near = num('fogNear');
    env.fog.far = num('fogFar');
    mixColor(env.sun.color, a.sun, b.sun, t);
    env.sun.intensity = num('sunIntensity');
    mixColor(env.hemi.color, a.hemiSky, b.hemiSky, t);
    mixColor(env.hemi.groundColor, a.hemiGround, b.hemiGround, t);
    env.hemi.intensity = num('hemiIntensity');
    mixColor(env.lake.color, a.lake, b.lake, t);
    mixColor(outlineColor, a.outline, b.outline, t);
    env.sky.starOpacity = num('stars');
    env.windows.color.copy(WINDOW_OFF).lerp(WINDOW_ON, num('windows'));
    windowNight.value = num('windows');
    daylightLevel.value = 1 - num('stars');

    // sun path: rises in the east (+x), sets in the west; the moon takes over at night
    const angle = ((this.hour - 6) / 12) * Math.PI;
    const elevation = Math.sin(angle);
    const day = elevation > -0.05;
    const az = day ? angle : angle - Math.PI;
    const el = day ? Math.max(0.08, elevation) : Math.max(0.35, -elevation);
    env.sky.sunDir.set(Math.cos(az) * Math.cos(el), Math.sin(el), -0.45).normalize();
    env.sun.position.copy(env.sky.sunDir).multiplyScalar(100);
  }
}
