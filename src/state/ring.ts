import type { FeatureFrame } from '../features/types';

/** Fixed-capacity ring of feature frames. Raw history is kept unsmoothed —
 *  smoothing belongs to consumers (product principle: replays are deterministic). */
export class FrameRing {
  private frames: (FeatureFrame | undefined)[];
  private head = 0;
  private count = 0;

  constructor(capacity = 6000) {
    this.frames = new Array(capacity);
  }

  push(frame: FeatureFrame): void {
    this.frames[this.head] = frame;
    this.head = (this.head + 1) % this.frames.length;
    if (this.count < this.frames.length) this.count++;
  }

  get size(): number {
    return this.count;
  }

  latest(): FeatureFrame | undefined {
    if (this.count === 0) return undefined;
    return this.frames[(this.head - 1 + this.frames.length) % this.frames.length];
  }

  /** Most recent `n` frames, oldest first. */
  lastN(n: number): FeatureFrame[] {
    const take = Math.min(n, this.count);
    const out: FeatureFrame[] = new Array(take);
    for (let i = 0; i < take; i++) {
      const idx = (this.head - take + i + this.frames.length * 2) % this.frames.length;
      out[i] = this.frames[idx]!;
    }
    return out;
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
  }
}
