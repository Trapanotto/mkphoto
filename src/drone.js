// Drohnen-Flugmodell (vereinfacht, an DJI-Mavic angelehnt) + Gimbal-Kamera.
import * as THREE from 'three';

const DEG = Math.PI / 180;

export class Drone {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;            // rad, 0 = Blick nach Norden (-z)
    this.yawRate = 0;
    this.gimbal = -10 * DEG; // Kameraneigung
    this.zoom = 1;
    this.tilt = new THREE.Vector2(); // optische Neigung beim Beschleunigen
    this.shake = 0;
    this.wind = new THREE.Vector3();
    this.gust = 0;
    this.t = 0;
    this.agl = 0;
    this.maxAgl = 120;
    this.baseFov = 72;
    this.speed = 0;
  }

  reset(pos, yawDeg, gimbalDeg = -10) {
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.yaw = yawDeg * DEG;
    this.yawRate = 0;
    this.gimbal = gimbalDeg * DEG;
    this.zoom = 1;
  }

  update(dt, a, env) {
    this.t += dt;
    const sport = a.sport;
    const maxH = sport ? 19 : 11;  // m/s horizontal
    const maxV = sport ? 6 : 4;
    const maxYaw = (sport ? 110 : 75) * DEG;

    // Drehen: Maus direkt, Tasten/Sticks mit Trägheit
    const yawTarget = a.yaw * maxYaw;
    this.yawRate += (yawTarget - this.yawRate) * (1 - Math.exp(-dt * 6));
    const mouseYaw = a.mouseYaw * 0.0022 / this.zoom;
    this.yaw -= this.yawRate * dt + mouseYaw;
    this.angRate = Math.abs(this.yawRate) + Math.abs(mouseYaw / Math.max(dt, 1e-3)) * 0.5;

    // Gimbal
    this.gimbal += a.gimbal * 55 * DEG * dt / Math.sqrt(this.zoom) + a.mouseGimbal * 0.0022 / this.zoom;
    this.gimbal = THREE.MathUtils.clamp(this.gimbal, -90 * DEG, 25 * DEG);
    this.angRate += Math.abs(a.gimbal) * 0.5 + Math.abs(a.mouseGimbal) * 0.02;

    // Zoom 1x – 4x
    this.zoom *= Math.exp(a.zoom * dt * 1.2 - a.wheel * 0.12);
    this.zoom = THREE.MathUtils.clamp(this.zoom, 1, 4);

    // Ziel-Geschwindigkeit in Weltkoordinaten
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const target = new THREE.Vector3()
      .addScaledVector(fwd, a.pitch * maxH)
      .addScaledVector(right, a.roll * maxH);
    target.y = a.throttle * maxV;

    // Wind mit Böen
    this.gust = 0.5 + 0.5 * Math.sin(this.t * 0.7) * Math.sin(this.t * 0.31 + 1.3);
    const windNow = this.wind.clone().multiplyScalar(0.6 + this.gust * 0.8);

    const accH = 1 - Math.exp(-dt * (sport ? 2.2 : 2.8));
    const accV = 1 - Math.exp(-dt * 3.5);
    const prev = this.vel.clone();
    this.vel.x += (target.x - this.vel.x) * accH;
    this.vel.z += (target.z - this.vel.z) * accH;
    this.vel.y += (target.y - this.vel.y) * accV;
    // Wind verschiebt die Drohne leicht (Positionshaltung gleicht nur teilweise aus)
    const drift = windNow.clone().multiplyScalar(0.12);

    const step = this.vel.clone().add(drift).multiplyScalar(dt);
    const next = this.pos.clone().add(step);

    // Kollision mit Gebäuden / Modellen horizontal
    if (env.collide) {
      const hit = env.collide(this.pos, step);
      if (hit) {
        next.copy(this.pos);
        this.vel.multiplyScalar(-0.2);
        env.onBump?.();
      }
    }

    // Boden
    const ground = env.ground(next.x, next.z);
    if (ground !== null) {
      this.groundY = ground;
      const minY = ground + 1.2;
      if (next.y < minY) { next.y = minY; if (this.vel.y < 0) this.vel.y = 0; }
      // Höhenlimit 120 m über Grund
      const maxY = ground + this.maxAgl;
      if (next.y > maxY) { next.y = Math.max(this.pos.y - 0.5 * dt, maxY); if (this.vel.y > 0) this.vel.y *= 0.5; }
      this.agl = next.y - ground;
    }

    // Geofence (Flugverbotszonen)
    if (env.fence) env.fence(next, this.vel);

    this.pos.copy(next);
    this.speed = Math.hypot(this.vel.x, this.vel.z);

    // optische Neigung + Vibration
    const acc = this.vel.clone().sub(prev).divideScalar(Math.max(dt, 1e-3));
    const localAccF = acc.dot(fwd), localAccR = acc.dot(right);
    this.tilt.x += (THREE.MathUtils.clamp(-localAccF * 0.012, -0.12, 0.12) - this.tilt.x) * (1 - Math.exp(-dt * 5));
    this.tilt.y += (THREE.MathUtils.clamp(localAccR * 0.012, -0.12, 0.12) - this.tilt.y) * (1 - Math.exp(-dt * 5));
    const windShake = this.wind.length() * this.gust * 0.0009;
    this.shake = windShake + this.speed * 0.00012;

    this.applyCamera();
  }

  // Unschärfe-Faktor 0 (scharf) .. 1 (stark verwackelt) für die Bewertung
  get motionBlur() {
    const lin = this.speed / 11;
    const ang = this.angRate / (60 * DEG);
    const wind = this.wind.length() * this.gust / 14;
    return THREE.MathUtils.clamp(lin * 0.55 + ang * 0.6 * this.zoom + wind * 0.35 * this.zoom, 0, 1);
  }

  applyCamera() {
    const cam = this.camera;
    cam.position.copy(this.pos);
    const jx = Math.sin(this.t * 37.1) * this.shake, jy = Math.sin(this.t * 29.3 + 1.7) * this.shake;
    cam.rotation.set(0, 0, 0);
    cam.rotation.order = 'YXZ';
    cam.rotation.y = this.yaw + jx;
    cam.rotation.x = this.gimbal + jy;
    cam.rotation.z = this.tilt.y * 0.15; // Gimbal stabilisiert fast vollständig
    const fov = 2 * Math.atan(Math.tan((this.baseFov * DEG) / 2) / this.zoom) / DEG;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
  }

  get headingDeg() {
    return ((-this.yaw / DEG) % 360 + 360) % 360;
  }
}
