import { FeatureExtractor } from '../features/extract';
import { ANALYSIS, type FeatureFrame } from '../features/types';

export type CaptureSource =
  | { kind: 'mic' }
  | { kind: 'tone-hold' }
  | { kind: 'tone-glide' }
  /** Feed an AudioBuffer through the capture path — the automated stand-in for
   *  a singer (e2e tests chase the target with its own audio, optionally
   *  pitch/tempo-shifted via playbackRate). */
  | { kind: 'buffer'; buffer: AudioBuffer; playbackRate?: number; audible?: boolean };

export interface EngineStats {
  sampleRate: number;
  hopSize: number;
  baseLatencyMs: number;
  framesPerSec: number;
  extractMsAvg: number;
  trackSettings: MediaTrackSettings | null;
}

/** Owns THE AudioContext (single clock for capture, playback and animation),
 *  the capture path, the sliding analysis window, and per-hop feature
 *  extraction. Emits FeatureFrames stamped with AudioContext time. */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private workletReady: Promise<void> | null = null;
  private node: AudioWorkletNode | null = null;
  private mute: GainNode | null = null;
  private source: AudioNode | null = null;
  private stream: MediaStream | null = null;
  private sourceStop: (() => void) | null = null;
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

  /** The single product clock. 0 until the context exists. */
  now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /** Create (or resume) the shared context. Must follow a user gesture.
   *  Pinned to the canonical analysis rate: MFCC/centroid features are
   *  sample-rate-dependent and Target Packs are baked at 48 kHz — letting the
   *  device rate leak in would bias every live-vs-pack comparison. */
  async ensureContext(): Promise<AudioContext> {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: ANALYSIS.sampleRate });
      this.workletReady = this.ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}capture-processor.js`);
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    await this.workletReady;
    return this.ctx;
  }

  async decode(data: ArrayBuffer): Promise<AudioBuffer> {
    const ctx = await this.ensureContext();
    return ctx.decodeAudioData(data);
  }

  /** Play a clip through the shared clock. Returns its context start time. */
  async play(buffer: AudioBuffer, onEnded?: () => void): Promise<{ startTime: number; stop(): void }> {
    const ctx = await this.ensureContext();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    if (onEnded) src.onended = onEnded;
    const startTime = ctx.currentTime + 0.05;
    src.start(startTime);
    return {
      startTime,
      stop: () => {
        try {
          src.stop();
        } catch {
          /* already stopped */
        }
      },
    };
  }

  private captureGen = 0;

  async startCapture(source: CaptureSource): Promise<void> {
    // Reentrancy guard: overlapping calls (e.g. a quick retry while a mic
    // prompt is pending) must not interleave two capture paths into one
    // analysis window. The newest call wins; stale ones abandon cleanly.
    const gen = ++this.captureGen;
    await this.stopCapture();
    const ctx = await this.ensureContext();
    if (gen !== this.captureGen) return;

    const hopSize = ANALYSIS.hopSize(ctx.sampleRate);
    this.extractor = new FeatureExtractor(ctx.sampleRate);
    this.windowBuf.fill(0);
    this.trackSettings = null;

    if (source.kind === 'mic') {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
      });
      if (gen !== this.captureGen) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      this.stream = stream;
      const track = stream.getAudioTracks()[0];
      this.trackSettings = track ? track.getSettings() : null;
      this.source = ctx.createMediaStreamSource(stream);
    } else if (source.kind === 'buffer') {
      const src = ctx.createBufferSource();
      src.buffer = source.buffer;
      src.playbackRate.value = source.playbackRate ?? 1;
      if (source.audible) src.connect(ctx.destination);
      src.start();
      this.sourceStop = () => {
        try {
          src.stop();
        } catch {
          /* already stopped */
        }
      };
      this.source = src;
    } else {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      if (source.kind === 'tone-hold') {
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
      this.sourceStop = () => osc.stop();
      this.source = gain;
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
    this.mute = mute;
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

  /** Stop the capture path. The context (and clock) stays alive. */
  async stopCapture(): Promise<void> {
    // Tell the processor to return false (lets the audio thread release it),
    // THEN close the port and tear down the graph.
    this.node?.port.postMessage('stop');
    this.node?.port.close();
    this.node?.disconnect();
    this.node = null;
    this.mute?.disconnect();
    this.mute = null;
    this.sourceStop?.();
    this.sourceStop = null;
    this.source?.disconnect();
    this.source = null;
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    this.extractor = null;
    this.frameTimes = [];
    this.extractTimes = [];
  }

  /** Full teardown, context included (debug page / page unload). */
  async close(): Promise<void> {
    await this.stopCapture();
    if (this.ctx) {
      await this.ctx.close();
      this.ctx = null;
      this.workletReady = null;
    }
  }
}
