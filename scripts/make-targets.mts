/** Offline Target Pack generator (Node, run with `npm run make-targets`).
 *
 *  Produces the two bundled MVP targets into public/targets/:
 *    - happy-birthday: first line of "Happy Birthday" (public-domain melody),
 *      synthesized as a vocal-ish additive tone (formant envelope + vibrato)
 *      so the repo needs no recorded-voice asset.
 *    - spoken-phrase: "Two voices, one space." via macOS `say` (skipped with a
 *      warning on other platforms).
 *
 *  Analysis reuses the exact same FeatureExtractor as live capture — schema
 *  parity is by construction, mirroring src/target/analyze.ts frame-for-frame.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FeatureExtractor } from '../src/features/extract';
import { ANALYSIS, type FeatureFrame, type TargetPack } from '../src/features/types';

const SR = ANALYSIS.sampleRate; // 48000
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'targets');

// ---------------------------------------------------------------------------
// Sung phrase synthesis: additive harmonics under a vowel-/a:/ formant
// envelope, phase-locked to a continuous f0 track (portamento + vibrato).
// ---------------------------------------------------------------------------

interface Note {
  midi: number;
  beats: number;
}

// "Hap-py birth-day to you" in F major, 110 bpm. The final note holds 3.5
// beats: the merge choreography needs 0.7 s capture + 0.8 s fusion inside a
// stable sustained note (docs/05 §1 — sustained notes give the merge a fair
// chance), so the phrase must end on a long, settleable tone.
const MELODY: Note[] = [
  { midi: 60, beats: 0.5 }, // C4  Hap-
  { midi: 60, beats: 0.5 }, // C4  py
  { midi: 62, beats: 1.0 }, // D4  birth-
  { midi: 60, beats: 1.0 }, // C4  day
  { midi: 65, beats: 1.0 }, // F4  to
  { midi: 64, beats: 3.5 }, // E4  you
];
const BPM = 110;
const LEAD_IN = 0.2; // silence before the first note
const TAIL = 0.6; // release + silence after the last note

const FORMANTS = [
  { hz: 700, bw: 110, gain: 1.0 },
  { hz: 1220, bw: 120, gain: 0.5 },
  { hz: 2600, bw: 180, gain: 0.22 },
];

function formantEnv(hz: number): number {
  let env = 0.01;
  for (const f of FORMANTS) {
    const d = (hz - f.hz) / f.bw;
    env += f.gain * Math.exp(-0.5 * d * d);
  }
  return env;
}

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function synthesizeSungPhrase(): Float32Array {
  const beatSec = 60 / BPM;
  const notes = MELODY.map((n, i) => {
    const startBeats = MELODY.slice(0, i).reduce((a, m) => a + m.beats, 0);
    return {
      hz: midiToHz(n.midi),
      start: LEAD_IN + startBeats * beatSec,
      end: LEAD_IN + (startBeats + n.beats) * beatSec,
    };
  });
  const total = notes[notes.length - 1].end + TAIL;
  const out = new Float32Array(Math.ceil(total * SR));

  const ATTACK = 0.045;
  const RELEASE = 0.09;
  const PORTAMENTO = 0.03;
  const VIB_HZ = 5.3;
  const VIB_CENTS = 22;
  const VIB_ONSET = 0.18; // vibrato fades in this long after a note starts

  let phase = 0; // fundamental phase; harmonic k uses k*phase (phase-locked)
  let jitterCents = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const noteIdx = notes.findIndex((n) => t < n.end);
    const note = noteIdx === -1 ? notes[notes.length - 1] : notes[noteIdx];
    const isTail = noteIdx === -1;

    // f0: portamento from the previous note, then vibrato that fades in.
    let hz = note.hz;
    const sinceStart = t - note.start;
    if (!isTail && sinceStart >= 0 && sinceStart < PORTAMENTO && noteIdx > 0) {
      const prev = notes[noteIdx - 1].hz;
      hz = prev * Math.pow(note.hz / prev, sinceStart / PORTAMENTO);
    }
    const vibAmount = Math.max(0, Math.min(1, (sinceStart - VIB_ONSET) / 0.25));
    const vib = vibAmount * VIB_CENTS * Math.sin(2 * Math.PI * VIB_HZ * t);
    jitterCents = jitterCents * 0.999 + (Math.random() - 0.5) * 0.35;
    hz *= Math.pow(2, (vib + jitterCents) / 1200);

    // Amplitude: legato with partial articulation. Inner-note attacks dip to
    // 55% instead of 0 — a full dip lets the breath-noise floor dominate the
    // spectrum for a few frames, spiking the centroid (bad target data).
    let amp = 0;
    if (t >= notes[0].start) {
      const inNote = isTail ? notes[notes.length - 1] : note;
      const ramp = Math.max(0, Math.min(1, (t - inNote.start) / ATTACK));
      const on = noteIdx === 0 || isTail ? ramp : 0.55 + 0.45 * ramp;
      const off = isTail ? Math.max(0, 1 - (t - inNote.end) / RELEASE) : 1;
      amp = 0.32 * on * off * (0.92 + 0.08 * Math.sin((Math.PI * (t - notes[0].start)) / (total - LEAD_IN)));
    }

    phase += (2 * Math.PI * hz) / SR;
    let s = 0;
    if (amp > 0) {
      for (let k = 1; k * hz < 16000 && k <= 40; k++) {
        // Real voices keep substantial fundamental energy at mid pitches; floor
        // the first two harmonics so no note leaves the fundamental near-silent
        // (a bare formant envelope makes MPM octave-jump on F4, whose 2nd
        // harmonic lands exactly on F1 = 700 Hz).
        const floor = k === 1 ? 0.85 : k === 2 ? 0.12 : 0;
        const a = Math.max(formantEnv(k * hz), floor) / Math.pow(k, 0.6);
        s += a * Math.sin(k * phase + k * k * 0.3);
      }
      s *= 0.35; // headroom for the harmonic sum
      // Breath noise floor, a touch stronger during attacks.
      s += (Math.random() - 0.5) * 0.006;
    }
    out[i] = s * amp;
  }

  // Normalize to -3 dBFS peak.
  let peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) {
    const g = Math.pow(10, -3 / 20) / peak;
    for (let i = 0; i < out.length; i++) out[i] *= g;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Spoken phrase via macOS `say` + afconvert (LEI16 mono 48 kHz WAV).
// ---------------------------------------------------------------------------

function synthesizeSpokenPhrase(): Float32Array | null {
  if (process.platform !== 'darwin') {
    console.warn('skipping spoken target: `say` is macOS-only');
    return null;
  }
  const aiff = join(tmpdir(), 'vmatch-spoken.aiff');
  const wav = join(tmpdir(), 'vmatch-spoken.wav');
  try {
    execFileSync('say', ['-o', aiff, 'Two voices, one space.']);
    execFileSync('afconvert', [aiff, '-o', wav, '-d', 'LEI16@48000', '-c', '1', '-f', 'WAVE']);
    return decodeWavLEI16(readFileSync(wav));
  } finally {
    for (const f of [aiff, wav]) {
      try {
        rmSync(f);
      } catch {
        /* ignore */
      }
    }
  }
}

