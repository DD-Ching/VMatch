/** One analysis frame, emitted every hop (~10 ms). This schema is shared verbatim
 *  between live capture and offline target analysis — Target Packs are arrays of these. */
export interface FeatureFrame {
  /** Seconds on the source clock (AudioContext time live; sample offset offline). */
  t: number;
  /** Fundamental frequency in Hz; 0 when unvoiced. */
  f0: number;
  /** MIDI note number (69 = A4 = 440 Hz), fractional; 0 when unvoiced. */
  midi: number;
  /** Pitch clarity from the MPM detector, 0..1. */
  clarity: number;
  voiced: boolean;
  rms: number;
  /** 20*log10(rms), clamped to [-90, 0]. */
  db: number;
  /** Spectral centroid in Hz ("brightness"). */
  centroid: number;
  /** 85% spectral rolloff in Hz. */
  rolloff: number;
  /** Spectral flatness 0..1 (noisiness / breathiness proxy). */
  flatness: number;
  /** Spectral slope (tilt proxy): regression slope of magnitude vs frequency, normalized. */
  slope: number;
  /** Half-wave-rectified spectral flux, normalized per bin. */
  flux: number;
  onset: boolean;
  /** 13 MFCCs for alignment features. */
  mfcc: number[];
}

export interface TargetPack {
  version: 1;
  sampleRate: number;
  hopSec: number;
  windowSize: number;
  frames: FeatureFrame[];
  meta: {
    name: string;
    durationSec: number;
    createdBy: string;
  };
}

export const ANALYSIS = {
  sampleRate: 48000,
  windowSize: 2048,
  /** Hop of 10 ms at the given sample rate. */
  hopSize(sampleRate: number): number {
    return Math.round(sampleRate * 0.01);
  },
  f0Min: 45,
  f0Max: 1200,
  clarityThreshold: 0.85,
} as const;

export function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

export function midiToNoteName(midi: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const n = Math.round(midi);
  const name = names[((n % 12) + 12) % 12];
  const octave = Math.floor(n / 12) - 1;
  return `${name}${octave}`;
}
