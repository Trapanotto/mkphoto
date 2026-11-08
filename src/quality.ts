import type { OutlineMode } from './outline';

export type QualityLevel = 'high' | 'medium' | 'low';

export const LEVELS: Record<QualityLevel, { label: string; pixelRatio: number; outline: OutlineMode }> = {
  high: { label: 'Hoch', pixelRatio: 2, outline: 'post-normals' },
  medium: { label: 'Mittel', pixelRatio: 1.5, outline: 'post-depth' },
  low: { label: 'Niedrig', pixelRatio: 1, outline: 'hull' },
};

const ORDER: QualityLevel[] = ['high', 'medium', 'low'];
/** Measuring window and the pause after a change before measuring again. */
const WINDOW_MS = 2500;
const SETTLE_MS = 3000;
/** A single frame longer than this is a hiccup (tab switch, loading), not a slow device. */
const STALL_MS = 250;

/**
 * Picks the graphics level. In auto mode it starts high on desktop and medium on phones,
 * and steps down when the frame rate stays under the target (60 desktop, 30 mobile)
 * for two measurements in a row.
 * It never steps back up on its own, so it cannot flicker between levels.
 */
export class Quality {
  auto = true;
  level: QualityLevel;
  readonly target: number;
  onChange?: (level: QualityLevel) => void;

  private frames = 0;
  private windowStart = 0;
  private lastFrame = 0;
  private stalled = false;
  private slowWindows = 0;
  private settleUntil = 0;

  constructor(mobile: boolean) {
    this.level = mobile ? 'medium' : 'high';
    this.target = mobile ? 30 : 60;
  }

  get label() {
    return `${LEVELS[this.level].label}${this.auto ? ' (Auto)' : ''}`;
  }

  /** Auto → Hoch → Mittel → Niedrig → Auto */
  cycle() {
    if (this.auto) {
      this.auto = false;
      this.set('high');
    } else if (this.level === 'low') {
      this.auto = true;
      this.set('high');
    } else {
      this.set(ORDER[ORDER.indexOf(this.level) + 1]);
    }
  }

  /** Call once per rendered frame. */
  frame(now: number) {
    if (!this.auto || document.visibilityState !== 'visible') {
      this.windowStart = 0;
      return;
    }
    if (now < this.settleUntil) return;
    if (this.windowStart === 0) {
      this.windowStart = this.lastFrame = now;
      this.frames = 0;
      this.stalled = false;
      return;
    }
    if (now - this.lastFrame > STALL_MS) this.stalled = true;
    this.lastFrame = now;
    this.frames++;
    const elapsed = now - this.windowStart;
    if (elapsed < WINDOW_MS) return;
    const fps = (this.frames * 1000) / elapsed;
    this.windowStart = 0;
    if (this.stalled) return;
    this.slowWindows = fps < this.target * 0.85 ? this.slowWindows + 1 : 0;
    if (this.slowWindows >= 2 && this.level !== 'low') {
      this.set(ORDER[ORDER.indexOf(this.level) + 1]);
    }
  }

  private set(level: QualityLevel) {
    this.level = level;
    this.windowStart = 0;
    this.slowWindows = 0;
    this.settleUntil = performance.now() + SETTLE_MS;
    this.onChange?.(level);
  }
}
