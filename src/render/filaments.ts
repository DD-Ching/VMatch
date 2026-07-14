/** Resonance filaments (tier 1: 1→3→5 luminous strands), the leash (filament
 *  zero — timing tendency as physical tension, never milliseconds), and the
 *  pace bead. All cues are directional, never judgmental (failure-aesthetics
 *  law 2); intensity scales with the session guidance-fade scalar. */
import * as THREE from 'three';
import { M } from '../mapping';
import { radialSprite } from './sprites';

const SEGMENTS = 28;
const MAX_FILAMENTS = 5;

export class Filaments {
  readonly group = new THREE.Group();
  private lines: THREE.Line[] = [];
  private mats: THREE.LineBasicMaterial[] = [];
  private positions: Float32Array[] = [];
  private displayedCount = 0; // eased, fractional
  private bead: THREE.Sprite;
  private beadMat: THREE.SpriteMaterial;

  private gold = new THREE.Color(M.color.callerGold);
  private cyan = new THREE.Color(M.color.chaserCyan);
  private ember = new THREE.Color(M.color.ember);
  private blue = new THREE.Color(M.color.aheadBlue);
  private cTmp = new THREE.Color();

  constructor() {
    for (let i = 0; i < MAX_FILAMENTS; i++) {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array((SEGMENTS + 1) * 3);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      const colors = new Float32Array((SEGMENTS + 1) * 3);
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
      const mat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      this.group.add(line);
      this.lines.push(line);
      this.mats.push(mat);
      this.positions.push(pos);
    }

    this.beadMat = new THREE.SpriteMaterial({
      map: radialSprite(),
      color: M.color.callerGold,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.bead = new THREE.Sprite(this.beadMat);
    this.bead.scale.setScalar(0.55);
    this.group.add(this.bead);
  }

  /**
   * @param tierCount target filament count (0/1/3/5 from closeness tiers)
   * @param leash low-passed signed offset (sec); + = ahead/rushing, − = behind
   * @param frozen bead frozen (user unvoiced) — holds position, pulses gently
   */
  update(
    now: number,
    dt: number,
    user: THREE.Vector3,
    beadPos: THREE.Vector3,
    closeness: number,
    tierCount: number,
    leash: number,
    frozen: boolean,
    guidance: number,
    visible: boolean,
  ): void {
    // Bead.
    this.bead.position.copy(beadPos);
    const pulse = frozen ? 0.8 + 0.25 * Math.sin(now * 2 * Math.PI) : 1;
    this.bead.scale.setScalar(0.55 * pulse);
    this.beadMat.opacity = visible ? 0.85 : 0;

    // Eased filament count — tiers retract smoothly, never pop (D4).
    const target = visible ? tierCount : 0;
    const k = Math.min(1, dt / M.render.tierEaseSec);
    this.displayedCount += (target - this.displayedCount) * k;

    const behind = Math.max(0, -leash); // seconds behind → taut
    const ahead = Math.max(0, leash); // seconds ahead → slack
    const tautness = Math.min(1, behind / M.bead.leashFullScaleSec);
    const slack = Math.min(1, ahead / M.bead.leashFullScaleSec);

    for (let i = 0; i < MAX_FILAMENTS; i++) {
      const alphaShare = Math.max(0, Math.min(1, this.displayedCount - i));
      const mat = this.mats[i];
      if (alphaShare <= 0.01 || !visible) {
        mat.opacity = 0;
        continue;
      }
      const isLeash = i === 0;
      const brightness = isLeash ? 0.65 + 0.35 * tautness : 0.28 + 0.6 * closeness;
      mat.opacity = alphaShare * brightness * guidance;

      // Curve: leash sags when ahead (slack), straightens when behind (taut);
      // resonance filaments bow symmetrically with a live wobble.
      const pos = this.positions[i];
      const bowDir = i % 2 === 0 ? 1 : -1;
      const bowMag = isLeash
        ? slack * 1.6 // slack loop hangs
        : (0.35 + 0.5 * ((i + 1) / MAX_FILAMENTS)) * (1 - closeness * 0.5);
      const wobbleAmp = isLeash ? 0.04 + 0.1 * (1 - tautness) : 0.14;
      const colors = this.lines[i].geometry.getAttribute('color') as THREE.BufferAttribute;
      for (let s = 0; s <= SEGMENTS; s++) {
        const f = s / SEGMENTS;
        const bell = Math.sin(Math.PI * f);
        const wob = Math.sin(now * (2.2 + i * 0.7) + f * 9 + i * 13) * wobbleAmp * bell;
        const sag = isLeash ? -bowMag * bell : bowDir * bowMag * bell * 0.7;
        pos[s * 3] = user.x + (beadPos.x - user.x) * f + wob;
        pos[s * 3 + 1] = user.y + (beadPos.y - user.y) * f + sag + wob * 0.6;
        pos[s * 3 + 2] = user.z + (beadPos.z - user.z) * f + wob * 0.4;

        // Gradient cyan→gold; leash shimmer tints toward ember (behind, at the
        // bead end = "reach forward") or blue (ahead, at the user end).
        this.cTmp.copy(this.cyan).lerp(this.gold, f);
        if (isLeash) {
          if (tautness > 0.05) this.cTmp.lerp(this.ember, tautness * 0.6 * f);
          if (slack > 0.05) this.cTmp.lerp(this.blue, slack * 0.6 * (1 - f));
        }
        colors.setXYZ(s, this.cTmp.r, this.cTmp.g, this.cTmp.b);
      }
      (this.lines[i].geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      colors.needsUpdate = true;
    }
  }
}
