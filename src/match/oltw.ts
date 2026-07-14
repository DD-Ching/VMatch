/** On-line time warping, streaming variant.
 *
 *  A native TypeScript implementation following the OLTW-Arzt design used by
 *  CPJKU `matchmaker` (matchmaker/alignment/oltw_arzt.py, Apache-2.0 — cited
 *  per docs/03-oss-audit.md): a two-column rolling DP over a bounded window of
 *  the reference, path-length-normalized costs, monotonic non-decreasing
 *  reference index with a bounded per-frame advance. O(window) time and
 *  constant memory per input frame; no allocation growth (acceptance test 14).
 *
 *  Alignment here is display-quality, never judgment-quality: consumers must
 *  stay sensible under ~100 ms of alignment jitter. */
import { M } from '../mapping';

export interface OltwResult {
  /** Reference frame index the input is currently aligned to. */
  refIndex: number;
  /** Local tempo ratio (>1 = user ahead of reference pace). Smoothed slope. */
  tempoRatio: number;
  /** Normalized local path cost at the chosen cell (lower = better match). */
  localCost: number;
  /** true while alignment confidence holds; false when the user is off-script. */
  locked: boolean;
}

export class Oltw {
  private readonly nRef: number;
  private readonly dim: number;
  private readonly window: number;

  private prev: Float32Array;
  private cur: Float32Array;
  private dist: Float32Array;
  private lo = 0;
  private refIndex = 0;
  private inputCount = 0;

  // Tempo estimate: recent (inputCount, refIndex) pairs.
  private slopeHistory: Array<[number, number]> = [];

  // Confidence (D7): EMA of local cost vs a slower rolling baseline.
  private costEma = 0;
  private costBaseline = 0;
  private locked = true;
  private lostSince = -1;
  private relockSince = -1;

  constructor(
    private readonly ref: Float32Array, // nRef × dim, row-major, pre-normalized
    dim: number,
    windowFrames = M.oltw.windowFrames,
  ) {
    this.dim = dim;
    this.nRef = ref.length / dim;
    this.window = Math.min(windowFrames, this.nRef);
    this.prev = new Float32Array(this.nRef);
    this.cur = new Float32Array(this.nRef);
    this.dist = new Float32Array(this.nRef);
    // BOTH DP buffers must start at Infinity: the window's top edge grows as
    // refIndex advances, and never-written cells in the swapped-in buffer must
    // not read as free zero-cost path seeds (that decays localCost toward 0,
    // pinning `locked` on and dragging refIndex forward off-script).
    this.prev.fill(Infinity);
    this.cur.fill(Infinity);
    this.prev[0] = 0;
  }

  /** Advance with one input feature vector (same dim/normalization as ref). */
  step(input: Float32Array, dtSec: number): OltwResult {
    const { dim, ref } = this;
    this.inputCount++;

    // Window straddles the current position, biased forward.
    const lo = Math.max(0, this.refIndex - (this.window >> 2));
    const hi = Math.min(this.nRef, lo + this.window);

    // L1 distance of the input against every reference frame in the window.
    for (let j = lo; j < hi; j++) {
      let d = 0;
      const off = j * dim;
      for (let k = 0; k < dim; k++) d += Math.abs(input[k] - ref[off + k]);
      this.dist[j] = d;
    }

    // DP update. cur[j] = dist[j] + min(prev[j], prev[j-1], cur[j-1]).
    const prev = this.prev;
    const cur = this.cur;
    for (let j = lo; j < hi; j++) {
      const up = prev[j]; // repeat reference frame (user slower)
      const diag = j > lo ? prev[j - 1] : Infinity;
      const left = j > lo ? cur[j - 1] : Infinity; // skip ref frames (user faster)
      const best = Math.min(up, diag, left);
      cur[j] = this.dist[j] + (best === Infinity ? this.dist[j] : best);
    }
    // Cells that slid out of the window would otherwise read stale values.
    if (lo > this.lo) for (let j = this.lo; j < lo; j++) cur[j] = Infinity;
    this.lo = lo;

    // Choose the new position: best path-length-normalized cost, monotonic,
    // bounded advance (slope constraint).
    const maxAdvance = M.oltw.maxAdvancePerFrame;
    const jMin = this.refIndex;
    const jMax = Math.min(hi - 1, this.refIndex + maxAdvance);
    let bestJ = jMin;
    let bestNorm = Infinity;
    for (let j = jMin; j <= jMax; j++) {
      const norm = cur[j] / (this.inputCount + j + 1);
      if (norm < bestNorm) {
        bestNorm = norm;
        bestJ = j;
      }
    }
    this.refIndex = bestJ;

    // Swap columns (typed arrays reused; zero allocation per frame).
    this.prev = cur;
    this.cur = prev;

    this.updateConfidence(bestNorm, dtSec);

    return {
      refIndex: this.refIndex,
      tempoRatio: this.estimateTempo(),
      localCost: bestNorm,
      locked: this.locked,
    };
  }

