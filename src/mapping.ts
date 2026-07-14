/** Every acoustic→visual mapping constant and every threshold in the product
 *  lives HERE and only here (architecture rule; acceptance test 25). The dev
 *  panel (?dev) mutates this object live; nothing else may hardcode a value.
 *
 *  Sources: docs/04-visualization.md, docs/research/concept-comet-trails.md,
 *  and the implementer decisions D1–D15 recorded in the design synthesis. */
export const M = {
  // ---- Identity & palette (D10) --------------------------------------------
  color: {
    background: 0x05060c,
    callerGold: 0xffc97a,
    chaserCyan: 0x8fe8ff,
    ember: 0xff6b2d, // blackbody LUT cold end (leash "behind" shimmer; NOT an error red)
    sear: 0xddebff, // blackbody LUT hot end
    lattice: 0x8b93a7,
    /** Leash "ahead/rushing" shimmer — a direction cue, paired with ember. */
    aheadBlue: 0x7ab8ff,
  },

  // ---- The Reach: axes & calibration ---------------------------------------
  axis: {
    /** 1 semitone = 1 world unit on Y, always (binding). */
    unitsPerSemitone: 1,
    /** Visible pitch span above/below the target median before soft-compression. */
    pitchSpanSemitones: 10,
    /** X span in world units for the target's padded log-centroid range (D10). */
    brightnessSpanUnits: 12,
    /** Percentile range of target log-centroid used for X calibration (D10). */
    centroidPercentiles: [5, 95] as [number, number],
    centroidPadding: 0.2,
    /** Soft-compression knee: fraction of half-span where compression starts. */
    softKnee: 0.85,
  },

  // ---- Smoothing chain (D5, D8) --------------------------------------------
  oneEuro: { minCutoff: 1.0, beta: 0.01, dCutoff: 1.0 },
  spring: {
    /** Natural frequency of the comet-head chase springs, Hz (concept: ~12). */
    yHz: 12,
    xHz: 8,
    /** Ignition mist→knot pop duration, seconds (critically damped, no overshoot). */
    ignitionPopSec: 0.12,
  },
  /** Loudness → mass envelope, seconds (asymmetric attack/release), and the
   *  dB window mapped onto mass 0..1 (law 1: only loudness governs vitality). */
  loudnessEnvelope: { attackSec: 0.08, releaseSec: 0.25, dbFloor: -50, dbRange: 35 },

  // ---- Voicing / features ---------------------------------------------------
  voicing: {
    /** pitchy clarity gate (D8; M0 shipped 0.85, spec range 0.85–0.93). */
    clarityThreshold: 0.87,
    /** dB floor under which the user is treated as silent (abort detection). */
    silenceDb: -55,
  },

  // ---- OLTW (D6, D7) --------------------------------------------------------
  oltw: {
    windowFrames: 400, // 4 s @ 100 Hz
    maxAdvancePerFrame: 3,
    weights: { f0Semitones: 2.0, voiced: 1.0, mfccTotal: 1.0, logEnergy: 0.5 },
    /** Confidence: EMA of local normalized cost vs rolling baseline (D7). */
    confidence: {
      emaSec: 0.25,
      baselineSec: 3.0,
      lostRatio: 2.0,
      lostHoldSec: 0.5,
      relockRatio: 1.5,
      relockHoldSec: 0.3,
    },
  },

  // ---- Relationship / closeness (D1, D2, D3) --------------------------------
  closeness: {
    /** Per-dimension capture thresholds (errors at exactly the threshold ⇒ e=1). */
    pitchSemitones: 0.5,
    timingSec: 0.15,
    /** Brightness gap as a fraction of the target's calibrated log-centroid span. */
    brightnessFrac: 0.25,
    /** Closeness C = exp(−Σ wᵢ·eᵢ), eᵢ = errorᵢ/thresholdᵢ (visual layer only). */
    weights: { pitch: 0.5, timing: 0.3, brightness: 0.2 },
    /** Resonance tier breakpoints on C (D2). */
    tierFilament1: 0.3,
    tierFilament3: 0.5,
    tierFilament5: 0.7,
    tierExchange: 0.6,
    tierThrob: 0.75,
    /** Softmax temperature for dominant-error secondary-cue gating. */
    dominantSoftmaxTemp: 4,
    /** Unjudgeable/blown dimensions saturate here (keeps C and the
     *  closest-approach norm finite and comparable). */
    errorCap: 4,
  },

  // ---- Capture / merge state machine (D4) -----------------------------------
  capture: {
    holdSec: 0.7, // all dims under threshold this long → orbit capture
    mergeHoldSec: 0.8, // additional hold in orbit → fusion
    orbitRevPerSec: 1.2,
    orbitRadius: 0.8,
    /** Hysteresis: exit thresholds are this factor looser than entry (D4). */
    exitFactor: 1.15,
    /** Breaches shorter than this during capture/merge-hold are forgiven (D4). */
    forgiveSec: 0.15,
  },

  // ---- Pace bead / leash -----------------------------------------------------
  bead: {
    maxRate: 1.5, // slew limit, × real-time; monotonic
    leashLowpassSec: 0.15,
    /** Offset (sec) at which the leash reads fully taut/slack. */
    leashFullScaleSec: 0.4,
  },

  // ---- Choreography ----------------------------------------------------------
  choreography: {
    countInPulses: 3,
    /** Fallback pulse spacing when the Target Pack has no tempo (D9). */
    countInFallbackSec: 0.6,
    ignitionMaxLatencySec: 0.12,
    latticeIdlePulseHz: 0.1,
    /** Silence longer than this mid-attempt = gentle give-up (exhale to mist). */
    abortSilenceSec: 3.0,
    /** ARMED with no voicing for this long → drift back to idle. */
    armedTimeoutSec: 10,
    /** Merge flare: reverse trail-flare sweep duration. */
    mergeFlareSec: 1.2,
    /** Afterglow exhale (sun splits back into two bodies). */
    exhaleSec: 1.5,
  },

  // ---- Guidance fade (§5.5) --------------------------------------------------
  guidance: {
    decayPerMerge: 0.85,
    floor: 0.5,
  },

  // ---- Particles / render ----------------------------------------------------
  render: {
    trailParticlesPerComet: 4096,
    nucleusParticles: 700,
    trailAgeSec: 2.5,
    roadDustCount: 7000,
    /** Particle-exchange midpoint capture radius, world units (D10). */
    exchangeRadius: 1.5,
    spriteSizePx: [1, 3] as [number, number],
    /** UnrealBloomPass semantics: threshold keeps the dim lattice/dust out of
     *  the bloom chain — only comets, corona and filaments glow. */
    bloom: { strengthBase: 0.42, strengthCloseness: 0.25, radius: 0.5, threshold: 0.3 },
    /** Throb (stillness graft): pulse rate at zero closeness → 0 Hz when captured. */
    throbMaxHz: 2.5,
    /** Filament tier-change ease time (never pop). */
    tierEaseSec: 0.3,
    cameraTiltDeg: 15,
    parallax: 0.35,
  },

  // ---- Quality tiers (D13) ---------------------------------------------------
  quality: {
    watchdogWindowSec: 5,
    downgradeBelowFps: 50,
    lodTrailParticles: 2048,
    lodRoadDust: 3000,
  },
};

export type Mapping = typeof M;

/** dB → mass 0..1 through the law-1 loudness window. */
export function dbToMass01(db: number): number {
  const { dbFloor, dbRange } = M.loudnessEnvelope;
  return Math.max(0, Math.min(1, (db - dbFloor) / dbRange));
}

/** Resonance filament count for a composite closeness value (tier ladder). */
export function tierForCloseness(c: number): 0 | 1 | 3 | 5 {
  if (c >= M.closeness.tierFilament5) return 5;
  if (c >= M.closeness.tierFilament3) return 3;
  if (c >= M.closeness.tierFilament1) return 1;
  return 0;
}
