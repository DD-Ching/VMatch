# VMatch — System Architecture

> One representation, two renderings. Flow Mode and Learn Mode are two views over the same signal pipeline — never two pipelines.

## 1. Architectural stance

- **Browser-first.** MVP is a single-page web app. Mic capture, analysis, and rendering all happen client-side for zero-latency interaction and zero-install sharing.
- **Two-tier analysis.**
  - *Real-time tier* (per ~10–20 ms frame, in an AudioWorklet + main-thread workers): pitch, energy, spectral shape, vowel position, onset events, online alignment. Powers Flow Mode.
  - *Considered tier* (seconds, async — WASM worker or optional Python service): forced alignment to phonemes, pronunciation scoring, utterance-level timbre embeddings. Powers Learn Mode and target preprocessing.
- **Targets are precomputed.** When a target clip is added, we run the full considered tier on it once (offline/async) and cache a **Target Pack**. Real-time work at attempt time is only ever on the *user's* stream.
- **The score is a vector, never a scalar.** All closeness signals stay decomposed (pitch, timing, articulation, timbre) end-to-end. Any blended "proximity" used by visuals is computed in the visual layer from the vector, with visible per-dimension behavior.

## 2. System diagram

```
                        ┌───────────────────────────────────────────────┐
                        │                 TARGET PIPELINE (async, once) │
 target clip ──────────►│ decode → resample → feature pass → alignment  │
 (upload / library)     │ → phoneme timeline → timbre profile → notes   │
                        │            ⇒  TARGET PACK (json + audio)      │
                        └───────────────┬───────────────────────────────┘
                                        │
                                        ▼
┌──────────────┐   frames    ┌──────────────────┐   state    ┌─────────────────┐
│ MIC CAPTURE  │────────────►│  REALTIME CORE   │───────────►│  SHARED STATE    │
│ AudioWorklet │ 10–20ms hop │ pitch · energy   │  60–100Hz  │  "the two voices"│
│ (raw, AEC off│             │ spectral · vowel │            │  ring buffers +  │
│  headphones) │             │ onsets · OLTW    │            │  closeness vector│
└──────────────┘             │ alignment        │            └───┬─────────┬────┘
                             └──────────────────┘                │         │
                                                                 ▼         ▼
                                                       ┌──────────────┐ ┌──────────────┐
                                                       │  FLOW MODE   │ │  LEARN MODE  │
                                                       │ WebGL/WebGPU │ │ DOM + canvas │
                                                       │ particles,   │ │ curves, text,│
                                                       │ trails, glow │ │ A/B playback │
                                                       └──────────────┘ └──────▲───────┘
                                                                                │
                             ┌──────────────────────────────┐                  │
                             │ CONSIDERED TIER (async)      │──────────────────┘
                             │ user-attempt forced align,   │
                             │ per-phoneme quality (GOP),   │
                             │ utterance timbre embedding   │
                             │ (WASM worker; opt. server)   │
                             └──────────────────────────────┘
```

## 3. Modules

### 3.1 Capture (`@vmatch/capture`)
- `getUserMedia` with `echoCancellation:false, noiseSuppression:false, autoGainControl:false` (raw voice; headphones-first UX; a "speakers mode" can re-enable AEC at quality cost).
- AudioWorklet ships fixed-size hops (e.g. 128–256 samples) into a SharedArrayBuffer ring; no analysis on the audio thread beyond framing.
- Also owns target playback with a sample-accurate clock shared with the visualizer (`AudioContext.currentTime` as the single time base for audio, analysis, and animation).

