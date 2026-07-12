# VMatch — Product Definition

> Two voices, one space. You don't read your progress — you *feel* yourself getting closer.

## 1. What VMatch is

VMatch is an **interactive voice-matching experience**. A user picks a *target* — a spoken English phrase, a sung line, or a vocal delivery they admire — and then uses their own voice to chase it. Both voices are rendered as living entities in a shared, stable acoustic space. Matching is not reported; it is *witnessed*: the two entities drift, orbit, converge, resonate, and — when the user truly matches — merge.

The visualization is the product. Numbers, panels, and coaching exist, but they live in a second mode. The first and defining experience is perceptual: **"I can sense how to become more like that voice."**

### One-sentence identity

*A voice mirror you can move toward.*

### The three use cases (one product, one representation)

| Use case | What the user chases | Dimensions that matter most |
|---|---|---|
| **Pronunciation practice** | A reference spoken phrase | Articulation (vowels/consonants), stress, rhythm, intonation |
| **Karaoke / singing** | A sung phrase or melody | Pitch, timing, sustained-note shape, expression |
| **Voice / style imitation** | A voice quality or delivery | Timbre, brightness, resonance, contour, energy shape |

All three are the same interaction — *make your entity move like theirs* — with different weightings of the same underlying signals. The product does not fork into three apps; it re-weights one space.

## 2. What VMatch is not

- **Not a dashboard.** Flow Mode contains no score bars, percentages, letter grades, or progress rings.
- **Not a karaoke arcade scorer.** There is no single hidden number deciding if you "won."
- **Not a language-learning course.** No lesson plans, streaks, or gamified XP in the core loop. Learn Mode explains; it doesn't nag.
- **Not a voice changer or synthesizer.** The user's real voice is the only instrument.
- **Not scientifically literal in every axis.** The space is *honest* (every motion maps to a real acoustic relationship) but *curated* (axes chosen for legibility and beauty, not completeness).
- **Not a black box.** Any similarity signal used by the visuals decomposes into pitch / timing / articulation / timbre components that Learn Mode can show and explain.

## 3. Product principles (binding)

1. **Visualization-first.** The renderer is a core system with its own design budget, not a skin on a metrics engine.
2. **Beauty matters.** The bar is "screenshot-worthy at any random frame."
3. **Intuition first, explanation second.** Flow Mode teaches through perception and body; Learn Mode teaches through explanation. Never mix registers within a mode.
4. **No opaque single score.** Closeness is always shown as *behavior* (distance, resonance, merging) in Flow Mode and as *decomposed dimensions* in Learn Mode.
5. **Stable spatial meaning.** The space's axes keep their meaning across attempts and sessions. We never refit the projection live. Users must be able to build muscle memory about the world.
6. **Reuse mature components.** Audio capture, pitch tracking, alignment, DTW, rendering — audit first, wrap second, write last. (See `03-oss-audit.md`.)
7. **Failure stays beautiful.** A bad attempt looks like *weather*, not like a red X. The system's worst state must still invite another try.

## 4. Modes

### Flow Mode (default)

