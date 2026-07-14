/** Motion-feel primitives: One-Euro filter (Casiez, Roussel & Vogel, CHI 2012 —
 *  original implementation from the published equations) and a critically-damped
 *  spring. All are dt-integrated so natural-frequency specs are rate-independent
 *  (implementer decision D5). Smoothing lives at the consumer; stored history
 *  stays raw (stability contract). */

function lowpassAlpha(dt: number, cutoffHz: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return dt / (dt + tau);
}

export class OneEuro {
  private x: number | null = null;
  private dx = 0;

  constructor(
    private minCutoff: number,
    private beta: number,
    private dCutoff: number,
  ) {}

  filter(value: number, dt: number): number {
    if (this.x === null || dt <= 0) {
      this.x = value;
      this.dx = 0;
      return value;
    }
    const rawDx = (value - this.x) / dt;
    this.dx += lowpassAlpha(dt, this.dCutoff) * (rawDx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += lowpassAlpha(dt, cutoff) * (value - this.x);
    return this.x;
  }

  reset(): void {
    this.x = null;
    this.dx = 0;
  }
}

/** Critically-damped spring: fast settle, zero overshoot ("never teleports").
 *  Integrated with the exact closed-form solution of
 *  x'' = ω²(target−x) − 2ωx', so it is unconditionally stable for any dt —
 *  numeric integrators explode here when a hitched frame delivers a large dt. */
export class Spring {
  pos = 0;
  vel = 0;

  constructor(private naturalHz: number) {}

  set frequency(hz: number) {
    this.naturalHz = hz;
  }

  update(target: number, dt: number): number {
    const w = 2 * Math.PI * this.naturalHz;
    const delta = this.pos - target;
    const k = this.vel + w * delta;
    const e = Math.exp(-w * dt);
    this.pos = target + (delta + k * dt) * e;
    this.vel = (this.vel - k * w * dt) * e;
    return this.pos;
  }

  snap(value: number): void {
    this.pos = value;
    this.vel = 0;
  }
}

/** First-order low-pass with a time constant expressed as a -3 dB period. */
export class Lowpass {
  private y: number | null = null;

  constructor(private periodSec: number) {}

  update(value: number, dt: number): number {
    if (this.y === null) {
      this.y = value;
      return value;
    }
    const alpha = 1 - Math.exp(-dt / this.periodSec);
    this.y += alpha * (value - this.y);
    return this.y;
  }

  get value(): number {
    return this.y ?? 0;
  }

  reset(): void {
    this.y = null;
  }
}

/** Asymmetric attack/release envelope follower (loudness → mass). */
export class AttackRelease {
  private y = 0;

  constructor(
    private attackSec: number,
    private releaseSec: number,
  ) {}

  update(value: number, dt: number): number {
    const period = value > this.y ? this.attackSec : this.releaseSec;
    const alpha = 1 - Math.exp(-dt / period);
    this.y += alpha * (value - this.y);
    return this.y;
  }

  get value(): number {
    return this.y;
  }
}
