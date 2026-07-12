--- REPORT START ---
## Real-Time Sequence Alignment (DTW / OLTW) for VMatch

### Candidates

| Name | Repo/URL | License | Platform | Maturity/maintenance | Real-time/browser feasibility | Notes |
|---|---|---|---|---|---|---|
| **matchmaker (pymatchmaker)** | github.com/pymatchmaker/matchmaker | Apache-2.0 | Python 3.10–3.13 | Active: v0.3.0 May 2026, 363 commits, ISMIR 2025 paper | Real-time yes (server-side); not browser | OLTW-Dixon, OLTW-Arzt, HMM, Kalman score followers; chroma/MFCC/CQT/mel features; live mic input; the reference for online alignment |
| **librosa.sequence.dtw** | librosa.org/doc/main/generated/librosa.sequence.dtw.html | ISC | Python (v0.11.0, Mar 2025) | Active, canonical MIR lib | Offline only | `subseq=True` gives subsequence DTW (align a short user attempt inside a longer target); custom step sizes, weights, global band |
| **synctoolbox** | github.com/meinardmueller/synctoolbox | MIT (code) | Python | Active: v1.4.2 May 2026 | Offline only | MrMsDTW: memory-restricted multiscale DTW, high-resolution sync — the SOTA offline music-alignment pipeline (Müller group) |
| **dtaidistance** | github.com/wannesm/dtaidistance | Apache-2.0 | Python + C core | Active: v2.4.0 Feb 2026 | Offline; fast C | Fast exact DTW in C, warping paths, subsequence alignment module, Sakoe-Chiba bands |
| **dtw-python** | github.com/DynamicTimeWarping/dtw-python | **GPL-3 (copyleft — avoid)** | Python | Active: v1.7.5 Jun 2026 | Offline | Most complete step-pattern zoo, but GPL-3 contaminates a commercial product |
| **fastdtw** | pypi.org/project/fastdtw | MIT | Python | **Abandoned** (v0.3.4, Oct 2019) | — | Wu & Keogh (TKDE/ICDE 2021): FastDTW is approximate AND generally *slower* than well-implemented exact DTW. Skip |
| **dynamic-time-warping (npm)** | github.com/GordonLesti/dynamic-time-warping | MIT | JS | **Abandoned** (v1.0.0, Jul 2016, single release) | Trivially runs, but naive O(N²), no bands, no subsequence | Forks (`dynamic-time-warping-2`, `-ts`, `dtw` npm v0.0.3 2014) equally stale. JS DTW ecosystem is abandonware |
| **web-score-following (ConcertCue)** | github.com/matthewcaren/web-score-following | MIT | TypeScript/React front end + Pyodide (WASM Python) DSP, browser | Small (9 stars, 22 commits, updated Mar 2025); MIT Music Tech Lab, WAC 2024 paper | **Yes — proof that OTW runs live in-browser** | Real-time in-browser score following: React/JS handles audio input and UI, while the feature extraction and online time warping run as Python via Pyodide/WebAssembly — proves in-browser OTW feasibility, but is *not* a native TS implementation of the algorithm |
| **MATCH (Dixon's original OLTW)** | code.soundsoftware.ac.uk/projects/match | GPL (QMUL research code) | Java/Vamp | Legacy | No | Historical reference only; the paper matters, not this code |
| **Antescofo** | IRCAM | Proprietary | Max/PD | Commercial | No | Not open source — rule out |

### Key technical facts

- **(a) Real-time "where is the user in the target timeline":** the solved problem shape is *score following* via **OLTW** (Dixon 2005) and the **Arzt variant**. Algorithm: keep a 2-column rolling DP cost matrix over a bounded search window (matchmaker defaults: window ≈ 10 frames of the reference around the current position, max reference advance 3 frames per input frame, Manhattan or cosine local distance on feature vectors), and each incoming frame advances `current_index` by argmin over diagonal/vertical/horizontal moves with normalized cost. O(window) work per frame, constant memory.
- Measured per-frame compute (matchmaker, ISMIR 2025, 44.1 kHz, 30 fps frames): **OLTW-Arzt 0.07 ms/frame, OLTW-Dixon 1.22 ms/frame, HMM 3.59 ms/frame**. Feature extraction dominates: log-spectral energy 0.91 ms, chroma 3.05 ms, mel 3.40 ms, **CQT 42.6 ms (too slow for RT)**. At our 50–100 Hz frame cadence this is trivially real-time even in JS.
- Accuracy ceiling (piano, nASAP dataset, chroma + OLTW-Arzt): 58% of frames within 100 ms, 92% within 1 s, median error ~91 ms. For VMatch's "how far off are you" signal that's fine — sub-100 ms tracking is display-quality, not judgment-quality; use the *offset between user position and real-time clock* plus per-dimension deltas at the aligned position.
- For our use, the feature vector per frame should be **pitch (f0 in cents, voiced flag) + a compact timbre/spectral vector (chroma or 13 MFCCs) + log energy**; pitch alone fails on unpitched consonants, spectral features alone drift on sustained vowels. Matchmaker validates chroma as the accuracy/speed sweet spot.
- **Deviation readout:** OLTW gives you `(user_frame → target_frame)` continuously; "how far off" = `target_time(aligned) − target_time(expected_at_wallclock)` (ahead/behind), plus local path slope (rushing/dragging rate). This is exactly the interpretable per-dimension signal the product wants.
- **(b) Offline (Learn Mode):** exact DTW on a 15–30 s clip at 100 Hz is a ~3000×3000 matrix — milliseconds in C (dtaidistance) and <1 s even in plain JS with Float32Array + Sakoe-Chiba band; FastDTW-style approximation is pointless at this scale (and empirically slower). librosa's `dtw(subseq=True)` handles the common failure mode where the user starts late/stops early. synctoolbox's MrMsDTW is the upgrade path if we later align whole songs (minutes) at high resolution.
- **Licenses:** dtw-python is **GPL-3** — do not link it into a commercial product. Everything else recommended is MIT/ISC/Apache-2.0.
- **(c) Build vs wrap for the browser:** there is nothing maintained to wrap in JS. Matchmaker's full OLTW-Arzt is ~380 lines of Python including three classes; the core online DP loop is ~120–200 lines. A TypeScript port running inside (or beside) the AudioWorklet is **1–2 days of work including tests**, using matchmaker (Apache-2.0) as the algorithmic reference and web-score-following (MIT) as the in-browser existence proof (it runs the OTW as WASM Python via Pyodide, so a native TS port is still ours to write). Offline DTW with band + backtracking is another ~150 lines of TS, or run it in Python server-side.

### Recommendation

- **Browser MVP (Flow Mode): implement OLTW-Arzt ourselves in TypeScript.** ~200 LOC core, Float32Array 2-column DP, window ~3–5 s of target frames, features = f0 + 12-d chroma or MFCC + energy at 50–100 Hz. Port from matchmaker's `oltw_arzt.py` (Apache-2.0, cite it). Wrapping is not an option — every npm DTW package is dead (2014–2016) and none are online/streaming anyway. Do NOT run WASM-compiled Python à la ConcertCue; the algorithm is too small to justify it.
- **Learn Mode post-attempt: exact banded DTW.** In-browser for short clips: the same TS codebase, offline variant with full path backtracking (gives per-word/per-syllable time mapping directly). Server-side Python analysis pipeline: **librosa.sequence.dtw with `subseq=True`** (ISC) as primary, **dtaidistance** (Apache-2.0) if we need C-speed batch processing, **synctoolbox MrMsDTW** if clips grow past ~1 minute.
- **Precompute for each target clip:** feature matrix + (if lyrics known) forced-alignment anchors, so both online and offline alignment consume the same cached target features.
- **Skip:** fastdtw (abandoned, discredited), dtw-python (GPL-3), npm `dynamic-time-warping` and forks (abandonware), MATCH Java code (GPL, legacy), Antescofo (proprietary). Keep **matchmaker** server-side only if we later want an HMM/Kalman follower for robustness experiments — its Apache-2.0 license permits that.

### Sources

- https://github.com/pymatchmaker/matchmaker
- https://arxiv.org/html/2510.10087v1 (Matchmaker, ISMIR 2025 — latency/accuracy tables)
- https://pypi.org/project/pymatchmaker/ (v0.3.0, 2026-05-25, Apache-2.0)
- https://raw.githubusercontent.com/pymatchmaker/matchmaker/main/matchmaker/dp/oltw_arzt.py
- https://www.ijcai.org/Proceedings/05/Papers/post-0005.pdf (Dixon 2005, OLTW)
- http://www.eecs.qmul.ac.uk/~simond/match/index.html (MATCH)
- https://www.mit.edu/~mcaren/papers/Online_Score_Following___WAC_2024.pdf (in-browser OTW via Pyodide, WAC 2024)
- https://github.com/matthewcaren/web-score-following (MIT, TypeScript + Pyodide)
- https://librosa.org/doc/main/generated/librosa.sequence.dtw.html (subseq mode); librosa 0.11.0 ISC via PyPI
- https://github.com/wannesm/dtaidistance + PyPI (Apache-2.0, v2.4.0 2026-02-12)
- https://github.com/DynamicTimeWarping/dtw-python (GPL-3, v1.7.5 2026-06)
- https://github.com/meinardmueller/synctoolbox (MIT, v1.4.2 2026-05-20, MrMsDTW)
- https://wu.renjie.im/research/fastdtw-is-slow/ + https://arxiv.org/pdf/2003.11246 (FastDTW critique); fastdtw PyPI (v0.3.4, 2019-10-07)
- npm registry metadata: dynamic-time-warping (v1.0.0, 2016, MIT), dtw (v0.0.3, 2014, MIT)
- https://github.com/topics/score-following

### Fact-check notes

Verified against primary sources (July 2026):

- **matchmaker**: repo exists at github.com/pymatchmaker/matchmaker; Apache-2.0; v0.3.0 released 2026-05-25; 363 commits; Python 3.10–3.13; implements OLTW ("dixon", "arzt") and HMM variants. All confirmed.
- **Matchmaker ISMIR 2025 paper** (arxiv 2510.10087): venue confirmed (accepted to ISMIR 2025). Per-frame numbers confirmed exactly (Table 4): OLTW-Arzt 0.07 ms, OLTW-Dixon 1.22 ms, HMM 3.59 ms; LSE 0.91 ms, chroma 3.05 ms, mel 3.40 ms, CQT 42.58 ms; 44.1 kHz / 30 fps. nASAP chroma+OLTW-Arzt accuracy confirmed: 58.3% within 100 ms, 92.0% within 1 s, median absolute error 91.18 ms.
- **librosa**: v0.11.0 (2025-03-11), ISC license — confirmed via PyPI.
- **synctoolbox**: MIT (code; bundled data has separate terms), v1.4.2 (2026-05-20), implements MrMsDTW — confirmed.
- **dtaidistance**: Apache-2.0, v2.4.0 (2026-02-12) — confirmed via PyPI.
- **dtw-python**: GPL-3.0, v1.7.5 (2026-06-12), actively maintained — confirmed. GPL warning stands.
- **fastdtw**: MIT, v0.3.4 (2019-10-07), no releases since — abandoned claim confirmed.
- **npm dynamic-time-warping**: v1.0.0 published 2016-07-21, MIT, single release — abandoned claim confirmed via npm registry.
- **web-score-following / ConcertCue**: repo exists, MIT, 9 stars, 22 commits, TypeScript-majority (80%, plus 14.7% Python) — confirmed. **Correction made**: the original report described it as "React + WebAudio AnalyserNode" TypeScript score following. Per the repo README and the WAC 2024 paper, the architecture is a JS/React component for audio input/UI plus a **Pyodide (WASM Python)** component that runs the feature extraction and online time warping. The table row, key-facts section, and Sources were corrected accordingly; it remains valid proof that OTW runs live in-browser, and the report's own advice not to use WASM Python was already consistent with this. Removed the unsupported "best existing reference for our exact architecture" framing.

Not independently re-verified (low-stakes / well-established): Dixon 2005 OLTW paper URL, MATCH GPL/legacy status, Antescofo proprietary status, Wu & Keogh FastDTW critique content, `dtw` npm v0.0.3 (2014) fork metadata, matchmaker default window/step parameters, LOC estimates. No other corrections needed.
--- REPORT END ---
