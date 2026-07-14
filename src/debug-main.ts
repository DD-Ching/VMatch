import { AudioEngine, type CaptureSource } from './capture/engine';
import { Scope } from './debug/scope';
import { FrameRing } from './state/ring';
import { midiToNoteName, type FeatureFrame } from './features/types';
import { analyzeFileToTargetPack, downloadTargetPack } from './target/analyze';

const engine = new AudioEngine();
const ring = new FrameRing();
const canvas = document.getElementById('scope') as HTMLCanvasElement;
const scope = new Scope(canvas, ring);
scope.start();

let lastFrame: FeatureFrame | null = null;
engine.onFrame = (frame) => {
  ring.push(frame);
  lastFrame = frame;
};

// Exposed for automated end-to-end checks (test tone → assert pitch).
declare global {
  interface Window {
    __vmatch: { lastFrame: () => FeatureFrame | null; frameCount: () => number };
  }
}
window.__vmatch = {
  lastFrame: () => lastFrame,
  frameCount: () => ring.size,
};

const el = (id: string) => document.getElementById(id)!;
const status = el('status');

function setButtons(running: boolean): void {
  (el('btn-mic') as HTMLButtonElement).disabled = running;
  (el('btn-tone') as HTMLButtonElement).disabled = running;
  (el('btn-glide') as HTMLButtonElement).disabled = running;
  (el('btn-stop') as HTMLButtonElement).disabled = !running;
}

async function start(kind: CaptureSource['kind']): Promise<void> {
  status.textContent = 'starting…';
  try {
    ring.clear();
    await engine.startCapture({ kind } as CaptureSource);
    const s = engine.stats();
    const src = kind === 'mic' ? 'microphone' : kind === 'tone-hold' ? 'test tone A3' : 'test glide A3–A4';
    let settings = '';
    if (s.trackSettings) {
      const t = s.trackSettings;
      settings = ` · AEC ${t.echoCancellation ? 'ON (!)' : 'off'} · NS ${t.noiseSuppression ? 'ON (!)' : 'off'} · AGC ${t.autoGainControl ? 'ON (!)' : 'off'}`;
    }
    status.textContent = `${src} · ${s.sampleRate} Hz · hop ${s.hopSize} (${((s.hopSize / s.sampleRate) * 1000).toFixed(1)} ms)${settings}`;
    setButtons(true);
  } catch (err) {
    status.textContent = `failed to start: ${err instanceof Error ? err.message : String(err)}`;
    setButtons(false);
  }
}

el('btn-mic').addEventListener('click', () => void start('mic'));
el('btn-tone').addEventListener('click', () => void start('tone-hold'));
el('btn-glide').addEventListener('click', () => void start('tone-glide'));
el('btn-stop').addEventListener('click', () => {
  void engine.stopCapture().then(() => {
    status.textContent = 'stopped';
    setButtons(false);
  });
});
setButtons(false);

// Readouts, ~10 Hz.
setInterval(() => {
  const f = lastFrame;
  const s = engine.stats();
  el('ro-f0').textContent = f && f.voiced ? `${f.f0.toFixed(1)} Hz` : '—';
  el('ro-note').textContent = f && f.voiced ? `${midiToNoteName(f.midi)} (${f.midi.toFixed(2)})` : '—';
  el('ro-clarity').textContent = f ? f.clarity.toFixed(2) : '—';
  el('ro-db').textContent = f ? `${f.db.toFixed(1)} dB` : '—';
  el('ro-centroid').textContent = f ? `${f.centroid.toFixed(0)} Hz` : '—';
  el('ro-flatness').textContent = f ? f.flatness.toFixed(3) : '—';
  el('ro-fps').textContent = engine.running ? `${s.framesPerSec.toFixed(0)} fps` : '—';
  el('ro-extract').textContent = engine.running ? `${s.extractMsAvg.toFixed(2)} ms` : '—';
  el('ro-latency').textContent = engine.running ? `${s.baseLatencyMs.toFixed(1)} ms base` : '—';
}, 100);

// Offline target-pack analyzer (same extractor, same schema).
const fileInput = el('file-input') as HTMLInputElement;
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  const out = el('analyze-status');
  out.textContent = `analyzing ${file.name}…`;
  try {
    const pack = await analyzeFileToTargetPack(file);
    downloadTargetPack(pack);
    out.textContent = `done: ${pack.frames.length} frames · ${pack.meta.durationSec.toFixed(2)} s → ${pack.meta.name}.vmatch.json`;
  } catch (err) {
    out.textContent = `analysis failed: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    fileInput.value = '';
  }
});
