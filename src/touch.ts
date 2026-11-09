type Side = 'left' | 'right';

const RADIUS = 56;

/**
 * Two floating virtual sticks: touching the left half moves, the right half turns and climbs.
 * The stick base jumps to where the thumb lands.
 */
export class TouchSticks {
  readonly left = { x: 0, y: 0 };
  readonly right = { x: 0, y: 0 };
  onUse?: () => void;

  private readonly ids: Record<Side, number | null> = { left: null, right: null };
  private readonly origin: Record<Side, { x: number; y: number }> = { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } };
  private readonly bases: Record<Side, HTMLElement>;
  private readonly knobs: Record<Side, HTMLElement>;

  constructor(layer: HTMLElement) {
    this.bases = {
      left: layer.querySelector<HTMLElement>('.stick.left')!,
      right: layer.querySelector<HTMLElement>('.stick.right')!,
    };
    this.knobs = {
      left: this.bases.left.querySelector<HTMLElement>('.knob')!,
      right: this.bases.right.querySelector<HTMLElement>('.knob')!,
    };

    layer.addEventListener('pointerdown', (e) => {
      // in the photo camera the whole screen drags the view instead
      if (e.pointerType === 'mouse' || document.body.dataset.mode === 'camera') return;
      const side: Side = e.clientX < window.innerWidth / 2 ? 'left' : 'right';
      if (this.ids[side] !== null) return;
      e.preventDefault();
      this.ids[side] = e.pointerId;
      this.origin[side] = { x: e.clientX, y: e.clientY };
      const base = this.bases[side];
      base.classList.add('active');
      base.style.left = `${e.clientX - base.offsetWidth / 2}px`;
      base.style.top = `${e.clientY - base.offsetHeight / 2}px`;
      base.style.bottom = 'auto';
      base.style.right = 'auto';
      this.onUse?.();
      try {
        layer.setPointerCapture(e.pointerId);
      } catch {
        // pointer already gone (e.g. very short tap); nothing to capture
      }
    });

    layer.addEventListener('pointermove', (e) => {
      const side = this.sideOf(e.pointerId);
      if (!side) return;
      let dx = e.clientX - this.origin[side].x;
      let dy = e.clientY - this.origin[side].y;
      const len = Math.hypot(dx, dy);
      if (len > RADIUS) {
        dx = (dx / len) * RADIUS;
        dy = (dy / len) * RADIUS;
      }
      this.knobs[side].style.transform = `translate(${dx}px, ${dy}px)`;
      this[side].x = dx / RADIUS;
      this[side].y = -dy / RADIUS;
    });

    const release = (e: PointerEvent) => {
      const side = this.sideOf(e.pointerId);
      if (!side) return;
      this.ids[side] = null;
      this[side].x = 0;
      this[side].y = 0;
      const base = this.bases[side];
      base.classList.remove('active');
      base.style.left = base.style.top = base.style.bottom = base.style.right = '';
      this.knobs[side].style.transform = '';
    };
    layer.addEventListener('pointerup', release);
    layer.addEventListener('pointercancel', release);
  }

  private sideOf(id: number): Side | null {
    if (this.ids.left === id) return 'left';
    if (this.ids.right === id) return 'right';
    return null;
  }
}
