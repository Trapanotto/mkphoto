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
  toggleCamera: boolean;
  shoot: boolean;
  cycleGrid: boolean;
  album: boolean;
  back: boolean;
  studio: boolean;
  menu: boolean;
  toggleOrientation: boolean;
  /** Photo camera axes: turn, tilt the gimbal, zoom. */
  camYaw: number;
  camTilt: number;
  camZoom: number;
}

export type Action =
  | 'toggleMode'
  | 'home'
  | 'skipTime'
  | 'cycleQuality'
  | 'toggleCamera'
  | 'shoot'
  | 'cycleGrid'
  | 'album'
  | 'back'
  | 'studio'
  | 'menu'
  | 'toggleOrientation';

const KEY_ACTIONS: Record<string, Action> = {
  KeyP: 'toggleMode',
  KeyR: 'home',
  KeyT: 'skipTime',
  KeyG: 'cycleQuality',
  KeyC: 'toggleCamera',
  Space: 'shoot',
  Enter: 'shoot',
  NumpadEnter: 'shoot',
  KeyF: 'cycleGrid',
  Tab: 'album',
  Escape: 'back',
  KeyM: 'studio',
  KeyV: 'toggleOrientation',
};

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
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      this.device = 'keyboard';
      if (e.repeat) return;
      const action = KEY_ACTIONS[e.code];
      if (action) this.pending.add(action);
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
      toggleCamera: this.pending.has('toggleCamera'),
      shoot: this.pending.has('shoot'),
      cycleGrid: this.pending.has('cycleGrid'),
      album: this.pending.has('album'),
      back: this.pending.has('back'),
      studio: this.pending.has('studio'),
      menu: this.pending.has('menu'),
      toggleOrientation: this.pending.has('toggleOrientation'),
      camYaw: k('KeyD', 'KeyE', 'ArrowRight') - k('KeyA', 'KeyQ', 'ArrowLeft'),
      camTilt: k('KeyW', 'ArrowUp') - k('KeyS', 'ArrowDown'),
      camZoom: k('Equal', 'NumpadAdd', 'BracketRight') - k('Minus', 'NumpadSubtract', 'Slash'),
    };
    this.pending.clear();

    this.readGamepad(s);

    s.moveX = clamp(s.moveX + this.touch.left.x);
    s.moveY = clamp(s.moveY + this.touch.left.y);
    s.yaw = clamp(s.yaw + this.touch.right.x);
    s.lift = clamp(s.lift + this.touch.right.y);
    // in the photo camera: right thumb turns and tilts, left thumb zooms
    s.camYaw = clamp(s.camYaw + this.touch.right.x);
    s.camTilt = clamp(s.camTilt + this.touch.right.y);
    s.camZoom = clamp(s.camZoom + this.touch.left.y);
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
    s.camYaw += rx + lx;
    s.camTilt -= ry;
    s.camZoom += lift;

    // edge-triggered buttons: A (0) shoot, B (1) home/back, X (2) time, Y (3) mode or grid,
    // LB (4) camera, View/Back (8) album, Start/Menu (9) menu
    const pressed = pad.buttons.map((b) => b.pressed);
    const down = (i: number) => pressed[i] && !this.padPrev[i];
    if (down(0)) s.shoot = true;
    if (down(1)) s.home = s.back = true;
    if (down(2)) s.skipTime = true;
    if (down(3)) s.toggleMode = s.cycleGrid = true;
    if (down(4)) s.toggleCamera = true;
    if (down(5)) s.toggleOrientation = true;
    if (down(8)) s.album = true;
    if (down(9)) s.menu = true;
    if (pressed.some((p, i) => p && !this.padPrev[i])) this.device = 'gamepad';
    this.padPrev = pressed;
  }
}
