## Real-time pitch tracking & low-level audio feature extraction in the browser

### Candidates

| Name | Repo/URL | License | Platform | Maturity/maintenance | Real-time/browser feasibility | Notes |
|---|---|---|---|---|---|---|
| SwiftF0 | github.com/lars76/swift-f0 | MIT | Python + ONNX model (runs in browser via onnxruntime-web WASM) | New (paper Aug 2025, arXiv 2508.18440), ~170 stars, small repo | Yes — author's demo (swift-f0.github.io) runs fully client-side on WASM ONNX | 95,842 params (~0.4 MB ONNX). 16 kHz input, 256-sample hop = 16 ms → 62.5 Hz update rate. 91.8% harmonic-mean accuracy at 10 dB SNR (beats CREPE by ~12 pts), ~42x faster than CREPE on CPU; ~132 ms to process 5 s of audio on CPU. Range G1–C7 (46.9–2093 Hz) covers speech + singing. |
| PESTO | github.com/SonyCSLParis/pesto | **LGPL-3.0** (weak copyleft — murky when bundled into a JS app) | PyTorch; streaming mode + ONNX export | Active; TISMIR 2025 paper (arXiv 2508.01488); pip release v0.1.0 Oct 2023, repo active since | Feasible via ONNX export (repo notes ONNX >2x faster than TorchScript); no official web build | ~130k params, self-supervised, ~12x faster than real-time on laptop CPU at 10 ms hop. Good on music AND speech (MIR-1K, PTDB). License is the drawback vs SwiftF0. |
| CREPE (tf.js / ml5.js) | github.com/marl/crepe; ml5js | MIT (model + code) | tf.js browser demo (tiny model), Python full | Research code from 2018; ml5's pitchDetection is **broken/removed** (hosted model deleted; users reported non-functional in 2024; dropped from ml5 next-gen) | Marginal — browser demo uses a stripped model (<3% of params) with more octave errors; full model (22M params) too heavy for 50 Hz on mid-range laptop | Still the accuracy reference offline (torchcrepe for Python). For browser real-time in 2026 it is dominated by SwiftF0/PESTO. |
| pitchy | github.com/ianprime0509/pitchy | MIT | Pure JS (ESM), npm | v4.1.0, last publish ~Dec 2023/Jan 2024; stable but dormant | Excellent — MPM on a 2048-sample buffer costs ~1 ms; trivially hits 100 Hz | McLeod Pitch Method + clarity value (usable as confidence/voicing gate). DSP baseline, no model download. Weaker than neural trackers on breathy/noisy voice, octave errors on speech. |
| pitchfinder | github.com/peterkhayes/pitchfinder | **GPL-3** (npm license field: "GNU v3") | Pure JS, npm | ~504 stars, low activity | Fine performance (YIN, MPM, AMDF, DWT) | **Copyleft — skip for a commercial product.** pitchy covers the same ground under MIT. |
| aubio / aubiojs | github.com/aubio/aubio; github.com/qiuxiang/aubiojs | **GPL-3** (aubiojs repo says MIT, but it statically embeds GPL aubio in the WASM — effectively GPL) | C → WASM | aubio itself semi-dormant; aubiojs last release v0.2.1 Nov 2022 | Works (YIN/yinfft pitch, tempo) | License poison pill for commercial use; skip. |
| Essentia.js | github.com/MTG/essentia.js | **AGPL-3.0** | C++ → WASM, npm (~10 MB unpacked) | **Stale: last release 0.1.3 June 2021** | Real-time capable in principle, but WASM build is heavyweight | Huge algorithm set (incl. PitchYinProbabilistic = pYIN, PitchCREPE). AGPL + staleness → skip unless we negotiate MTG's commercial license. |
| Meyda | github.com/meyda/meyda | MIT | Pure JS/TS, npm | v5.6.3 (Apr 2024), 1.7k stars, maintained | Yes — extractors are pure functions on Float32Array, cheap at 50-100 Hz | RMS, energy, loudness (Bark bands), spectralCentroid/rolloff/flux/flatness/spread, MFCC, chroma, ZCR. Caveat: the convenience `createMeydaAnalyzer` still wraps deprecated ScriptProcessorNode (issue #286 open since 2019) — call `Meyda.extract()` on frames from our own AudioWorklet instead. |
| pitchlite | github.com/sevagh/pitchlite | MIT | C++ → WASM | Small side project (3 commits) of sevagh/pitch-detection (MIT, 650 stars, last release Dec 2023, has MPM/YIN/pYIN in C++) | Yes — designed for realtime WASM AudioWorklet loop (128-sample chunks → 4096 ring buffer) | Interesting pattern reference (parallel coarse+fine MPM), not a dependency to bet on. |
| pYIN (JS) | none credible | — | — | No maintained JS/WASM pYIN exists (only Essentia.js AGPL build and C++ sevagh/pitch-detection) | — | pYIN's value is Viterbi smoothing over pitch candidates; use Python (librosa.pyin, ISC-licensed) server-side. |
| AnalyserNode + autocorrelation | e.g. cwilso PitchDetect pattern (alexanderell.is/posts/tuner/) | n/a (public domain patterns) | Vanilla Web Audio | n/a | Works but AnalyserNode polls from the main thread (rAF-timed, jittery) and naive ACF is the least accurate option | Fine for a hack-day demo; not for a product whose core promise is feeling pitch convergence. |

### Key technical facts

- **Update rate is not the bottleneck; accuracy on voice is.** MPM/YIN in JS or WASM easily run at 100+ Hz. Neural trackers are what buy robustness on breathy/quiet/vibrato singing and on speech: SwiftF0 = 95,842 params, 62.5 Hz native frame rate, ~42x faster than CREPE on CPU, and its 91.8% accuracy at 10 dB SNR matters because users will sing into laptop mics in untreated rooms.
- SwiftF0's whole model is ~0.4 MB — smaller than most webfonts — and already proven in-browser via WASM ONNX (the author's own client-side demo at swift-f0.github.io). WebGPU EP unnecessary at this size; single-threaded WASM should evaluate one 16 ms frame in well under 1 ms on a mid-range laptop.
- CREPE-tiny in tf.js (the only browser CREPE) is known to make more octave errors than full CREPE, and the ml5.js wrapper is dead (hosted model deleted; multiple 2024 issue reports). Full CREPE (22M params) can't hold 50 Hz on mid-range laptop CPU.
- License minefield: pitchfinder = GPL-3, aubio/aubiojs = GPL-3 (the wrapper's MIT file doesn't relicense the embedded WASM), Essentia.js = AGPL-3 and last released June 2021, PESTO = LGPL-3. Clean MIT options: SwiftF0, pitchy, Meyda, sevagh/pitch-detection, CREPE.
- Meyda (MIT, v5.6.3 Apr 2024) computes everything Flow Mode's visualization needs per frame — RMS/loudness, spectral centroid/rolloff/flux/flatness, MFCC-13 — as pure functions on Float32Array; do NOT use `createMeydaAnalyzer` (ScriptProcessorNode-based, deprecated path), feed frames from our own AudioWorklet.
- **Capture:** request `{echoCancellation:false, noiseSuppression:false, autoGainControl:false, channelCount:1}` for singing — AEC/NS are tuned for speech and mangle sustained sung notes; AGC destroys the dynamics/energy signal we want to visualize. Known Chrome quirk: AGC can't always be disabled independently — setting `echoCancellation:false` is what reliably disables the whole WebRTC processing chain (addpipe constraints writeup; Chromium issue 327472528). Safari has historically ignored some of these constraints — read back `track.getSettings()` and adapt.
- **The echo problem is real and has no good in-browser fix:** WebRTC AEC treats the karaoke backing/target playback as "far-end" signal and cancels it, but it also gates/ducks the user's voice while music plays and distorts sustained tones — with AEC on, pitch tracking during playback is unreliable; with AEC off on speakers, the target vocal leaks into the mic and the tracker locks onto the target instead of the user. Conclusion: **headphones-recommended UX is the correct design**, with AEC off. Fallbacks for speaker users: (a) run a headphone check (play a chirp, detect leakage), (b) attenuate target playback and rely on the target's precomputed F0 to subtract/ignore matching frames, (c) degrade gracefully to turn-based (listen, then sing) instead of simultaneous.
- **Latency:** AudioWorklet processes 128-sample quanta (2.7 ms @ 48 kHz) on the audio thread with no main-thread hop; ScriptProcessorNode is deprecated and adds main-thread jank. Achievable mic→analysis latency: ~10-20 ms input path (OS/hardware buffer ~10 ms on Chrome/Windows + one quantum), plus analysis window centering (a 32-64 ms window adds ~16-32 ms effective lag). Chrome full round-trip (mic→speaker) measures 10-30 ms with `latencyHint:'interactive'`. Post pitch/feature messages from the worklet via a SharedArrayBuffer ring or `port.postMessage` per hop; drive visuals by sampling the latest value each rAF.
- Practical frame pipeline: worklet accumulates 128-sample quanta into a ring; every 10 ms hop, emit (a) a 16 kHz-resampled 1024-sample window to the SwiftF0 ONNX session (in a Worker, not the worklet), (b) Meyda features computed on the 48 kHz frame. 100 Hz features + 62.5 Hz pitch comfortably feed a 60 fps renderer.

