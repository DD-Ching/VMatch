/** VMatch Flow Mode — the vertical slice orchestrator.
 *  Wires: audio spine (M0) → relationship tier (M2) → the Reach (M1) →
 *  attempt loop choreography (M2/M3). One AudioContext clock everywhere. */
import * as THREE from 'three';
import { AudioEngine } from './capture/engine';
import { FrameRing } from './state/ring';
import { M, dbToMass01, tierForCloseness } from './mapping';
import { OneEuro, Spring, AttackRelease } from './motion/filters';
import { loadTarget, toWorld, type LoadedTarget } from './target/pack';
import { FlowController, type Phase, type AttemptRecord } from './flow/state';
import { Reach } from './render/scene';
import { Comets, type CometInput } from './render/comet';
import { PathRenderer, framesToPath } from './render/road';
import { Filaments } from './render/filaments';
import { Afterglow } from './render/afterglow';
import { Overlay } from './ui/overlay';
import { mountDevPanel } from './ui/devpanel';
import type { FeatureFrame } from './features/types';

const DEFAULT_TARGET = 'happy-birthday';

class App {
  private engine = new AudioEngine();
  private ring = new FrameRing();
  private reach: Reach;
  private comets = new Comets();
  private filaments = new Filaments();
  private overlay: Overlay;

  private target: LoadedTarget | null = null;
  private road: PathRenderer | null = null;
  private afterglow: Afterglow | null = null;
  private flow: FlowController | null = null;

  private lastFrame: FeatureFrame | null = null;
  private micGranted = false;
  private spectating = false;
  private demoStartT = 0;
  private demoPlaying = false;
  private demoStop: (() => void) | null = null;

  // User comet motion chain: One-Euro → critically damped springs.
  private euroMidi = new OneEuro(M.oneEuro.minCutoff, M.oneEuro.beta, M.oneEuro.dCutoff);
  private euroBright = new OneEuro(M.oneEuro.minCutoff, M.oneEuro.beta, M.oneEuro.dCutoff);
  private springX = new Spring(M.spring.xHz);
  private springY = new Spring(M.spring.yHz);
  private cohesionSpring = new Spring(1 / M.spring.ignitionPopSec / 2);
  private massEnv = new AttackRelease(M.loudnessEnvelope.attackSec, M.loudnessEnvelope.releaseSec);
  private cohesionTarget = 0;
  private lastVoicedWorld = { x: -6, y: -3 };
  private smoothedC = 0;

  private orbitAngle = 0;
  private lastNow = 0;
  private lastFrameT = -1;
  private goldHead = new THREE.Vector3(0, 0, 0);
  private cyanHead = new THREE.Vector3(-6, -3, 0);
  private beadPos = new THREE.Vector3();
  private exchangeMid = new THREE.Vector3();
  private scratchV = new THREE.Vector3();

  // Automated-test hook: feed the capture path from a buffer at the next ARMED.
  private pendingSimRate: number | null = null;
  private captureWant: { phase: string; delayFrames: number; res: (dataUrl: string) => void } | null = null;

  private scrubbing = false;
  private mouseWorld = { x: 0, y: 0, active: false };

  constructor() {
    const canvas = document.getElementById('stage') as HTMLCanvasElement;
    this.reach = new Reach(canvas);
    this.reach.scene.add(this.comets.group, this.filaments.group);
    this.overlay = new Overlay(document.getElementById('overlay')!);

    this.engine.onFrame = (f) => {
      this.ring.push(f);
      this.lastFrame = f;
      this.flow?.onUserFrame(f);
    };

    this.reach.onQualityChange = (tier) => {
      this.comets.budgetScale = tier === 'lod' ? 0.5 : 1;
      this.road?.setDustVisible(tier === 'lod' ? 0.45 : 1);
    };

    // Replay scrubbing: horizontal drag anywhere while replaying.
    window.addEventListener('pointerdown', (e) => {
      if (this.flow?.phase === 'replay') {
        this.scrubbing = true;
        this.afterglow?.scrubTo(e.clientX / window.innerWidth);
      }
    });
    window.addEventListener('pointermove', (e) => {
      if (this.scrubbing) this.afterglow?.scrubTo(e.clientX / window.innerWidth);
      if (this.spectating && this.target) {
        // Mouse conducting (mic-denied spectate toy): pointer drives the comet.
        const nx = e.clientX / window.innerWidth - 0.5;
        const ny = 0.5 - e.clientY / window.innerHeight;
        this.mouseWorld = {
          x: nx * M.axis.brightnessSpanUnits,
          y: ny * M.axis.pitchSpanSemitones * 2,
          active: true,
        };
      }
    });
    window.addEventListener('pointerup', () => (this.scrubbing = false));

    this.showOnboarding();
    this.installTestHooks();
    mountDevPanel(document.body, {
      getInfo: () => {
        const rf = this.flow?.current;
        const phase = this.flow?.phase ?? 'boot';
        if (!rf) return `phase ${phase}`;
        return [
          `phase ${phase}  C ${rf.closeness.toFixed(2)}`,
          `e: pitch ${rf.eNorm.pitch.toFixed(2)} timing ${rf.eNorm.timing.toFixed(2)} bright ${rf.eNorm.brightness.toFixed(2)}`,
          `offset ${rf.offsetSec.toFixed(3)}s tempo ${rf.tempoRatio.toFixed(2)} lock ${rf.locked}`,
        ].join('\n');
      },
    });

    this.reach.renderer.setAnimationLoop(() => this.frame());
  }