- **Register:** immersive, abstract, elegant. Full-bleed canvas, no chrome beyond a whisper of UI.
- **Loop:** *listen* (target entity performs its path) → *attempt* (user's entity comes alive from mic input, chases the target) → *afterglow* (both trajectories replay as ghosts; the moment of closest approach glows) → *again*.
- **Feedback vocabulary:** distance, attraction, orbit, particle exchange, resonance/interference, tension, drift, merging. Every one of these maps to a specific acoustic relationship (see `04-visualization.md`).
- **What's deliberately absent:** numbers, words, grades, timers, red/green judgment coloring.

### Learn Mode

- **Register:** clear, calm, explanatory. Same world, unfolded — the entity trajectories become labeled curves and timelines.
- **Capabilities:**
  - Pitch/intonation overlay (target vs user contour, semitone grid).
  - Timing/rhythm view (syllable/note onsets, stretch/compress map from alignment).
  - Articulation view (per-word → per-syllable → per-phoneme quality; vowel-space plot for vowels).
  - Timbre view (brightness/spectral profile comparison, voice-quality similarity).
  - Synchronized A/B playback: target, user, and time-aligned overlay; loop any segment.
  - "Why" explanations: plain-language notes ("your vowel in *heart* sits closer to 'hot' — open your jaw more").
- **The bridge rule:** every Learn Mode panel is a *literal unfolding* of something the user already saw in Flow Mode (the ribbon of the attempt becomes the timeline; vertical position becomes the pitch plot). Same data, same colors, same identity — different altitude.

### Mode transition

One gesture (a pinch/scroll or single button: "unfold"). The Flow scene doesn't cut away — it *unrolls* into the analytic layout and rolls back up. This continuity is what keeps Learn Mode from feeling like a different, boring product.

## 5. Primary user journeys

### J1 — First five minutes (pronunciation)
1. Open app → a target phrase card is already loaded ("Try matching this"). The target entity performs it: the user watches a comet of voice trace a path and hears the phrase.
2. Prompt: *"Now chase it."* Mic permission with a friendly explanation (headphones recommended).
3. User speaks. Their entity springs to life, visibly tugged along the target's ghost path. They're off — they can *see* they're off (below the path = pitch low; path blooms apart on a vowel = mouth shape off).
4. They try again immediately (retry is one tap, zero friction). Third try, the entities lock together for a stretch — the space resonates. That moment is the product's hook.
5. Afterglow shows both trajectories; the user taps "unfold" out of curiosity → Learn Mode shows *the same shapes* with words on them. They understand *why* the second word kept them apart.

### J2 — Karaoke night
1. User picks a sung phrase (bundled targets, or imports a clip / an UltraStar-format song line).
2. Target performs; melody path pre-renders as a faint road with note "gates."
3. User sings along in real time (target audio in headphones); the entity threads the gates; sustained notes become held resonance the user can feel wobble when vibrato drifts.
4. Replay ghost race: their best attempt's ghost runs alongside the current attempt.

### J3 — Voice imitation
1. User imports a clip of a voice they want to channel (a narrator's warmth, an actor's delivery).
2. Space re-weights toward timbre/energy: axes emphasize brightness and resonance rather than word timing.
3. The target entity's *texture* (grain, glow color, trail character) embodies its timbre; the user watches their own entity's texture shift toward it as they adjust their voice placement.
4. Learn Mode shows brightness/spectral tilt and energy-contour comparisons with plain-language guidance.

### J4 — Deliberate practice (returning learner)
1. User opens a saved target, reviews last session's afterglow.
2. In Learn Mode, picks the weakest segment (the app suggests one), loops it slow, drills it.
3. Flips back to Flow Mode to "perform" the whole phrase — the drill pays off as visible convergence. Session history is a shelf of afterglow artifacts, not a chart of scores.

## 6. Audience & platform

- **Primary:** language learners who hate drill apps; casual singers; voice/VO hobbyists; streamers who want a beautiful clip.
- **Platform:** browser-first (zero install, mic ubiquity, shareable), desktop-class laptops as the design target; degrade gracefully on lower GPUs by thinning particles, never by dropping meaning.
- **Session shape:** 3–15 minutes; one phrase repeated 3–10 times, not hour-long courses.

## 7. Success criteria for the MVP

- A first-time user, with no instruction, retries the same phrase ≥3 times unprompted (the chase is self-motivating).
- Users can articulate *in their own words* what to change ("I needed to go higher at the end") after Flow Mode alone — before seeing Learn Mode.
- The "lock-on/merge" moment is reliably reachable by a motivated user within ~5 attempts on an easy phrase, and it reads as the emotional payoff.
- Any random paused frame looks like art, not telemetry.
