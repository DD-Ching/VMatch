/** Path renderer: the target's ghost road (dust-river + ember ridge + onset
 *  beads) and — through the same pipeline, per the spec — crystallized attempt
 *  trails in the afterglow. Fed by feature frames; purely a function of them
 *  (deterministic replays). */
import * as THREE from 'three';
import { blackbody } from './sprites';
import { toWorld, type TargetCalibration } from '../target/pack';
import type { FeatureFrame } from '../features/types';

export interface PathSample {
  t: number;
  x: number;
  y: number;
  /** Normalized brightness 0..1 within the target's calibrated range. */
  temp: number;
  onset: boolean;
}

export function framesToPath(frames: FeatureFrame[], cal: TargetCalibration): PathSample[] {
  const out: PathSample[] = [];
  const voiced = frames.filter((f) => f.voiced);
  for (let i = 0; i < voiced.length; i++) {
    const f = voiced[i];
    // Positions bake a 5-frame median centroid: a single breathy analysis frame
    // must not fling road dust across the Reach (deterministic — same frames in,
    // same road out; the raw values stay untouched in the pack/attempt record).
    const win: number[] = [];
    for (let k = Math.max(0, i - 4); k <= Math.min(voiced.length - 1, i + 4); k++) {
      if (voiced[k].centroid > 0) win.push(voiced[k].centroid);
    }
    win.sort((a, b) => a - b);
    const medCentroid = win.length ? win[Math.floor(win.length / 2)] : f.centroid;
    const w = toWorld(cal, f.midi, medCentroid);
    const temp =
      medCentroid > 0
        ? Math.max(0, Math.min(1, (Math.log2(medCentroid) - cal.centroidLogCenter) / (2 * cal.centroidLogHalfSpan) + 0.5))
        : 0.5;
    out.push({ t: f.t, x: w.x, y: w.y, temp, onset: f.onset });
  }
  return out;
}

export interface RoadStyle {
  tint: THREE.Color;
  dustCount: number;
  baseAlpha: number;
  /** Crystallized paths shimmer glassily and ignore lit/bead uniforms. */
  crystalline: boolean;
  zOffset?: number;
}

const pathVertex = `
  attribute float aT;
  attribute float aSeed;
  attribute vec3 aColor;
  uniform float uPixelRatio;
  uniform float uSize;
  varying float vT;
  varying float vSeed;
  varying vec3 vColor;
  void main() {
    vT = aT; vSeed = aSeed; vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = max(1.0, uSize * uPixelRatio * clamp(24.0 / -mv.z, 0.4, 1.8));
    gl_Position = projectionMatrix * mv;
  }
`;

const pathFragment = `
  uniform float uNow;
  uniform float uLitT;
  uniform float uBeadT;
  uniform float uBase;
  uniform float uCrystal;
  uniform vec3 uTint;
  varying float vT;
  varying float vSeed;
  varying vec3 vColor;
  void main() {
    vec2 pc = gl_PointCoord - 0.5;
    float d = length(pc);
    if (d > 0.5) discard;
    float soft = smoothstep(0.5, 0.05, d);
    float sparkle = 0.78 + 0.22 * sin(uNow * (1.5 + uCrystal * 2.5) + vSeed * 80.0);
    float lit = vT <= uLitT ? 2.4 : 1.0;
    float beadGlow = 1.0 + 2.0 * exp(-pow((vT - uBeadT) / 0.16, 2.0));
    float a = uBase * soft * sparkle * lit * beadGlow;
    // Crystallized paths trade blackbody warmth for their glassy identity tint.
    vec3 base = mix(vColor, vec3(1.0), uCrystal * 0.75);
    gl_FragColor = vec4(base * uTint, a);
  }
`;

export class PathRenderer {
  readonly group = new THREE.Group();
  private dustMat: THREE.ShaderMaterial;
  private ridgeMat: THREE.ShaderMaterial;
  private beadMat: THREE.ShaderMaterial | null = null;
  private samples: PathSample[];
  private dust: THREE.Points;

