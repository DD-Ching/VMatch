# VMatch — MVP Plan (Vertical Slice)

> Prove one thing: **a user can feel themselves getting closer to a voice, and the moment of merging is worth chasing.** Everything else is deferred.

## 1. The slice

**One sung phrase, Flow Mode only, in the browser, no backend.**

- **Target:** a bundled ~4-second sung phrase (public-domain melody, e.g. the first line of *"Happy Birthday"* or a folk tune — chosen because sustained sung notes make the pitch axis's chase-and-lock payoff strongest and give the merge a fair chance within ~5 attempts). One spoken phrase ships as a second bundled target to sanity-check the same pipeline on speech, but the demo script is the sung one.
- **Loop:** watch the gold comet perform its ghost road → count-in → sing → chase → (hopefully) lock-on and merge → crystallized afterglow → one-tap replay ghost → one-tap retry.
- **Explicitly out of scope for the slice:** Learn Mode, target import/upload, accounts, F1/F2 vowel axis, phoneme scoring, timbre embeddings, mobile, Safari quirk-handling beyond graceful failure.

## 2. Stack (from the OSS audit)

| Layer | Choice |
|---|---|
| App | Vite + TypeScript, vanilla (no framework in the render path) |
| Capture | AudioWorklet, 48 kHz mono, AEC/NS/AGC off, SharedArrayBuffer ring buffer; `AudioContext.currentTime` as the single clock |
| Pitch | SwiftF0 ONNX (0.4 MB) via onnxruntime-web WASM in a Worker (62.5 Hz); pitchy (MPM) inline fallback + voicing gate |
| Features | Meyda pure functions per 10 ms hop: RMS/loudness, spectral centroid, tilt (regression on log-spectrum), flatness, flux-based onsets, MFCC-13 (for alignment) |
| Alignment | Custom OLTW-Arzt port in TS (~200 LOC; ref matchmaker, Apache-2.0), features f0+MFCC+energy; slew-limited, monotonic, confidence-gated |
| Smoothing | One-Euro filters (npm `1eurofilter`) + critically-damped springs at the consumer |
| Rendering | three.js `WebGPURenderer` (WebGL2 auto-fallback), TSL shaders, ping-pong FBO particle sim (512×512), history-texture instanced trails, half-res TSL bloom |
| Target pack | Precomputed offline by a small Python script (librosa pyin + Meyda-equivalent features + onset detection), bundled as JSON + audio file — **no runtime server at all** |

## 3. Milestones

### M0 — Audio spine (week 1)
AudioWorklet capture → feature frames (pitch, clarity, loudness, centroid, tilt, flatness, onsets) at 100 Hz in a debug oscilloscope view. Target-pack Python script produces the same frame schema offline for the bundled clips.
**Gate:** live pitch trace is stable on held notes, tracks glides, gates breath; end-to-end mic→screen under ~60 ms.

### M1 — Two comets in the Reach (weeks 2–3)
The space (lattice, floor, fixed camera), the target comet flying its pre-baked ghost road in sync with clip playback, the user comet driven by live features through springs. Per-target frozen axis calibration. GPGPU particles + trails + bloom at 60 fps.
**Gate:** watching the target perform is already pleasant; singing visibly and immediately moves your comet; a random paused frame looks like art.

### M2 — The relationship (weeks 4–5)
OLTW cursor + pace bead + leash; closeness vector; resonance tiers 1–3 (filaments, particle exchange, stillness throb); orbit-capture/merge state machine (700 ms hysteresis); failure-aesthetics laws enforced; ignition and count-in choreography.
**Gate:** the 200 ms closeness read passes with naive viewers; lock-on is reachable within ~5 attempts on the bundled phrase and reliably feels like the payoff.

### M3 — The loop closes (week 6)
Crystallized afterglow + replay ghost (scrubbing both trails), attempt stacking, zero-friction retry, mic onboarding (headphones-recommended flow with leakage check), quality tiers (256×256 particle LOD, bloom off), quiet mode, `mapping.ts` dev tuning panel.
**Gate:** the MVP success criteria from `01-product-definition.md` §7 — unprompted retries ≥3, users articulate corrections in their own words, merge reachable, every frame screenshot-worthy.

## 4. Team-of-one build order within each milestone

Audio truth first, then motion, then relationship, then reward — never polish a later layer while an earlier one lies (e.g., don't tune filaments while pitch still jitters; the whole experience inherits the spine's honesty).

## 5. Key risks and their tests (front-loaded)

| Risk | Week-1 spike |
|---|---|
| SwiftF0 WASM latency/accuracy on a mid-range laptop | Run the official demo model against recorded singing; measure per-frame inference and octave-error rate vs pitchy |
| OLTW stability on singing (melisma, held notes) | Prototype the TS port against the bundled clip with deliberately rushed/dragged test takes |
| The echo problem | Verify headphone flow UX; test AEC-off speaker leakage to confirm the headphone-check design |
| 60 fps on integrated GPU (Iris Xe class) | Particle+trail+bloom stress scene before any product code depends on the budget |
| The merge feels fake or unreachable | Tune thresholds with recorded good/bad takes before live testing; thresholds live in `mapping.ts` |

## 6. What the slice proves / disproves

- **Proves:** the emotional core (chase → convergence → merge), the stability contract, the latency budget, and that the whole thing runs client-side with zero infrastructure.
- **Disproves cheaply if wrong:** if motivated users don't retry unprompted, the metaphor needs rework *before* any Learn Mode, alignment-quality, or ML investment happens. The slice is deliberately the riskiest 20% of the product.
