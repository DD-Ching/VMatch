## Stable, Legible Low-Dimensional "Acoustic Space" for Two-Voice Matching

### Candidates

| Name | Repo/URL | License | Platform | Maturity/maintenance | Real-time/browser feasibility | Notes |
|---|---|---|---|---|---|---|
| **Hand-designed perceptual axes** (log-Hz pitch, loudness/RMS, spectral centroid, F1/F2) | N/A (compute from Meyda + pitch lib) | N/A | Browser | Standard DSP; phonetics-established (vowel charts) | Excellent — trivially per-frame, deterministic | Axes never move; perfectly stable & legible. The backbone of the MVP. |
| **Meyda** | github.com/meyda/meyda | MIT | Browser (WebAudio) + Node | Stable; latest 5.6.3 (Apr 2024), 6.0.0-beta.2 exists (2021); low churn but usable | Excellent — real-time via ScriptProcessor/manual buffering (no native AudioWorklet node, you feed frames) | Gives loudness, spectralCentroid, spectralFlatness, MFCC, RMS, ZCR out of the box |
| **pitchy** | github.com/ianprime0509/pitchy | 0BSD | Browser + Node | Maintained, TS, McLeod Pitch Method; latest release v4.1.0 (Jan 2024) | Excellent — designed for real-time tuners; pure function over Float32Array, callable from an AudioWorklet | Returns [pitchHz, clarity]; clarity gates unvoiced frames. Best pitch pick for MVP |
| **CREPE (tfjs)** | github.com/marl/crepe | MIT | Browser (tfjs) | Research-grade, ICASSP 2018 | Browser demo uses <3% param model, more octave errors; heavier | Overkill for MVP; use only if pitchy accuracy insufficient |
| **SPICE (tfjs)** | tfhub / tensorflow.org | Apache-2.0 | Browser (tfjs) + TFLite | Google-maintained model | Runs in-browser (official TF.js demo; FreddieMeter shipped it via TFLite); robust to noise/backing track | Good for karaoke-over-backing-track pitch; self-supervised relative-pitch model with calibration to Hz |
| **formantanalyzer.js** | github.com/tabahi/formantanalyzer.js | Apache-2.0 | Browser (WebAudio) | Niche, single-author, low activity (~15 commits) | Feasible but LPC formant tracking is jittery at high F0 | Only source for in-browser F1/F2; validate quality before shipping |
| **umap-js** | github.com/PAIR-code/umap-js | Apache-2.0 | Browser + Node | **Effectively unmaintained** — last release 1.2.2 (May 2019) | fit() is slow, not per-frame; `transform()` exists | Has `.transform(newPoints)` but does k-NN search against training set — too slow/jittery for 50-100 Hz |
| **Parametric UMAP** | github.com/lmcinnes/umap (parametric_umap.py) | BSD-3-Clause | Python (Keras3/TF) train → export | Maintained but fragile (Keras ≥3.7 loss-divergence bug #1211, reported on Apple Silicon GPU) | Train offline, export encoder to ONNX/tfjs → fast per-frame inference in browser | This is the only "learned projection" path that meets the per-frame + stability constraints |
| **AlignedUMAP** | umap-learn (AlignedUMAP) | BSD-3-Clause | Python | Maintained, documented | Offline only | For stability *across corpus segments/time*, not runtime. Not a browser runtime tool |
| **PCA/LDA (fit-once, frozen)** | scikit-learn (train) → matrix multiply at runtime | BSD-3-Clause | Anywhere | Rock-solid, trivial | Excellent — a frozen projection is one matrix multiply per frame | The pragmatic "learned" option: stable by construction, legible if you inspect loadings |
| **OneEuroFilter** | github.com/casiez/OneEuroFilter | BSD-3-Clause | JS/TS impls included (npm `1eurofilter`); port trivial (~40 lines) | Canonical (Casiez 2012), reference impls maintained (CI, PyPI/npm packages) | Excellent — designed exactly for responsive-but-smooth interactive signals | Adaptive cutoff: low jitter at rest, low lag on fast moves. Ideal for trajectory smoothing |

### Key technical facts

- **Vowel charts are the phonetics precedent for a stable 2D acoustic space.** Standard practice plots **F2 on the x-axis (front↔back tongue position) and F1 on the y-axis (high↔low), both axes conventionally inverted** so the layout matches the IPA vowel quadrilateral. This is exactly the "axes that keep their meaning" property VMatch needs — every vowel sits in a fixed, learnable region. Trajectories of connected speech/singing trace continuous loops through this space (diphthongs = arcs; sustained sung vowels = tight clusters).
- **Perceptually legible per-frame features, ranked:** (1) **pitch in log-Hz** (semitone/cents axis — perception is logarithmic, so log-Hz not linear Hz); (2) **loudness** (perceptual, or RMS/dB as a proxy — Meyda's `loudness` uses Bark-band specific loudness); (3) **spectral centroid** = "brightness/timbre" (Meyda `spectralCentroid`); (4) **F1/F2** for vowel identity when the target is speech/lyrics. For a Flow-Mode 2D canvas, **pitch (vertical) × brightness or F2 (horizontal)** is the most intuitive default; add loudness as particle size/opacity rather than a spatial axis.
- **umap-js `.transform()` exists but is the wrong tool for per-frame runtime.** It does an approximate k-NN search of each new point against the stored training embedding then optimizes its position — this is (a) slow, (b) **non-deterministic frame-to-frame** (random init components), causing exactly the jitter the product forbids. The repo's last release is May 2019; treat it as abandoned.
- **Parametric UMAP is the only UMAP-family member fit for browser runtime:** it trains a plain feed-forward encoder (default 3-layer, 100-unit MLP) so inference is a deterministic forward pass. You **train offline in Python, then export the encoder (not the UMAP object — it can't be pickled) to ONNX or tfjs**. Once frozen, it's stable by construction (same input → same output, no refitting). Caveat: known training instability on Keras ≥3.7 (issue #1211, open/unresolved) — reproduced on Apple Silicon (M2) GPU training; CPU training and Keras 3.6 are fine — pin Keras 3.6 or train on CPU/Linux to be safe.
- **A frozen linear projection (PCA/LDA) fit once over a reference corpus is the lowest-risk "learned space":** it's a single matrix multiply per frame (sub-microsecond), perfectly deterministic, and stable across all sessions. LDA is preferable if you have phoneme/pitch-class labels because its axes align with perceptually meaningful contrasts. The cost vs. hand-designed axes is only interpretability of the axes themselves.
- **AlignedUMAP solves a *different* stability problem** — keeping a *sequence of separately-computed embeddings* comparable (via `alignment_regularisation`, default 0.01). It's an offline corpus tool, not a runtime projector, and doesn't help the per-frame case.
- **Smoothing is mandatory and the One-Euro filter is the right default.** It's an adaptive-cutoff low-pass: low cutoff at low speed kills jitter when a voice is held steady, high cutoff at high speed kills lag on fast pitch/vowel transitions. Two tunable params (min-cutoff, beta). ~40 lines of JS, or use the official BSD-3-Clause TypeScript/JS implementation (npm `1eurofilter`). EMA (single-pole IIR) is simpler but forces a fixed jitter/lag trade-off — fine for a coarse "energy" channel, inferior for the primary position signal. Design target from the source literature: keep lag ≤ ~60 ms.
- **No one appears to have shipped an in-browser *live* parametric audio projection as a polished product**; the famous precedent (Google Creative Lab **Bird Sounds**, t-SNE; repo archived 2022) is a **precomputed static map** the user browses — embeddings computed offline, positions frozen. This validates the "precompute the target's trajectory offline, project the live voice into that fixed space at runtime" pattern.

### Recommendation

**MVP (browser, Flow Mode): ship hand-designed perceptual axes, not a learned projection.** Build the "acoustic space" from 2-4 interpretable per-frame features:
- **X-axis:** spectral centroid (brightness) for general voice, OR F2 when the target is a spoken/sung vowel-rich phrase.
- **Y-axis:** pitch in log-Hz (semitones) via **pitchy** (0BSD, real-time, McLeod method) — gate frames by its `clarity` value.
- **Non-spatial channels:** loudness/RMS (from **Meyda**, MIT) → particle size/brightness; spectral flatness → texture (breathy vs. tonal).

This is stable *by construction* (axes never refit), responsive (all features are cheap per-frame DSP hitting 50-100 Hz easily), and immediately matchable ("get higher / get brighter / get louder" map to screen directions). Both the precomputed target trajectory and the live voice live in the identical fixed coordinate system, so "convergence" is literally two points approaching in a space whose meaning never changes.

**Smoothing:** Wrap every displayed coordinate in a **One-Euro filter** (use Casiez's official JS/TS implementation or port it). Tune min-cutoff/beta so held notes sit still and glides track without lag. This is what makes trails feel alive rather than either jittery or sluggish.

**How to blend learned embeddings without destroying legibility:** Do **not** replace the perceptual axes with a black-box 2D embedding. Instead, keep the 2-4 hand-designed axes as the **skeleton the user reads**, and use a learned embedding only as an *additional, non-positional* similarity signal — e.g., a frozen speaker/timbre embedding whose cosine distance to the target drives *color warmth or particle cohesion*, never the XY position. If you later want a data-driven axis, use a **fit-once frozen linear projection (PCA/LDA over your reference corpus)** or an **offline-trained Parametric UMAP encoder exported to ONNX/tfjs** — both give deterministic, session-stable coordinates. Anchor at least one axis to a hand-designed feature (e.g., force Y = pitch) and let the learned model own only the residual axis, so users always retain one axis they intuitively understand.

**Server-side / Learn Mode (Python, offline or on-demand):** This is where the heavy, less-legible machinery belongs.
- Forced alignment + per-word/syllable feedback: offline alignment against the target transcript.
- **Precompute the target clip's full trajectory** (pitch curve, formants, embeddings) server-side so runtime only projects the *live* voice.
- Train **Parametric UMAP** (pin Keras 3.6 or train on CPU/Linux, per bug #1211 — the divergence is reported on Apple Silicon GPU) or **PCA/LDA** here; export frozen weights to the browser.
- Use **AlignedUMAP** only if you need to keep multiple corpus-segment maps mutually consistent for authoring/analysis — not in the runtime path.
- Robust formants/pitch (CREPE-full, Praat-style LPC) for the analytical curves shown in Learn Mode.

**Skip / avoid:**
- **umap-js at runtime** — unmaintained since 2019, and its `.transform()` is slow and frame-to-frame non-deterministic → guaranteed jitter. Fatal for the "coherent across attempts" requirement.
- **Live UMAP/t-SNE refitting of any kind** — refitting moves the axes; the whole product premise dies.
- **formantanalyzer.js as a hard dependency** — Apache-2.0 is fine commercially, but it's single-author/low-activity and LPC formants degrade at high sung F0. Validate output quality before relying on it; consider your own LPC or a WASM tracker as fallback.
- **CREPE-full in-browser** — the tfjs demo model is heavily stripped (<3% params, octave errors); pitchy is lighter and adequate. Keep CREPE server-side for Learn Mode accuracy.

**License posture:** everything recommended for the browser MVP is permissive — Meyda (MIT), pitchy (0BSD), One-Euro official implementations (BSD-3-Clause), umap-js/SPICE/formantanalyzer (Apache-2.0), CREPE (MIT). UMAP/scikit-learn (BSD-3) are permissive and server-side only regardless. **No GPL/AGPL copyleft in the stack** — clean for a commercial product. (Note: some Praat-derived formant code is GPL — if you go that route server-side, isolate it as a separate process/service, don't link it.)

### Sources
- https://github.com/PAIR-code/umap-js
- https://www.npmjs.com/package/umap-js
- https://umap-learn.readthedocs.io/en/latest/parametric_umap.html
- https://github.com/lmcinnes/umap/blob/master/umap/parametric_umap.py
- https://github.com/lmcinnes/umap/issues/1211
- https://umap-learn.readthedocs.io/en/latest/aligned_umap_basic_usage.html
- https://umap-learn.readthedocs.io/en/latest/aligned_umap_politics_demo.html
- https://github.com/meyda/meyda
- https://meyda.js.org/audio-features.html
- https://www.npmjs.com/package/meyda
- https://www.npmjs.com/package/pitchy
- https://github.com/ianprime0509/pitchy
- https://github.com/marl/crepe
- https://marl.github.io/crepe/
- https://www.tensorflow.org/hub/tutorials/spice
- https://blog.tensorflow.org/2020/06/estimating-pitch-with-spice-and-tensorflow-hub.html
- https://github.com/tabahi/formantanalyzer.js
- https://github.com/tabahi/formantanalyzer.js/blob/main/LICENSE
- https://github.com/casiez/OneEuroFilter
- https://www.npmjs.com/package/1eurofilter
- https://jaantollander.com/post/noise-filtering-using-one-euro-filter/
- https://dl.acm.org/doi/10.1145/2207676.2208639
- https://www.yacavone.net/vowel-space/
- https://www.isca-archive.org/interspeech_2024/yoder24_interspeech.pdf
- https://github.com/googlecreativelab/aiexperiments-bird-sounds
- https://experiments.withgoogle.com/bird-sounds

### Fact-check notes

Verified against primary sources (GitHub repos/releases, README/LICENSE text, TF Hub/TensorFlow blog, web search) on 2026-07-12.

**Corrections made:**
1. **pitchy license: MIT → 0BSD.** The pitchy README states it is "released under the Zero Clause BSD License." Corrected in the candidates table, Recommendation, and License posture. (0BSD is even more permissive than MIT, so no impact on the commercial-viability conclusion.) Also removed the unsupported "runs in AudioWorklet" phrasing — the repo documents real-time tuner use but does not document AudioWorklet; restated accurately as a pure function callable from an AudioWorklet.
2. **OneEuroFilter license: "BSD/MIT (ref impls)" → BSD-3-Clause.** The official casiez implementations (PyPI `OneEuroFilter`, npm `1eurofilter`) are BSD-3-Clause; MIT applies only to third-party ports. Corrected in table, Smoothing paragraph, and License posture; noted the ready-made official JS/TS npm package.
3. **Parametric UMAP bug #1211 scope narrowed.** Confirmed the issue exists, is open/unresolved (reported July 2025), and shows loss divergence on Keras ≥3.7 — but only on Apple Silicon (M2) GPU training; CPU training and Keras 3.6 work on all tested platforms. The blanket "pin Keras 3.6" advice was overbroad; amended to "pin Keras 3.6 or train on CPU/Linux."
4. **Minor date fixes:** Meyda 5.6.3 released April 2024 (was "~2024"); 6.0.0-beta.2 dates from Nov 2021. Noted pitchy's latest release is v4.1.0 (Jan 2024). Noted the Bird Sounds repo was archived in 2022 (consistent with the "static precomputed map" claim).

**Verified, no change needed:**
- Meyda: MIT license, latest release 5.6.3, real-time WebAudio extraction, features include zero-crossing/spectral centroid etc.; no native AudioWorklet node (claim consistent with docs).
- umap-js: exists at PAIR-code/umap-js, Apache-2.0, last release 1.2.2 (May 23, 2019), `transform()` for additional points exists, project inactive — all as stated.
- formantanalyzer.js: exists, Apache-2.0, single-author (tabahi), ~15 commits (low activity), browser WebAudio formant extraction — as stated.
- CREPE: MIT license; official web demo statement confirms the browser model has "less than 3 percent of parameters" and "may make more octave errors than the full model" — the report's <3% claim is accurate.
- SPICE: Google model on TF Hub, Apache-2.0, runs fully in-browser via TensorFlow.js (official demo) and TFLite (FreddieMeter); self-supervised (relative-pitch) training with calibration to Hz — feasibility and license claims accurate.
- AlignedUMAP `alignment_regularisation` default 0.01 — matches umap-learn docs. umap-learn BSD-3-Clause — correct.
- Bird Sounds: googlecreativelab/aiexperiments-bird-sounds exists, uses t-SNE, positions precomputed offline, Apache-2.0 — as stated.
- One-Euro filter design intent (adaptive cutoff, jitter/lag trade-off, CHI 2012 Casiez et al.) — consistent with the repo and paper.
