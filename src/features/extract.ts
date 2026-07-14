import Meyda from 'meyda';
import { PitchDetector } from 'pitchy';
import { ANALYSIS, hzToMidi, type FeatureFrame } from './types';
import { centroidHz, flatness, fluxL1, rolloffHz, slopeNorm } from '../dsp/spectral';

/** Stateful per-stream feature extractor. Feed it one analysis window per hop.
 *  State is only used for flux (previous spectrum) and onset gating, so live
 *  capture and offline analysis produce identical frames for identical audio. */
export class FeatureExtractor {
  private readonly detector: PitchDetector<Float32Array>;
  private prevSpec: Float32Array | null = null;
  private fluxHistory: number[] = [];
  private lastOnsetT = -Infinity;

  constructor(
    private readonly sampleRate: number,
    private readonly windowSize: number = ANALYSIS.windowSize,
  ) {
    this.detector = PitchDetector.forFloat32Array(windowSize);
    // Meyda's extractors read these globals when called as pure functions —
    // AND cache the mel filter bank keyed only by band count, not sample rate.
    // Every extractor in the app must therefore run at the canonical rate
    // (the AudioContext is pinned to it); a mismatch would silently produce
    // MFCCs from a wrong-rate filter bank.
    if (sampleRate !== ANALYSIS.sampleRate) {
      console.warn(
        `FeatureExtractor at ${sampleRate} Hz != canonical ${ANALYSIS.sampleRate} Hz — ` +
          'MFCCs will not be comparable with Target Packs',
      );
    }
    Meyda.sampleRate = sampleRate;
    Meyda.bufferSize = windowSize;
    Meyda.windowingFunction = 'hanning';
  }

  extract(window: Float32Array, t: number): FeatureFrame {
    const [pitch, clarity] = this.detector.findPitch(window, this.sampleRate);
    const voiced =
      clarity >= ANALYSIS.clarityThreshold && pitch >= ANALYSIS.f0Min && pitch <= ANALYSIS.f0Max;
    const f0 = voiced ? pitch : 0;

    const extracted = Meyda.extract(['amplitudeSpectrum', 'mfcc', 'rms'], window) as {
      amplitudeSpectrum: Float32Array;
      mfcc: number[];
      rms: number;
    } | null;

    const spec = extracted?.amplitudeSpectrum ?? new Float32Array(this.windowSize / 2);
    const rms = extracted?.rms ?? 0;
    const mfcc = extracted?.mfcc ?? new Array(13).fill(0);

    const flux = fluxL1(spec, this.prevSpec);
    this.prevSpec = spec.slice();

    const onset = this.detectOnset(flux, t);

    return {
      t,
      f0,
      midi: voiced ? hzToMidi(f0) : 0,
      clarity,
      voiced,
      rms,
      db: rms > 0 ? Math.max(-90, Math.min(0, 20 * Math.log10(rms))) : -90,
      centroid: centroidHz(spec, this.sampleRate, this.windowSize),
      rolloff: rolloffHz(spec, this.sampleRate, this.windowSize),
      flatness: flatness(spec),
      slope: slopeNorm(spec),
      flux,
      onset,
      mfcc,
    };
  }

  /** Adaptive-threshold onset: flux must exceed k × median of recent flux,
   *  with an 80 ms refractory period. */
  private detectOnset(flux: number, t: number): boolean {
    this.fluxHistory.push(flux);
    if (this.fluxHistory.length > 40) this.fluxHistory.shift();
    if (this.fluxHistory.length < 10) return false;
    const sorted = [...this.fluxHistory].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const threshold = median * 2.2 + 1e-5;
    if (flux > threshold && t - this.lastOnsetT > 0.08) {
      this.lastOnsetT = t;
      return true;
    }
    return false;
  }
}
