import { TouchSticks } from './touch';

export type Device = 'keyboard' | 'gamepad' | 'touch';

export interface InputState {
  moveX: number;
  moveY: number;
  yaw: number;
  lift: number;
  camPitch: number;
  /** One-shot actions, true only in the frame they were triggered. */
  toggleMode: boolean;
  home: boolean;
  skipTime: boolean;
  cycleQuality: boolean;
}

export type Action = 'toggleMode' | 'home' | 'skipTime' | 'cycleQuality';

const DEADZONE = 0.15;

const clamp = (v: number) => Math.max(-1, Math.min(1, v));
const dead = (v: number) => (Math.abs(v) < DEADZONE ? 0 : Math.sign(v) * ((Math.abs(v) - DEADZONE) / (1 - DEADZONE)));

/** Merges keyboard, gamepad and touch into one set of flight controls. */
export class Input {
  device: Device;
  readonly touch: TouchSticks;

  private readonly keys = new Set<string>();
  private readonly pending = new Set<Action>();
  private padPrev: boolean[] = [];

  constructor(touchLayer: HTMLElement) {
    this.device = window.matchMedia('(pointer: coarse)').matches ? 'touch' : 'keyboard';

    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      this.device = 'keyboard';
      if (e.repeat) return;
      if (e.code === 'KeyP') this.pending.add('toggleMode');
      if (e.code === 'KeyR') this.pending.add('home');
      if (e.code === 'KeyT') this.pending.add('skipTime');
      if (e.code === 'KeyG') this.pending.add('cycleQuality');
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    this.touch = new TouchSticks(touchLayer);
    this.touch.onUse = () => (this.device = 'touch');
  }

  /** Called by on-screen buttons. */
  trigger(action: Action) {
    this.pending.add(action);
  }

  read(): InputState {
    const k = (...codes: string[]) => (codes.some((c) => this.keys.has(c)) ? 1 : 0);
    const s: InputState = {
      moveX: k('KeyD') - k('KeyA'),
      moveY: k('KeyW') - k('KeyS'),
      yaw: k('KeyE', 'ArrowRight') - k('KeyQ', 'ArrowLeft'),
      lift: k('Space', 'ArrowUp') - k('ShiftLeft', 'ShiftRight', 'ArrowDown'),
      camPitch: 0,
      toggleMode: this.pending.has('toggleMode'),
      home: this.pending.has('home'),
      skipTime: this.pending.has('skipTime'),
      cycleQuality: this.pending.has('cycleQuality'),
    };
    this.pending.clear();

    this.readGamepad(s);

    s.moveX = clamp(s.moveX + this.touch.left.x);
    s.moveY = clamp(s.moveY + this.touch.left.y);
    s.yaw = clamp(s.yaw + this.touch.right.x);
    s.lift = clamp(s.lift + this.touch.right.y);
    return s;
  }

  private readGamepad(s: InputState) {
    const pad = navigator.getGamepads?.().find((p) => p && p.connected);
    if (!pad) return;
    const [lx = 0, ly = 0, rx = 0, ry = 0] = pad.axes.map(dead);
    const btn = (i: number) => pad.buttons[i]?.value ?? 0;
    const lift = btn(7) - btn(6); // RT up, LT down

    if (lx || ly || rx || ry || lift > 0.05 || lift < -0.05) this.device = 'gamepad';
    s.moveX += lx;
    s.moveY -= ly;
    s.yaw += rx;
    s.lift += lift;
    s.camPitch = -ry;

    // edge-triggered buttons: Y (3) mode, B (1) home, X (2) time, View/Back (8) graphics
    const pressed = pad.buttons.map((b) => b.pressed);
    const down = (i: number) => pressed[i] && !this.padPrev[i];
    if (down(3)) s.toggleMode = true;
    if (down(1)) s.home = true;
    if (down(2)) s.skipTime = true;
    if (down(8)) s.cycleQuality = true;
    if (pressed.some((p, i) => p && !this.padPrev[i])) this.device = 'gamepad';
    this.padPrev = pressed;
  }
}
