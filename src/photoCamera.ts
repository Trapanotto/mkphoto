import * as THREE from 'three';
import type { Drone } from './drone';
import type { Landmark } from './landmarks';
import type { Photo } from './photos';

export type GridMode = 'thirds' | 'golden' | 'horizon' | 'off';
const GRIDS: GridMode[] = ['thirds', 'golden', 'horizon', 'off'];
const GRID_LABEL: Record<GridMode, string> = {
  thirds: 'Drittel',
  golden: 'Goldener Schnitt',
  horizon: 'Horizont',
  off: 'Aus',
};

/** Focal length range of the starter camera, in 35 mm equivalent. */
const MIN_FOCAL = 24;
const MAX_FOCAL = 72;
const GIMBAL_MIN = -Math.PI / 2;
const GIMBAL_MAX = 0.35;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/**
 * The drone's photo camera: a viewfinder in 3:2 (2:3 in portrait), zoom, gimbal tilt and grid overlays.
 * The view is rendered full screen; the frame marks the part that becomes the photo.
 */
export class PhotoCamera {
  active = false;
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.3, 25000);
  focal = MIN_FOCAL;
  gimbal = -0.15;
  grid: GridMode = 'thirds';
  /** Frame rectangle in CSS pixels. */
  readonly frame = { x: 0, y: 0, w: 0, h: 0 };

  private readonly el = $('viewfinder');
  private readonly frameEl = $('vf-frame');
  private readonly info = $('vf-info');
  private readonly flash = $('vf-flash');
  private readonly forward = new THREE.Vector3();

  constructor(canvas: HTMLElement) {
    canvas.addEventListener(
      'wheel',
      (e) => {
        if (this.active) this.zoomBy(-Math.sign(e.deltaY) * 0.08);
      },
      { passive: true },
    );
    this.applyGrid();
  }

  get portrait() {
    return window.innerHeight > window.innerWidth;
  }

  setActive(on: boolean) {
    this.active = on;
    this.el.hidden = !on;
    document.body.dataset.mode = on ? 'camera' : 'flight';
    this.layout();
  }

  cycleGrid() {
    this.grid = GRIDS[(GRIDS.indexOf(this.grid) + 1) % GRIDS.length];
    this.applyGrid();
  }

  private applyGrid() {
    this.frameEl.dataset.grid = this.grid;
  }

  zoomBy(amount: number) {
    this.focal = THREE.MathUtils.clamp(this.focal * Math.exp(amount), MIN_FOCAL, MAX_FOCAL);
  }

  /** Largest 3:2 (or 2:3) frame that fits the screen, with a small margin. */
  layout() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const ratio = this.portrait ? 2 / 3 : 3 / 2;
    const margin = 8;
    let w = W - margin * 2;
    let h = w / ratio;
    if (h > H - margin * 2) {
      h = H - margin * 2;
      w = h * ratio;
    }
    Object.assign(this.frame, { x: (W - w) / 2, y: (H - h) / 2, w, h });
    Object.assign(this.frameEl.style, {
      left: `${this.frame.x}px`,
      top: `${this.frame.y}px`,
      width: `${w}px`,
      height: `${h}px`,
    });
  }

  /** Per-frame control while the viewfinder is up. */
  update(dt: number, input: { tilt: number; zoom: number }, drone: Drone) {
    this.gimbal = THREE.MathUtils.clamp(this.gimbal + input.tilt * 0.9 * dt, GIMBAL_MIN, GIMBAL_MAX);
    if (input.zoom) this.zoomBy(input.zoom * 1.1 * dt);

    // lens sits under the front of the drone
    this.forward.set(-Math.sin(drone.yaw), 0, -Math.cos(drone.yaw));
    this.camera.position.copy(drone.pos).addScaledVector(this.forward, 0.6);
    this.camera.position.y -= 0.3;
    this.camera.rotation.set(this.gimbal, drone.yaw, 0, 'YXZ');

    // frame shows the sensor's field of view; the full screen shows a bit more
    const W = window.innerWidth;
    const H = window.innerHeight;
    const frameVertical = 2 * Math.atan((this.portrait ? 18 : 12) / this.focal);
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(frameVertical / 2) * (H / this.frame.h)));
    this.camera.aspect = W / H;
    this.camera.near = 0.3;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();

    this.info.textContent =
      `${Math.round(this.focal)} mm · ${(this.focal / MIN_FOCAL).toFixed(1)}× · ` +
      `Neigung ${Math.round(THREE.MathUtils.radToDeg(this.gimbal))}° · Raster: ${GRID_LABEL[this.grid]}`;
  }

  /** Output size of a photo: 1800×1200, or 1200×1800 in portrait. */
  get photoSize() {
    return this.portrait ? { w: 1200, h: 1800 } : { w: 1800, h: 1200 };
  }

  /** Camera that sees exactly the framed part, for rendering the photo itself. */
  readonly shot = new THREE.PerspectiveCamera();

  prepareShot() {
    const { w, h } = this.photoSize;
    this.shot.position.copy(this.camera.position);
    this.shot.quaternion.copy(this.camera.quaternion);
    this.shot.fov = THREE.MathUtils.radToDeg(2 * Math.atan((this.portrait ? 18 : 12) / this.focal));
    this.shot.aspect = w / h;
    this.shot.near = this.camera.near;
    this.shot.far = this.camera.far;
    this.shot.updateProjectionMatrix();
    this.shot.updateMatrixWorld();
    return this.shot;
  }

  /**
   * Copies the canvas after the photo was rendered into it at photo size.
   * Must run right after that render, in the same frame, while the drawing buffer still holds it.
   */
  capture(canvas: HTMLCanvasElement, landmarks: Landmark[], meta: { gameTime: string; altitude: number }) {
    const { w, h } = this.photoSize;
    const full = document.createElement('canvas');
    full.width = w;
    full.height = h;
    full.getContext('2d')!.drawImage(canvas, 0, 0, w, h, 0, 0, w, h);
    const thumb = document.createElement('canvas');
    const tk = 360 / Math.max(w, h);
    thumb.width = Math.round(w * tk);
    thumb.height = Math.round(h * tk);
    thumb.getContext('2d')!.drawImage(full, 0, 0, thumb.width, thumb.height);

    const tags = this.visibleLandmarks(landmarks);
    this.flash.classList.remove('go');
    void this.flash.offsetWidth; // restart the animation
    this.flash.classList.add('go');

    const toBlob = (c: HTMLCanvasElement, q: number) =>
      new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/jpeg', q));

    return Promise.all([toBlob(full, 0.92), toBlob(thumb, 0.8)]).then(
      ([image, thumbBlob]): Photo => ({
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        created: new Date().toISOString(),
        gameTime: meta.gameTime,
        focal: Math.round(this.focal),
        gimbal: Math.round(THREE.MathUtils.radToDeg(this.gimbal)),
        altitude: Math.round(meta.altitude),
        width: w,
        height: h,
        tags,
        image,
        thumb: thumbBlob,
      }),
    );
  }

  /** Landmarks that cover at least 2 % of the photo (no occlusion check yet, that comes with the rating). */
  private visibleLandmarks(landmarks: Landmark[]) {
    const v = new THREE.Vector3();
    const names: string[] = [];
    for (const lm of landmarks) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let inFront = 0;
      for (let i = 0; i < 8; i++) {
        v.set(i & 1 ? lm.box.max.x : lm.box.min.x, i & 2 ? lm.box.max.y : lm.box.min.y, i & 4 ? lm.box.max.z : lm.box.min.z);
        v.project(this.shot);
        if (v.z > 1) continue;
        inFront++;
        minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
        minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
      }
      if (inFront < 4) continue;
      const ix = Math.max(0, Math.min(maxX, 1) - Math.max(minX, -1));
      const iy = Math.max(0, Math.min(maxY, 1) - Math.max(minY, -1));
      if ((ix * iy) / 4 >= 0.02) names.push(lm.name);
    }
    return names;
  }
}
