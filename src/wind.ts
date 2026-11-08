import * as THREE from 'three';

/** Slowly turning wind with gusts. Stronger higher up. Deterministic, no randomness. */
export class Wind {
  readonly base = new THREE.Vector3();
  strength = 0;

  update(t: number) {
    const angle = 0.6 + Math.sin(t * 0.02) * 0.8;
    const steady = 2.5 + Math.sin(t * 0.05) * 1.5;
    const gust = Math.max(0, Math.sin(t * 0.7) * Math.sin(t * 0.23)) * 4;
    this.strength = steady + gust;
    this.base.set(Math.cos(angle) * this.strength, 0, Math.sin(angle) * this.strength);
  }

  /** Wind vector at a given height above ground. */
  at(altitude: number, out: THREE.Vector3) {
    return out.copy(this.base).multiplyScalar(1 + Math.max(0, altitude) / 60);
  }
}
