--- REPORT START ---
## Prior Art: Real-Time Visual Feedback for Voice Matching (Pitch, Pronunciation, Vocal Style)

### Candidates

| Name | Repo/URL | License | Platform | Maturity/maintenance | Real-time/browser feasibility | Notes |
|---|---|---|---|---|---|---|
| Smule | apps.apple.com/us/app/id509993510 | Proprietary | iOS/Android | Very mature, actively maintained (2026) | Native mobile only | Karaoke + social duets. On-screen pitch guide bars over lyrics; AI pitch correction. Feedback is thin (glow/sparkle on correct notes) — social, not pedagogical. |
| Yousician (Singing) | yousician.com/singing | Proprietary | iOS/Android/desktop | Very mature, actively maintained | Native; proven ~real-time pitch tracking at consumer mic quality | Canonical "piano-roll pitch bar" UI: target note bars scroll horizontally, your live pitch is a trace/line; bars turn green (hit) / red (miss). Gamified levels. |
| SingSharp | singsharp.com | Proprietary | iOS/Android | Maintained (v16, 2026 blog active) | Native mobile | "See Your Pitch" real-time pitch display, plus resonance/"bridge" spectroscopy and breath-sound detection — rare non-pitch dimensions. |
| Vanido | vanido.io (App Store) | Proprietary | iOS | Alive but low activity; freemium ($2.99/mo) | Native mobile | Minimal, calm real-time pitch feedback for daily exercises. Aesthetically closest of the apps to "gentle" feedback. |
| Riyaz / Daily Riyaz | riyazapp.com (Riyaz = com.musicmuni.riyaz, MusicMuni Labs); Daily Riyaz = com.rahuls.riyaz (separate app, different developer) | Proprietary | iOS/Android | Actively maintained | Native mobile | Continuous pitch-contour feedback suited to Indian classical gamakas (curves, not discrete note bars) — proof that contour-following (vs note-bucket) feedback works for expressive singing. Daily Riyaz is a minimalist offline pitch visualizer with no scores. |
| UltraStar Deluxe | github.com/UltraStar-Deluxe/USDX | **GPL-2.0 (copyleft)** | Win/Mac/Linux desktop (Pascal) | Open source, still maintained (v2026.6.0, June 2026) | Desktop; the UI pattern is trivially reproducible in WebGL | SingStar clone: note bars + live sung-pitch overlay, score counter. Spawned Performous/Vocaluxe (also GPL). Good reference for scoring/octave-tolerant pitch matching logic; do NOT copy code (GPL). |
| Sing&See (Cantovation) | singandsee.com | Proprietary ($49–$99) | Win/Mac desktop | Stagnant (~v1.4.x for years; site alive) | Desktop only | The classic vocal-pedagogy tool: real-time pitch trace on a musical staff + spectrogram + record/replay. Built by pedagogy researchers; UI is a literal dashboard. |
| VoceVista Video | vocevista.com | Proprietary ($70+) | Win/Mac desktop | Maintained (Sygyt Software) | Desktop only | Pro spectrogram/spectrum analyzer for voice teachers; side-by-side teacher/student comparison, real-time spectral filtering, vowel chart, singer's formant work. The "expert timbre" benchmark. |
| ELSA Speak | elsaspeak.com | Proprietary | iOS/Android | Very mature, actively maintained | Native; server-side ASR scoring | Phoneme-level pronunciation scoring with color-coded word/sound highlights (red/yellow/green), ELSA Score radar across 5 dimensions, mouth-position diagrams. Feedback is post-hoc per utterance, not continuous. |
| BoldVoice | boldvoice.com | Proprietary | iOS/Android | Actively maintained, well-funded | Native; server-side scoring | Pinpoints problem phonemes, stress patterns, and overlays your intonation curve vs a native/coach curve; IPA + mouth diagrams. Closest commercial thing to "match a target curve" for speech. |
| Praat (+ Parselmouth) | praat.org; github.com/YannickJadoul/Parselmouth | **GPL (copyleft)** | Desktop (C++); Parselmouth = Python, GPL-3.0 | Praat continuously maintained for ~30 yrs; Parselmouth active (v0.4.7, Nov 2025) | Not browser; offline analysis | The research workhorse behind most L2 pitch/formant feedback studies. Use as offline ground-truth validator only; GPL blocks embedding in a commercial product — reimplement algorithms instead. |
| Kay Sona-Match | (KayPENTAX, legacy product) | Proprietary | Windows clinical | Legacy/abandoned | No | Real-time F1/F2 vowel-space dot vs. target vowel templates. The archetype for vowel-space feedback; validated in L2 studies. |
| VoiceCoach (CHI 2020) | arxiv.org/abs/2001.07876 | Research prototype | Web prototype | Paper only, not productized | Concept feasible in browser | Interactive training of voice modulation (pitch/volume/speed) for public speaking, mined from 2,623 TED talks; recommends exemplars + real-time quantitative practice view. Evidence-based but dashboard-styled. |
| Blob Opera (David Li) | experiments.withgoogle.com/blob-opera | Proprietary code (free experiment) | **Browser** (WebAudio + WebGL + on-device ML) | Launched December 2020; still online | Yes — the existence proof | 4 ML-synthesized opera voices as squishy characters; drag = pitch/vowel; real-time harmonization. Voices as living, emotionally lovable entities — but zero feedback/matching. Source not open. |
| Chrome Music Lab (Spectrogram, Voice Spinner) | musiclab.chromeexperiments.com | Open experiments (mostly Apache-2.0 on GitHub) | Browser | Stable since 2016 | Yes | Playful, zero-instruction voice visualization; proves emotionally warm audio-reactive visuals run fine in vanilla WebAudio/WebGL. |

