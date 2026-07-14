/** Twin comets: ONE unified particle system for both trails (per-particle
 *  `owner` scalar — gold 0, cyan 1 — enabling exchange and iridescent merge),
 *  plus per-comet nucleus knots and corona sprites.
 *
 *  The sim runs on the CPU behind this class's interface (recorded deviation
 *  from the GPGPU spec; see scene.ts note) — consumers only see `update()`. */
import * as THREE from 'three';
import { M } from '../mapping';
import { curl } from './noise';
import { radialSprite, blackbody } from './sprites';

export interface CometInput {
  head: THREE.Vector3;
  /** 0 = breath-mist (unvoiced), 1 = tight knot (voiced). */
  cohesion: number;
  /** Loudness envelope 0..1 → nucleus radius, corona, emission rate. */
  mass: number;
  /** Normalized brightness 0..1 → blackbody temperature tint. */
  temp: number;
  /** Spectral tilt proxy 0..1 → curl turbulence scale. */
  turbulence: number;
  /** Iridescent hue-film strength 0..1 (timbre proxy). */
  film: number;
  visible: boolean;
}

export interface ExchangeInput {
  active: boolean;
  midpoint: THREE.Vector3;
  strength: number; // 0..1
}

const GOLD = 0;
const CYAN = 1;

export class Comets {
  readonly group = new THREE.Group();

  private n: number; // per comet
  private pos: Float32Array;
  private vel: Float32Array;
  private birth: Float32Array;
  private owner: Float32Array;
  private home: Float32Array;
  private seed: Float32Array;
  private curlCache: Float32Array;
  private cursor = [0, 0];
  private emitAcc = [0, 0];
  private frame = 0;

  private geo: THREE.BufferGeometry;
  private mat: THREE.ShaderMaterial;

  private nuclei: Array<{
    points: THREE.Points;
    mat: THREE.ShaderMaterial;
    offsets: Float32Array;
    targets: Float32Array;
    n: number;
  }> = [];
  private coronas: Array<{ inner: THREE.Sprite; outer: THREE.Sprite }> = [];

  /** Reverse trail-flare sweep (merge): -1 = off, else sweep start time. */
  private flareStart = -1;
  private mergeMix = 0;
  /** Throb (stillness graft): pulse rate in Hz; 0 = perfectly still. */
  throbHz = 0;
  throbAmp = 0;
  /** Extra emission multiplier (quality tier). */
  budgetScale = 1;

  private curlOut = { x: 0, y: 0, z: 0 };
  private colorA = new THREE.Color();
  private colorB = new THREE.Color();
  private cTmp = new THREE.Color();

