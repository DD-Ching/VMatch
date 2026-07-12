# VMatch — Open-Source Audit & Reuse Matrix

> Every claim below was researched and independently fact-checked against primary sources (repos, npm/PyPI registries, papers) as of **2026-07-12**. Full per-topic reports with sources live in [`docs/research/`](research/).

## 1. Verdict legend

- **USE** — adopt as a dependency.
- **PORT** — small algorithm; reimplement in TypeScript from a permissive reference (cite it).
- **SERVER** — use in the Python considered-tier / target-preprocessing pipeline only.
- **IDEAS** — study the algorithm/design; write our own (usually because of GPL).
- **WATCH** — promising; re-evaluate later.
- **SKIP** — do not use (license, staleness, or dominated by a better option).

## 2. Reuse matrix

### Audio capture & low-level features (browser, real-time)

| Component | Library | License | Verdict | Why |
|---|---|---|---|---|
| Mic capture | Web Audio `getUserMedia` + **AudioWorklet** | — | USE | 128-sample quanta (2.7 ms @ 48 kHz), no main-thread jank. Constraints: `echoCancellation/noiseSuppression/autoGainControl: false`, mono — AEC/NS/AGC mangle singing; verify with `track.getSettings()` (Safari ignores some). |
| Spectral features (RMS, loudness, centroid, rolloff, flux, flatness, MFCC) | **Meyda** v5.6.3 | MIT | USE | Maintained (Apr 2024); pure functions on `Float32Array`. **Never** use `createMeydaAnalyzer` (wraps deprecated ScriptProcessorNode); feed frames from our worklet. |
| Feature extraction (alt) | Essentia.js | AGPL-3.0 | SKIP | Copyleft + last release June 2021. |

### Pitch tracking

| Component | Library | License | Verdict | Why |
|---|---|---|---|---|
| Primary browser pitch | **SwiftF0** (ONNX via onnxruntime-web WASM) | MIT | USE | 95,842 params ≈ **0.4 MB**; 62.5 Hz native update; 91.8% accuracy @ 10 dB SNR (beats CREPE by ~12 pts), ~42× faster than CREPE on CPU; proven client-side (swift-f0.github.io); range G1–C7 covers speech + singing. Run in a Worker. |
| Instant fallback / voicing gate | **pitchy** v4.1 (McLeod Pitch Method) | 0BSD | USE | ~1 ms per 2048-sample buffer, zero download; covers first paint while ONNX warms; `clarity` output gates unvoiced frames. |
| Neural alternative | PESTO | LGPL-3.0 | WATCH | Technically excellent (~130k params, streaming); LGPL bundling ambiguity in a web app — SwiftF0 equals it under MIT. |
| Reference-grade offline pitch | librosa `pyin` / torchcrepe | ISC / MIT | SERVER | Target-clip preprocessing and Learn Mode ground truth. |
| CREPE tf.js / ml5.js | — | MIT | SKIP | Browser demo is a <3%-params strip with octave errors; ml5 wrapper dead (hosted model deleted, 2024). |
| pitchfinder / aubiojs / Essentia pitch | — | GPL/AGPL | SKIP | Copyleft; dominated anyway. |
| SPICE (tf.js) | — | Apache-2.0 | WATCH | Robust to backing tracks (FreddieMeter shipped it); relevant if we later track voice over music. |

### Formants / vowel position

| Component | Library | License | Verdict | Why |
|---|---|---|---|---|
| F1/F2 tracker | **own LPC** (order 12–16 @ 16 kHz, Levinson-Durbin + peak-pick) | — | BUILD (~100 lines) | No maintained Praat-quality JS/WASM tracker exists. formantanalyzer.js (Apache-2.0) is single-maintainer peak-picking, not LPC — IDEAS only. Praat/Parselmouth are GPL — offline validation oracle only, isolated process. Gate output by voicing + stability; confidence-weighted. |

### Alignment (real-time and offline)

| Component | Library | License | Verdict | Why |
|---|---|---|---|---|
| Online "where is the user on the target timeline" | **own OLTW-Arzt port in TypeScript** (~200 LOC) | ref: matchmaker, Apache-2.0 | PORT | Measured 0.07 ms/frame (ISMIR 2025); every npm DTW package is 2014–2016 abandonware and none are streaming. Features: f0 + chroma-or-MFCC + energy at 50–100 Hz. web-score-following (MIT) proves in-browser OTW works. |
| Offline DTW (Learn Mode warp map) | same TS codebase, banded + backtracking; **librosa.sequence.dtw `subseq=True`** server-side | ISC | PORT + SERVER | 15–30 s clips at 100 Hz = ~3000² matrix — <1 s in plain JS with a Sakoe-Chiba band. `subseq` handles late starts/early stops. dtaidistance (Apache-2.0) for batch; synctoolbox MrMsDTW (MIT) if clips exceed ~1 min. |
| dtw-python | — | GPL-3 | SKIP | Copyleft. |
| fastdtw | — | MIT | SKIP | Abandoned (2019); empirically slower than exact DTW (Wu & Keogh). |