### 3.2 Realtime feature core (`@vmatch/features`)
Per hop (~10–20 ms), for the user stream (target's frames come precomputed):
- **Pitch:** log-f0 + voicing confidence — **SwiftF0** (MIT, 0.4 MB ONNX, 62.5 Hz) via onnxruntime-web in a Worker, with **pitchy** (0BSD, MPM) as instant fallback and voicing gate.
- **Loudness:** RMS → perceptual dB mapping with fast attack / slow release (**Meyda** pure functions).
- **Spectral shape:** centroid ("brightness"), tilt, rolloff, flatness; MFCC-13 for alignment (Meyda).
- **Vowel position:** F1/F2 estimate (own ~100-line LPC tracker) with confidence gating (voiced + stable frames only). *Post-MVP.*
- **Onsets:** spectral-flux onset events for rhythm.
- All features pass through smoothing (EMA / One-Euro filter) *at the consumer*, not in storage — raw history is kept for Learn Mode honesty.

### 3.3 Online alignment (`@vmatch/align-rt`)
- Streaming alignment of user frames to the target timeline: our own ~200-line TypeScript port of **OLTW-Arzt** (reference: matchmaker, Apache-2.0; measured 0.07 ms/frame in the ISMIR 2025 benchmark) over f0+MFCC+energy frames, answering at every frame: *where on the target's timeline is the user, and how stretched/late are they?*
- Outputs: target-time cursor, local tempo ratio, timing offset; plus per-dimension deltas computed *at the aligned target frame* (pitch error in semitones, vowel-space distance, brightness gap, energy gap).
- Also runs in "free mode" (style imitation with no fixed script): no timeline, deltas computed against the target's *distribution* (e.g. its timbre centroid and pitch range) rather than a cursor.

### 3.4 Shared state (`@vmatch/state`)
- The single source of truth both modes read: two ring buffers of feature frames (target, user), alignment state, and the **closeness vector** `{pitch, timing, vowel, brightness, energy, timbre}` with per-dimension confidence.
- Deliberately renderer-agnostic: Flow and Learn are subscribers, not owners.

### 3.5 Target pipeline (`@vmatch/target`)
Runs once per target clip (async; WASM worker in-browser for MVP, optional server for heavy models):
- Decode/resample → full feature pass (same features as realtime, computed offline; reference-grade f0 via librosa `pyin`).
- Transcript alignment → word/syllable/phoneme timeline via **MFA 3.x** (speech targets; boundary error <15 ms); note segmentation for sung targets — **UltraStar .txt** import or UltraSinger-style auto-generation with Demucs vocal separation, hand-verified at authoring time.
- Timbre profile: utterance-level embedding (**CAM++ / ECAPA**) + summary stats (brightness range, pitch range).
- Emits a **Target Pack**: `{audio, frames[], phonemes[], notes[], timbreProfile, meta}` — cacheable, shareable, and the contract between all other modules.

### 3.6 Considered tier for user attempts (`@vmatch/assess`)
- After an attempt (async, 1–3 s): force-align the user's recording to the same transcript (wav2vec2 phoneme-CTC posteriors + CTC alignment DP); per-phoneme quality via logit-based GOP (GOPT-style head later); utterance timbre embedding (**CAM++ int8 ONNX**, ~7 MB, in a Worker at ~1–2 Hz sliding window); banded DTW at full quality for the definitive time-map.
- Feeds Learn Mode only. Flow Mode never waits on it.

### 3.7 Flow renderer (`@vmatch/flow`)
- **three.js `WebGPURenderer` with automatic WebGL2 fallback, all shaders in TSL**; particle sim as ping-pong FBO passes (runs identically on both backends — WebGPU compute does not fall back), history-texture instanced trails, half-res TSL bloom, spring/impulse dynamics driven by the closeness vector.
- Consumes shared state at 60 fps; all mapping from acoustic signals to visual channels lives here in one **mapping table** module (`mapping.ts`) so the vocabulary stays consistent and tunable. (Design in `04-visualization.md`.)

### 3.8 Learn renderer (`@vmatch/learn`)
- DOM/canvas hybrid: pitch-contour overlay, timing map, vowel-space plot, phoneme timeline, timbre comparison, synchronized A/B playback with segment looping.
- Reads the *same* ring buffers and the considered-tier results; reuses Flow Mode's colors/identities.

### 3.9 App shell (`@vmatch/app`)
- Target library, attempt history ("afterglow shelf"), mode transition, settings, mic onboarding.

## 4. Latency budget (attempt loop)

| Stage | Budget |
|---|---|
| Mic → worklet frame available | ≤ 15 ms |
| Feature extraction per hop | ≤ 3 ms |
| Online alignment update | ≤ 2 ms |
| State → render (next rAF) | ≤ 16 ms |
| **Voice → visible response** | **≤ 50 ms perceived** |

Pitch trackers with model inference (if used) run in a Worker with ≤ 25 ms cadence; the visual layer covers inference latency with physics continuity (springs), so the entity never freezes waiting for a frame.

## 5. Stability contract (Principle 5, enforced structurally)

- The acoustic space's axes are **fixed functions** of features (e.g. vertical = log-f0 within a per-target register window; horizontal = vowel/brightness blend), *calibrated once per target* and per user (a 5-second range-finding warmup), then frozen for the session.
- No online refitting of any projection. Learned embeddings (timbre) influence *texture/appearance*, never spatial position, precisely because embedding spaces drift and positions must not.
- All smoothing is stateless-per-consumer (One-Euro), so replays are deterministic: the same recorded frames always replay as the same trajectory.

## 6. Data & privacy

- Default: everything on-device; recordings stored locally (IndexedDB/OPFS); nothing uploaded without an explicit share action.
- Target Packs are shareable JSON+audio bundles — the viral loop ("match my voice") without a backend dependency in the MVP.

## 7. Failure & degradation policy

- No mic / denied permission → spectate mode (target performs; space is explorable by mouse "conducting" as a toy).
- Low GPU → thin particle counts and drop bloom, never drop the closeness behaviors.
- Unvoiced/silent input → user's entity dims to embers and drifts (legible "not receiving voice" state, still beautiful).
- Alignment lost (user wildly off-script) → cursor confidence drops; the space stops judging timing and shows only timbre/pitch relationships until re-lock.
