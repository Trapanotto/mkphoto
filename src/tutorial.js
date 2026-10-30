// Flugschule: Schritt-für-Schritt-Anleitung beim ersten Flug.
import { t } from './i18n.js';

export class Tutorial {
  constructor(el, onDone) {
    this.el = el;
    this.text = el.querySelector('.tut-text');
    this.bar = el.querySelector('.tut-bar i');
    this.onDone = onDone;
    this.active = false;
    el.querySelector('.tut-skip').addEventListener('click', () => this.finish(true));
  }

  start(drone, photosCount) {
    this.active = true;
    this.i = 0;
    this.ref = null;
    this.steps = [
      { key: 'tut1', init: (d) => ({ p: d.pos.clone() }), done: (d, r) => Math.hypot(d.pos.x - r.p.x, d.pos.z - r.p.z) > 15 },
      { key: 'tut2', init: (d) => ({ y: d.pos.y }), done: (d, r) => d.pos.y - r.y > 10 },
      { key: 'tut3', init: (d) => ({ yaw: d.yaw }), done: (d, r) => Math.abs(d.yaw - r.yaw) > 1.0 },
      { key: 'tut4', init: (d) => ({ g: d.gimbal }), done: (d, r) => Math.abs(d.gimbal - r.g) > 0.3 },
      { key: 'tut5', init: () => ({}), done: (d) => d.mode === 'cine' || d.mode === 'tripod' },
      { key: 'tut6', init: () => ({ n: photosCount() }), done: (d, r) => photosCount() > r.n },
    ];
    this.photosCount = photosCount;
    this.enter(drone);
    this.el.classList.remove('hidden');
  }

  enter(drone) {
    const s = this.steps[this.i];
    this.ref = s.init(drone);
    this.text.textContent = t(s.key);
    this.bar.style.width = `${(this.i / this.steps.length) * 100}%`;
    this.el.classList.remove('pop'); void this.el.offsetWidth; this.el.classList.add('pop');
  }

  update(drone) {
    if (!this.active) return;
    const s = this.steps[this.i];
    if (s.done(drone, this.ref)) {
      this.i++;
      if (this.i >= this.steps.length) return this.finish(false);
      this.enter(drone);
    }
  }

  finish(skipped) {
    this.active = false;
    this.bar.style.width = '100%';
    if (!skipped) {
      this.text.textContent = t('tutDone');
      setTimeout(() => this.el.classList.add('hidden'), 3500);
    } else this.el.classList.add('hidden');
    this.onDone?.(skipped);
  }
}
