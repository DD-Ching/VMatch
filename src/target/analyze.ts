import { FeatureExtractor } from '../features/extract';
import { ANALYSIS, type FeatureFrame, type TargetPack } from '../features/types';

/** Offline analysis of an audio file into a Target Pack, using the exact same
 *  FeatureExtractor as live capture — schema parity is by construction. */
export async function analyzeFileToTargetPack(file: File): Promise<TargetPack> {
  const arrayBuffer = await file.arrayBuffer();

  const decodeCtx = new AudioContext();
  const decoded = await decodeCtx.decodeAudioData(arrayBuffer);
  await decodeCtx.close();

  // Resample to the canonical analysis rate, mono.
  const sr = ANALYSIS.sampleRate;
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * sr), sr);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  const data = rendered.getChannelData(0);

  const hop = ANALYSIS.hopSize(sr);
  const win = ANALYSIS.windowSize;
  const extractor = new FeatureExtractor(sr, win);
  const frames: FeatureFrame[] = [];
  const windowBuf = new Float32Array(win);

  for (let pos = 0; pos + hop <= data.length; pos += hop) {
    windowBuf.copyWithin(0, hop);
    windowBuf.set(data.subarray(pos, pos + hop), win - hop);
    frames.push(extractor.extract(windowBuf.slice(), (pos + hop) / sr));
  }

  return {
    version: 1,
    sampleRate: sr,
    hopSec: hop / sr,
    windowSize: win,
    frames,
    meta: {
      name: file.name.replace(/\.[^.]+$/, ''),
      durationSec: decoded.duration,
      createdBy: 'vmatch-browser-analyzer@0.0.1',
    },
  };
}

export function downloadTargetPack(pack: TargetPack): void {
  const blob = new Blob([JSON.stringify(pack)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${pack.meta.name}.vmatch.json`;
  a.click();
  URL.revokeObjectURL(url);
}