function decodeWavLEI16(buf: Buffer): Float32Array {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('not a RIFF/WAVE file');
  }
  let pos = 12;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    if (id === 'data') {
      const n = Math.floor(size / 2);
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = buf.readInt16LE(pos + 8 + i * 2) / 32768;
      return out;
    }
    pos += 8 + size + (size % 2);
  }
  throw new Error('WAV data chunk not found');
}

function encodeWavPCM16(samples: Float32Array, sampleRate: number): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

// ---------------------------------------------------------------------------
// Analysis: mirrors src/target/analyze.ts exactly (same hop/window sliding).
// ---------------------------------------------------------------------------

function analyze(data: Float32Array, name: string): TargetPack {
  const hop = ANALYSIS.hopSize(SR);
  const win = ANALYSIS.windowSize;
  const extractor = new FeatureExtractor(SR, win);
  const frames: FeatureFrame[] = [];
  const windowBuf = new Float32Array(win);

  for (let pos = 0; pos + hop <= data.length; pos += hop) {
    windowBuf.copyWithin(0, hop);
    windowBuf.set(data.subarray(pos, pos + hop), win - hop);
    frames.push(roundFrame(extractor.extract(windowBuf.slice(), (pos + hop) / SR)));
  }

  return {
    version: 1,
    sampleRate: SR,
    hopSec: hop / SR,
    windowSize: win,
    frames,
    meta: {
      name,
      durationSec: data.length / SR,
      createdBy: 'vmatch-node-analyzer@0.0.1',
    },
  };
}

/** Round floats so the bundled JSON stays small; precision chosen well above
 *  every consumer threshold (cents-level pitch, 0.01 dB loudness). */
function roundFrame(f: FeatureFrame): FeatureFrame {
  const r = (v: number, d: number) => {
    const m = 10 ** d;
    return Math.round(v * m) / m;
  };
  return {
    ...f,
    t: r(f.t, 4),
    f0: r(f.f0, 2),
    midi: r(f.midi, 3),
    clarity: r(f.clarity, 3),
    rms: r(f.rms, 5),
    db: r(f.db, 2),
    centroid: r(f.centroid, 1),
    rolloff: r(f.rolloff, 1),
    flatness: r(f.flatness, 4),
    slope: r(f.slope, 4),
    flux: r(f.flux, 6),
    mfcc: f.mfcc.map((v) => r(v, 3)),
  };
}

// ---------------------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true });

const targets: Array<{ name: string; samples: Float32Array | null; bpm?: number }> = [
  { name: 'happy-birthday', samples: synthesizeSungPhrase(), bpm: BPM },
  { name: 'spoken-phrase', samples: synthesizeSpokenPhrase() },
];

for (const { name, samples, bpm } of targets) {
  if (!samples) continue;
  const pack = analyze(samples, name);
  if (bpm) pack.meta.bpm = bpm;
  writeFileSync(join(OUT_DIR, `${name}.wav`), encodeWavPCM16(samples, SR));
  writeFileSync(join(OUT_DIR, `${name}.vmatch.json`), JSON.stringify(pack));
  const voicedRatio = pack.frames.filter((f) => f.voiced).length / pack.frames.length;
  console.log(
    `${name}: ${pack.meta.durationSec.toFixed(2)}s · ${pack.frames.length} frames · ` +
      `${(voicedRatio * 100).toFixed(0)}% voiced → public/targets/${name}.{wav,vmatch.json}`,
  );
}
