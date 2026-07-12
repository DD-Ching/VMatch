/** Spectral shape measures computed from an amplitude spectrum, with explicit units.
 *  We compute these ourselves (rather than trusting library conventions) so every
 *  consumer — live scope, mapping layer, target packs — sees the same units. */

export function centroidHz(spec: Float32Array, sampleRate: number, fftSize: number): number {
  let num = 0;
  let den = 0;
  for (let i = 0; i < spec.length; i++) {
    num += i * spec[i];
    den += spec[i];
  }
  if (den <= 1e-9) return 0;
  return ((num / den) * sampleRate) / fftSize;
}

export function rolloffHz(
  spec: Float32Array,
  sampleRate: number,
  fftSize: number,
  fraction = 0.85,
): number {
  let total = 0;
  for (let i = 0; i < spec.length; i++) total += spec[i];
  if (total <= 1e-9) return 0;
  const target = total * fraction;
  let acc = 0;
  for (let i = 0; i < spec.length; i++) {
    acc += spec[i];
    if (acc >= target) return (i * sampleRate) / fftSize;
  }
  return ((spec.length - 1) * sampleRate) / fftSize;
}

export function flatness(spec: Float32Array): number {
  let logSum = 0;
  let sum = 0;
  let n = 0;
  for (let i = 1; i < spec.length; i++) {
    const v = spec[i] + 1e-12;
    logSum += Math.log(v);
    sum += v;
    n++;
  }
  if (n === 0 || sum <= 1e-9) return 0;
  const geo = Math.exp(logSum / n);
  const ari = sum / n;
  return geo / ari;
}

/** Least-squares slope of magnitude vs bin index, normalized by mean magnitude
 *  so the value is comparable across loudness levels. Negative = falling spectrum. */
export function slopeNorm(spec: Float32Array): number {
  const n = spec.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += spec[i];
    sumXY += i * spec[i];
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const mean = sumY / n;
  if (mean <= 1e-9) return 0;
  return (slope * n) / mean;
}

/** Half-wave-rectified L1 flux between successive spectra, normalized per bin. */
export function fluxL1(spec: Float32Array, prev: Float32Array | null): number {
  if (!prev || prev.length !== spec.length) return 0;
  let acc = 0;
  for (let i = 0; i < spec.length; i++) {
    const d = spec[i] - prev[i];
    if (d > 0) acc += d;
  }
  return acc / spec.length;
}