  // ---- Onboarding & attempt-loop UI ---------------------------------------

  private showOnboarding(): void {
    this.overlay.showCard('VMatch', 'Two voices, one space. Try matching this.', 'Listen', () => {
      void this.bootAndDemo();
    });
  }

  private async bootAndDemo(): Promise<void> {
    this.overlay.hideCard();
    try {
      await this.ensureTarget();
      this.beginDemo();
    } catch (err) {
      this.overlay.showCard('VMatch', `Could not load the target: ${err instanceof Error ? err.message : err}`, 'Retry', () => void this.bootAndDemo());
    }
  }

  private async ensureTarget(): Promise<LoadedTarget> {
    if (this.target) return this.target;
    const ctx = await this.engine.ensureContext();
    const name = new URLSearchParams(location.search).get('target') ?? DEFAULT_TARGET;
    const target = await loadTarget(import.meta.env.BASE_URL, name, ctx);
    this.target = target;

    this.road = new PathRenderer(framesToPath(target.pack.frames, target.cal), {
      tint: new THREE.Color(0xffffff),
      dustCount: M.render.roadDustCount,
      baseAlpha: 0.17,
      crystalline: false,
    });
    this.reach.scene.add(this.road.group);
    this.afterglow = new Afterglow(target, this.road);
    this.reach.scene.add(this.afterglow.group);
    this.road.posAt(target.cal.firstVoicedT, this.goldHead);

    this.flow = new FlowController(target, {
      onPhase: (p, prev) => this.onPhase(p, prev),
      onCountInPulse: () => this.reach.pulseLattice(0.7),
      onIgnition: () => {
        this.cohesionSpring.snap(0);
        this.cohesionTarget = 1;
      },
      onOrbit: () => {
        this.orbitAngle = 0;
      },
      onMerge: () => {
        this.comets.beginMergeFlare();
        this.comets.setMergeMix(true);
        this.reach.pulseLattice(1.3);
      },
      onAttemptEnd: (rec) => this.onAttemptEnd(rec),
    });
    return target;
  }

  private beginDemo(): void {
    const target = this.target!;
    this.overlay.hideCard();
    this.overlay.hideBar();
    void this.engine.play(target.audio).then(({ startTime, stop }) => {
      this.demoStartT = startTime;
      this.demoPlaying = true;
      this.demoStop = stop;
      this.flow!.beginDemo(this.engine.now(), target.audio.duration + 0.15);
    });
  }

  private onPhase(p: Phase, prev: Phase): void {
    if (prev === 'demo') {
      this.demoPlaying = false;
      this.demoStop?.();
      this.demoStop = null;
      if (p === 'idle') this.afterDemo();
    }
    if (p === 'idle' && prev === 'armed') {
      // Armed timed out (no voicing). Offer the loop again instead of a blank stage.
      this.overlay.showCard('Ready when you are', 'The road is waiting.', 'Chase it', () => {
        this.overlay.hideCard();
        this.flow!.beginCountIn(this.engine.now());
      });
    }
    if (p === 'countin') {
      this.overlay.hideCard();
      this.overlay.hideBar();
      this.afterglow?.onRetry();
      this.comets.setMergeMix(false);
      this.comets.clearTrails();
      this.cohesionTarget = 0;
    }
    if (p === 'armed' && this.pendingSimRate !== null) {
      const rate = this.pendingSimRate;
      this.pendingSimRate = null;
      void this.engine.startCapture({ kind: 'buffer', buffer: this.target!.audio, playbackRate: rate });
    }
    // The bar stays visible during replay — its replay button is the only
    // control that can end the replay (hiding it soft-locked the loop).
    if (p === 'afterglow' && prev !== 'replay') this.showAfterglowBar();
  }

