import * as THREE from 'three';
import type { Drone } from './drone';

/** Chase camera behind the drone. Mouse wheel zooms, right stick tilts. */
export class FollowCamera {
  distance = 8;
  private pitch = 0.32;
  private readonly desired = new THREE.Vector3();
  private readonly target = new THREE.Vector3();

  /** Turned off while the photo camera uses the mouse wheel. */
  wheelEnabled = true;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    canvas: HTMLElement,
    /** Lowest point the camera may go: terrain or water. */
    private readonly floorAt: (x: number, z: number) => number,
    /** True where a building or the bridge would block the camera. */
    private readonly solidAt: (x: number, y: number, z: number) => boolean,
  ) {
    canvas.addEventListener(
      'wheel',
      (e) => {
        if (!this.wheelEnabled) return;
        this.distance = THREE.MathUtils.clamp(this.distance * (1 + Math.sign(e.deltaY) * 0.1), 4, 18);
      },
      { passive: true },
    );
  }

  /** Jump straight into place, e.g. after a reset. */
  snap(drone: Drone) {
    this.update(drone, 0, 1e3);
  }

  update(drone: Drone, pitchInput: number, dt: number) {
    // stick tilts the view between nearly level and steeply from above
    const goalPitch = THREE.MathUtils.clamp(0.32 + pitchInput * 0.6, 0.05, 1.1);
    this.pitch += (goalPitch - this.pitch) * (1 - Math.exp(-4 * dt));

    const back = Math.cos(this.pitch) * this.distance;
    this.desired.set(
      drone.pos.x + Math.sin(drone.yaw) * back,
      drone.pos.y + Math.sin(this.pitch) * this.distance,
      drone.pos.z + Math.cos(drone.yaw) * back,
    );
    const minY = this.floorAt(this.desired.x, this.desired.z) + 0.8;
    if (this.desired.y < minY) this.desired.y = minY;

    // a wall between drone and camera: slide the camera in towards the drone
    const dx = this.desired.x - drone.pos.x;
    const dy = this.desired.y - drone.pos.y;
    const dz = this.desired.z - drone.pos.z;
    for (let k = 1; k >= 0.15; k -= 0.085) {
      const x = drone.pos.x + dx * k;
      const y = drone.pos.y + dy * k;
      const z = drone.pos.z + dz * k;
      if (!this.solidAt(x, y, z)) break;
      this.desired.set(drone.pos.x + dx * (k - 0.085), drone.pos.y + dy * (k - 0.085), drone.pos.z + dz * (k - 0.085));
    }

    this.camera.position.lerp(this.desired, 1 - Math.exp(-5 * dt));
    this.target.set(drone.pos.x, drone.pos.y + 0.6, drone.pos.z);
    this.camera.lookAt(this.target);
  }
}
