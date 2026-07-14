/** The relationship tier: OLTW cursor → pace bead, leash, per-dimension error
 *  vector, composite closeness. Closeness crosses this boundary DECOMPOSED
 *  (per-dimension); the scalar blend exists for the visual layer only
 *  (architecture rule / acceptance test 25). */
import { M } from '../mapping';
import { Lowpass } from '../motion/filters';
import { buildFeatureSpace, Oltw, type OltwFeatureSpace } from './oltw';
import type { LoadedTarget } from '../target/pack';
import type { FeatureFrame } from '../features/types';

export type Dimension = 'pitch' | 'timing' | 'brightness';

export interface RelationshipFrame {
  t: number;
  userVoiced: boolean;
  /** OLTW confidence state; when false, timing judgments are suspended. */
  locked: boolean;
  aligned: boolean;
  /** Target-time position of the pace bead (slew-limited, monotonic, freezes on unvoiced). */
  beadTargetT: number;
  expectedTargetT: number;
  /** Signed seconds; positive = user ahead (rushing), negative = behind. */
  offsetSec: number;
  /** 150 ms low-passed offset driving the leash (tendency only, never ms). */
  leash: number;
  tempoRatio: number;
  /** Signed raw errors; null = not judgeable this frame. */
  pitchErrSt: number | null;
  brightnessErrLog2: number | null;
  /** Per-dimension errors normalized by capture thresholds (1.0 = at threshold). */
  eNorm: Record<Dimension, number>;
  /** Composite closeness C = exp(−Σ wᵢeᵢ) ∈ (0,1] — visual layer only. */
  closeness: number;
  /** The single dominant error dimension (softmax-gated secondary cue). */
  dominant: Dimension | null;
  dominantStrength: number;
  /** All dimensions under entry thresholds (capture gate input). */
  gate: boolean;
  /** Target is voiced near the bead (unvoiced target pauses the capture timer). */
  targetVoiced: boolean;
}

const E_UNKNOWN = M.closeness.errorCap; // unjudgeable dims read as far (blocks the gate)

export class Relationship {
  private space: OltwFeatureSpace;
  private oltw: Oltw;
  private scratch: Float32Array;
  private leashLp = new Lowpass(M.bead.leashLowpassSec);
  /** Brightness is judged as a slow channel: both sides smoothed ~250 ms so
   *  attack transients don't masquerade as timbre error. */
  private brightLp = new Lowpass(0.25);
  private targetBrightSmooth: Float32Array;
  private beadTargetT: number;
  private ignitionT = 0;
  private lastT: number | null = null;
  private lastOffset = 0;
  private lastTempo = 1;

  /** Full frame-level warp path for the attempt (Learn Mode contract). */
  readonly warpPath: Array<[number, number]> = [];

