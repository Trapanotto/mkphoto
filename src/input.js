// Eingabe: Tastatur + Maus, Touch (zwei virtuelle Sticks, Mode 2), Gamepad.
// Liefert normalisierte Achsen: throttle, yaw, pitch(vor/zurück), roll(seitlich), gimbal, zoom.

export class Input {
  constructor(canvas, touchRoot) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouseDX = 0; this.mouseDY = 0;
    this.wheel = 0;
    this.locked = false;
    this.touch = { left: { x: 0, y: 0 }, right: { x: 0, y: 0 }, gimbal: 0, zoom: 0 };
    this.handlers = {}; // shutter, pause, grid, missions
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.enabled = false;

    addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space' || e.code === 'Enter') this.fire('shutter');
      if (e.code === 'KeyG') this.fire('grid');
      if (e.code === 'Tab' || e.code === 'KeyM') this.fire('missions');
      if (e.code === 'KeyL') this.fire('land');
      if (e.code === 'Escape' || e.code === 'KeyP') this.fire('pause');
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('click', () => {
      if (!this.enabled || this.isTouch) return;
      if (!this.locked) canvas.requestPointerLock?.();
      else this.fire('shutter');
    });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (was && !this.locked && this.enabled) this.fire('unlock');
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX; this.mouseDY += e.movementY;
    });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.wheel += Math.sign(e.deltaY); }, { passive: false });

    addEventListener('touchstart', () => this.setTouch(true), { passive: true });
    this.setupTouch(touchRoot);
  }

  on(name, fn) { this.handlers[name] = fn; }
  fire(name) { this.handlers[name]?.(); }

  setTouch(v) {
    if (this.isTouch === v) return;
    this.isTouch = v;
    this.fire('modechange');
  }

  setupTouch(root) {
    const stick = (el, target) => {
      const knob = el.querySelector('.knob');
      let id = null, cx = 0, cy = 0;
      const R = () => el.clientWidth / 2;
      const move = (x, y) => {
        let dx = (x - cx) / R(), dy = (y - cy) / R();
        const len = Math.hypot(dx, dy);
        if (len > 1) { dx /= len; dy /= len; }
        target.x = dx; target.y = -dy;
        knob.style.transform = `translate(${dx * R() * 0.6}px, ${dy * R() * 0.6}px)`;
      };
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        id = e.pointerId;
        try { el.setPointerCapture(id); } catch { /* synthetisches Event */ }
        const r = el.getBoundingClientRect();
        cx = r.left + r.width / 2; cy = r.top + r.height / 2;
        move(e.clientX, e.clientY);
        this.setTouch(true);
      });
      el.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e.clientX, e.clientY); });
      const end = (e) => {
        if (e.pointerId !== id) return;
        id = null; target.x = 0; target.y = 0; knob.style.transform = '';
      };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
    };
    stick(root.querySelector('#stickL'), this.touch.left);
    stick(root.querySelector('#stickR'), this.touch.right);

    const hold = (sel, key, val) => {
      const el = root.querySelector(sel);
      const set = (v) => (e) => { e.preventDefault(); this.touch[key] = v; };
      el.addEventListener('pointerdown', set(val));
      el.addEventListener('pointerup', set(0));
      el.addEventListener('pointerleave', set(0));
      el.addEventListener('pointercancel', set(0));
    };
    hold('#gimUp', 'gimbal', 1);
    hold('#gimDown', 'gimbal', -1);
    hold('#zoomIn', 'zoom', 1);
    hold('#zoomOut', 'zoom', -1);
    root.querySelector('#shutterBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); this.fire('shutter'); });
  }

  // Achsen für diesen Frame
  read(dt) {
    const k = (c) => (this.keys.has(c) ? 1 : 0);
    const a = {
      throttle: k('KeyE') + k('PageUp') - k('KeyQ') - k('PageDown'),
      yaw: k('ArrowRight') - k('ArrowLeft'),
      pitch: k('KeyW') - k('KeyS'),
      roll: k('KeyD') - k('KeyA'),
      gimbal: k('KeyR') + k('ArrowUp') - k('KeyF') - k('ArrowDown'),
      zoom: k('Equal') + k('NumpadAdd') + k('KeyX') - k('Minus') - k('NumpadSubtract') - k('KeyZ'),
      sport: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
      mouseYaw: this.mouseDX, mouseGimbal: -this.mouseDY, wheel: this.wheel,
    };
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;

    // Touch: links = Höhe + Drehen, rechts = vor/zurück + seitlich (Mode 2)
    const t = this.touch;
    const dz = (v) => (Math.abs(v) < 0.08 ? 0 : v);
    a.throttle += dz(t.left.y);
    a.yaw += dz(t.left.x) * 0.9;
    a.pitch += dz(t.right.y);
    a.roll += dz(t.right.x);
    a.gimbal += t.gimbal;
    a.zoom += t.zoom;

    // Gamepad (Standard-Mapping)
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const ax = (i) => dz(p.axes[i] || 0);
      const b = (i) => p.buttons[i]?.pressed;
      a.yaw += ax(0); a.throttle -= ax(1); a.roll += ax(2); a.pitch -= ax(3);
      if (b(4)) a.gimbal -= 1;
      if (b(5)) a.gimbal += 1;
      if (b(12)) a.zoom += 1;
      if (b(13)) a.zoom -= 1;
      if (b(10)) a.sport = true;
      const shutter = b(7) || b(0);
      if (shutter && !this._padShutter) this.fire('shutter');
      this._padShutter = shutter;
      const pause = b(9);
      if (pause && !this._padPause) this.fire('pause');
      this._padPause = pause;
      if (p.axes.length) this.setTouch(false);
    }

    for (const key of ['throttle', 'yaw', 'pitch', 'roll', 'gimbal', 'zoom']) a[key] = Math.max(-1, Math.min(1, a[key]));
    return a;
  }
}
