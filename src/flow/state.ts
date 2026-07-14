/** Flow Mode attempt state machine (render-free; drives the visual layer via
 *  callbacks). Phases follow the spec choreography:
 *
 *  IDLE → DEMO → COUNTIN(3 pulses) → ARMED → [ignition] CHASE
 *       → ORBIT(700 ms gate) → MERGED(+800 ms) → AFTERGLOW → retry/replay
 *
 *  Give-up is gentle: prolonged silence mid-attempt marks the attempt aborted,
 *  the Caller's bead finishes the road alone, then AFTERGLOW — never a fail UI. */
import { M } from '../mapping';
import { Relationship, type RelationshipFrame } from '../match/relationship';
import type { LoadedTarget } from '../target/pack';
import type { FeatureFrame } from '../features/types';

export type Phase =
  | 'idle'
  | 'demo'
  | 'countin'
  | 'armed'
  | 'chase'
  | 'orbit'
  | 'merged'
  | 'afterglow'
  | 'replay';

export interface AttemptRecord {
  id: number;
  ignitionT: number;
  /** Raw, unsmoothed 100 Hz user frames for the whole attempt. */
  frames: FeatureFrame[];
  rel: RelationshipFrame[];
  /** Frame-level warp path [(userT, targetT), …] — Learn Mode contract. */
  warpPath: Array<[number, number]>;
  merged: boolean;
  mergeT: number | null;
  aborted: boolean;
  /** Closest approach (D11): argmin over aligned time of the weighted error norm. */
  closest: { t: number; targetT: number; errorNorm: number } | null;
}

export interface FlowCallbacks {
  onPhase(phase: Phase, prev: Phase): void;
  onCountInPulse(index: number): void;
  onIgnition(t: number): void;
  onOrbit(): void;
  onMerge(t: number): void;
  onAttemptEnd(record: AttemptRecord): void;
}

export class FlowController {
  phase: Phase = 'idle';
  readonly rel: Relationship;
  attempts: AttemptRecord[] = [];
  mergeCount = 0;

  /** Latest relationship frame (visual layer reads this every rAF). */
  current: RelationshipFrame | null = null;

  private demoEndT = 0;
  private countInStartT = 0;
  private pulsesFired = 0;
  private armedSince = 0;
  private ignitionT = 0;
  private gateHeldSec = 0;
  private orbitHeldSec = 0;
  private breachSec = 0;
  private silenceSince: number | null = null;
  private lastFrameT: number | null = null;
  private recording: AttemptRecord | null = null;
  private nextId = 1;

  constructor(
    private target: LoadedTarget,
    private cbs: FlowCallbacks,
  ) {
    this.rel = new Relationship(target);
  }

  /** Session guidance-fade scalar (§5.5): decays per merged attempt. */
  get guidanceIntensity(): number {
    return Math.max(M.guidance.floor, Math.pow(M.guidance.decayPerMerge, this.mergeCount));
  }

  private setPhase(p: Phase): void {
    if (p === this.phase) return;
    const prev = this.phase;
    this.phase = p;
    this.cbs.onPhase(p, prev);
  }

  get countInPeriodSec(): number {
    return this.target.cal.beatPeriodSec ?? M.choreography.countInFallbackSec;
  }

  // ---- Actions (one-tap, zero friction) ------------------------------------

  /** Caller performs: the app starts clip playback and reports its end time. */
  beginDemo(now: number, clipDurationSec: number): void {
    this.demoEndT = now + clipDurationSec;
    this.setPhase('demo');
  }

  beginCountIn(now: number): void {
    this.countInStartT = now;
    this.pulsesFired = 0;
    this.setPhase('countin');
  }

  /** Retry = one tap → straight to count-in (re-DEMO is a separate action). */
  retry(now: number): void {
    if (this.phase === 'afterglow' || this.phase === 'replay') this.beginCountIn(now);
  }

  beginReplay(): void {
    if (this.phase === 'afterglow' && this.attempts.length > 0) this.setPhase('replay');
  }

  endReplay(): void {
    if (this.phase === 'replay') this.setPhase('afterglow');
  }

  backToIdle(): void {
    this.setPhase('idle');
  }

  // ---- Time-driven transitions (call once per rAF with the audio clock) ----

  tick(now: number): void {
    switch (this.phase) {
      case 'demo':
        if (now >= this.demoEndT) this.setPhase('idle');
        break;
      case 'countin': {
        const period = this.countInPeriodSec;
        const due = Math.floor((now - this.countInStartT) / period);
        while (this.pulsesFired < Math.min(due + 1, M.choreography.countInPulses)) {
          this.cbs.onCountInPulse(this.pulsesFired++);
        }
        if (now - this.countInStartT >= period * M.choreography.countInPulses) {
          this.armedSince = now;
          this.setPhase('armed');
        }
        break;
      }
      case 'armed':
        if (now - this.armedSince > M.choreography.armedTimeoutSec) this.setPhase('idle');
        break;
      case 'chase':
      case 'orbit':
      case 'merged': {
        // The road ends for everyone: expected time passes the last voiced frame.
        const expected = this.target.cal.firstVoicedT + (now - this.ignitionT);
        if (expected > this.target.cal.lastVoicedT + 0.4) this.endAttempt();
        break;
      }
      default:
        break;
    }
  }

