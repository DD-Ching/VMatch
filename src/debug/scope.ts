import type { FrameRing } from '../state/ring';
import { midiToNoteName } from '../features/types';

const COLORS = {
  ground: '#0A0E16',
  grid: 'rgba(139,147,167,0.15)',
  gridLabel: 'rgba(139,147,167,0.6)',
  pitch: '#6FD6E8',
  pitchDim: 'rgba(111,214,232,0.25)',
  centroid: '#E8B44A',
  loudness: 'rgba(232,230,223,0.8)',
  onset: 'rgba(232,180,74,0.9)',
  unvoiced: 'rgba(139,147,167,0.35)',
};

const PITCH_LANE = { top: 0.04, bottom: 0.62, midiMin: 33, midiMax: 86 }; // A1..D6
const CENTROID_LANE = { top: 0.66, bottom: 0.82, hzMin: 100, hzMax: 8000 };
const LOUD_LANE = { top: 0.86, bottom: 0.98, dbMin: -70, dbMax: 0 };

/** Scrolling debug oscilloscope: pitch (semitone grid), brightness, loudness, onsets.
 *  Renders raw frames — deliberately unsmoothed so the spine's honesty is visible. */
export class Scope {
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  /** Seconds of history shown. */
  windowSec = 8;

  constructor(
    private canvas: HTMLCanvasElement,
    private ring: FrameRing,
  ) {
    this.ctx = canvas.getContext('2d')!;
  }

  start(): void {
    const loop = () => {
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private draw(): void {
    this.resize();
    const { ctx } = this;
    const W = this.canvas.clientWidth;
    const H = this.canvas.clientHeight;

    ctx.fillStyle = COLORS.ground;
    ctx.fillRect(0, 0, W, H);

    this.drawPitchGrid(W, H);

    const frames = this.ring.lastN(Math.ceil(this.windowSec * 110));
    if (frames.length < 2) return;

    const tEnd = frames[frames.length - 1].t;
    const tStart = tEnd - this.windowSec;
    const x = (t: number) => ((t - tStart) / this.windowSec) * W;

    const yPitch = (midi: number) => {
      const f = (midi - PITCH_LANE.midiMin) / (PITCH_LANE.midiMax - PITCH_LANE.midiMin);
      return H * (PITCH_LANE.bottom - f * (PITCH_LANE.bottom - PITCH_LANE.top));
    };
    const yCentroid = (hz: number) => {
      const clamped = Math.max(CENTROID_LANE.hzMin, Math.min(CENTROID_LANE.hzMax, hz));
      const f =
        Math.log(clamped / CENTROID_LANE.hzMin) / Math.log(CENTROID_LANE.hzMax / CENTROID_LANE.hzMin);
      return H * (CENTROID_LANE.bottom - f * (CENTROID_LANE.bottom - CENTROID_LANE.top));
    };
    const yLoud = (db: number) => {
      const f = (db - LOUD_LANE.dbMin) / (LOUD_LANE.dbMax - LOUD_LANE.dbMin);
      const clamped = Math.max(0, Math.min(1, f));
      return H * (LOUD_LANE.bottom - clamped * (LOUD_LANE.bottom - LOUD_LANE.top));
    };

    // Onsets: full-height ticks behind everything else.
    for (const fr of frames) {
      if (fr.onset && fr.t >= tStart) {
        ctx.strokeStyle = COLORS.onset;
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.moveTo(x(fr.t), H * PITCH_LANE.top);
        ctx.lineTo(x(fr.t), H * LOUD_LANE.bottom);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // Pitch: dots, alpha from clarity; unvoiced frames as faint baseline ticks.
    for (const fr of frames) {
      if (fr.t < tStart) continue;
      if (fr.voiced) {
        ctx.fillStyle = COLORS.pitch;
        ctx.globalAlpha = 0.35 + 0.65 * Math.max(0, Math.min(1, (fr.clarity - 0.85) / 0.15));
        ctx.beginPath();
        ctx.arc(x(fr.t), yPitch(fr.midi), 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (fr.db > -60) {
        ctx.fillStyle = COLORS.unvoiced;
        ctx.fillRect(x(fr.t), H * PITCH_LANE.bottom + 2, 1, 3);
      }
    }

    // Centroid line.
    ctx.strokeStyle = COLORS.centroid;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    let started = false;
    for (const fr of frames) {
      if (fr.t < tStart || fr.db <= -70) continue;
      const px = x(fr.t);
      const py = yCentroid(fr.centroid);
      if (!started) {
        ctx.moveTo(px, py);
        started = true;
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.stroke();

    // Loudness area.
    ctx.strokeStyle = COLORS.loudness;
    ctx.lineWidth = 1;
    ctx.beginPath();
    started = false;
    for (const fr of frames) {
      if (fr.t < tStart) continue;
      const px = x(fr.t);
      const py = yLoud(fr.db);
      if (!started) {
        ctx.moveTo(px, py);
        started = true;
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.stroke();
  }

  private drawPitchGrid(W: number, H: number): void {
    const { ctx } = this;
    ctx.font = '10px ui-monospace, monospace';
    for (let midi = PITCH_LANE.midiMin; midi <= PITCH_LANE.midiMax; midi++) {
      if (midi % 12 !== 0 && midi % 12 !== 9) continue; // C and A lines only
      const f = (midi - PITCH_LANE.midiMin) / (PITCH_LANE.midiMax - PITCH_LANE.midiMin);
      const y = H * (PITCH_LANE.bottom - f * (PITCH_LANE.bottom - PITCH_LANE.top));
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
      ctx.fillStyle = COLORS.gridLabel;
      ctx.fillText(midiToNoteName(midi), 4, y - 3);
    }
  }
}