  constructor() {
    this.n = M.render.trailParticlesPerComet;
    const total = this.n * 2;
    this.pos = new Float32Array(total * 3);
    this.vel = new Float32Array(total * 3);
    this.birth = new Float32Array(total).fill(-1e9);
    this.owner = new Float32Array(total);
    this.home = new Float32Array(total);
    this.seed = new Float32Array(total);
    this.curlCache = new Float32Array(total * 3);
    for (let i = 0; i < total; i++) {
      const which = i < this.n ? GOLD : CYAN;
      this.owner[i] = which;
      this.home[i] = which;
      this.seed[i] = Math.random();
    }

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aBirth', new THREE.BufferAttribute(this.birth, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aOwner', new THREE.BufferAttribute(this.owner, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSeed', new THREE.BufferAttribute(this.seed, 1));

    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uNow: { value: 0 },
        uAgeMax: { value: M.render.trailAgeSec },
        uColorA: { value: new THREE.Color(M.color.callerGold) },
        uColorB: { value: new THREE.Color(M.color.chaserCyan) },
        uFilm: { value: 0 },
        uFlareSweep: { value: -1 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      },
      vertexShader: `
        attribute float aBirth; attribute float aOwner; attribute float aSeed;
        uniform float uNow; uniform float uAgeMax; uniform float uPixelRatio;
        varying float vAge; varying float vOwner; varying float vSeed;
        void main() {
          float age = uNow - aBirth;
          vAge = age / uAgeMax;
          vOwner = aOwner; vSeed = aSeed;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float size = (1.4 + 1.6 * aSeed) * uPixelRatio * clamp(26.0 / -mv.z, 0.4, 2.0);
          gl_PointSize = (vAge >= 0.0 && vAge <= 1.0) ? max(size, 1.0) : 0.0;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform vec3 uColorA; uniform vec3 uColorB;
        uniform float uNow; uniform float uFilm; uniform float uFlareSweep;
        varying float vAge; varying float vOwner; varying float vSeed;
        void main() {
          if (vAge < 0.0 || vAge > 1.0) discard;
          vec2 pc = gl_PointCoord - 0.5;
          float d = length(pc);
          if (d > 0.5) discard;
          float soft = smoothstep(0.5, 0.08, d);
          vec3 color = mix(uColorA, uColorB, vOwner);
          // Iridescent hue-film (thin-film proxy): per-channel shimmer.
          float filmPhase = uNow * 2.0 + vSeed * 47.0;
          float mixZone = 1.0 - abs(vOwner - 0.5) * 2.0; // strongest when blended
          float film = uFilm + mixZone * 0.6;
          color.r *= 1.0 + film * 0.22 * sin(filmPhase);
          color.g *= 1.0 + film * 0.22 * sin(filmPhase + 2.1);
          color.b *= 1.0 + film * 0.22 * sin(filmPhase + 4.2);
          // Merge flare: a fuse burning back along the trail (newest → oldest).
          float flare = uFlareSweep >= 0.0 ? exp(-pow((vAge - uFlareSweep) * 5.0, 2.0)) * 3.0 : 0.0;
          float a = soft * pow(1.0 - vAge, 1.6) * (0.26 + flare);
          gl_FragColor = vec4(color * (1.0 + flare), a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(this.geo, this.mat);
    points.frustumCulled = false;
    this.group.add(points);

    // Nuclei + coronas.
    const spriteTex = radialSprite();
    for (let c = 0; c < 2; c++) {
      const n = M.render.nucleusParticles;
      const offsets = new Float32Array(n * 3);
      const targets = new Float32Array(n * 3);
      const nPos = new Float32Array(n * 3);
      const nSeed = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        nSeed[i] = Math.random();
        this.randomKnotOffset(targets, i, 1);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(nPos, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('aSeed', new THREE.BufferAttribute(nSeed, 1));
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(c === GOLD ? M.color.callerGold : M.color.chaserCyan) },
          uAlpha: { value: 0.5 },
          uNow: { value: 0 },
          uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
        },
        vertexShader: `
          attribute float aSeed;
          uniform float uPixelRatio;
          varying float vSeed;
          void main() {
            vSeed = aSeed;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = max(1.0, (1.2 + 1.8 * aSeed) * uPixelRatio * clamp(26.0 / -mv.z, 0.4, 2.0));
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: `
          uniform vec3 uColor; uniform float uAlpha; uniform float uNow;
          varying float vSeed;
          void main() {
            vec2 pc = gl_PointCoord - 0.5;
            float d = length(pc);
            if (d > 0.5) discard;
            float soft = smoothstep(0.5, 0.05, d);
            float tw = 0.7 + 0.3 * sin(uNow * 3.0 + vSeed * 60.0);
            gl_FragColor = vec4(uColor, uAlpha * soft * tw);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const points2 = new THREE.Points(geo, mat);
      points2.frustumCulled = false;
      this.group.add(points2);
      this.nuclei.push({ points: points2, mat, offsets, targets, n });

      const mkSprite = (scale: number, opacity: number) => {
        const sm = new THREE.SpriteMaterial({
          map: spriteTex,
          color: c === GOLD ? M.color.callerGold : M.color.chaserCyan,
          transparent: true,
          opacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const s = new THREE.Sprite(sm);
        s.scale.setScalar(scale);
        return s;
      };
      const inner = mkSprite(1.1, 0.5);
      const outer = mkSprite(3.2, 0.16);
      this.group.add(inner, outer);
      this.coronas.push({ inner, outer });
    }
  }

  private randomKnotOffset(arr: Float32Array, i: number, spread: number): void {
    const r = Math.abs(gaussian()) * spread;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    arr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    arr[i * 3 + 2] = r * Math.cos(phi) * 0.5;
  }

  beginMergeFlare(): void {
    this.flareStart = -2; // armed; set on next update with clock
  }

  setMergeMix(active: boolean): void {
    this.mergeMix = active ? 1 : 0;
  }

  update(now: number, dt: number, gold: CometInput, cyan: CometInput, exchange: ExchangeInput): void {
    this.frame++;
    const inputs = [gold, cyan];

    // Emission + trail physics.
    for (let c = 0; c < 2; c++) {
      const inp = inputs[c];
      if (!inp.visible) continue;
      const base = c * this.n;
      const rate = (26 + 190 * inp.mass) * this.budgetScale * (0.25 + 0.75 * inp.cohesion);
      this.emitAcc[c] += rate * dt;
      while (this.emitAcc[c] >= 1) {
        this.emitAcc[c] -= 1;
        const slot = base + this.cursor[c];
        this.cursor[c] = (this.cursor[c] + 1) % this.n;
        const i3 = slot * 3;
        const jitter = 0.1 + 0.5 * (1 - inp.cohesion);
        this.pos[i3] = inp.head.x + gaussian() * jitter;
        this.pos[i3 + 1] = inp.head.y + gaussian() * jitter;
        this.pos[i3 + 2] = inp.head.z + gaussian() * jitter * 0.6;
        // Polarity: gold accretes (spawn out, fall in); cyan emits (stream out).
        const dx = this.pos[i3] - inp.head.x;
        const dy = this.pos[i3 + 1] - inp.head.y;
        const dz = this.pos[i3 + 2] - inp.head.z;
        const len = Math.max(1e-4, Math.hypot(dx, dy, dz));
        const dir = c === GOLD ? -1 : 1;
        const speed = c === GOLD ? 0.9 : 1.3;
        if (c === GOLD) {
          // spawn on a shell so the infall reads
          const shell = 0.5 + Math.random() * 0.7;
          this.pos[i3] = inp.head.x + (dx / len) * shell;
          this.pos[i3 + 1] = inp.head.y + (dy / len) * shell;
          this.pos[i3 + 2] = inp.head.z + (dz / len) * shell * 0.5;
        }
        this.vel[i3] = (dx / len) * dir * speed;
        this.vel[i3 + 1] = (dy / len) * dir * speed + (c === CYAN ? 0.15 : 0);
        this.vel[i3 + 2] = (dz / len) * dir * speed * 0.4;
        this.birth[slot] = now;
        this.owner[slot] = this.home[slot];
      }
    }

    const ageMax = M.render.trailAgeSec;
    const exR2 = M.render.exchangeRadius * M.render.exchangeRadius;
    const damp = Math.exp(-dt * 1.6);
    const total = this.n * 2;
    for (let i = 0; i < total; i++) {
      if (now - this.birth[i] > ageMax) continue;
      const i3 = i * 3;
      // Curl turbulence, staggered: refresh each particle's sample every 3rd frame.
      if ((i + this.frame) % 3 === 0) {
        const which = i < this.n ? 0 : 1;
        const turb = inputs[which].turbulence;
        curl(
          this.pos[i3] * 0.32 + this.seed[i] * 7,
          this.pos[i3 + 1] * 0.32,
          this.pos[i3 + 2] * 0.32 + now * 0.12,
          this.curlOut,
        );
        this.curlCache[i3] = this.curlOut.x * (0.5 + 2.2 * turb);
        this.curlCache[i3 + 1] = this.curlOut.y * (0.5 + 2.2 * turb);
        this.curlCache[i3 + 2] = this.curlOut.z * (0.5 + 2.2 * turb) * 0.4;
      }
      this.vel[i3] = this.vel[i3] * damp + this.curlCache[i3] * dt * 2.4;
      this.vel[i3 + 1] = this.vel[i3 + 1] * damp + this.curlCache[i3 + 1] * dt * 2.4;
      this.vel[i3 + 2] = this.vel[i3 + 2] * damp + this.curlCache[i3 + 2] * dt * 2.4;
      // Gold keeps accreting toward its head (identity by physics, not color).
      if (i < this.n && inputs[GOLD].visible) {
        const hx = inputs[GOLD].head.x;
        const hy = inputs[GOLD].head.y;
        this.vel[i3] += (hx - this.pos[i3]) * dt * 0.7;
        this.vel[i3 + 1] += (hy - this.pos[i3 + 1]) * dt * 0.7;
      }
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;

      // Tier-2 resonance: owner scalars migrate inside the midpoint radius.
      if (exchange.active) {
        const mx = this.pos[i3] - exchange.midpoint.x;
        const my = this.pos[i3 + 1] - exchange.midpoint.y;
        if (mx * mx + my * my < exR2) {
          const towards = 1 - this.home[i];
          this.owner[i] += (towards - this.owner[i]) * Math.min(1, dt * 1.2 * exchange.strength);
        }
      }
      // Merge: everyone meets in the middle (iridescent sun, no absorption).
      if (this.mergeMix > 0) {
        this.owner[i] += (0.5 - this.owner[i]) * Math.min(1, dt * 3);
      }
    }

    // Nuclei knots + coronas.
    for (let c = 0; c < 2; c++) {
      const inp = inputs[c];
      const nu = this.nuclei[c];
      const spread = 0.14 + (1 - inp.cohesion) * 1.3;
      const attr = nu.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let i = 0; i < nu.n; i++) {
        const i3 = i * 3;
        // Wandering targets keep the knot alive; respawn a few each frame.
        if (Math.random() < dt * 1.5) this.randomKnotOffset(nu.targets, i, 1);
        const k = Math.min(1, dt * (2 + 6 * inp.cohesion));
        nu.offsets[i3] += (nu.targets[i3] * spread - nu.offsets[i3]) * k;
        nu.offsets[i3 + 1] += (nu.targets[i3 + 1] * spread - nu.offsets[i3 + 1]) * k;
        nu.offsets[i3 + 2] += (nu.targets[i3 + 2] * spread - nu.offsets[i3 + 2]) * k;
        arr[i3] = inp.head.x + nu.offsets[i3];
        arr[i3 + 1] = inp.head.y + nu.offsets[i3 + 1];
        arr[i3 + 2] = inp.head.z + nu.offsets[i3 + 2];
      }
      attr.needsUpdate = true;
      nu.mat.uniforms.uNow.value = now;
      nu.mat.uniforms.uAlpha.value = (0.14 + 0.5 * inp.cohesion) * (inp.visible ? 1 : 0);
      blackbody(inp.temp, this.cTmp);
      const identity = c === GOLD ? this.colorA.setHex(M.color.callerGold) : this.colorB.setHex(M.color.chaserCyan);
      // Temperature modulates, identity dominates — gold may warm-shift freely,
      // but the Chaser must stay unmistakably cyan (grayscale/CVD identity is
      // flow polarity; color identity must survive everything else).
      identity.lerp(this.cTmp, c === GOLD ? 0.4 : 0.12);
      (nu.mat.uniforms.uColor.value as THREE.Color).copy(identity);

      // Throb: shared corona pulse, decelerating to stillness near capture.
      const throb = this.throbHz > 0 ? 1 + this.throbAmp * Math.sin(2 * Math.PI * this.throbHz * now) : 1;
      const co = this.coronas[c];
      const scale = (0.55 + 1.1 * inp.mass) * throb;
      co.inner.position.copy(inp.head);
      co.outer.position.copy(inp.head);
      co.inner.scale.setScalar(scale * 0.9);
      co.outer.scale.setScalar(scale * 2.1);
      (co.inner.material as THREE.SpriteMaterial).color.copy(identity);
      (co.outer.material as THREE.SpriteMaterial).color.copy(identity);
      (co.inner.material as THREE.SpriteMaterial).opacity = inp.visible ? 0.24 + 0.16 * inp.cohesion : 0;
      (co.outer.material as THREE.SpriteMaterial).opacity = inp.visible ? 0.045 + 0.05 * inp.mass : 0;
    }

    // Trail shader uniforms.
    this.mat.uniforms.uNow.value = now;
    this.mat.uniforms.uFilm.value = Math.max(gold.film, cyan.film) * 0.5;
    blackbody(gold.temp, this.cTmp);
    (this.mat.uniforms.uColorA.value as THREE.Color).setHex(M.color.callerGold).lerp(this.cTmp, 0.35);
    blackbody(cyan.temp, this.cTmp);
    (this.mat.uniforms.uColorB.value as THREE.Color).setHex(M.color.chaserCyan).lerp(this.cTmp, 0.1);

    if (this.flareStart === -2) this.flareStart = now;
    if (this.flareStart >= 0) {
      const sweep = (now - this.flareStart) / M.choreography.mergeFlareSec;
      this.mat.uniforms.uFlareSweep.value = sweep <= 1 ? sweep : -1;
      if (sweep > 1) this.flareStart = -1;
    }

    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aBirth') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aOwner') as THREE.BufferAttribute).needsUpdate = true;
  }

  /** Extinguish all live trail particles (retry hygiene between attempts). */
  clearTrails(): void {
    this.birth.fill(-1e9);
    for (let i = 0; i < this.owner.length; i++) this.owner[i] = this.home[i];
  }
}

function gaussian(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