  private afterDemo(): void {
    if (this.micGranted || this.spectating) {
      // Returning listener: straight into the loop, zero friction.
      if (this.micGranted) this.flow!.beginCountIn(this.engine.now());
      return;
    }
    this.overlay.showCard('Now chase it', 'Sing along and pull your comet onto the gold road. Headphones recommended.', 'Use microphone', () => {
      void this.requestMic();
    });
  }

  private async requestMic(): Promise<void> {
    this.overlay.hideCard();
    try {
      await this.engine.startCapture({ kind: 'mic' });
      this.micGranted = true;
      this.flow!.beginCountIn(this.engine.now());
    } catch {
      // Denied → spectate mode: the target still performs; the pointer conducts.
      this.spectating = true;
      this.overlay.setHint('spectate — move to conduct, tap to hear the phrase again');
      window.addEventListener('click', () => {
        if (this.flow?.phase === 'idle') this.beginDemo();
      });
    }
  }

  private showAfterglowBar(): void {
    this.overlay.showBar({
      retry: () => this.flow!.retry(this.engine.now()),
      replay: () => {
        if (this.flow!.phase === 'replay') {
          this.flow!.endReplay();
          this.afterglow!.endReplay();
        } else {
          this.flow!.beginReplay();
          this.afterglow!.beginReplay(this.afterglow!.replayAligned);
        }
      },
      toggleAligned: () => {
        const next = !this.afterglow!.replayAligned;
        this.afterglow!.replayAligned = next;
        return next;
      },
      listen: () => {
        if (this.flow!.phase === 'replay') {
          this.flow!.endReplay();
          this.afterglow!.endReplay();
        }
        this.beginDemo();
      },
    });
  }

  private onAttemptEnd(rec: AttemptRecord): void {
    this.afterglow?.addAttempt(rec);
    this.comets.setMergeMix(false);
    this.cohesionTarget = 0;
  }

  // ---- Per-rAF composition --------------------------------------------------

