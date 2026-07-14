/** The Reach: renderer, fixed camera rig (15° above horizon, gentle parallax
 *  only), lattice, floor, bloom, and the quality-tier watchdog.
 *
 *  Renderer note (recorded deviation): the design docs specify three.js
 *  WebGPURenderer + TSL with a GPGPU ping-pong particle sim. The slice ships a
 *  classic WebGLRenderer + shader-material particles with a CPU sim behind the
 *  Comets interface so a GPU sim can replace it without touching consumers —
 *  chosen so the slice runs verified on every target including headless CI.
 *  See README "Known deviations". */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { M } from '../mapping';

export class Reach {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;

  private latticeMat: THREE.LineBasicMaterial;
  private latticeBaseOpacity = 0.1;
  private pulse = 0; // count-in / merge shockwave boost, decays

  private parallaxTarget = new THREE.Vector2();
  private parallax = new THREE.Vector2();

  // Quality watchdog (D13): sticky downgrade, never mid-attempt upswitch.
  private frameTimes: number[] = [];
  private lastWatchdogCheck = 0;
  qualityTier: 'full' | 'lod' = 'full';
  onQualityChange: ((tier: 'full' | 'lod') => void) | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // MSAA off under postprocessing (render research)
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    // Clear to pure black: the composer's intermediate-target clear pre-encodes
    // the clear color to sRGB, so any non-zero clear would be encoded twice by
    // OutputPass (verified empirically). Zero is invariant; the visible
    // background color comes from a backdrop plane that takes the normal
    // single-encode material path.
    this.renderer.setClearColor(0x000000, 1);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(M.color.background, 26, 46);
    this.scene.add(this.buildBackdrop());

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    const dist = 19;
    const tilt = (M.render.cameraTiltDeg * Math.PI) / 180;
    this.camera.position.set(0, Math.sin(tilt) * dist, Math.cos(tilt) * dist);
    this.camera.lookAt(0, 0, 0);

    const { lattice, material } = this.buildLattice();
    this.latticeMat = material;
    this.scene.add(lattice);
    this.scene.add(this.buildFloor());

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(1, 1),
      M.render.bloom.strengthBase,
      M.render.bloom.radius,
      M.render.bloom.threshold,
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    window.addEventListener('pointermove', (e) => {
      this.parallaxTarget.set(
        (e.clientX / window.innerWidth - 0.5) * 2,
        (e.clientY / window.innerHeight - 0.5) * 2,
      );
    });
    this.resize();
    window.addEventListener('resize', () => this.resize());
    // Debug probe (harmless in prod; used by automated visual checks).
    (window as unknown as { __reach: Reach }).__reach = this;
  }

  private buildLattice(): { lattice: THREE.LineSegments; material: THREE.LineBasicMaterial } {
    const pts: number[] = [];
    const spanY = M.axis.pitchSpanSemitones;
    const spanX = M.axis.brightnessSpanUnits / 2 + 3;
    const z = -2.5;
    // Horizontal aurora threads at each semitone; octave lines reach further.
    for (let s = -spanY; s <= spanY; s++) {
      const w = s % 12 === 0 ? spanX : spanX * 0.82;
      pts.push(-w, s, z, w, s, z);
    }
    // Sparse verticals.
    for (let x = -spanX; x <= spanX; x += 3) {
      pts.push(x, -spanY, z, x, spanY, z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const material = new THREE.LineBasicMaterial({
      color: M.color.lattice,
      transparent: true,
      opacity: this.latticeBaseOpacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    return { lattice: new THREE.LineSegments(geo, material), material };
  }

  private buildBackdrop(): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(260, 160);
    const mat = new THREE.MeshBasicMaterial({ color: M.color.background, fog: false, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.z = -48;
    mesh.renderOrder = -10;
    return mesh;
  }

  private buildFloor(): THREE.Mesh {
    const floorY = -(M.axis.pitchSpanSemitones + 2);
    const geo = new THREE.PlaneGeometry(90, 60);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uColor: { value: new THREE.Color(0x0a0e16) } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        varying vec2 vUv; uniform vec3 uColor;
        void main(){
          float d = distance(vUv, vec2(0.5, 0.62));
          float a = smoothstep(0.55, 0.08, d) * 0.55;
          gl_FragColor = vec4(uColor, a);
        }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = floorY;
    return mesh;
  }

  /** Count-in pulse / merge shockwave: soft lattice brightening, light-only. */
  pulseLattice(strength = 1): void {
    this.pulse = Math.min(1.6, this.pulse + strength);
  }

  setBloomCloseness(c: number): void {
    if (this.qualityTier === 'lod') return;
    this.bloom.strength = M.render.bloom.strengthBase + M.render.bloom.strengthCloseness * c;
  }

  private resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    // Re-read DPR: dragging the window between monitors changes it.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.composer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(now: number, dt: number): void {
    // Idle breathing + pulse decay.
    const idle = 0.5 + 0.5 * Math.sin(2 * Math.PI * M.choreography.latticeIdlePulseHz * now);
    this.pulse = Math.max(0, this.pulse - dt * 2.2);
    this.latticeMat.opacity = this.latticeBaseOpacity * (0.75 + 0.25 * idle) + 0.3 * this.pulse;

    // Gentle parallax only — the rig itself never travels.
    this.parallax.lerp(this.parallaxTarget, Math.min(1, dt * 3));
    const p = M.render.parallax;
    this.camera.position.x = this.parallax.x * p;
    this.camera.position.y += (this.parallax.y * -p * 0.5 - (this.camera.position.y - this.baseCamY())) * 0.1;
    this.camera.lookAt(0, 0, 0);

    this.composer.render();
    // The watchdog runs on its own monotonic clock: `now` is the AudioContext
    // clock, which starts at 0 the moment the user first taps — feeding that
    // discontinuity here silenced the watchdog for minutes.
    this.watchdog(performance.now() / 1000);
  }

  private baseCamY(): number {
    return Math.sin((M.render.cameraTiltDeg * Math.PI) / 180) * 19;
  }

  private watchdog(now: number): void {
    this.frameTimes.push(now);
    const windowSec = M.quality.watchdogWindowSec;
    while (this.frameTimes.length > 2 && this.frameTimes[0] < now - windowSec) this.frameTimes.shift();
    if (this.qualityTier === 'lod' || now - this.lastWatchdogCheck < windowSec) return;
    this.lastWatchdogCheck = now;
    if (this.frameTimes.length < 30) return;
    const spans: number[] = [];
    for (let i = 1; i < this.frameTimes.length; i++) spans.push(this.frameTimes[i] - this.frameTimes[i - 1]);
    spans.sort((a, b) => a - b);
    const medianFps = 1 / Math.max(1e-4, spans[Math.floor(spans.length / 2)]);
    if (medianFps < M.quality.downgradeBelowFps) this.setQuality('lod');
  }

  setQuality(tier: 'full' | 'lod'): void {
    if (tier === this.qualityTier) return;
    this.qualityTier = tier;
    this.bloom.enabled = tier === 'full';
    this.onQualityChange?.(tier);
  }
}