### Forced alignment & pronunciation scoring (considered tier)

| Component | Library | License | Verdict | Why |
|---|---|---|---|---|
| Target transcript → phoneme timestamps | **Montreal Forced Aligner 3.x** | MIT | SERVER | Boundary error <15 ms — accuracy leader; conda cost irrelevant at authoring time. torchaudio `forced_align` + MMS_FA (BSD-2) for multilingual (preserved in torchaudio 2.10). |
| User-attempt phoneme posteriors | **wav2vec2-xlsr-53-espeak-cv-ft** (Apache-2.0) or Charsiu `en_w2v2_fc_10ms` (MIT) | Apache/MIT | SERVER (browser later via transformers.js WebGPU, q8) | CTC posteriors → forced-align DP (portable, ~small) → per-phoneme scores. |
| Per-phoneme quality | **CTC/logit-based GOP** (2025–26 recipes) + GOPT head (BSD-3) | — | SERVER | Modern GOP works straight from CTC posteriors — no Kaldi lattice; GOPT gives calibrated multi-aspect scores (trained on speechocean762). |
| Singing alignment | Demucs vocal separation (MIT) → align given lyrics; SongTrans/STARS | — | SERVER, authoring-time | MFA/WhisperX fail on melisma/sustained vowels; treat sung-target alignment as an authoring pipeline with hand-verification, never live. |
| echogarden, allosaurus | — | GPL-3 | SKIP | Copyleft in a shipped product. |
| Gentle, Vosk (for phonemes) | — | MIT/Apache | SKIP | Stale / word-level only; dominated. |
| Azure/Google pronunciation APIs | — | proprietary | benchmark only | Calibration reference for our GOP quality. |

### Timbre / speaker embeddings

| Component | Library | License | Verdict | Why |
|---|---|---|---|---|
| Real-time timbre proxy (Flow Mode) | **own per-frame vector**: log-centroid, tilt, rolloff, flatness, autocorr-HNR at F0 lag, F1/F2 | — | BUILD | All computable at 50–100 Hz in JS (prototype with Meyda, inline what we keep). Speaker embeddings are identity-invariant by design — wrong tool for frame-level motion. |
| Utterance timbre embedding (Learn Mode) | **3D-Speaker CAM++ int8 ONNX** via onnxruntime-web (or sherpa-onnx WASM), Web Worker, lazy-loaded | Apache-2.0 | USE | ~7–28 MB; proven fully client-side (parakeet_web); ~1–2 Hz sliding-window embedding is realistic on WASM SIMD. English VoxCeleb-trained export exists — validate on singing in week 1. Fallback: WeSpeaker ResNet34-LM official ONNX (CC-BY-4.0). |
| Server second opinion / calibration | SpeechBrain ECAPA-TDNN | Apache-2.0 | SERVER | Calibrate the browser model's cosine scale against it. WavLM-sv is stronger but weights are CC-BY-SA (ShareAlike) — needs legal sign-off. |
| ReDimNet2 (~1M-param B0) | MIT | WATCH | Likely the best browser model once someone exports ONNX. |
| Resemblyzer, TitaNet, pyannote embeddings | — | — | SKIP | Stale / NeMo-heavy / HF-gated repackaging respectively. |

### Karaoke scoring & sung-target format

| Component | Library | License | Verdict | Why |
|---|---|---|---|---|
| Sung-target note representation | **UltraStar .txt format** (spec 1.1.0) | MIT | USE | Community standard, semitone+quarter-beat granularity, huge tooling ecosystem (UltraSinger auto-generates charts from audio: Whisper + separation + note transcription). We extend with a parallel continuous f0 curve (cents) per target. |
| Scoring semantics | octave-fold ±6 st; snap-to-target within tolerance; per-~100 ms cell occupancy; joker/grace mechanics; detection dropouts = neutral; unreachable ceiling | ref: UltraStar Play (MIT) | PORT (~100 lines) | The genre's hard-won "fair and fun" recipe. UltraStar Play is MIT — code portable. Never punish onset timing directly; show direction (sharp/flat), never a raw zero. |
| USDX / Performous / Vocaluxe engines | — | GPL-2/3 | IDEAS | Study Performous's FFT + phase-reassignment detector; re-derive from published methods. |