  private updateConfidence(localNorm: number, dt: number): void {
    const c = M.oltw.confidence;
    const aFast = 1 - Math.exp(-dt / c.emaSec);
    const aSlow = 1 - Math.exp(-dt / c.baselineSec);
    if (this.inputCount === 1) {
      this.costEma = localNorm;
      this.costBaseline = Math.max(localNorm, 1e-6);
    } else {
      this.costEma += aFast * (localNorm - this.costEma);
      this.costBaseline += aSlow * (localNorm - this.costBaseline);
    }
    const ratio = this.costEma / Math.max(this.costBaseline, 1e-6);
    const now = this.inputCount * dt;
    if (this.locked) {
      if (ratio > c.lostRatio) {
        if (this.lostSince < 0) this.lostSince = now;
        if (now - this.lostSince > c.lostHoldSec) {
          this.locked = false;
          this.relockSince = -1;
        }
      } else {
        this.lostSince = -1;
      }
    } else {
      if (ratio < c.relockRatio) {
        if (this.relockSince < 0) this.relockSince = now;
        if (now - this.relockSince > c.relockHoldSec) {
          this.locked = true;
          this.lostSince = -1;
        }
      } else {
        this.relockSince = -1;
      }
    }
  }

  /** Path slope over the last ~0.5 s of steps ⇒ local tempo ratio. */
  private estimateTempo(): number {
    this.slopeHistory.push([this.inputCount, this.refIndex]);
    if (this.slopeHistory.length > 50) this.slopeHistory.shift();
    if (this.slopeHistory.length < 10) return 1;
    const [i0, j0] = this.slopeHistory[0];
    const [i1, j1] = this.slopeHistory[this.slopeHistory.length - 1];
    if (i1 === i0) return 1;
    return Math.max(0.25, Math.min(4, (j1 - j0) / (i1 - i0)));
  }
}

/** Build z-normalized, weighted OLTW feature matrices. Normalization stats come
 *  from the TARGET clip only (D6) so both streams share one frame of reference. */
export interface OltwFeatureSpace {
  dim: number;
  ref: Float32Array;
  /** Project one live frame into the same space (writes into `out`). */
  project(frame: OltwFrameLike, out: Float32Array): void;
}

export interface OltwFrameLike {
  midi: number;
  voiced: boolean;
  db: number;
  mfcc: number[];
}

export function buildFeatureSpace(frames: OltwFrameLike[]): OltwFeatureSpace {
  const nMfcc = 13;
  const dim = 1 + 1 + nMfcc + 1; // f0(semitones) + voiced + mfcc13 + logE
  const w = M.oltw.weights;

  // Target-derived stats. Pitch uses voiced frames only; silence must not skew it.
  const voiced = frames.filter((f) => f.voiced);
  const midiMean = voiced.length ? voiced.reduce((a, f) => a + f.midi, 0) / voiced.length : 60;
  const midiStd = Math.max(
    1,
    Math.sqrt(voiced.length ? voiced.reduce((a, f) => a + (f.midi - midiMean) ** 2, 0) / voiced.length : 1),
  );
  const dbMean = frames.reduce((a, f) => a + f.db, 0) / Math.max(1, frames.length);
  const dbStd = Math.max(
    3,
    Math.sqrt(frames.reduce((a, f) => a + (f.db - dbMean) ** 2, 0) / Math.max(1, frames.length)),
  );
  const mfccMean = new Float32Array(nMfcc);
  const mfccStd = new Float32Array(nMfcc);
  for (let k = 0; k < nMfcc; k++) {
    let m = 0;
    for (const f of frames) m += f.mfcc[k] ?? 0;
    m /= Math.max(1, frames.length);
    let v = 0;
    for (const f of frames) v += ((f.mfcc[k] ?? 0) - m) ** 2;
    mfccMean[k] = m;
    mfccStd[k] = Math.max(1e-3, Math.sqrt(v / Math.max(1, frames.length)));
  }

  const wMfccEach = w.mfccTotal / nMfcc;
  const project = (f: OltwFrameLike, out: Float32Array): void => {
    // Unvoiced frames carry the pitch dimension at 0 (mean) — the voiced flag
    // dimension is what separates them.
    out[0] = f.voiced ? ((f.midi - midiMean) / midiStd) * w.f0Semitones : 0;
    out[1] = (f.voiced ? 1 : 0) * w.voiced;
    for (let k = 0; k < nMfcc; k++) out[2 + k] = (((f.mfcc[k] ?? 0) - mfccMean[k]) / mfccStd[k]) * wMfccEach;
    out[2 + nMfcc] = ((f.db - dbMean) / dbStd) * w.logEnergy;
  };

  const ref = new Float32Array(frames.length * dim);
  const row = new Float32Array(dim);
  frames.forEach((f, i) => {
    project(f, row);
    ref.set(row, i * dim);
  });

  return { dim, ref, project };
}