### Recommendation

- **Browser MVP pitch tracker: SwiftF0 via onnxruntime-web (WASM), with pitchy (MPM) as the zero-download instant fallback and as a cross-check/voicing gate.** SwiftF0 is MIT, ~0.4 MB, natively 62.5 Hz, robust on both speech and singing in noise, and already demonstrated client-side. Run it in a Web Worker fed by an AudioWorklet ring buffer; keep pitchy in the worklet for first-paint responsiveness while the ONNX session warms up. Apply light median + Viterbi-ish smoothing on the F0 stream for the visualization.
- **Browser feature extraction: Meyda** (MIT, maintained) — RMS/loudness, spectral centroid/rolloff/flux, MFCC per 10 ms hop, called as pure functions from our own worklet/worker pipeline, never via `createMeydaAnalyzer`. This covers the energy/brightness/noisiness axes that drive Flow Mode particles; no WASM needed.
- **Server-side Learn Mode (offline, target preprocessing + post-take analysis):** Python — `librosa.pyin` (ISC) or torchcrepe/CREPE-full (MIT) for reference-grade F0 on both the target clip and the user take; this is also where forced alignment and timbre embeddings live. Precompute the target's F0/feature tracks once so the client only tracks the live user.
- **Skip:** Essentia.js (AGPL + last release June 2021), aubio/aubiojs and pitchfinder (GPL, stale), ml5.js pitch detection (dead), CREPE-in-tf.js (heavy or inaccurate-tiny, dominated by SwiftF0), AnalyserNode autocorrelation (main-thread jitter, worst accuracy). Hold PESTO in reserve — technically excellent and fastest-moving research option, but LGPL-3 bundling ambiguity in a web app makes SwiftF0 the safer bet at equal capability.
- **Capture posture:** all three processing constraints OFF, mono, 48 kHz, AudioWorklet capture, `latencyHint:'interactive'`, verify with `getSettings()`; headphones-recommended onboarding with a leakage check, and a turn-based fallback mode for speaker users.

