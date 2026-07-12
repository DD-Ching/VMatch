import { FeatureExtractor } from '../features/extract';
import { ANALYSIS, type FeatureFrame } from '../features/types';

export type SourceKind = 'mic' | 'tone-hold' | 'tone-glide';

export interface EngineStats {
  sampleRate: number;
  hopSize: number;
  baseLatencyMs: number;
  framesPerSec: number;
  extractMsAvg: number;
  trackSettings: MediaTrackSettings | null;
}

/** Owns the AudioContext, the capture path (mic or test tone), the sliding
 *  analysis window, and per-hop feature extraction. Emits FeatureFrames. */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private source: AudioNode | null = null;
  private stream: MediaStream | null = null;
  private osc: OscillatorNode | null = null;
  private extractor: FeatureExtractor | null = null;

  private windowBuf: Float32Array = new Float32Array(ANALYSIS.windowSize);
  private scratch: Float32Array = new Float32Array(ANALYSIS.windowSize);

  private frameTimes: number[] = [];
  private extractTimes: number[] = [];
  private trackSettings: MediaTrackSettings | null = null;

  onFrame: ((frame: FeatureFrame) => void) | null = null;

  get running(): boolean {
    return this.node !== null;
  }

  async start(kind: SourceKind): Promise<void> {
    await this.stop();
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ctx = ctx;
    if (ctx.state === 'suspended') await ctx.resume();

    await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}capture-processor.js`);

    const hopSize = ANALYSIS.hopSize(ctx.sampleRate);
    this.extractor = new FeatureExtractor(ctx.sampleRate);
    this.windowBuf.fill(0);

    if (kind === 'mic') {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
      });
      const track = this.stream.getAudioTracks()[0];
      this.trackSettings = track ? track.getSettings() : null;
      this.source = ctx.createMediaStreamSource(this.stream);
    } else {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      if (kind === 'tone-hold') {
        osc.frequency.value = 220;
      } else {
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        // Slow up-and-down glide between A3 and A4 to exercise pitch tracking.
        for (let i = 0; i < 30; i++) {
          osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + i * 4 + 2);
          osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + i * 4 + 4);
        }
      }
      const gain = ctx.createGain();
      gain.gain.value = 0.5;
      osc.connect(gain);
      osc.start();
      this.osc = osc;
      this.source = gain;
      this.trackSettings = null;
    }

    const node = new AudioWorkletNode(ctx, 'capture-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      processorOptions: { hopSize },
    });
    this.node = node;

    // The worklet must be pulled by the graph; route through a muted gain.
    const mute = ctx.createGain();
    mute.gain.value = 0;
    this.source.connect(node);
    node.connect(mute);
    mute.connect(ctx.destination);

    node.port.onmessage = (e: MessageEvent<{ t: number; samples: Float32Array }>) => {
      this.handleHop(e.data.t, e.data.samples);
    };
  }

  private handleHop(t: number, samples: Float32Array): void {
    if (!this.extractor) return;
    const w = this.windowBuf;
    // Slide the analysis window left by one hop and append the new samples.
    w.copyWithin(0, samples.length);
    w.set(samples, w.length - samples.length);
    this.scratch.set(w);

    const start = performance.now();
    const frame = this.extractor.extract(this.scratch, t);
    const elapsed = performance.now() - start;

    this.extractTimes.push(elapsed);
    if (this.extractTimes.length > 100) this.extractTimes.shift();
    this.frameTimes.push(performance.now());
    if (this.frameTimes.length > 100) this.frameTimes.shift();

    this.onFrame?.(frame);
  }

  stats(): EngineStats {
    const ft = this.frameTimes;
    let fps = 0;
    if (ft.length >= 2) {
      const span = (ft[ft.length - 1] - ft[0]) / 1000;
      if (span > 0) fps = (ft.length - 1) / span;
    }
    const ex = this.extractTimes;
    const extractMsAvg = ex.length ? ex.reduce((a, b) => a + b, 0) / ex.length : 0;
    return {
      sampleRate: this.ctx?.sampleRate ?? 0,
      hopSize: this.ctx ? ANALYSIS.hopSize(this.ctx.sampleRate) : 0,
      baseLatencyMs: (this.ctx?.baseLatency ?? 0) * 1000,
      framesPerSec: fps,
      extractMsAvg,
      trackSettings: this.trackSettings,
    };
  }

  async stop(): Promise<void> {
    this.node?.port.close();
    this.node?.disconnect();
    this.node = null;
    this.source?.disconnect();
    this.source = null;
    if (this.osc) {
      this.osc.stop();
      this.osc = null;
    }
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    if (this.ctx) {
      await this.ctx.close();
      this.ctx = null;
    }
    this.extractor = null;
    this.frameTimes = [];
    this.extractTimes = [];
  }
}
