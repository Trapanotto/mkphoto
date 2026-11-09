import * as THREE from 'three';
import { addHull } from './outline';
import { toon } from './toon';

/**
 * A foldable camera drone in the style of today's consumer models (no brand):
 * slim grey body, four folding arms, two-blade props, a 3-axis gimbal camera at the nose,
 * obstacle sensors, vents, landing feet and navigation lights. Forward is -z.
 */
export interface DroneModel {
  group: THREE.Group;
  /** Spins the props; speed in rad/s. Fast props blur into a disc. */
  spin(angle: number, speed: number): void;
  /** Tilts the camera (radians, negative = down). */
  setGimbal(pitch: number): void;
  /** Blinks the rear light. */
  blink(time: number): void;
}

const BODY = '#686d75';
const BODY_LIGHT = '#8b9099';
const DARK = '#25282d';
const BLACK = '#121315';

export function createDroneModel(): DroneModel {
  const group = new THREE.Group();
  const body = toon(BODY);
  const light = toon(BODY_LIGHT);
  const dark = toon(DARK);
  const black = toon(BLACK);

  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, hull = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    if (hull) addHull(m, hull);
    group.add(m);
    return m;
  };

  // fuselage: main shell, lighter top cover, tapered nose, battery at the back
  box(0.5, 0.24, 0.95, body, 0, 0, 0.05, 0, 0, 0, 0.02);
  box(0.42, 0.06, 0.8, light, 0, 0.14, 0.02);
  box(0.4, 0.18, 0.3, body, 0, -0.01, -0.5, 0.25, 0, 0, 0.02);
  box(0.44, 0.18, 0.36, light, 0, 0.02, 0.48);
  for (let i = 0; i < 4; i++) box(0.36, 0.012, 0.03, dark, 0, 0.115, 0.36 + i * 0.07); // battery grip
  for (let i = 0; i < 5; i++) box(0.05, 0.012, 0.22, dark, -0.12 + i * 0.06, 0.175, -0.1); // vents
  box(0.14, 0.04, 0.14, light, 0, 0.19, 0.15); // GPS dome

  // obstacle sensors: stereo pairs front and back
  const eye = new THREE.CylinderGeometry(0.035, 0.035, 0.02, 12);
  for (const x of [-0.09, 0.09]) {
    const f = new THREE.Mesh(eye, black);
    f.rotation.x = Math.PI / 2;
    f.position.set(x, 0.05, -0.66);
    const b = f.clone();
    b.position.z = 0.67;
    group.add(f, b);
  }

  // folding arms with motors, feet and props
  const rotors: THREE.Group[] = [];
  const blurs: THREE.Mesh[] = [];
  const blurMat = new THREE.MeshBasicMaterial({ color: '#c8ccd2', transparent: true, opacity: 0, depthWrite: false });
  const blade = new THREE.BoxGeometry(0.62, 0.012, 0.07);
  blade.translate(0, 0, 0);
  const arms: [number, number, number, number][] = [
    // x, z at the motor, and where the arm meets the body
    [-0.62, -0.5, -0.22, -0.3],
    [0.62, -0.5, 0.22, -0.3],
    [-0.6, 0.55, -0.2, 0.35],
    [0.6, 0.55, 0.2, 0.35],
  ];
  arms.forEach(([mx, mz, bx, bz], i) => {
    const front = mz < 0;
    const y = front ? 0.04 : -0.06;
    const len = Math.hypot(mx - bx, mz - bz);
    box(0.07, 0.05, len, body, (mx + bx) / 2, y, (mz + bz) / 2, 0, Math.atan2(mx - bx, mz - bz), 0, 0.015);
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.1, 12), dark);
    motor.position.set(mx, y + 0.06, mz);
    group.add(motor);
    // feet under the motors
    box(0.04, 0.16, 0.04, dark, mx, y - 0.1, mz);
    // nav lights: red left, green right at the front, white at the back
    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.03, 8, 6),
      new THREE.MeshBasicMaterial({ color: front ? (mx < 0 ? '#ff3030' : '#30ff60') : '#ffffff' }),
    );
    led.position.set(mx, y - 0.04, mz + (front ? -0.07 : 0.07));
    led.userData.rear = !front;
    group.add(led);

    const rotor = new THREE.Group();
    rotor.position.set(mx, y + 0.13, mz);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 8), black);
    const b1 = new THREE.Mesh(blade, black);
    b1.rotation.z = 0.06 * (i % 2 ? 1 : -1);
    rotor.add(hub, b1);
    group.add(rotor);
    rotors.push(rotor);
    const blur = new THREE.Mesh(new THREE.CircleGeometry(0.33, 24), blurMat);
    blur.rotation.x = -Math.PI / 2;
    blur.position.set(mx, y + 0.13, mz);
    group.add(blur);
    blurs.push(blur);
  });

  // 3-axis gimbal under the nose: yoke, then the camera that tilts
  box(0.2, 0.05, 0.1, dark, 0, -0.14, -0.55);
  const yoke = new THREE.Group();
  yoke.position.set(0, -0.2, -0.6);
  group.add(yoke);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.05), dark);
  armL.position.set(-0.12, 0, 0);
  const armR = armL.clone();
  armR.position.x = 0.12;
  yoke.add(armL, armR);
  const cam = new THREE.Group();
  yoke.add(cam);
  const camBody = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.15), dark);
  addHull(camBody, 0.012);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.05, 16), black);
  lens.rotation.x = Math.PI / 2;
  lens.position.z = -0.095;
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.038, 16), new THREE.MeshBasicMaterial({ color: '#2a5a8a' }));
  glass.position.z = -0.121;
  glass.rotation.y = Math.PI;
  cam.add(camBody, lens, glass);

  const leds = group.children.filter((c) => c.userData.rear);

  return {
    group,
    spin(angle, speed) {
      const fast = Math.min(1, speed / 40);
      for (const r of rotors) {
        r.rotation.y = angle;
        // at speed the blades are hard to see, the blur disc takes over
        r.children[1].visible = fast < 0.9;
      }
      blurMat.opacity = fast * 0.35;
      for (const b of blurs) b.visible = fast > 0.05;
    },
    setGimbal(pitch) {
      cam.rotation.x = pitch;
    },
    blink(time) {
      const on = Math.sin(time * 6) > 0.6;
      for (const l of leds) l.visible = on;
    },
  };
}
