import * as THREE from 'three';
import { toon } from './toon';
import { FLIGHT_RADIUS, HOME, MAX_ALTITUDE, heightAt, type Collider } from './world';

export type FlightMode = 'assist' | 'pro';

export interface FlightInput {
  moveX: number; // strafe, right = +1
  moveY: number; // forward = +1
  yaw: number; // turn right = +1
  lift: number; // climb = +1
}

/** Height of the drone's centre above the ground when it sits on it. */
const REST = 0.35;
/** Full battery lasts 12 minutes of normal flight. */
const DRAIN_PER_SECOND = 100 / (12 * 60);

const SETTINGS = {
  assist: { maxSpeed: 11, maxClimb: 4.5, yawRate: 1.7, response: 3.5, windCompensation: 0.75 },
  pro: { maxSpeed: 18, maxClimb: 6, yawRate: 2.2, response: 1.6, windCompensation: 0.2 },
};

export class Drone {
  readonly group = new THREE.Group();
  readonly pos = new THREE.Vector3();
  /** Velocity the pilot asks for (air velocity). */
  readonly vel = new THREE.Vector3();
  /** Actual movement including wind drift. */
  readonly groundVel = new THREE.Vector3();
  yaw = 0;
  battery = 100;
  grounded = true;
  mode: FlightMode = 'assist';
  atBoundary = false;
  atCeiling = false;

  private readonly rotors: THREE.Mesh[] = [];
  private tiltX = 0;
  private tiltZ = 0;
  private rotorAngle = 0;