### Sources

- https://github.com/lars76/swift-f0
- https://swift-f0.github.io/ (official client-side WASM demo)
- https://arxiv.org/abs/2508.18440 (SwiftF0 paper)
- https://github.com/SonyCSLParis/pesto and https://arxiv.org/abs/2508.01488
- https://github.com/marl/crepe and https://marl.github.io/crepe/
- https://github.com/ml5js/ml5-library/issues/1489 (ml5 pitch detection broken)
- https://github.com/ianprime0509/pitchy and https://registry.npmjs.org/pitchy/latest
- https://registry.npmjs.org/pitchfinder/latest (license "GNU v3")
- https://github.com/qiuxiang/aubiojs and https://aubio.org/
- https://github.com/MTG/essentia.js (+ /releases) and https://registry.npmjs.org/essentia.js
- https://essentia.upf.edu/licensing_information.html
- https://github.com/meyda/meyda and https://github.com/meyda/meyda/issues/286
- https://github.com/sevagh/pitch-detection and https://github.com/sevagh/pitchlite
- https://blog.addpipe.com/getusermedia-audio-constraints/
- https://issues.chromium.org/issues/327472528 (Chrome AGC/NS constraint limitations)
- https://developer.chrome.com/blog/audio-worklet
- https://github.com/WebAudio/web-audio-api/issues/2632 and /issues/1503
- https://mictestpro.com/audio-latency-tester/ (round-trip latency figures)
- https://bssaudio.com/en/site_elements/acoustic-echo-cancellation (AEC cancels near-end music)
- https://alexanderell.is/posts/tuner/ (AnalyserNode autocorrelation pattern)