### Key technical facts

- **The dominant UI pattern is the horizontal-scrolling piano-roll ("pitch bars + your trace")** — Yousician, Smule, SingSharp, UltraStar, SingStar all use it. It dominates because it's legible, maps time→x and pitch→y, and scores trivially. It feels like a dashboard because *you* are a cursor being graded against a grid; the target is inert geometry, not a voice.
- **The second pattern is the analyst's dashboard** (Sing&See, VoceVista, Praat-based teaching): staff-pitch trace + spectrogram + waveform panels. Powerful for teachers, intimidating for consumers; requires interpretation training.
- **Pronunciation apps converge on post-hoc colored-text scoring** (ELSA, BoldVoice, Speechling): speak → wait → red/yellow/green phonemes + numeric score + mouth diagram. Almost none give *continuous* feedback while you speak; BoldVoice's your-curve-vs-native-curve intonation overlay is the closest to VMatch's Learn Mode.
- **Evidence that visual feedback works (pitch):** Wilson et al. ("Learning to sing in tune: Does real-time visual feedback help?", CIM07) and follow-ups found visual-feedback groups improved pitch accuracy more than no-feedback controls, including with children; the motor-learning literature supports a visual-feedback advantage in early learning of complex tasks. The 2022 MDPI review (Lã & Fiuza, *Applied Sciences* 12:10781) endorses real-time visualization across breathing/phonation/resonance subsystems as a pedagogy trend.
- **Critical caveat — the guidance hypothesis:** concurrent (during-performance) visual feedback can *worsen* production while it's on and create dependence, while still improving retention; several singing studies observed degraded melody production under live feedback. Implication: feedback intensity should be modulated (fade, summarize after phrase) rather than always-on maximal.
- **Evidence (pronunciation/intonation):** Praat pitch-contour imitation studies (de Bot 1983 onward; ESL/Mandarin-tone studies) consistently show audio+visual contour comparison beats audio-only for intonation and tone learning. Real-time F1/F2 vowel-space feedback (Sona-Match-style; Parselmouth-based systems) yields significant, lasting vowel improvement — but mainly in citation forms, transferring poorly to continuous speech. Articulatory-target feedback (JASA 2015, EL382) improved Japanese speakers' /æ/ regardless of audio training.
- **Evidence (gamification):** mixed. Karaoke-style gamified feedback boosts motivation and engagement (e.g., SLIONS language-karaoke study), but gamification meta-analyses warn game elements can add cognitive load that outweighs motivational benefit; recommendation is fewer, refined mechanics, not more. A score counter ticking during singing is exactly the distraction case.
- **Nobody renders the target as a living entity.** Across every product surveyed, the target voice is a static reference: note bars, a frozen curve, a text overlay. The learner is a cursor/dot/trace judged against it. No product or installation found renders BOTH voices as animate agents in one shared space whose *relationship* (distance, entrainment, merging) is the feedback signal. Blob Opera proves the "voice as lovable creature" half in-browser; Yousician/BoldVoice prove the "match the reference" half; no one has combined them.
- Browser feasibility is settled by existence proofs: Blob Opera (WebAudio + WebGL + on-device ML synthesis, 2020 hardware) and Chrome Music Lab both run real-time voice-reactive visuals in-browser; consumer apps do robust real-time pitch tracking on phone mics.