  private frame(): void {
    const now = this.engine.now() || performance.now() / 1000;
    const dt = Math.min(0.05, Math.max(1e-3, now - this.lastNow || 0.016));
    this.lastNow = now;
    this.flow?.tick(now);

    const phase: Phase | 'boot' = this.flow?.phase ?? 'boot';
    const target = this.target;
    const rf = this.flow?.current ?? null;
    const guidance = this.flow?.guidanceIntensity ?? 1;

    // -- User comet head from the latest feature frame (smoothing chain). ----
    const f = this.lastFrame;
    let userVoiced = false;
    if (f && target && f.t !== this.lastFrameT) {
      this.lastFrameT = f.t;
      userVoiced = f.voiced && f.clarity >= M.voicing.clarityThreshold;
      if (userVoiced) {
        const midi = this.euroMidi.filter(f.midi, 0.01);
        const bright = this.euroBright.filter(Math.log2(Math.max(64, f.centroid)), 0.01);
        const w = toWorld(target.cal, midi, Math.pow(2, bright));
        this.lastVoicedWorld = w;
      }
      const db01 = dbToMass01(f.db);
      this.massEnv.update(userVoiced ? db01 : 0, 0.01);
      this.cohesionTarget = userVoiced ? 1 : Math.max(0, this.cohesionTarget - 0.02);
    } else if (!f) {
      this.massEnv.update(0.12, dt); // pre-mic idle breath
    }

    const inOrbit = phase === 'orbit';
    const merged = phase === 'merged';
    if (!inOrbit && !merged) {
      this.cyanHead.x = this.springX.update(this.lastVoicedWorld.x, dt);
      this.cyanHead.y = this.springY.update(this.lastVoicedWorld.y, dt);
    }
    const cohesion = Math.max(0, Math.min(1, this.cohesionSpring.update(this.cohesionTarget, dt)));

    // -- Gold comet head & road lighting per phase. ---------------------------
    let litT = -1e9;
    let beadT = -1e9;
    let goldVisible = target !== null;
    let filVisible = false;
    let frozen = false;

    if (target && this.road) {
      if (phase === 'demo' && this.demoPlaying) {
        const clipT = now - this.demoStartT;
        this.road.posAt(clipT, this.goldHead);
        litT = clipT;
      } else if (phase === 'countin' || phase === 'armed' || phase === 'idle') {
        this.road.posAt(target.cal.firstVoicedT, this.scratchV);
        this.goldHead.lerp(this.scratchV, Math.min(1, dt * 2));
      } else if (phase === 'chase' || inOrbit || merged) {
        const expected = rf ? rf.expectedTargetT : target.cal.firstVoicedT;
        beadT = rf ? rf.beadTargetT : target.cal.firstVoicedT;
        litT = beadT;
        this.road.posAt(beadT, this.beadPos);
        frozen = rf ? !rf.userVoiced : false;
        filVisible = phase === 'chase' && rf !== null;

        if (phase === 'chase') {
          this.road.posAt(Math.min(expected, target.cal.lastVoicedT), this.goldHead);
        } else {
          // Orbit capture: both co-rotate around the pace bead; merged: fuse.
          this.orbitAngle += 2 * Math.PI * M.capture.orbitRevPerSec * dt;
          const r = merged ? 0 : M.capture.orbitRadius;
          this.goldHead.set(
            this.beadPos.x + Math.cos(this.orbitAngle) * r,
            this.beadPos.y + Math.sin(this.orbitAngle) * r,
            0,
          );
          this.cyanHead.set(
            this.beadPos.x - Math.cos(this.orbitAngle) * r,
            this.beadPos.y - Math.sin(this.orbitAngle) * r,
            0,
          );
          this.springX.snap(this.cyanHead.x);
          this.springY.snap(this.cyanHead.y);
        }
      } else if (phase === 'afterglow' || phase === 'replay') {
        this.road.posAt(target.cal.firstVoicedT, this.scratchV);
        this.goldHead.lerp(this.scratchV, Math.min(1, dt * 1.5));
      }
      this.road.update(now, litT, beadT);
    }

    // -- Closeness-driven resonance. ------------------------------------------
    const C = rf && (phase === 'chase' || inOrbit || merged) ? rf.closeness : 0;
    this.smoothedC += (C - this.smoothedC) * Math.min(1, dt * 6);
    this.reach.setBloomCloseness(merged ? 1 : this.smoothedC);

    let tierCount: number = tierForCloseness(this.smoothedC);
    if (tierCount === 0 && filVisible) tierCount = 1; // mismatch: ONE taut strand remains

    // Throb overlay: decelerates as error shrinks; still during capture window.
    if (this.smoothedC >= M.closeness.tierThrob && (phase === 'chase' || inOrbit)) {
      this.comets.throbHz = inOrbit ? 0 : M.render.throbMaxHz * Math.max(0, 1 - this.smoothedC);
      this.comets.throbAmp = 0.07 * guidance;
    } else {
      this.comets.throbHz = 0;
    }

    // -- Compose comet inputs. -------------------------------------------------
    const goldFrame = target && litT > -1e8 ? target.frameAt(Math.max(0.02, litT)) : null;
    const goldTemp = this.road && litT > -1e8 ? this.road.tempAt(litT) : 0.5;
    const goldInput: CometInput = {
      head: this.goldHead,
      cohesion: phase === 'demo' ? (goldFrame?.voiced ? 1 : 0.5) : merged ? 1 : 0.85,
      mass:
        phase === 'demo'
          ? Math.max(0.15, dbToMass01(goldFrame?.db ?? -60))
          : merged || inOrbit
            ? 0.6
            : 0.45,
      temp: goldTemp,
      turbulence: 0.35,
      film: merged ? 1 : 0.15,
      visible: goldVisible,
    };
    const userTemp = f && f.centroid > 0 && target
      ? Math.max(0, Math.min(1, (Math.log2(f.centroid) - target.cal.centroidLogCenter) / (2 * target.cal.centroidLogHalfSpan) + 0.5))
      : 0.5;
    const turb = f ? Math.max(0, Math.min(1, 1 + f.slope)) : 0.4;
    const cyanInput: CometInput = {
      head: this.cyanHead,
      cohesion: merged ? 1 : cohesion,
      mass: merged ? 0.85 : Math.max(0.08, this.massEnv.value),
      temp: userTemp,
      turbulence: turb,
      film: f ? Math.max(0, Math.min(1, 0.7 * turb * 0.5 + 3 * 0.3 * f.flatness)) : 0.2,
      visible: this.micGranted || this.spectating || phase !== 'boot',
    };

    // Spectate conducting: pointer drives the comet directly (no judgments).
    if (this.spectating && this.mouseWorld.active) {
      this.cyanHead.x = this.springX.update(this.mouseWorld.x, dt);
      this.cyanHead.y = this.springY.update(this.mouseWorld.y, dt);
      cyanInput.cohesion = 0.8;
      cyanInput.mass = 0.5;
    }

    // Tier-2 particle exchange.
    this.exchangeMid.copy(this.goldHead).add(this.cyanHead).multiplyScalar(0.5);
    const exchange = {
      active: (phase === 'chase' || inOrbit || merged) && this.smoothedC >= M.closeness.tierExchange,
      midpoint: this.exchangeMid,
      strength: Math.max(0, Math.min(1, (this.smoothedC - M.closeness.tierExchange) / (1 - M.closeness.tierExchange))),
    };

    this.comets.update(now, dt, goldInput, cyanInput, exchange);

    // -- Filaments + leash + bead (chase), or replay ghosts. -------------------
    if (phase === 'replay' && this.afterglow) {
      const r = this.afterglow.update(now, dt, this.scrubbing);
      if (r) {
        this.filaments.update(now, dt, r.user, r.target, r.closeness, Math.max(1, tierForCloseness(r.closeness)), 0, false, guidance, true);
      }
    } else {
      this.afterglow?.update(now, dt, false);
      this.filaments.update(
        now,
        dt,
        this.cyanHead,
        this.beadPos,
        this.smoothedC,
        tierCount,
        rf?.leash ?? 0,
        frozen,
        guidance,
        filVisible || inOrbit,
      );
    }

    this.reach.render(now, dt);

    // Same-frame canvas capture for automated visual checks (no readback race).
    if (this.captureWant && (this.flow?.phase ?? 'boot') === this.captureWant.phase) {
      if (this.captureWant.delayFrames-- <= 0) {
        const want = this.captureWant;
        this.captureWant = null;
        want.res((document.getElementById('stage') as HTMLCanvasElement).toDataURL('image/png'));
      }
    }
  }