  // ---- Frame-driven transitions (100 Hz) ------------------------------------

  onUserFrame(f: FeatureFrame): void {
    const voiced = f.voiced && f.clarity >= M.voicing.clarityThreshold;

    if (this.phase === 'armed') {
      if (voiced) this.ignite(f);
      return;
    }
    if (this.phase !== 'chase' && this.phase !== 'orbit' && this.phase !== 'merged') return;

    const dt = this.lastFrameT === null ? 0.01 : Math.max(1e-3, f.t - this.lastFrameT);
    this.lastFrameT = f.t;

    const rf = this.rel.onUserFrame(f);
    this.current = rf;
    if (this.recording && !this.recording.aborted) {
      this.recording.frames.push(f);
      this.recording.rel.push(rf);
      this.trackClosest(rf);
    }

    // Gentle give-up detection (never during merged — the sun holds).
    if (this.phase !== 'merged') {
      const silent = !voiced && f.db < M.voicing.silenceDb;
      if (silent) {
        this.silenceSince ??= f.t;
        if (this.recording && f.t - this.silenceSince > M.choreography.abortSilenceSec) {
          this.recording.aborted = true; // exhale to mist; Caller finishes alone
        }
      } else {
        this.silenceSince = null;
      }
    }

    // A target rest is unjudgeable in EITHER user voicing state: the bead
    // freezes when the user is unvoiced, so also check the expected timeline —
    // a singer correctly breathing through the rest must not reset the gate,
    // and must not be worse off than one who hums through it (D3/D4).
    const targetResting =
      !rf.targetVoiced || this.target.voicedFrameNear(rf.expectedTargetT) === null;

    // A given-up attempt keeps its comet alive but can no longer capture or
    // merge — the record already stopped; a merge on a partial record would
    // corrupt attempt data and decay the guidance scalar for a non-attempt.
    const aborted = this.recording?.aborted ?? false;

    if (this.phase === 'chase') {
      if (aborted) {
        this.gateHeldSec = 0;
      } else if (rf.gate) {
        this.gateHeldSec += dt;
      } else if (targetResting) {
        // Unvoiced target segments PAUSE (not reset) the capture timer (D3/D4).
      } else {
        this.gateHeldSec = 0; // a broken pre-capture window resets fully (D4)
      }
      if (this.gateHeldSec >= M.capture.holdSec) {
        this.orbitHeldSec = 0;
        this.breachSec = 0;
        this.setPhase('orbit');
        this.cbs.onOrbit();
      }
    } else if (this.phase === 'orbit') {
      const holds = !aborted && this.rel.gateWithExitThresholds(rf);
      if (holds) {
        this.breachSec = 0;
        this.orbitHeldSec += dt;
      } else if (targetResting && !aborted) {
        // pause
      } else {
        this.breachSec += dt;
        if (this.breachSec > M.capture.forgiveSec) {
          // Release gracefully back to the chase; capture may re-arm.
          this.gateHeldSec = 0;
          this.setPhase('chase');
          return;
        }
      }
      if (this.orbitHeldSec >= M.capture.mergeHoldSec) {
        this.setPhase('merged');
        this.mergeCount++;
        if (this.recording) {
          this.recording.merged = true;
          this.recording.mergeT = f.t;
        }
        this.cbs.onMerge(f.t);
      }
    }
    // 'merged' holds until the road ends (tick handles the transition).
  }

  private ignite(f: FeatureFrame): void {
    this.ignitionT = f.t;
    this.rel.reset(f.t);
    this.gateHeldSec = 0;
    this.orbitHeldSec = 0;
    this.silenceSince = null;
    this.lastFrameT = f.t;
    this.current = null;
    this.recording = {
      id: this.nextId++,
      ignitionT: f.t,
      frames: [],
      rel: [],
      warpPath: this.rel.warpPath, // live reference; snapshot on end
      merged: false,
      mergeT: null,
      aborted: false,
      closest: null,
    };
    this.setPhase('chase');
    this.cbs.onIgnition(f.t);
  }

  private trackClosest(rf: RelationshipFrame): void {
    if (!rf.aligned || !this.recording) return;
    const w = M.closeness.weights;
    const cap = M.closeness.errorCap;
    const norm =
      w.pitch * Math.min(rf.eNorm.pitch, cap) +
      w.timing * Math.min(rf.eNorm.timing, cap) +
      w.brightness * Math.min(rf.eNorm.brightness, cap);
    if (!this.recording.closest || norm < this.recording.closest.errorNorm) {
      this.recording.closest = { t: rf.t, targetT: rf.beadTargetT, errorNorm: norm };
    }
  }

  private endAttempt(): void {
    const rec = this.recording;
    this.recording = null;
    this.current = null;
    if (rec) {
      rec.warpPath = [...this.rel.warpPath]; // immutable snapshot (never mutate in place)
      this.attempts.push(rec);
      this.cbs.onAttemptEnd(rec);
    }
    this.setPhase('afterglow');
  }
}
