# VMatch

> Two voices, one space. You don't read your progress — you *feel* yourself getting closer.

VMatch is an interactive voice-matching experience: pick a target voice (a spoken phrase, a sung line, or a vocal style), then chase it with your own voice while both voices live as luminous entities in a stable acoustic space. Matching isn't scored — it's *witnessed*: drift, attraction, convergence, resonance, and — when you truly match — merging.

**Status: MVP vertical slice implemented and machine-verified (2026-07-13).** One sung phrase, Flow Mode, in the browser, no backend — the full loop from `docs/05-mvp-plan.md`: demo → count-in → ignition → chase → orbit capture → merge → crystallized afterglow → replay → one-tap retry.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173 — the product
                     # http://localhost:5173/debug.html — M0 audio-spine scope
npm run build        # typecheck + production bundle
npm run make-targets # regenerate bundled Target Packs (public/targets/)
```

Open the app, tap **Listen** (the Caller performs the phrase), then **Use microphone** and sing the line back. Headphones recommended (echo cancellation stays off by design). Mic denied → spectate mode with pointer conducting. Append `?dev` for the live `mapping.ts` tuning panel, `?target=spoken-phrase` for the bundled speech clip.

## What's implemented

- **M0 — audio spine.** AudioWorklet capture (AEC/NS/AGC off), pitchy (MPM) pitch + voicing gate, Meyda MFCC-13, custom spectral features, 100 Hz `FeatureFrame`s on the AudioContext clock. Debug scope at `/debug.html`.
- **Target Packs.** `scripts/make-targets.mts` synthesizes the bundled sung phrase (public-domain *Happy Birthday* first line, formant-shaped additive voice) and a macOS-`say` spoken phrase, then analyzes both with the *same* `FeatureExtractor` as live capture — schema parity by construction. The in-browser analyzer (debug page) produces identical packs from any audio file.
- **M1 — the Reach.** Fixed camera (15° tilt, parallax only), semitone lattice, ghost road baked from the pack (dust-river + ember ridge + onset beads), twin comets: gold Caller (accretive) / cyan Chaser (emissive), one unified particle system with per-particle `owner` scalars, curl-noise turbulence (Bridson 2007, original implementation), loudness→mass envelope (80/250 ms), One-Euro → critically-damped springs (closed-form, unconditionally stable), UnrealBloom.
- **M2 — the relationship.** OLTW (Arzt-style, ported after CPJKU `matchmaker`'s `oltw_arzt.py`, Apache-2.0): 2-column DP, 4 s window, ≤3-frame slope, target-stat z-normalized features (f0 + voiced + MFCC-13 + log-energy); pace bead (monotonic, ±1.5× slew, freezes on unvoiced); leash (150 ms low-passed offset, taut/ember behind vs slack/blue ahead); per-dimension closeness vector (pitch/timing/brightness, thresholds in `mapping.ts`); resonance tiers (filaments 1→3→5, particle exchange, stillness throb); orbit capture (700 ms all-dims hold) → merge (+800 ms) with reverse trail-flare; failure-aesthetics laws enforced (no red, no numbers, errors point home, give-up is gentle).
- **M3 — the loop.** Crystallized duet-portrait afterglow with attempt stacking (dimming layers), closest-approach glow, replay ghosts (DTW-aligned ↔ raw-time toggle, scrub by dragging), one-tap retry → count-in (3 lattice pulses at the pack's tempo), onboarding (target performs before any prompt; mic asked only at "Now chase it"), guidance fade (×0.85 per merge, floor 0.5), fps watchdog → LOD tier, `?dev` tuning panel.

## Verification (all machine-checked, headless)

The app exposes `window.__vmatch` test hooks (phase, closeness vector, attempt records, same-frame canvas capture, and `chaseSim(semitones)` — feeds the target's own audio through the real capture path as a simulated singer).

| Check | Result |
|---|---|
| Feed the target its own voice (`chaseSim(0)`) | countin → armed → chase → **orbit → merged** → afterglow; attempt record with 459 frames + full warp path |
| Detuned +3 st (`chaseSim(3)`) | never captures (max closeness 0.38), still crystallizes — merge is earned |
| Near-miss +0.75 st | no merge; filaments + leash visible; crystallized trail visibly offset from the road |
| Silence mid-attempt | `aborted: true`, Caller finishes alone, afterglow, no fail UI |
| Retry via UI button | one tap → count-in; prior layers stack dimmer; guidance fade 1 → 0.85 after merge |
| Replay | both ember lights fly the crystallized trails, filaments re-form |
| OLTW self-alignment | tracks the diagonal (offset ≈ 0 after settle) |
| Render | 60+ fps, exact `#05060C` background (color-space double-encode fixed), debug scope regression green |

## Known deviations from the design docs (deliberate, recorded)

1. **Renderer:** classic `WebGLRenderer` + shader-material particles with a CPU sim behind the `Comets` interface, instead of `WebGPURenderer` + TSL GPGPU ping-pong (docs/03, research-render). Chosen so the slice runs verified everywhere (including headless CI); the interface isolates a future GPU sim swap. Particle budget is accordingly ~8k trail + 1.4k nucleus, not 262k.
2. **Trails** are aged point sprites from the moving emitter, not history-texture instanced ribbons.
3. **SwiftF0 ONNX** is not wired; pitchy (MPM) alone passes the M0 gate for the slice. The worker seam exists in the engine design.
4. **Final note lengthened to 3.5 beats** in the bundled phrase: the binding 700 ms capture + 800 ms merge holds need a sustained tone to live inside (docs/05 asks for exactly this property).
5. Timing gates on the 150 ms low-passed offset (the leash value) rather than the raw OLTW cursor — raw cursors wobble ±0.2 s inside self-similar held notes (alignment noise, not rushing).

## Design documents

| Doc | Contents |
|---|---|
| [01 · Product definition](docs/01-product-definition.md) | What VMatch is / is not, binding principles, MVP success criteria |
| [02 · Architecture](docs/02-architecture.md) | Two-tier system, module breakdown, latency budget, stability contract |
| [03 · OSS audit & reuse matrix](docs/03-oss-audit.md) | Library choices, license posture |
| [04 · Visualization concept](docs/04-visualization.md) | SYZYGY twin comets + grafts, MVP scoping, acceptance tests |
| [05 · MVP plan](docs/05-mvp-plan.md) | The vertical slice: stack, milestones M0–M3 |
| [06 · Learn Mode plan](docs/06-learn-mode.md) | The "unfold" (post-MVP; attempt records already retain frames + warp paths for it) |
| [07 · Roadmap](docs/07-roadmap.md) | Phases 0–4, risk register, decision log |
| [docs/research/](docs/research/) | Fact-checked research reports and the three visualization concept specs |

Entire shipped bundle is MIT/BSD/0BSD/Apache-2.0 — no copyleft. Curl noise implemented from the Bridson 2007 paper; OLTW ported from the algorithm in CPJKU matchmaker (Apache-2.0, cited in source).
