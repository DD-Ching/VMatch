# VMatch — Learn Mode Plan (Stage 2)

> Learn Mode is Flow Mode, unfolded. Same data, same colors, same two voices — explained.

## 1. Design contract

1. **One representation.** Every Learn Mode view is a re-projection of the exact ring buffers and alignment data Flow Mode rendered. If Learn Mode needs a signal Flow Mode's pipeline doesn't produce, the pipeline grows — we never build a parallel analyzer.
2. **Continuity of identity.** Target and user keep their Flow Mode colors, grain, and glow across the transition. The unfold animation literally unrolls the attempt's trajectory into the timeline: the user watches their comet-path become the pitch curve. This is the single most important trick for making Learn Mode feel like the same product.
3. **Explanation, not judgment.** Copy explains *difference and action* ("your pitch fell early on 'away' — hold it through the second syllable"), never verdicts ("Bad. 43%"). Numbers appear only where they are actionable (semitones, milliseconds), formatted as deltas, not grades.
4. **Flow is always one gesture away.** Drill a segment in Learn Mode → "perform it" bounces you into Flow Mode scoped to that segment.

## 2. The unfold layout

```
┌────────────────────────────────────────────────────────────┐
│  ▶ target   ▶ you   ▶ overlay        segment: [ away ] 🔁  │   playback bar
├────────────────────────────────────────────────────────────┤
│  PITCH LANE      target contour (solid) vs user (glowing)  │
│                  semitone grid · note gates (singing)      │
├────────────────────────────────────────────────────────────┤
│  TIMING LANE     word/syllable/note blocks; user blocks    │
│                  stretched/compressed vs target (warp map) │
├────────────────────────────────────────────────────────────┤
│  SOUND LANE      per-phoneme quality chips (speech) or     │
│                  per-note shape (singing); tap → detail    │
├────────────────────────────────────────────────────────────┤
│  VOICE LANE      brightness/energy contours; timbre        │
│                  similarity as texture swatch pair         │
└────────────────────────────────────────────────────────────┘
```

- Horizontal axis is always **target time** (the warp map from alignment places user events on it). One shared cursor scrubs everything, including audio.
- Lanes collapse/expand; the default expanded lane depends on use case (pitch for singing, sound lane for pronunciation, voice lane for imitation).

## 3. The four lanes

### 3.1 Pitch & intonation
- Target f0 contour (solid ribbon) and user contour (the user's own glow) on a semitone grid, voicing-confidence rendered as opacity.
- Speech: contour shown in relative terms (semitones vs. speaker baseline) so a deep-voiced learner isn't "wrong" for being low — intonation *shape* is the target.
- Singing: absolute notes with octave-fold option; sustained notes show shape detail (attack, hold stability, vibrato depth/rate) on tap.
- Hover/tap anywhere: hear both voices at that instant; delta readout in semitones.

### 3.2 Timing & rhythm
- Blocks per syllable (speech) or note (singing) on the target timeline; the user's aligned blocks drawn beneath with stretch/compress shading and onset tick marks.
- The warp map (from DTW) visualized as connecting threads — steep threads = rushed/dragged region.
- One-tap "rhythm only" playback: both versions as percussive taps, isolating timing from everything else.

### 3.3 Articulation & pronunciation (speech targets)
- Word → syllable → phoneme drill-down. Phoneme chips shaded by quality score (continuous shade, not pass/fail), sourced from the considered tier (posterior/GOP-based).
- Tap a weak vowel: opens the **vowel-space view** — F1/F2 plane with the target vowel as an anchor and the user's attempts as points drifting toward/away; plain-language articulator hints per direction ("more open", "further back") from a static phonetics mapping.
- Tap a weak consonant: waveform+spectrogram zoom of the two versions, with a one-line articulation note from a curated phoneme-tips table (bundled content, not generated).
- Minimal-pair suggestions where relevant ("this vowel vs the one in 'ship'").

### 3.4 Timbre & voice quality (imitation targets; available everywhere)
- Brightness (spectral centroid/tilt) contours overlaid; energy envelope comparison.
- Utterance-level timbre similarity rendered as the two entities' *textures* side by side plus a small set of named qualities (brighter/darker, breathier/clearer, fuller/thinner) derived from interpretable spectral measures — never a raw embedding distance alone.
- "Placement trainer": live mini-mode where a single dot tracks the user's brightness against a target band while they sustain a vowel.

## 4. Playback comparison

- Three synchronized sources: target, user (raw), and **warped overlay** (user time-aligned onto target timing) — the overlay is the "hear the difference with rhythm removed" tool.
- Segment looping with slow-down (time-stretch, pitch-preserved) on any word/note/phoneme span.
- A/B flip with keyboard/tap during loop for rapid-fire comparison.

## 5. Practice loop features (post-MVP, in priority order)

1. **Weakest-segment suggestion** — the app picks the span with the largest persistent multi-dimension gap and offers "drill this."
2. **Segment-scoped Flow Mode** — perform just the drilled span; the merge payoff on a two-word span is reachable in seconds.
3. **Attempt history per target** — afterglow shelf with per-dimension trend sparks (the one place quiet numbers earn their keep).
4. **Curated target packs** — pronunciation sets (stress patterns, problem vowels by L1), song phrase packs, iconic-delivery packs.

## 6. Build order

1. Unfold transition + pitch lane + synchronized playback (this alone is a credible Learn Mode v0).
2. Timing lane from the alignment warp map.
3. Considered tier online: phoneme chips + vowel-space view.
4. Timbre lane + placement trainer.
5. Practice loop features.
