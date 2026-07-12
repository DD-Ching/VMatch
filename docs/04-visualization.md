# VMatch — Visualization Concept

> Three metaphors were developed in full depth by independent designers (complete specs in [`docs/research/concept-*.md`](research/)). This document compares them, picks the winner, and defines the MVP-scoped visual system.

## 1. The three candidates

### A. SYZYGY — Twin Comets *(full spec: `research/concept-comet-trails.md`)*
Two luminous particle-bodies in a dark, still 3D space ("the Reach"). **Position = acoustic state**: Y = log-pitch (1 semitone = 1 fixed world unit), X = vowel frontness/brightness, shallow Z = vowel openness. Time is *motion*, not an axis — the past is your trail, the future is the target's pre-rendered "ghost road." The target comet (warm gold, particles spiraling inward — calm, inviting) performs its path; the user's comet (cool cyan, particles streaming outward — eager, effortful) chases it. Closeness manifests as a resonance stack: spring filaments → particle exchange between trails → shared corona → gravitational lensing → orbit capture → merge into one iridescent sun. Attempts crystallize into glassy twin trails; practice history stacks as visible geology of rivers converging on the gold road.

### B. SELVEDGE — The Loom *(full spec: `research/concept-ribbon-loom.md`)*
Both voices are silk ribbons on a loom. X = time scrolling past a fixed "now" line, Y = log-pitch on a semitone warp. The target ribbon is pre-woven in ember-gold; the user's moon-silver ribbon extrudes live. Matching braids the ribbons; mismatch billows them apart like silk in wind, with weft threads that slant toward the correction. Every attempt leaves a woven cloth artifact — the ribbon *is* the timeline.

### C. SYMPATHY — The Listening Water *(full spec: `research/concept-resonant-field.md`)*
Both voices are excitation sources in one shared pool. Position = pitch (vertical) × brightness (horizontal); vowels are cymatic glyph shapes stamped into the wavefronts; mismatch is chop, moiré, and — the concept's masterstroke — a **beat-throb**: the combined field pulses at the difference frequency and goes *utterly still* at unison. Match crystallizes a standing wave; teal + gold light floods additively to white.

## 2. Comparison

| Criterion | SYZYGY | SELVEDGE | SYMPATHY |
|---|---|---|---|
| "Two living entities" (core brief) | ★★★ strongest — a being you chase | ★★ ribbons are alive but tethered to a timeline | ★★ epicenters risk dissolving into the medium |
| Pre-attentive closeness read | ★★★ literal distance | ★★★ gap at the now-line | ★★★ distance + throb-stillness |
| Escapes the karaoke/dashboard paradigm | ★★★ state-space, no timeline on screen | ★ time→x scrolling is a beautified piano-roll — the pattern prior-art says feels like being graded | ★★★ fully |
| Merge/lock-on payoff | ★★★ orbit capture → fusion | ★★ braid | ★★★★ "one pattern where two used to be" — the best payoff of all |
| Articulation guidance (vowels as *places*) | ★★★ vowels are locations you steer to | ★★ vowel = ribbon twist (subtle) | ★ vowel = glyph shape (recognizable, not steerable) |
| Per-dimension legibility (anti-black-box) | ★★★ every error is a direction | ★★★ every error is geometry | ★★ moiré/phase cues need learning |
| Replay & Learn Mode bridge | ★★★ crystallized trails + camera-station unfold | ★★★★ the cloth IS the timeline — best bridge | ★★ filament ghosts |
| GPU risk / implementation risk | medium (3D depth axis, resonance stack budget) | low (~4 ms frame) | medium (identity-in-one-medium risk) |
| Style-imitation use case (no script) | ★★★ free-roam space works without a timeline | ★ needs a timeline | ★★★ works without a timeline |

## 3. Decision: SYZYGY, with two grafts

**SYZYGY is the product.** It is the most literal realization of the vision — two voices as living entities in a stable acoustic space, chase → convergence → merge — and it is the only concept where *all three* use cases (pronunciation, karaoke, style) live naturally in one world: the space is state-space, so a scripted phrase is a road through it and a free style-imitation is a region of it. Its axes are performable ("go higher, slide left, open up"), which SELVEDGE's time-scroll and SYMPATHY's glyphs can't match. SELVEDGE, for all its craft, re-imports the scrolling-grid paradigm the prior-art research identified as the thing that makes every existing product feel like being graded.