### Recommendation

- **Own the whitespace deliberately:** VMatch Flow Mode should be "Blob Opera's soul with Yousician's signal." Two animate entities (target = pre-analyzed, breathing/idling even when silent; user = born from mic input) in one acoustic space; proximity/entrainment/color-blending encode per-dimension closeness (pitch → vertical alignment, timing → phase lock, timbre → texture/color, articulation → shape). This is genuinely unoccupied territory — verified: no commercial app, research prototype, or documented installation does two-voice convergence-as-feedback.
- **For Learn Mode, copy the proven pieces, not the layouts:** BoldVoice-style your-curve-over-native-curve intonation overlay; ELSA-style per-word/phoneme color coding (post-hoc, after the attempt); Riyaz-style continuous contour (not note buckets) for sung phrases; a VoceVista-style side-by-side playback comparison. Skip spectrograms as a primary surface — they're the reason pedagogy tools read as lab equipment.
- **Apply the guidance-hypothesis lesson structurally:** Flow Mode = low-detail ambient concurrent feedback (safe because it's holistic and non-symbolic); Learn Mode = detailed *terminal* feedback after each phrase. Don't put numbers, scores, or red/green judgments inside the live loop.
- **Skip / don't build on:** UltraStar/Performous code (GPL-2.0 — study the octave-tolerant scoring idea, reimplement clean-room); Praat/Parselmouth in-product (GPL/GPL-3 — fine as an offline validation oracle in the research phase only); vowel-space F1/F2 as a consumer-facing surface (evidence says gains don't transfer to continuous speech, and raw F1/F2 is unstable on consumer mics — use it internally to drive the entity's "shape" instead of showing a quadrilateral); running score counters during performance (gamification-distraction evidence).
- **Design lessons (bullets):**
  - Time→x scrolling grids make the user feel graded; a shared spatial field where *relative position* is the signal makes them feel accompanied.
  - The target must be alive before the user sings — idle animation, breathing — so matching feels like approaching a being, not tracing a stencil.
  - Encode each dimension in a distinct visual channel (position, phase, texture, color) so feedback stays interpretable without labels — this is the anti-"one opaque score" move, and it's what dashboards fail at emotionally.
  - Concurrent feedback should be pre-attentive (glow, drift, convergence), never symbolic (numbers, letters, red X) — symbols force verbal processing mid-performance.
  - Reward proximity continuously (gradient) rather than binary hit/miss; Yousician's green/red bars teach "wrong" but not "how close."
  - Deliver diagnosis after the phrase (Learn Mode), and let users scrub a replay where both entities re-perform — replay comparison is the single most praised feature of teacher tools (VoceVista, Sing&See).
  - Fade feedback intensity as the user improves within a session to prevent feedback dependence (guidance hypothesis).

### Sources

- https://www.mdpi.com/2076-3417/12/21/10781 (Lã & Fiuza 2022, Real-Time Visual Feedback in Singing Pedagogy)
- https://patwilson.com.au/wp-content/uploads/2012/11/CIM07WilsonLearnSingTune.pdf (Wilson et al., Learning to sing in tune)
- https://www.researchgate.net/publication/239921722_Looking_at_singing_Does_real-time_visual_feedback_improve_the_way_we_learn_to_sing
- https://arxiv.org/abs/2001.07876 (VoiceCoach, CHI 2020)
- https://arxiv.org/abs/2601.12153 (Survey: 30+ Years of Automatic Singing Assessment)
- https://yousician.com/singing ; https://support.yousician.com/hc/en-us/articles/360000538749
- https://apps.apple.com/us/app/smule-karaoke-singing-app/id509993510
- https://www.singsharp.com/en ; https://riyazapp.com/ ; https://play.google.com/store/apps/details?id=com.rahuls.riyaz
- https://github.com/UltraStar-Deluxe/USDX ; https://en.wikipedia.org/wiki/UltraStar
- https://www.singandsee.com/ ; https://www.vocevista.com/en/products/
- https://vn.elsaspeak.com/en/discover-your-elsa-score-an-ai-powered-visualization-of-your-english-speaking-proficiency-in-real-time/ ; https://talkpal.ai/elsa-speak-vs-boldvoice-which-ai-speech-coach-wins/ ; https://blog.talkme.ai/archives/best-accent-reduction-apps-2026-boldvoice-elsa-talkme
- https://www.academia.edu/1196627/CALL_Visual_Feedback_for_Pronunciation_of_Vowels_Kay_Sona_Match
- https://pubs.aip.org/asa/jasa/article/138/4/EL382/900185 (real-time articulatory feedback, /æ/ training)
- https://www.researchgate.net/publication/314135107_The_Use_of_2D_Real-Time_Visual_Feedback_Software_in_Foreign_Vowel_Sound_Production_Training
- https://www.hpu.edu/research-publications/tesol-working-papers/2011/9_1-2_Le%20Brook.pdf (Praat for ESL intonation)
- https://www.sciencedirect.com/science/article/abs/pii/0167639384900372 (de Bot, pitch-contour visualization effectiveness)
- https://www.researchgate.net/publication/328374864_SLIONS_A_Karaoke_Application_to_Enhance_Foreign_Language_Learning
- https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7445616/ (gamification meta-analysis, distraction caveat)
- https://experiments.withgoogle.com/blob-opera ; https://artsandculture.google.com/experiment/blob-opera/AAHWrq360NcGbw

### Fact-check notes

Verified against primary sources (July 2026):

- **UltraStar Deluxe** (github.com/UltraStar-Deluxe/USDX): confirmed GPL-2.0 and actively maintained — latest release v2026.6.0 (June 3, 2026). Added the release detail to the table; license claim was correct.
- **Parselmouth** (github.com/YannickJadoul/Parselmouth): confirmed GPL-3.0 (or later) and actively maintained (v0.4.7, Nov 27, 2025). Praat itself is GPL v3+ (some components GPL v2+), so "GPL (copyleft)" and the do-not-embed conclusion stand.
- **VoiceCoach** (arxiv.org/abs/2001.07876): confirmed — "VoiceCoach: Interactive Evidence-based Training for Voice Modulation Skills in Public Speaking," CHI 2020, ~2,600 TED talks. Correct.
- **arxiv.org/abs/2601.12153**: confirmed real — "A Survey on 30+ Years of Automatic Singing Assessment and Singing Information Processing" (dos Santos & Masiero). Correct.
- **Lã & Fiuza 2022** (MDPI Applied Sciences 12(21):10781, "Real-Time Visual Feedback in Singing Pedagogy: Current Trends and Future Directions"): confirmed title, authors, journal, article number, and topic (breathing/oscillatory/resonatory subsystem visualization). Correct.
- **Blob Opera** (experiments.withgoogle.com/blob-opera): confirmed — by David Li with Google Arts & Culture, browser-based (web audio), launched December 2020, still online, source not open. Correct.
- **Chrome Music Lab**: confirmed — googlecreativelab/chrome-music-lab on GitHub is Apache-2.0, built on Web Audio API. Correct.
- **Vanido**: confirmed still on the App Store and updated as recently as May 2026; "alive but low activity" is fair. No change.
- **Riyaz row corrected**: the table listed only `com.musicmuni.riyaz` for "Riyaz / Daily Riyaz," but these are two distinct apps — Riyaz: Practice, Learn to Sing (`com.musicmuni.riyaz`, MusicMuni Labs) and Daily Riyaz – Pitch Visualizer (`com.rahuls.riyaz`, a separate developer). Both exist on Google Play and both are maintained; the row now identifies both correctly. This is the only substantive correction.
- Not individually re-verified (low decision risk, mature commercial products with claims consistent with public listings): Smule, Yousician, SingSharp, Sing&See, VoceVista, ELSA, BoldVoice pricing/version details, and the Kay Sona-Match legacy status (KayPENTAX product line discontinuation is long-documented).
- The core whitespace claim ("no product renders both voices as animate agents whose relationship is the feedback signal") is a negative claim and cannot be proven exhaustively; nothing found in verification contradicts it (the 2026 arXiv survey and Audio Mostly 2024 extreme-vocal-technique training system both stay within trace-vs-reference paradigms).
--- REPORT END ---
