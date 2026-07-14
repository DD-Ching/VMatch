/** Afterglow: crystallized duet portrait (Cloth graft) + replay ghosts.
 *  Crystallized trails reuse the exact ghost-road pipeline fed from recorded
 *  attempt frames — rendering is a pure function of retained data, so replays
 *  are deterministic and regenerable offline (acceptance tests 12/28). */
import * as THREE from 'three';
import { M } from '../mapping';
import { PathRenderer, framesToPath, type RoadStyle } from './road';
import { radialSprite } from './sprites';
import type { AttemptRecord } from '../flow/state';
import type { LoadedTarget } from '../target/pack';

const MAX_LAYERS = 6; // older crystallized attempts dissolve (GPU memory cap)

export class Afterglow {
  readonly group = new THREE.Group();
  private layers: Array<{ path: PathRenderer; style: RoadStyle }> = [];
  private closestGlow: THREE.Sprite;
  private replayUser: THREE.Sprite;
  private replayTarget: THREE.Sprite;
  private current: AttemptRecord | null = null;
  private userPath: PathRenderer | null = null;

  replayActive = false;
  replayAligned = true;
  private replayT = 0;
  private replayRange: [number, number] = [0, 1];

  constructor(private target: LoadedTarget, private road: PathRenderer) {
    const tex = radialSprite();
    const mk = (color: number, scale: number) => {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: tex,
          color,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      s.scale.setScalar(scale);
      return s;
    };
    this.closestGlow = mk(0xfff3d8, 1.6);
    this.replayUser = mk(M.color.chaserCyan, 0.8);
    this.replayTarget = mk(M.color.callerGold, 0.8);
    this.group.add(this.closestGlow, this.replayUser, this.replayTarget);
  }

  /** Crystallize a finished attempt; prior layers dim (geology of practice). */
  addAttempt(rec: AttemptRecord): void {
    this.current = rec;
    const style: RoadStyle = {
      tint: new THREE.Color(0xc9f2ff),
      dustCount: 2200,
      baseAlpha: 0.22,
      crystalline: true,
      zOffset: 0.3,
    };
    const path = new PathRenderer(framesToPath(rec.frames, this.target.cal), style);
    this.group.add(path.group);
    this.layers.push({ path, style });
    while (this.layers.length > MAX_LAYERS) {
      const oldest = this.layers.shift()!;
      this.group.remove(oldest.path.group);
      oldest.path.dispose();
    }
    // Progressively dimmer stack, newest brightest.
    for (let i = 0; i < this.layers.length; i++) {
      const age = this.layers.length - 1 - i;
      this.layers[i].path.setOpacityScale(Math.pow(0.55, age), this.layers[i].style);
    }
    this.userPath = path;

    // The moment of closest approach glows (D11).
    if (rec.closest) {
      const f = nearestFrame(rec.frames, rec.closest.t);
      if (f) {
        const p = framesToPath([f], this.target.cal)[0];
        if (p) {
          this.closestGlow.position.set(p.x, p.y, 0.35);
          (this.closestGlow.material as THREE.SpriteMaterial).opacity = 0.5;
        }
      }
    }
  }

  beginReplay(aligned: boolean): void {
    if (!this.current) return;
    this.replayAligned = aligned;
    const frames = this.current.frames;
    if (frames.length === 0) return;
    this.replayRange = [frames[0].t, frames[frames.length - 1].t];
    this.replayT = this.replayRange[0];
    this.replayActive = true;
  }

  endReplay(): void {
    this.replayActive = false;
    (this.replayUser.material as THREE.SpriteMaterial).opacity = 0;
    (this.replayTarget.material as THREE.SpriteMaterial).opacity = 0;
  }

  scrubTo(fraction: number): void {
    const [a, b] = this.replayRange;
    this.replayT = a + (b - a) * Math.max(0, Math.min(1, fraction));
  }

  /** @returns positions for live filament re-forming during replay. */
  update(
    now: number,
    dt: number,
    scrubbing: boolean,
  ): { user: THREE.Vector3; target: THREE.Vector3; closeness: number } | null {
    // Crystallized layers shimmer glassily — their uNow must tick.
    for (const l of this.layers) l.path.update(now, -1e9, -1e9);
    if (!this.replayActive || !this.current || !this.userPath) return null;
    if (!scrubbing) {
      this.replayT += dt;
      if (this.replayT > this.replayRange[1]) this.replayT = this.replayRange[0]; // loop
    }
    const rec = this.current;

    const userPos = new THREE.Vector3();
    this.userPath.posAt(this.replayT, userPos);
    userPos.z = 0.3;

    // Target ghost: DTW-aligned time vs raw time (toggle).
    const targetT = this.replayAligned
      ? warpAt(rec.warpPath, this.replayT)
      : this.target.cal.firstVoicedT + (this.replayT - rec.ignitionT);
    const targetPos = new THREE.Vector3();
    this.road.posAt(targetT, targetPos);

    this.replayUser.position.copy(userPos);
    this.replayTarget.position.copy(targetPos);
    const pulse = 0.75 + 0.25 * Math.sin(now * 6);
    (this.replayUser.material as THREE.SpriteMaterial).opacity = 0.9 * pulse;
    (this.replayTarget.material as THREE.SpriteMaterial).opacity = 0.9 * pulse;

    const rel = nearestRel(rec, this.replayT);
    return { user: userPos, target: targetPos, closeness: rel?.closeness ?? 0 };
  }

  /** Retry hygiene: the stack stays (dimmed), transient glows clear. */
  onRetry(): void {
    this.endReplay();
    (this.closestGlow.material as THREE.SpriteMaterial).opacity = 0;
  }

  clearAll(): void {
    this.onRetry();
    for (const l of this.layers) {
      this.group.remove(l.path.group);
      l.path.dispose();
    }
    this.layers = [];
    this.current = null;
    this.userPath = null;
  }
}

function nearestFrame<T extends { t: number }>(arr: T[], t: number): T | null {
  if (arr.length === 0) return null;
  let best = arr[0];
  let bd = Math.abs(arr[0].t - t);
  for (const f of arr) {
    const d = Math.abs(f.t - t);
    if (d < bd) {
      bd = d;
      best = f;
    }
  }
  return best;
}

function nearestRel(rec: AttemptRecord, t: number): { closeness: number } | null {
  return nearestFrame(rec.rel, t);
}

function warpAt(path: Array<[number, number]>, userT: number): number {
  if (path.length === 0) return 0;
  if (userT <= path[0][0]) return path[0][1];
  if (userT >= path[path.length - 1][0]) return path[path.length - 1][1];
  let lo = 0;
  let hi = path.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (path[mid][0] <= userT) lo = mid;
    else hi = mid;
  }
  const [t0, r0] = path[lo];
  const [t1, r1] = path[hi];
  const f = (userT - t0) / Math.max(1e-6, t1 - t0);
  return r0 + (r1 - r0) * f;
}