  constructor(samples: PathSample[], style: RoadStyle) {
    this.samples = samples;
    const z = style.zOffset ?? 0;

    const uniforms = () => ({
      uNow: { value: 0 },
      uLitT: { value: -1e9 },
      uBeadT: { value: -1e9 },
      uBase: { value: style.baseAlpha },
      uCrystal: { value: style.crystalline ? 1 : 0 },
      uTint: { value: style.tint.clone() },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      uSize: { value: 2.2 },
    });

    // --- Dust: scattered luminous grains along the path. -------------------
    const n = Math.max(0, style.dustCount);
    const pos = new Float32Array(n * 3);
    const aT = new Float32Array(n);
    const aSeed = new Float32Array(n);
    const aColor = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      // Sample a point along the path in TIME (including transitions) so the
      // dust reads as one continuous river, not per-note islands.
      let s: { t: number; x: number; y: number; temp: number };
      if (samples.length < 2) {
        s = samples[0] ?? { t: 0, x: 0, y: 0, temp: 0.5 };
      } else {
        const j = Math.min(samples.length - 2, Math.floor(Math.random() * (samples.length - 1)));
        const a = samples[j];
        const b = samples[j + 1];
        const f = Math.random();
        s =
          b.t - a.t > 0.15
            ? a // unvoiced gap: cluster at the note edge, don't bridge it
            : { t: a.t + (b.t - a.t) * f, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, temp: a.temp + (b.temp - a.temp) * f };
      }
      const r = gaussian() * 0.26;
      const ang = Math.random() * Math.PI * 2;
      pos[i * 3] = s.x + Math.cos(ang) * r;
      pos[i * 3 + 1] = s.y + Math.sin(ang) * r;
      pos[i * 3 + 2] = z + gaussian() * 0.4;
      aT[i] = s.t;
      aSeed[i] = Math.random();
      blackbody(s.temp, c);
      aColor[i * 3] = c.r;
      aColor[i * 3 + 1] = c.g;
      aColor[i * 3 + 2] = c.b;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    dustGeo.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
    dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 1));
    dustGeo.setAttribute('aColor', new THREE.BufferAttribute(aColor, 3));
    this.dustMat = new THREE.ShaderMaterial({
      uniforms: uniforms(),
      vertexShader: pathVertex,
      fragmentShader: pathFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.dust = new THREE.Points(dustGeo, this.dustMat);
    this.group.add(this.dust);

    // --- Ember ridge: the exact path centerline. ---------------------------
    // Rendered as dense points along the line so the same shader lights it.
    const ridge: number[] = [];
    const ridgeT: number[] = [];
    const ridgeColor: number[] = [];
    for (let i = 0; i + 1 < samples.length; i++) {
      const a = samples[i];
      const b = samples[i + 1];
      if (b.t - a.t > 0.15) continue; // unvoiced gap — the road breathes there
      // Adaptive density: fast pitch transitions cover world distance in few
      // frames — keep the ridge continuous there instead of beading apart.
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.max(3, Math.min(80, Math.ceil(dist / 0.035)));
      for (let k = 0; k < steps; k++) {
        const f = k / steps;
        ridge.push(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, z);
        ridgeT.push(a.t + (b.t - a.t) * f);
        blackbody(a.temp + (b.temp - a.temp) * f, c);
        ridgeColor.push(c.r, c.g, c.b);
      }
    }
    const ridgeGeo = new THREE.BufferGeometry();
    ridgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(ridge, 3));
    ridgeGeo.setAttribute('aT', new THREE.Float32BufferAttribute(ridgeT, 1));
    ridgeGeo.setAttribute('aSeed', new THREE.Float32BufferAttribute(ridgeT.map(() => Math.random()), 1));
    ridgeGeo.setAttribute('aColor', new THREE.Float32BufferAttribute(ridgeColor, 3));
    this.ridgeMat = new THREE.ShaderMaterial({
      uniforms: { ...uniforms(), uBase: { value: style.baseAlpha * 3.2 }, uSize: { value: 2.1 } },
      vertexShader: pathVertex,
      fragmentShader: pathFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.group.add(new THREE.Points(ridgeGeo, this.ridgeMat));

    // --- Onset beads (ghost road only). ------------------------------------
    if (!style.crystalline) {
      const beads = samples.filter((s) => s.onset);
      const bPos = new Float32Array(beads.length * 3);
      const bT = new Float32Array(beads.length);
      const bSeed = new Float32Array(beads.length);
      const bColor = new Float32Array(beads.length * 3);
      beads.forEach((s, i) => {
        bPos[i * 3] = s.x;
        bPos[i * 3 + 1] = s.y;
        bPos[i * 3 + 2] = z + 0.05;
        bT[i] = s.t;
        bSeed[i] = Math.random();
        blackbody(s.temp, c);
        bColor[i * 3] = c.r * 1.3;
        bColor[i * 3 + 1] = c.g * 1.3;
        bColor[i * 3 + 2] = c.b * 1.3;
      });
      const bGeo = new THREE.BufferGeometry();
      bGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
      bGeo.setAttribute('aT', new THREE.BufferAttribute(bT, 1));
      bGeo.setAttribute('aSeed', new THREE.BufferAttribute(bSeed, 1));
      bGeo.setAttribute('aColor', new THREE.BufferAttribute(bColor, 3));
      this.beadMat = new THREE.ShaderMaterial({
        uniforms: { ...uniforms(), uBase: { value: style.baseAlpha * 5 }, uSize: { value: 7 } },
        vertexShader: pathVertex,
        fragmentShader: pathFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      this.group.add(new THREE.Points(bGeo, this.beadMat));
    }
  }

  /** World position along the path at target-time t (holds through gaps). */
  posAt(t: number, out: THREE.Vector3): THREE.Vector3 {
    const s = this.samples;
    if (s.length === 0) return out.set(0, 0, 0);
    if (t <= s[0].t) return out.set(s[0].x, s[0].y, 0);
    if (t >= s[s.length - 1].t) return out.set(s[s.length - 1].x, s[s.length - 1].y, 0);
    let lo = 0;
    let hi = s.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (s[mid].t <= t) lo = mid;
      else hi = mid;
    }
    const a = s[lo];
    const b = s[hi];
    const f = (t - a.t) / Math.max(1e-6, b.t - a.t);
    return out.set(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, 0);
  }

  tempAt(t: number): number {
    const s = this.samples;
    if (s.length === 0) return 0.5;
    let lo = 0;
    let hi = s.length - 1;
    if (t <= s[0].t) return s[0].temp;
    if (t >= s[hi].t) return s[hi].temp;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (s[mid].t <= t) lo = mid;
      else hi = mid;
    }
    return s[lo].temp;
  }

  update(now: number, litT: number, beadT: number): void {
    for (const m of [this.dustMat, this.ridgeMat, this.beadMat]) {
      if (!m) continue;
      m.uniforms.uNow.value = now;
      m.uniforms.uLitT.value = litT;
      m.uniforms.uBeadT.value = beadT;
    }
  }

  setOpacityScale(k: number, style: RoadStyle): void {
    this.dustMat.uniforms.uBase.value = style.baseAlpha * k;
    this.ridgeMat.uniforms.uBase.value = style.baseAlpha * 3.2 * k;
  }

  setDustVisible(fraction: number): void {
    const geo = this.dust.geometry;
    const total = geo.getAttribute('position').count;
    geo.setDrawRange(0, Math.floor(total * fraction));
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Points) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
}

function gaussian(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
