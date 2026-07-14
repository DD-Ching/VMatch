/** Divergence-free curl noise for particle turbulence, after Bridson et al.,
 *  "Curl-Noise for Procedural Fluid Flow" (SIGGRAPH 2007). Original
 *  implementation over a hash-based 3D value-noise potential (no third-party
 *  noise code — license posture, docs/03-oss-audit.md). */

function hash(ix: number, iy: number, iz: number): number {
  let h = (ix * 374761393 + iy * 668265263 + iz * 2147483647) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967295;
}

function smooth(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function valueNoise(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const fz = smooth(z - iz);

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const c000 = hash(ix, iy, iz);
  const c100 = hash(ix + 1, iy, iz);
  const c010 = hash(ix, iy + 1, iz);
  const c110 = hash(ix + 1, iy + 1, iz);
  const c001 = hash(ix, iy, iz + 1);
  const c101 = hash(ix + 1, iy, iz + 1);
  const c011 = hash(ix, iy + 1, iz + 1);
  const c111 = hash(ix + 1, iy + 1, iz + 1);
  return lerp(
    lerp(lerp(c000, c100, fx), lerp(c010, c110, fx), fy),
    lerp(lerp(c001, c101, fx), lerp(c011, c111, fx), fy),
    fz,
  );
}

/** Two independent scalar potentials (offset copies of the noise field). */
function potential(x: number, y: number, z: number, which: number): number {
  const o = which * 71.13;
  return valueNoise(x + o, y - o, z + o * 0.5);
}

const EPS = 0.35;

/** curl of (ψ1, ψ2, ψ3) sampled by finite differences; writes into `out`. */
export function curl(x: number, y: number, z: number, out: { x: number; y: number; z: number }): void {
  const dp3dy = (potential(x, y + EPS, z, 2) - potential(x, y - EPS, z, 2)) / (2 * EPS);
  const dp2dz = (potential(x, y, z + EPS, 1) - potential(x, y, z - EPS, 1)) / (2 * EPS);
  const dp1dz = (potential(x, y, z + EPS, 0) - potential(x, y, z - EPS, 0)) / (2 * EPS);
  const dp3dx = (potential(x + EPS, y, z, 2) - potential(x - EPS, y, z, 2)) / (2 * EPS);
  const dp2dx = (potential(x + EPS, y, z, 1) - potential(x - EPS, y, z, 1)) / (2 * EPS);
  const dp1dy = (potential(x, y + EPS, z, 0) - potential(x, y - EPS, z, 0)) / (2 * EPS);
  out.x = dp3dy - dp2dz;
  out.y = dp1dz - dp3dx;
  out.z = dp2dx - dp1dy;
}