  constructor(private target: LoadedTarget) {
    this.space = buildFeatureSpace(target.pack.frames);
    this.oltw = new Oltw(this.space.ref, this.space.dim);
    this.scratch = new Float32Array(this.space.dim);
    this.beadTargetT = target.cal.firstVoicedT;

    // Precompute the target's smoothed log2-centroid track (EMA ≈ 250 ms,
    // voiced frames only, held through unvoiced gaps).
    const frames = target.pack.frames;
    this.targetBrightSmooth = new Float32Array(frames.length);
    const alpha = 1 - Math.exp(-target.pack.hopSec / 0.25);
    let ema = Number.NaN;
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      if (f.voiced && f.centroid > 0) {
        const v = Math.log2(f.centroid);
        ema = Number.isNaN(ema) ? v : ema + alpha * (v - ema);
      }
      this.targetBrightSmooth[i] = ema;
    }
  }

  /** Rebuild per-attempt state. Ignition anchors the expected-time clock. */
  reset(ignitionT: number): void {
    this.oltw = new Oltw(this.space.ref, this.space.dim);
    this.leashLp.reset();
    this.brightLp.reset();
    this.beadTargetT = this.target.cal.firstVoicedT;
    this.ignitionT = ignitionT;
    this.lastT = null;
    this.lastOffset = 0;
    this.lastTempo = 1;
    this.warpPath.length = 0;
  }

  onUserFrame(f: FeatureFrame): RelationshipFrame {
    const cal = this.target.cal;
    const dt = this.lastT === null ? 0.01 : Math.max(1e-3, f.t - this.lastT);
    this.lastT = f.t;

    const voiced = f.voiced && f.clarity >= M.voicing.clarityThreshold;
    const expectedTargetT = cal.firstVoicedT + (f.t - this.ignitionT);

    let locked = true;
    let aligned = false;
    if (voiced) {
      this.space.project(f, this.scratch);
      const r = this.oltw.step(this.scratch, dt);
      const alignedT = (r.refIndex + 1) * this.target.pack.hopSec;
      // Pace bead: monotonic, slew-limited to ±maxRate × real-time; frozen on unvoiced.
      const maxStep = dt * M.bead.maxRate;
      this.beadTargetT = Math.max(this.beadTargetT, Math.min(this.beadTargetT + maxStep, alignedT));
      this.lastOffset = alignedT - expectedTargetT;
      this.lastTempo = r.tempoRatio;
      locked = r.locked;
      aligned = r.locked;
      this.warpPath.push([f.t, alignedT]);
    }

    const leash = this.leashLp.update(this.lastOffset, dt);

    // Per-dimension errors, judged AT the aligned target frame (bead position).
    const tf = this.target.voicedFrameNear(this.beadTargetT);
    const targetVoiced = tf !== null;
    const c = M.closeness;

    let pitchErrSt: number | null = null;
    let brightnessErrLog2: number | null = null;
    if (voiced && tf) {
      pitchErrSt = f.midi - tf.midi;
      if (f.centroid > 0) {
        const userBright = this.brightLp.update(Math.log2(f.centroid), dt);
        const beadIdx = Math.max(
          0,
          Math.min(this.targetBrightSmooth.length - 1, Math.round(this.beadTargetT / this.target.pack.hopSec) - 1),
        );
        const targetBright = this.targetBrightSmooth[beadIdx];
        if (!Number.isNaN(targetBright)) brightnessErrLog2 = userBright - targetBright;
      }
    }

    const brightSpan = 2 * cal.centroidLogHalfSpan;
    const eNorm: Record<Dimension, number> = {
      pitch: pitchErrSt === null ? E_UNKNOWN : Math.abs(pitchErrSt) / c.pitchSemitones,
      // Timing gates on the 150 ms low-passed offset (the leash value): raw
      // OLTW cursors wobble ±0.2 s inside self-similar held notes, which is
      // alignment noise, not the singer rushing. Suspended when lock is lost.
      timing: voiced && locked ? Math.abs(leash) / c.timingSec : E_UNKNOWN,
      brightness:
        brightnessErrLog2 === null ? E_UNKNOWN : Math.abs(brightnessErrLog2) / (c.brightnessFrac * brightSpan),
    };

    const w = c.weights;
    const cap = (e: number) => Math.min(e, E_UNKNOWN);
    const closeness = voiced
      ? Math.exp(-(w.pitch * cap(eNorm.pitch) + w.timing * cap(eNorm.timing) + w.brightness * cap(eNorm.brightness)))
      : 0;

    // Dominant error dimension via weighted softmax (temperature from mapping).
    let dominant: Dimension | null = null;
    let dominantStrength = 0;
    if (voiced) {
      const dims: Dimension[] = ['pitch', 'timing', 'brightness'];
      const scores = dims.map((d) => cap(eNorm[d]) * w[d]);
      const t = M.closeness.dominantSoftmaxTemp;
      const exps = scores.map((s) => Math.exp(s * t));
      const sum = exps.reduce((a, b) => a + b, 0);
      let bestI = 0;
      for (let i = 1; i < dims.length; i++) if (scores[i] > scores[bestI]) bestI = i;
      dominant = dims[bestI];
      dominantStrength = exps[bestI] / sum;
    }

    const gate =
      voiced && locked && targetVoiced && eNorm.pitch <= 1 && eNorm.timing <= 1 && eNorm.brightness <= 1;

    return {
      t: f.t,
      userVoiced: voiced,
      locked,
      aligned,
      beadTargetT: this.beadTargetT,
      expectedTargetT,
      offsetSec: this.lastOffset,
      leash,
      tempoRatio: this.lastTempo,
      pitchErrSt,
      brightnessErrLog2,
      eNorm,
      closeness,
      dominant,
      dominantStrength,
      gate,
      targetVoiced,
    };
  }

  /** Loosened re-check used while in orbit/merge-hold (D4 hysteresis). */
  gateWithExitThresholds(rf: RelationshipFrame): boolean {
    const x = M.capture.exitFactor;
    return (
      rf.userVoiced &&
      rf.locked &&
      rf.targetVoiced &&
      rf.eNorm.pitch <= x &&
      rf.eNorm.timing <= x &&
      rf.eNorm.brightness <= x
    );
  }
}
