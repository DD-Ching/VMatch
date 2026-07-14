/** Target Pack loading + per-target frozen axis calibration.
 *
 *  Calibration is computed once, from the TARGET's frames only, and never
 *  changes afterwards (stability contract: lattice, camera and ghost road are
 *  pixel-identical across attempts 1–100; user audio can never move the axes). */
import { M } from '../mapping';
import type { FeatureFrame, TargetPack } from '../features/types';

export interface TargetCalibration {
  /** Median voiced midi of the target — the Y origin of the Reach. */
  medianMidi: number;
  /** Log2-centroid center and half-span (padded percentile range) for X. */
  centroidLogCenter: number;
  centroidLogHalfSpan: number;
  firstVoicedT: number;
  lastVoicedT: number;
  durationSec: number;
  /** Median beat period if the pack carries tempo metadata, else null. */
  beatPeriodSec: number | null;
}

export interface LoadedTarget {
  pack: TargetPack;
  audio: AudioBuffer;
  cal: TargetCalibration;
  /** frames[i] corresponds to t = (i+1) * hopSec (matches the analyzers). */
  frameAt(t: number): FeatureFrame | null;
  /** Nearest voiced frame within ±windowSec of t, else null. */
  voicedFrameNear(t: number, windowSec?: number): FeatureFrame | null;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, (p / 100) * (sorted.length - 1)));
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function calibrate(pack: TargetPack): TargetCalibration {
  const voiced = pack.frames.filter((f) => f.voiced);
  const midis = voiced.map((f) => f.midi).sort((a, b) => a - b);
  const logCentroids = voiced
    .filter((f) => f.centroid > 0)
    .map((f) => Math.log2(f.centroid))
    .sort((a, b) => a - b);

  const [pLo, pHi] = M.axis.centroidPercentiles;
  const cLo = percentile(logCentroids, pLo);
  const cHi = percentile(logCentroids, pHi);
  const pad = (cHi - cLo) * M.axis.centroidPadding;
  const lo = cLo - pad;
  const hi = cHi + pad;

  const meta = pack.meta as TargetPack['meta'] & { bpm?: number };
  return {
    medianMidi: percentile(midis, 50),
    centroidLogCenter: (lo + hi) / 2,
    // Guard degenerate targets (near-constant centroid) with a sane minimum
    // span: half an octave of log2-centroid. Tighter spans turn frame-level
    // spectral jitter into a brightness judgment, which no singer can beat.
    centroidLogHalfSpan: Math.max((hi - lo) / 2, 0.5),
    firstVoicedT: voiced.length ? voiced[0].t : 0,
    lastVoicedT: voiced.length ? voiced[voiced.length - 1].t : pack.meta.durationSec,
    durationSec: pack.meta.durationSec,
    beatPeriodSec: meta.bpm ? 60 / meta.bpm : null,
  };
}

export async function loadTarget(baseUrl: string, name: string, ctx: AudioContext): Promise<LoadedTarget> {
  const [packRes, wavRes] = await Promise.all([
    fetch(`${baseUrl}targets/${name}.vmatch.json`),
    fetch(`${baseUrl}targets/${name}.wav`),
  ]);
  if (!packRes.ok) throw new Error(`target pack ${name} missing (${packRes.status})`);
  if (!wavRes.ok) throw new Error(`target audio ${name} missing (${wavRes.status})`);
  const pack = (await packRes.json()) as TargetPack;
  if (pack.version !== 1) throw new Error(`unsupported target pack version ${pack.version}`);
  const audio = await ctx.decodeAudioData(await wavRes.arrayBuffer());
  const cal = calibrate(pack);

  const hop = pack.hopSec;
  const frameAt = (t: number): FeatureFrame | null => {
    const i = Math.round(t / hop) - 1;
    if (i < 0 || i >= pack.frames.length) return null;
    return pack.frames[i];
  };
  const voicedFrameNear = (t: number, windowSec = 0.15): FeatureFrame | null => {
    const center = Math.round(t / hop) - 1;
    const radius = Math.round(windowSec / hop);
    for (let d = 0; d <= radius; d++) {
      for (const i of d === 0 ? [center] : [center - d, center + d]) {
        const f = pack.frames[i];
        if (f?.voiced) return f;
      }
    }
    return null;
  };

  return { pack, audio, cal, frameAt, voicedFrameNear };
}

/** Map a feature frame into Reach world coordinates (X = brightness, Y = pitch).
 *  Out-of-range values soft-compress logarithmically near the lattice edge —
 *  never clip, never rescale (acceptance test 3). */
export function toWorld(cal: TargetCalibration, midi: number, centroid: number): { x: number; y: number } {
  const ySpan = M.axis.pitchSpanSemitones * M.axis.unitsPerSemitone;
  const y = softCompress((midi - cal.medianMidi) * M.axis.unitsPerSemitone, ySpan);

  const xHalf = M.axis.brightnessSpanUnits / 2;
  const xNorm =
    centroid > 0 ? (Math.log2(centroid) - cal.centroidLogCenter) / cal.centroidLogHalfSpan : 0;
  const x = softCompress(xNorm * xHalf, xHalf * 1.4);
  return { x, y };
}

function softCompress(v: number, halfSpan: number): number {
  const knee = halfSpan * M.axis.softKnee;
  const a = Math.abs(v);
  if (a <= knee) return v;
  const over = a - knee;
  const room = halfSpan - knee;
  return Math.sign(v) * (knee + room * Math.tanh(over / room));
}