### Rendering (Flow Mode)

| Component | Library | License | Verdict | Why |
|---|---|---|---|---|
| Engine | **three.js r18x, `WebGPURenderer` + TSL** (`three/webgpu`) | MIT | USE | One shader codebase → WGSL or GLSL; automatic WebGL2 fallback (mandatory: WebGPU ≈80% coverage mid-2026, Firefox Linux/Android pending). Vanilla imperative loop — don't route 50–100 Hz audio frames through React state. |
| Particle sim | **TSL ping-pong FBO passes** (GPUComputationRenderer pattern), *not* WebGPU compute | MIT (three) | PORT pattern | Ping-pong runs identically on both backends; WebGPU compute does not fall back. 512×512 float textures ≈ 262k particles; proven at 60 fps on decade-old hardware. Swap to storage-buffer compute post-MVP behind a small interface. |
| Trails/ribbons | history-texture + instanced ribbon quads; meshline (MIT) for first prototype only | MIT | BUILD | CPU-updated lines don't scale; TrailRendererJS is stale with no license file. |
| Organic motion | curl noise (Bridson 2007) — **reimplement**; cabbibo/glsl-curl-noise has no license file | — | PORT | Divergence-free = fluid-looking without a sim. |
| Bloom | three's TSL bloom node (WebGPU path); pmndrs/postprocessing v6 (Zlib) on classic WebGL path | MIT/Zlib | USE | Half-res mip-chain, HalfFloat targets, no MSAA. Overdraw (big additive sprites), not particle count, is the perf killer — keep sprites 1–3 px. |
| pixi.js / regl / OGL | — | MIT etc. | SKIP | 2D-only / frozen / would rebuild bloom+lines+dual-backend. |
| Study references | The Spirit (MIT, curl-noise trails — closest existing aesthetic), David Li fluid/flow, three.js `webgpu_tsl_compute_attractors_particles`, Maxime Heckel's TSL field guide | — | IDEAS | — |

### Trajectory smoothing & space stability

| Component | Library | License | Verdict | Why |
|---|---|---|---|---|
| Display smoothing | **One-Euro filter** (npm `1eurofilter` or ~40-line port) | BSD-3 | USE | Adaptive cutoff: still when held, responsive on glides; tune so 5–7 Hz vibrato survives. Springs (critically damped) on top for physical feel. |
| Space projection | **hand-designed frozen axes** (log-f0, F2/brightness, F1), calibrated once per target | — | BUILD | Stable by construction. Learned embeddings drive *texture/color only*, never position. umap-js at runtime is disqualified (unmaintained since 2019; `.transform()` slow + non-deterministic → jitter). If a data-driven axis is ever needed: fit-once frozen PCA/LDA, or offline-trained Parametric UMAP encoder exported to ONNX (pin Keras 3.6 / train on CPU — known ≥3.7 Apple-GPU divergence bug). |

## 3. What we build custom (the short list)

1. **The Flow renderer** — the product's soul; no library exists for "two voices as living entities." (~weeks, on three.js/TSL.)
2. **OLTW-Arzt streaming aligner in TS** (~200 LOC, 1–2 days incl. tests) + offline banded DTW (~150 LOC).
3. **LPC formant tracker** (~100 lines) with confidence gating.
4. **Karaoke scoring semantics** (~100 lines, from UltraStar Play's MIT recipe).
5. **The mapping layer** (acoustic signals → visual channels) — one tunable module; this is design-critical code.
6. **Target Pack pipeline** (Python: MFA/pyin/embeddings → JSON bundle).

Everything else is reused. Total custom DSP/algorithm code is on the order of **a thousand lines** — the audit confirms the heavy lifting (capture, pitch, features, alignment references, rendering, models) is all available under permissive licenses.

## 4. License posture

Shipped browser bundle: **MIT / 0BSD / BSD / Apache-2.0 / Zlib only.** Model weights: SwiftF0 (MIT), CAM++ (Apache-2.0 repo license) — clean; WeSpeaker fallback is CC-BY-4.0 (attribution; VoxCeleb-scraped — legal review before commercial launch). Server-side Python may additionally use ISC/BSD tools. **Nothing GPL/AGPL/LGPL anywhere in the product**; GPL tools (Praat, echogarden, UltraStar engines) are used only as offline research oracles or algorithm literature, never linked or bundled.