**Graft 1 — the Stillness cue (from SYMPATHY).** SYZYGY's composite-closeness stack gains SYMPATHY's beat-throb: when the comets are near, the shared corona pulses at a rate mapped from the residual error, decelerating as error shrinks and going **perfectly still** in the 700 ms before orbit capture. Stillness-as-truth is physically honest (it's how beats between two tones actually behave), pre-attentive, and it gives lock-on a *felt* run-up rather than a binary trigger.

**Graft 2 — the Cloth (from SELVEDGE).** The afterglow's crystallized trails adopt SELVEDGE's artifact framing: attempts stack as layers (progressively dimmer), the "look how far you traveled" duet portrait is the retry screen, and the Learn Mode unfold treats the crystallized trail as woven material to lean into — reinforcing that the trail *is* the timeline once unrolled.

## 4. MVP scoping of SYZYGY (what ships in the vertical slice)

The full spec is the destination. The slice makes these simplifications, each reversible:

1. **2.5D space, not 3D.** Y = log-pitch, X = brightness (spectral centroid, log-scaled) — the two most robust real-time signals. The Z/F1 vowel-depth axis is deferred until the LPC formant tracker proves stable (its own risk mitigation already anticipated this: F1 becomes comet *squash* + floor-shadow offset in 2.5D). Camera is a fixed gentle-parallax rig — no navigation.
2. **Resonance stack, tiers 1–3 only:** filaments, particle exchange, orbit-capture/merge — plus the grafted stillness throb. Gravitational lensing and lattice-glimmer cues are post-MVP polish.
3. **One unified GPGPU particle system** (512×512 ping-pong, ~262k budget, LOD tier at 256×256) exactly as the concept's implementation sketch specifies; instanced-quad trails with a history texture; single half-res bloom chain. Frame budget target ≤ 8 ms GPU.
4. **The mapping table is the contract.** All acoustic→visual mappings from the concept's table are implemented in one `mapping.ts` module with live-tunable constants (dev panel), because the difference between "magical" and "noisy" will be found in tuning, not architecture:

| Signal | Visual channel (MVP) |
|---|---|
| log-f0 | comet Y (1 st = fixed unit; per-target calibration, frozen) |
| voicing confidence | nucleus cohesion (knot ↔ breath-mist) |
| loudness | comet mass: nucleus radius, corona, emission rate (80 ms attack / 250 ms release) |
| spectral centroid | comet X + nucleus color temperature |
| spectral tilt | trail plume texture (feathered ↔ spiky) |
| onsets | shockwave pulse + bead knotted into trail |
| timbre drift (post-MVP: embedding; MVP: tilt+flatness blend) | slow iridescent hue-film |
| OLTW cursor | pace bead gliding on the ghost road |
| timing offset | leash filament: taut-forward (dragging) / slack-loop (rushing) |
| pitch error | vertical gap + filament bend |
| brightness gap | nucleus temperature mismatch + filament flicker |
| composite closeness | filament count 1–5 → particle exchange → **stillness throb** → orbit capture → merge |

5. **Choreography beats** (from the concept, all kept — they are the product): idle-breathing target with pre-rendered ghost road → target performs its road live → three lattice-pulse count-in → ignition spring-pop on first voiced frame (≤120 ms — the "it heard me" moment) → chase with spring-driven motion (~12 Hz natural frequency, near-critical damping) → orbit capture after 700 ms all-dimensions-under-threshold → merge with reverse-fuse trail flare → crystallized afterglow + one-tap replay ghost.
6. **Failure aesthetics laws** (binding, testable): no red, no shake, no mass-loss on error; every mismatch cue is a *direction*; the zero-resonance state must still be screenshot-worthy; giving up mid-attempt = gentle exhale to mist, never a game-over.

## 5. Acceptance tests for the visual system

- **200 ms read:** a first-time viewer shown a random 200 ms clip can say "getting closer" vs "getting farther" with >90% accuracy.
- **Squint test:** at 50% gaussian blur, the two identities and their distance remain readable.
- **Quiet mode test:** with all resonance effects disabled (comets + filaments + road only), the closeness read still works — the stack is reinforcement, never the only carrier.
- **Stability test:** replaying the same recorded attempt twice renders pixel-identical trajectories; axes identical across attempts 1–100 of a target.
- **Direction test:** users asked "what would you change?" after a deliberately flat/dark/late attempt answer with the correct direction (higher / brighter / sooner) without coaching.
