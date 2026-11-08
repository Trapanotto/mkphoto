import * as THREE from 'three';
import { toon } from './toon';

/** Upright obstacle the drone can bump into. Cones narrow towards the top. */
export interface Collider {
  kind: 'cylinder' | 'cone';
  x: number;
  z: number;
  r: number;
  h: number;
  base: number;
}

export const HOME = new THREE.Vector3(0, 0, 28.5);
export const FLIGHT_RADIUS = 185;
export const MAX_ALTITUDE = 120;

/** Terrain height in metres. Flat around the lake, hills further out. */
export function heightAt(x: number, z: number): number {
  const d = Math.hypot(x, z);
  if (d <= 30) return 0;
  const hills = Math.sin(x * 0.05) * Math.cos(z * 0.04) * 4 + Math.sin(x * 0.013 + z * 0.02) * 6;
  return Math.max(0, (d - 30) * 0.06 * (hills + 6));
}

export interface World {
  colliders: Collider[];
  setWind(wind: THREE.Vector3): void;
}

export function createWorld(scene: THREE.Scene): World {
  const colliders: Collider[] = [];

  const ground = new THREE.PlaneGeometry(400, 400, 128, 128);
  ground.rotateX(-Math.PI / 2);
  const pos = ground.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  ground.computeVertexNormals();
  scene.add(new THREE.Mesh(ground, toon('#7fb86a')));

  const lake = new THREE.Mesh(new THREE.CircleGeometry(26, 48), toon('#3d8fd1'));
  lake.rotation.x = -Math.PI / 2;
  lake.position.y = 0.05;
  scene.add(lake);

  // Stylised mountains with snow caps
  const mountains: [number, number, number, number][] = [
    [-90, -120, 34, 70],
    [-30, -150, 40, 90],
    [40, -130, 30, 64],
    [110, -100, 36, 76],
  ];
  for (const [x, z, r, h] of mountains) {
    const base = heightAt(x, z) - 2;
    const rock = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), toon('#8a94a6'));
    rock.position.set(x, base + h / 2, z);
    const snow = new THREE.Mesh(new THREE.ConeGeometry(r * 0.38, h * 0.38, 6), toon('#ffffff'));
    snow.position.set(x, base + h - h * 0.19 + 0.1, z);
    scene.add(rock, snow);
    colliders.push({ kind: 'cone', x, z, r, h, base });
  }

  // A tower in the lake as a stand-in landmark
  const tower = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 8, 8), toon('#c9a77c'));
  body.position.y = 4;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.1, 3, 8), toon('#b2442f'));
  roof.position.y = 9.5;
  tower.add(body, roof);
  tower.position.set(-8, 0, -6);
  scene.add(tower);
  colliders.push({ kind: 'cylinder', x: -8, z: -6, r: 2.1, h: 11, base: 0 });

  // Home pad with an "H"
  const pad = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.1, 32), toon('#2b2b2b'));
  const markMat = toon('#ffffff');
  const barL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 1.4), markMat);
  barL.position.set(-0.45, 0.06, 0);
  const barR = barL.clone();
  barR.position.x = 0.45;
  const barM = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.02, 0.18), markMat);
  barM.position.y = 0.06;
  pad.add(disc, barL, barR, barM);
  pad.position.set(HOME.x, heightAt(HOME.x, HOME.z) + 0.05, HOME.z);
  scene.add(pad);

  // Windsock next to the pad
  const sockPole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 6), toon('#dddddd'));
  sockPole.position.set(HOME.x + 3, 1.5, HOME.z);
  const sock = new THREE.Group();
  const sockCone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.4, 12, 1, true), toon('#ff6a1a'));
  sockCone.material.side = THREE.DoubleSide;
  sockCone.rotation.z = Math.PI / 2; // tip points along +x
  sockCone.position.x = 0.7;
  sock.add(sockCone);
  sock.position.set(HOME.x + 3, 2.9, HOME.z);
  scene.add(sockPole, sock);

  return {
    colliders,
    setWind(wind) {
      const strength = Math.hypot(wind.x, wind.z);
      // points downwind; hangs limp at calm, horizontal at ~8 m/s
      sock.rotation.set(0, Math.atan2(-wind.z, wind.x), -Math.max(0, 1 - strength / 8) * 1.2);
    },
  };
}
