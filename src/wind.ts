import * as THREE from 'three';

/** Slowly turning light wind (about 1-5 m/s) with gusts, a bit stronger higher up. Deterministic. */
export class Wind {
  readonly base = new THREE.Vector3();
  strength = 0;

  update(t: number) {
    const angle = 0.6 + Math.sin(t * 0.02) * 0.8;
    const steady = 1.5 + Math.sin(t * 0.05) * 0.8;
    const gust = Math.max(0, Math.sin(t * 0.7) * Math.sin(t * 0.23)) * 2.5;
    this.strength = steady + gust;
    this.base.set(Math.cos(angle) * this.strength, 0, Math.sin(angle) * this.strength);
  }

  /** Wind vector at a given height above ground. */
  at(altitude: number, out: THREE.Vector3) {
    return out.copy(this.base).multiplyScalar(1 + Math.max(0, altitude) / 150);
  }
}
