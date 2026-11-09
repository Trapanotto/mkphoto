/**
 * Aiming the photo camera by hand: one finger (or the mouse) drags the view,
 * two fingers pinch to zoom. Collects movement until the game loop takes it.
 */
export class CameraDrag {
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private dx = 0;
  private dy = 0;
  private zoom = 0;
  private pinch = 0;

  constructor(
    elements: HTMLElement[],
    private readonly enabled: () => boolean,
  ) {
    for (const el of elements) {
      el.addEventListener('pointerdown', (e) => {
        if (!this.enabled() || (e.pointerType === 'mouse' && e.button !== 0)) return;
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        this.pinch = this.spread();
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          // pointer already gone
        }
      });
      el.addEventListener('pointermove', (e) => {
        const p = this.pointers.get(e.pointerId);
        if (!p || !this.enabled()) return;
        if (this.pointers.size === 1) {
          this.dx += e.clientX - p.x;
          this.dy += e.clientY - p.y;
        }
        p.x = e.clientX;
        p.y = e.clientY;
        if (this.pointers.size >= 2) {
          const s = this.spread();
          if (this.pinch > 0 && s > 0) this.zoom += Math.log(s / this.pinch);
          this.pinch = s;
        }
      });
      const up = (e: PointerEvent) => {
        this.pointers.delete(e.pointerId);
        this.pinch = this.spread();
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    }
  }

  private spread() {
    const pts = [...this.pointers.values()];
    return pts.length >= 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
  }

  /** Movement since the last call: pixels dragged and the zoom change (log of the pinch ratio). */
  take() {
    const out = { dx: this.dx, dy: this.dy, zoom: this.zoom };
    this.dx = this.dy = this.zoom = 0;
    return out;
  }
}