### Fact-check notes

Verified against primary sources (GitHub repos, npm registry, arXiv) on 2026-07-12:

**Corrections made:**
1. **SwiftF0 demo URL**: the report cited "pitch-detector.com" as the author's client-side demo. Neither the repo README nor the paper mentions that domain; both the repo and arXiv 2508.18440 point to **https://swift-f0.github.io/** as the official demo ("runs entirely client-side using WebAssembly and ONNX"). Corrected in the Candidates table and Key technical facts, and added to Sources. The load-bearing claim (client-side WASM browser demo exists) stands.
2. **pitchy publish date**: npm registry timestamp for v4.1.0 is late Dec 2023/early Jan 2024, not "~2023" generically. Minor precision fix in the table.

**Verified, no change needed:**
- SwiftF0: repo exists, MIT, 95,842 params, 16 kHz input, 256-sample hop, G1–C7 (46.875–2093.75 Hz), ~132 ms per 5 s audio on CPU, ~170 stars (repo); 91.80% HM at 10 dB SNR (beats CREPE by >12 pts), ~42x faster than CREPE on CPU (arXiv 2508.18440).
- PESTO: LGPL-3.0 confirmed on repo; streaming mode (`streaming=True`) and ONNX export confirmed (repo states ONNX >2x faster than TorchScript); pip release v0.1.0 Oct 17, 2023; papers arXiv 2309.02265 (v1) and 2508.01488 (v2) confirmed.
- pitchy: MIT, v4.1.0 latest on npm.
- pitchfinder: npm license field literally "GNU v3", v2.3.4 — GPL-3 characterization correct.
- aubiojs: repo states MIT, last release v0.2.1 Nov 8, 2022, wraps GPL aubio via emscripten — report's "effectively GPL" analysis is consistent with the facts.
- Essentia.js: AGPL-3.0, latest npm release 0.1.3 published June 24, 2021 — staleness claim exact.
- Meyda: MIT, v5.6.3 published April 2024; issue #286 (ScriptProcessorNode → AudioWorklet migration) opened Feb 2019 and still open, maintainer suggests using pure extractor functions in custom worklets — matches the report's guidance.
- ml5 pitch detection: issue #1489 (July 2024) confirms hosted model deleted and projects broken.
- pitchlite: exists, MIT, 3 commits, WASM/AudioWorklet with 128-sample chunks into a 4096-sample ring buffer, MPM — all as stated.

**Spot-checked as plausible but not independently re-derived:** sevagh/pitch-detection star count/Dec 2023 release, CREPE param count (22M, corroborated by SwiftF0 paper coverage), PESTO ~130k params (repo says CREPE has ~800x more params, consistent order of magnitude), AudioWorklet quantum/latency arithmetic (standard Web Audio facts), Chromium issue 327472528 (cited but not fetched; the AGC/AEC coupling quirk is widely reported).
