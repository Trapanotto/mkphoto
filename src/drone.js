// Drohnen-Flugmodell (an DJI Mini/Air angelehnt) mit GPS-Positionshaltung und 3-Achsen-Gimbal.
import * as THREE from 'three';

const DEG = Math.PI / 180;

// Flugmodi: Geschwindigkeiten (m/s, °/s), Reaktionszeit (s), Expo (Feinfühligkeit in der Mitte)
export const MODES = {
  tripod: { label: 'Stativ', h: 1.0, v: 0.8, yaw: 12, gim: 12, tau: 0.6, yawTau: 0.45, expo: 0.3, comp: 1.0 },
  cine:   { label: 'Cine',   h: 4.5, v: 2.0, yaw: 28, gim: 25, tau: 0.75, yawTau: 0.4, expo: 0.65, comp: 1.0 },
  normal: { label: 'Normal', h: 10,  v: 4.0, yaw: 60, gim: 45, tau: 0.42, yawTau: 0.22, expo: 0.45, comp: 1.0 },
  sport:  { label: 'Sport',  h: 19,  v: 6.0, yaw: 110, gim: 70, tau: 0.32, yawTau: 0.15, expo: 0.25, comp: 0.85 },
};
export const MODE_ORDER = ['cine', 'normal', 'sport'];

const expo = (x, e) => x * (1 - e) + x * x * x * e;
const damp = (cur, target, tau, dt) => cur + (target - cur) * (1 - Math.exp(-dt / Math.max(tau, 1e-3)));

