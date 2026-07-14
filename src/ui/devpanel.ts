/** Live tuning panel (?dev) over mapping.ts — dev tooling, not Flow Mode UI. */
import { M } from '../mapping';

interface Binding {
  label: string;
  get(): number;
  set(v: number): void;
  min: number;
  max: number;
  step: number;
}

export function mountDevPanel(root: HTMLElement, extra: { getInfo(): string }): void {
  if (!new URLSearchParams(location.search).has('dev')) return;

  const bindings: Binding[] = [
    { label: 'pitch thr (st)', get: () => M.closeness.pitchSemitones, set: (v) => (M.closeness.pitchSemitones = v), min: 0.1, max: 2, step: 0.05 },
    { label: 'timing thr (s)', get: () => M.closeness.timingSec, set: (v) => (M.closeness.timingSec = v), min: 0.05, max: 0.6, step: 0.01 },
    { label: 'bright thr (frac)', get: () => M.closeness.brightnessFrac, set: (v) => (M.closeness.brightnessFrac = v), min: 0.05, max: 1, step: 0.05 },
    { label: 'w pitch', get: () => M.closeness.weights.pitch, set: (v) => (M.closeness.weights.pitch = v), min: 0, max: 1, step: 0.05 },
    { label: 'w timing', get: () => M.closeness.weights.timing, set: (v) => (M.closeness.weights.timing = v), min: 0, max: 1, step: 0.05 },
    { label: 'w bright', get: () => M.closeness.weights.brightness, set: (v) => (M.closeness.weights.brightness = v), min: 0, max: 1, step: 0.05 },
    { label: 'capture hold (s)', get: () => M.capture.holdSec, set: (v) => (M.capture.holdSec = v), min: 0.2, max: 2, step: 0.05 },
    { label: 'merge hold (s)', get: () => M.capture.mergeHoldSec, set: (v) => (M.capture.mergeHoldSec = v), min: 0.2, max: 2, step: 0.05 },
    { label: 'spring Y (Hz)', get: () => M.spring.yHz, set: (v) => (M.spring.yHz = v), min: 2, max: 20, step: 0.5 },
    { label: 'spring X (Hz)', get: () => M.spring.xHz, set: (v) => (M.spring.xHz = v), min: 2, max: 20, step: 0.5 },
    { label: '1€ minCutoff', get: () => M.oneEuro.minCutoff, set: (v) => (M.oneEuro.minCutoff = v), min: 0.1, max: 5, step: 0.1 },
    { label: '1€ beta', get: () => M.oneEuro.beta, set: (v) => (M.oneEuro.beta = v), min: 0, max: 0.2, step: 0.005 },
    { label: 'bloom base', get: () => M.render.bloom.strengthBase, set: (v) => (M.render.bloom.strengthBase = v), min: 0, max: 2, step: 0.05 },
    { label: 'clarity gate', get: () => M.voicing.clarityThreshold, set: (v) => (M.voicing.clarityThreshold = v), min: 0.8, max: 0.97, step: 0.01 },
  ];

  const panel = document.createElement('div');
  panel.className = 'vm-dev';
  const title = document.createElement('div');
  title.className = 'vm-dev-title';
  title.textContent = 'mapping.ts';
  panel.appendChild(title);

  for (const b of bindings) {
    const row = document.createElement('label');
    const span = document.createElement('span');
    span.textContent = b.label;
    const val = document.createElement('em');
    val.textContent = String(b.get());
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(b.min);
    input.max = String(b.max);
    input.step = String(b.step);
    input.value = String(b.get());
    input.addEventListener('input', () => {
      b.set(Number(input.value));
      val.textContent = input.value;
    });
    row.append(span, input, val);
    panel.appendChild(row);
  }

  const info = document.createElement('pre');
  info.className = 'vm-dev-info';
  panel.appendChild(info);
  setInterval(() => {
    info.textContent = extra.getInfo();
  }, 250);

  root.appendChild(panel);
}