  // ---- Automated end-to-end hooks (test surface, not product UI) ------------

  private installTestHooks(): void {
    const api = {
      phase: () => this.flow?.phase ?? 'boot',
      lastFrame: () => this.lastFrame,
      frameCount: () => this.ring.size,
      rel: () => this.flow?.current ?? null,
      closeness: () => this.flow?.current?.closeness ?? 0,
      mergeCount: () => this.flow?.mergeCount ?? 0,
      guidance: () => this.flow?.guidanceIntensity ?? 1,
      attempts: () =>
        (this.flow?.attempts ?? []).map((a) => ({
          id: a.id,
          merged: a.merged,
          aborted: a.aborted,
          frames: a.frames.length,
          warp: a.warpPath.length,
          closest: a.closest,
        })),
      quality: () => this.reach.qualityTier,
      heads: () => ({ gold: this.goldHead.toArray(), cyan: this.cyanHead.toArray() }),
      /** Boot → load target → play demo (user-gesture free path for tests). */
      boot: async () => {
        this.overlay.hideCard();
        await this.ensureTarget();
        this.beginDemo();
      },
      /** Chase with the target's own audio as the simulated singer.
       *  semitones ≠ 0 detunes it (playbackRate) — must NOT merge. */
      chaseSim: async (semitones = 0) => {
        await this.ensureTarget();
        this.micGranted = true; // sim IS the capture path
        this.pendingSimRate = Math.pow(2, semitones / 12);
        this.flow!.beginCountIn(this.engine.now());
      },
      retry: () => this.flow?.retry(this.engine.now()),
      replay: () => {
        this.flow?.beginReplay();
        this.afterglow?.beginReplay(this.afterglow.replayAligned);
      },
      stopCapture: () => void this.engine.stopCapture(),
      /** Swap the capture source to silence (abort-path testing: a real mic
       *  keeps producing frames when the singer stops — stopCapture doesn't). */
      goSilent: async () => {
        const ctx = await this.engine.ensureContext();
        const silent = ctx.createBuffer(1, ctx.sampleRate * 8, ctx.sampleRate);
        await this.engine.startCapture({ kind: 'buffer', buffer: silent });
      },
      /** Resolve a same-frame PNG capture when the flow reaches `phase`. */
      captureOnPhase: (phase: string, delayFrames = 0) =>
        new Promise<string>((res) => {
          this.captureWant = { phase, delayFrames, res };
        }),
      /** Live mapping constants (dev/test tuning surface). */
      M,
    };
    (window as unknown as { __vmatch: typeof api }).__vmatch = api;
    (window as unknown as { __app: App }).__app = this;
  }
}

new App();