  constructor() {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 1.2), toon('#f2f2f2'));
    this.group.add(hull);
    const corners: [number, number][] = [
      [1, -1],
      [-1, -1],
      [1, 1],
      [-1, 1],
    ];
    for (const [x, z] of corners) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 1.1), toon('#222222'));
      arm.position.set(x * 0.45, 0, z * 0.45);
      arm.rotation.y = Math.atan2(x, z);
      // front rotors red, rear grey, so the heading is readable
      const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.04, 16), toon(z < 0 ? '#d23a2a' : '#9a9a9a'));
      rotor.position.set(x * 0.85, 0.2, z * 0.85);
      this.group.add(arm, rotor);
      this.rotors.push(rotor);
    }
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), toon('#111111'));
    lens.position.set(0, -0.25, -0.5);
    this.group.add(lens);
    this.reset();
  }

  get settings() {
    return SETTINGS[this.mode];
  }

  get empty() {
    return this.battery <= 0;
  }

  get altitude() {
    return this.pos.y - REST - heightAt(this.pos.x, this.pos.z);
  }

  /** Back to the home pad with a full battery. */
  reset() {
    this.pos.set(HOME.x, heightAt(HOME.x, HOME.z) + REST, HOME.z);
    this.vel.set(0, 0, 0);
    this.groundVel.set(0, 0, 0);
    this.yaw = 0;
    this.battery = 100;
    this.grounded = true;
    this.syncModel();
  }

  update(dt: number, input: FlightInput, wind: THREE.Vector3, colliders: Collider[]) {
    const s = this.settings;
    let { moveX, moveY, yaw, lift } = input;
    if (this.empty) {
      // battery dead: no control, slow forced descent
      moveX = moveY = yaw = 0;
      lift = -0.5;
    } else if (this.grounded && this.mode === 'assist' && lift <= 0 && (moveX !== 0 || moveY !== 0)) {
      // assist: moving the stick on the ground takes off automatically
      lift = 0.6;
    }

    this.yaw -= yaw * s.yawRate * dt;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // forward = (-sin, 0, -cos), right = (cos, 0, -sin)
    const targetX = (-sin * moveY + cos * moveX) * s.maxSpeed;
    const targetZ = (-cos * moveY - sin * moveX) * s.maxSpeed;
    const targetY = lift * s.maxClimb;

    const k = 1 - Math.exp(-s.response * dt);
    this.vel.x += (targetX - this.vel.x) * k;
    this.vel.z += (targetZ - this.vel.z) * k;
    this.vel.y += (targetY - this.vel.y) * (1 - Math.exp(-4 * dt));

    const takingOff = targetY > 0;
    if (this.grounded && !takingOff) {
      // sitting on the ground: no sliding, no wind drift
      this.vel.set(0, Math.max(0, this.vel.y), 0);
      this.groundVel.set(0, 0, 0);
    } else {
      const drift = 1 - s.windCompensation;
      this.groundVel.set(this.vel.x + wind.x * drift, this.vel.y, this.vel.z + wind.z * drift);
    }
    this.pos.addScaledVector(this.groundVel, dt);

    this.collide(colliders);

    // battery
    if (!this.grounded) {
      const speed = Math.hypot(this.vel.x, this.vel.z) / s.maxSpeed;
      const climb = Math.max(0, this.vel.y) / s.maxClimb;
      const load = 1 + 0.6 * speed + 0.4 * climb + 0.3 * (Math.hypot(wind.x, wind.z) / 8);
      this.battery = Math.max(0, this.battery - DRAIN_PER_SECOND * load * dt);
    } else if (Math.hypot(this.pos.x - HOME.x, this.pos.z - HOME.z) < 2.5) {
      this.battery = Math.min(100, this.battery + 25 * dt);
    }

    // visual tilt: nose down when flying forward, bank into sideways motion
    const fwd = (-sin * this.vel.x - cos * this.vel.z) / s.maxSpeed;
    const side = (cos * this.vel.x - sin * this.vel.z) / s.maxSpeed;
    const t = 1 - Math.exp(-6 * dt);
    this.tiltX += (-fwd * 0.35 - this.tiltX) * t;
    this.tiltZ += (-side * 0.35 - this.tiltZ) * t;

    const spin = this.empty && this.grounded ? 0 : this.grounded && !takingOff ? 10 : 45;
    this.rotorAngle += spin * dt;
    this.syncModel();
  }

  private collide(colliders: Collider[]) {
    const p = this.pos;
    const ground = heightAt(p.x, p.z) + REST;
    if (p.y <= ground) {
      p.y = ground;
      if (this.vel.y < 0) this.vel.y = 0;
    }
    this.grounded = p.y <= ground + 0.02;

    this.atCeiling = p.y > ground + MAX_ALTITUDE;
    if (this.atCeiling) {
      p.y = ground + MAX_ALTITUDE;
      this.vel.y = Math.min(0, this.vel.y);
    }

    for (const c of colliders) {
      if (p.y > c.base + c.h + 0.5) continue;
      const along = Math.min(1, Math.max(0, (p.y - c.base) / c.h));
      const radius = (c.kind === 'cone' ? c.r * (1 - along) : c.r) + 0.7;
      this.pushOut(p.x - c.x, p.z - c.z, radius, c.x, c.z, false);
    }

    this.atBoundary = Math.hypot(p.x, p.z) > FLIGHT_RADIUS;
    if (this.atBoundary) this.pushOut(p.x, p.z, FLIGHT_RADIUS, 0, 0, true);
  }

  /** Keeps the drone outside (or, for the boundary, inside) a circle and removes velocity into it. */
  private pushOut(dx: number, dz: number, radius: number, cx: number, cz: number, inside: boolean) {
    const d = Math.hypot(dx, dz);
    if (d < 1e-4 || (inside ? d <= radius : d >= radius)) return;
    const nx = dx / d;
    const nz = dz / d;
    this.pos.x = cx + nx * radius;
    this.pos.z = cz + nz * radius;
    const vn = this.vel.x * nx + this.vel.z * nz;
    if (inside ? vn > 0 : vn < 0) {
      this.vel.x -= vn * nx;
      this.vel.z -= vn * nz;
    }
  }

  private syncModel() {
    this.group.position.copy(this.pos);
    this.group.rotation.set(this.tiltX, this.yaw, this.tiltZ, 'YXZ');
    for (const r of this.rotors) r.rotation.y = this.rotorAngle;
  }
}
