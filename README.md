# VMatch

> Two voices, one space. You don't read your progress — you *feel* yourself getting closer.

VMatch is an interactive voice-matching experience: pick a target voice (a spoken phrase, a sung line, or a vocal style), then chase it with your own voice while both voices live as luminous entities in a stable acoustic space. Matching isn't scored — it's *witnessed*: drift, attraction, convergence, resonance, and — when you truly match — merging.

**Status: design phase complete (2026-07-12). Next: build the vertical slice (`docs/05-mvp-plan.md`).**

## Design documents

| Doc | Contents |
|---|---|
| [01 · Product definition](docs/01-product-definition.md) | What VMatch is / is not, the three use cases, binding principles, mode definitions, user journeys, MVP success criteria |
| [02 · Architecture](docs/02-architecture.md) | Two-tier system (real-time + considered), module breakdown, latency budget, stability contract |
| [03 · OSS audit & reuse matrix](docs/03-oss-audit.md) | Fact-checked library choices per layer, license posture, the short build-custom list |
| [04 · Visualization concept](docs/04-visualization.md) | Three competing metaphors, the decision (SYZYGY twin comets + grafts), MVP scoping, acceptance tests |
| [05 · MVP plan](docs/05-mvp-plan.md) | The vertical slice: stack, milestones M0–M3, front-loaded risk spikes |
| [06 · Learn Mode plan](docs/06-learn-mode.md) | The "unfold": four lanes over the target timeline, playback comparison, practice loop |
| [07 · Roadmap](docs/07-roadmap.md) | Phases 0–4, risk register, decision log |
| [docs/research/](docs/research/) | Full fact-checked research reports (8 topics) and the three complete visualization concept specs |

## The stack in one paragraph

Browser-first, no backend for the MVP. AudioWorklet capture (AEC off, headphones-first) → SwiftF0 (MIT, 0.4 MB ONNX) + pitchy fallback for pitch, Meyda for per-frame features, our own ~200-line OLTW-Arzt port for streaming alignment, One-Euro + critically-damped springs for motion feel → three.js `WebGPURenderer` (WebGL2 fallback) with TSL ping-pong GPU particles, instanced trails, and bloom. Targets are preprocessed offline (Python: MFA, pyin, embeddings) into shareable Target Packs. Considered tier (phoneme GOP scoring, CAM++ timbre embeddings) powers Learn Mode. Entire shipped bundle is MIT/BSD/Apache/Zlib — no copyleft.
