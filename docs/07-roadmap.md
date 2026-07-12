# VMatch — Implementation Roadmap

## Phase 0 — Vertical slice (≈6 weeks) → *"the feeling exists"*
The MVP from `05-mvp-plan.md`: one sung phrase, Flow Mode, browser-only, no backend. Ends with real-user playtests against the §7 success criteria.

## Phase 1 — Speech targets + Learn Mode v0 (≈4 weeks) → *"it teaches"*
- Spoken-phrase targets become first-class: intonation shown in relative semitones vs speaker baseline; onset beads carry syllable identity from the Target Pack.
- **Learn Mode v0** (per `06-learn-mode.md` build order 1–2): the unfold transition, pitch lane, timing lane from the OLTW/offline-DTW warp map, synchronized A/B playback with segment looping.
- Target Pack authoring pipeline v1 (Python CLI): given clip + transcript → MFA phoneme timeline, pyin f0, features, onsets → JSON bundle. Ships as a repo tool, not a service.
- Offline banded DTW in TS for the definitive post-attempt warp map.

## Phase 2 — Articulation + vowel space (≈5 weeks) → *"it knows your mouth"*
- Own LPC formant tracker (confidence-gated F1/F2); the deferred vowel axis enters Flow Mode as 2.5D squash or full Z once playtests validate readability.
- Considered tier for user attempts: wav2vec2 phoneme-CTC posteriors + CTC forced alignment + logit-based GOP → per-phoneme chips and the vowel-space view in Learn Mode. Runs server-side first (simplest), with the code structured to move in-browser via transformers.js WebGPU later.
- Curated phoneme-tips content table (articulator hints, minimal pairs).

## Phase 3 — Timbre + style mode (≈4 weeks) → *"become the voice"*
- CAM++ int8 embedding in a Worker (lazy-loaded): slow "voice color convergence" hue-film channel in Flow Mode; timbre lane + placement trainer in Learn Mode.
- Free-mode (no timeline) matching for style targets: deltas against the target's distribution; space re-weighting per use case.
- Calibrate embedding cosine → perceptual scale against server-side ECAPA.

## Phase 4 — Targets from anywhere + sharing (≈5 weeks) → *"it spreads"*
- User-imported targets: upload/record a clip → in-browser or server preprocessing; Demucs separation + UltraStar chart import/auto-generation (UltraSinger-style) for sung targets; hand-verification UI for authored packs.
- Shareable Target Packs and afterglow clips ("match my voice" loop); afterglow shelf with per-dimension trend sparks.
- Hardening: Safari constraint quirks, mobile viability assessment, quality-tier telemetry.

## Standing risk register

| Risk | Mitigation owner |
|---|---|
| Merge tuned wrong (too easy = hollow; too hard = demoralizing) | `mapping.ts` thresholds + per-target difficulty from Target Pack stats; playtest every phase |
| Alignment on expressive singing | authoring-time hand-verification; confidence-gated visuals degrade to timbre/pitch-only |
| Guidance-hypothesis dependence (users can't perform without visuals) | feedback intensity fades within a session (already a design law) |
| Scope gravity toward dashboard-ware | the failure-aesthetics laws and "no numbers in Flow Mode" are non-negotiable acceptance criteria in every PR touching Flow |
| Weights licensing (CC-BY VoxCeleb models) | legal review before commercial launch; ReDimNet2 (MIT) as replacement path |

## Decision log (settled by this design phase)

1. Browser-first, client-side real-time tier; Python considered tier server-side/authoring-time; targets precomputed into Target Packs.
2. SYZYGY twin-comet visualization with SYMPATHY's stillness-throb and SELVEDGE's artifact framing grafted in.
3. Hand-designed frozen axes (pitch/brightness/vowel), calibrated once per target; learned embeddings never drive position.
4. SwiftF0 + pitchy + Meyda + own OLTW port + three.js TSL ping-pong — all-permissive license stack, no GPL anywhere.
5. Closeness is a decomposed vector end-to-end; any blend exists only inside the visual layer.
6. UltraStar .txt adopted as the sung-target interchange format, extended with continuous f0 curves.
7. Headphones-recommended UX with AEC off; turn-based fallback for speaker users.