export class Drone {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;            // rad, 0 = Blick nach Norden (-z)
    this.yawRate = 0;
    this.gimbal = -10 * DEG;
    this.gimbalTarget = this.gimbal;
    this.yawTarget = 0;       // für geglättete Maus
    this.zoom = 1;
    this.zoomTarget = 1;
    this.mode = 'normal';
    this.windEnabled = true;
    this.wind = new THREE.Vector3();
    this.gust = 0;
    this.t = 0;
    this.agl = 0;
    this.maxAgl = 120;
    this.baseFov = 72;
    this.speed = 0;
    this.angRate = 0;
    this.tilt = new THREE.Vector2(); // Neigung des Rumpfs (für 3rd-Person-Modell)
    this.hold = true;                 // GPS-Positionshaltung aktiv (keine Eingabe)
  }

  reset(pos, yawDeg, gimbalDeg = -10) {
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.yaw = this.yawTarget = yawDeg * DEG;
    this.yawRate = 0;
    this.gimbal = this.gimbalTarget = gimbalDeg * DEG;
    this.zoom = this.zoomTarget = 1;
  }

  setMode(m) { if (MODES[m]) this.mode = m; }

  update(dt, a, env) {
    this.t += dt;
    const M = MODES[a.sport ? 'sport' : this.mode];

    // ---------- Drehen: Sticks mit Expo + Trägheit, Maus geglättet
    const yawCmd = expo(a.yaw, M.expo) * M.yaw * DEG;
    this.yawRate = damp(this.yawRate, yawCmd, M.yawTau, dt);
    const mouseScale = 0.0018 / this.zoom * (M === MODES.tripod ? 0.3 : M === MODES.cine ? 0.6 : 1);
    this.yawTarget -= a.mouseYaw * mouseScale;
    this.yawTarget -= this.yawRate * dt;
    const prevYaw = this.yaw;
    this.yaw = damp(this.yaw, this.yawTarget, 0.07, dt);
    const yawVel = (this.yaw - prevYaw) / Math.max(dt, 1e-3);

    // ---------- Gimbal (3 Achsen, Horizont immer gerade)
    this.gimbalTarget += expo(a.gimbal, 0.4) * M.gim * DEG * dt / Math.sqrt(this.zoom) + a.mouseGimbal * mouseScale;
    this.gimbalTarget = THREE.MathUtils.clamp(this.gimbalTarget, -90 * DEG, 25 * DEG);
    const prevG = this.gimbal;
    this.gimbal = damp(this.gimbal, this.gimbalTarget, 0.09, dt);
    const gimVel = (this.gimbal - prevG) / Math.max(dt, 1e-3);
    this.angRate = Math.abs(yawVel) + Math.abs(gimVel);

    // ---------- Zoom 1x – 4x (weich)
    this.zoomTarget *= Math.exp(a.zoom * dt * 1.0 - a.wheel * 0.12);
    this.zoomTarget = THREE.MathUtils.clamp(this.zoomTarget, 1, 4);
    this.zoom = damp(this.zoom, this.zoomTarget, 0.15, dt);

    // ---------- Translation mit GPS-Haltung
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const p = expo(a.pitch, M.expo), r = expo(a.roll, M.expo), th = expo(a.throttle, M.expo * 0.6);
    const target = new THREE.Vector3().addScaledVector(fwd, p * M.h).addScaledVector(right, r * M.h);
    // diagonale Eingabe nicht schneller als geradeaus
    const tl = Math.hypot(target.x, target.z);
    if (tl > M.h) target.multiplyScalar(M.h / tl);
    target.y = th * M.v;
    this.hold = Math.abs(p) + Math.abs(r) + Math.abs(th) < 0.02;

    // Bremsen schneller als Beschleunigen (wie echte Drohnen)
    const tauH = this.hold ? M.tau * 0.6 : M.tau;
    const prev = this.vel.clone();
    this.vel.x = damp(this.vel.x, target.x, tauH, dt);
    this.vel.z = damp(this.vel.z, target.z, tauH, dt);
    this.vel.y = damp(this.vel.y, target.y, 0.3, dt);

    // Wind: Böen, die die GPS-Regelung fast vollständig ausgleicht
    this.gust = 0.5 + 0.5 * Math.sin(this.t * 0.7) * Math.sin(this.t * 0.31 + 1.3);
    const w = this.windEnabled ? this.wind.length() * (0.4 + this.gust) : 0;
    const residual = (1 - M.comp) * 0.15 + 0.004; // was die Regelung nicht schafft
    const drift = this.windEnabled ? this.wind.clone().multiplyScalar(residual * (0.6 + this.gust)) : new THREE.Vector3();

    const step = this.vel.clone().add(drift).multiplyScalar(dt);
    const next = this.pos.clone().add(step);

    if (env.collide) {
      const hit = env.collide(this.pos, step);
      if (hit) {
        next.copy(this.pos);
        this.vel.multiplyScalar(-0.2);
        env.onBump?.();
      }
    }

    const ground = env.ground(next.x, next.z);
    if (ground !== null) {
      this.groundY = ground;
      const minY = ground + 1.2;
      if (next.y < minY) { next.y = minY; if (this.vel.y < 0) this.vel.y = 0; }
      const maxY = ground + this.maxAgl;
      if (next.y > maxY) { next.y = Math.max(this.pos.y - 0.5 * dt, maxY); if (this.vel.y > 0) this.vel.y *= 0.5; }
      this.agl = next.y - ground;
    }
    if (env.fence) env.fence(next, this.vel);

    this.pos.copy(next);
    this.speed = Math.hypot(this.vel.x, this.vel.z);

    // Rumpfneigung (nur optisch, Gimbal kompensiert)
    const acc = this.vel.clone().sub(prev).divideScalar(Math.max(dt, 1e-3));
    this.tilt.x = damp(this.tilt.x, THREE.MathUtils.clamp(-(acc.dot(fwd) * 0.05 + this.vel.dot(fwd) * 0.012), -0.35, 0.35), 0.15, dt);
    this.tilt.y = damp(this.tilt.y, THREE.MathUtils.clamp(acc.dot(right) * 0.05 + this.vel.dot(right) * 0.012, -0.35, 0.35), 0.15, dt);
    // Restvibration: nur bei starkem Wind in Sport/ohne Haltung, sehr klein
    this.vib = (w > 6 ? (w - 6) * 0.00012 : 0) * (M === MODES.sport ? 2 : 0.5) * this.zoom;

    this.applyCamera();
  }

  // Unschärfe 0 (scharf) .. 1 (verwackelt) für die Bewertung
  get motionBlur() {
    const lin = this.speed / 12;
    const ang = this.angRate / (40 * DEG) * this.zoom;
    const vib = (this.vib || 0) * 400;
    return THREE.MathUtils.clamp(lin * 0.5 + ang * 0.6 + vib, 0, 1);
  }

  applyCamera(cam = this.camera) {
    cam.position.copy(this.pos);
    const v = this.vib || 0;
    cam.rotation.order = 'YXZ';
    cam.rotation.set(this.gimbal + Math.sin(this.t * 31) * v, this.yaw + Math.sin(this.t * 23 + 1) * v, 0);
    const fov = 2 * Math.atan(Math.tan((this.baseFov * DEG) / 2) / this.zoom) / DEG;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
  }

  get headingDeg() {
    return ((-this.yaw / DEG) % 360 + 360) % 360;
  }
}
