## Forced Alignment, Phoneme Recognition & Pronunciation Assessment (Learn Mode)

### Candidates

| Name | Repo/URL | License | Platform | Maturity/maintenance | Real-time/browser feasibility | Notes |
|---|---|---|---|---|---|---|
| Montreal Forced Aligner (MFA) | github.com/MontrealCorpusTools/Montreal-Forced-Aligner | MIT (depends on Kaldi via conda, Apache-2.0) | Python + conda (Kaldi backend) | v3.4.1, Jul 2026; actively maintained; SOTA boundary error <15 ms | Server-side only. No browser, no real-time. Conda-only install | Gold standard for phoneme-level boundaries. Needs a pronunciation dictionary (has G2P). Best for precomputing the target clip |
| WhisperX | github.com/m-bain/whisperX | BSD-2-Clause | Python (faster-whisper/CTranslate2 + torchaudio) | v3.8.6, May 2026; active | Server/GPU. Not browser | Whisper transcription + wav2vec2 phoneme-CTC forced alignment → word-level timestamps. Great when you DON'T have the transcript. Phoneme timing is coarser than MFA |
| torchaudio forced-align API + MMS_FA | docs.pytorch.org/audio (`Wav2Vec2FABundle`, `functional.forced_align`) | BSD-2-Clause | Python (PyTorch) | torchaudio entered a maintenance phase (2.8→2.10 refactor), but `forced_align` was explicitly preserved in torchaudio 2.10 (Jan 2026) after user feedback | Server. The DP align algorithm itself is trivially portable to JS/WASM | MMS_FA aligner covers 1100+ languages; GPU `forced_align`. Clean primitive: feed CTC emissions + tokens, get spans+scores |
| Charsiu | github.com/lingjzhu/charsiu | MIT | Python (HF wav2vec2) | Beta; peak activity 2022, thin since | Model is small enough to port to ONNX/browser | `charsiu/en_w2v2_fc_10ms` frame-classification aligner; supports **textless** phone alignment (useful for singing/free vocal). Semi-abandoned but usable |
| wav2vec2-xlsr-53-espeak-cv-ft | huggingface.co/facebook/wav2vec2-xlsr-53-espeak-cv-ft | Apache-2.0 | HF Transformers / ONNX | Static Meta checkpoint (2021), stable | XLSR-53 large (~1.2 GB fp32; ~300 MB q8) — heavy for browser but runnable quantized | Multilingual phoneme-CTC → IPA labels. The workhorse for phoneme posteriors → GOP/MDD |
| Kaldi `gop_speechocean762` | github.com/kaldi-asr/kaldi/egs/gop_speechocean762 | Apache-2.0 | Kaldi (C++/scripts) | Reference recipe, stable | Server only | Classic GMM-HMM Goodness-of-Pronunciation baseline on speechocean762. Superseded by neural GOP but still the canonical reference |
| GOPT | github.com/YuanGongND/gopt | BSD-3-Clause | PyTorch | ICASSP-2022 code, stable | Server (small model, but needs GOP features first) | Transformer over GOP features → multi-aspect, multi-granularity scores (phoneme/word/utterance) on speechocean762. Best off-the-shelf scoring head |
| SpeechBrain | github.com/speechbrain/speechbrain | Apache-2.0 | PyTorch | v1.x, very active 2026 | Server | Recipes for CTC/aligner + pronunciation; good framework glue, not a drop-in aligner |
| allosaurus | github.com/xinjli/allosaurus | GPL-3.0 (confirmed) | Python | v1.0.2 (pip); last GitHub release v1.0, May 2021; largely inactive | Server | Universal phone recognizer, 2000+ languages, text-free. Copyleft — flag before shipping |
| echogarden | github.com/echogarden-project/echogarden | **GPL-3.0 (copyleft)** | Node.js (WASM + ONNX) | v2.10.2, Apr 2026, active | Node server, not true browser | DTW + Whisper-guided alignment, all-JS/WASM. Convenient but GPL — keep out of a closed commercial bundle |
| sherpa-onnx | github.com/k2-fsa/sherpa-onnx | Apache-2.0 | C++/WASM/JS/Python/mobile | Very active 2026 | **Yes — WASM ASR in browser** | First-class forced alignment is only a feature request (issue #3536, still open, CTC-alignment proposed); has offline CTC ASR + timestamps. Best browser ASR runtime |
| Vosk | github.com/alphacep/vosk-api | Apache-2.0 | Kaldi-based, many bindings incl. WASM | Mature, maintained | WASM build exists | Word-level timestamps, not phoneme-level; dated acoustic models. Skip for phoneme MDD |
| Gentle | github.com/lowerquality/gentle | MIT (bundles Kaldi) | Python + Kaldi (Docker) | Effectively unmaintained since ~2020-21 | Server (Docker) | Lenient English word/phone aligner. Easy but stale; MFA/torchaudio strictly better |
| transformers.js v3 | github.com/huggingface/transformers.js | Apache-2.0 | Browser JS (ONNX Runtime Web, WebGPU) | Active 2026 | **Yes — WebGPU/WASM** | Runs Wav2Vec2 + Whisper in-browser; the vehicle for in-browser phoneme-CTC posteriors |
| Azure Pronunciation Assessment | (commercial) | Proprietary | Cloud API | — | — | Commercial baseline: per-phoneme accuracy/fluency/completeness/prosody scores, well-calibrated. Reference target for quality |
| Google Speech / "read-along" scoring | (commercial) | Proprietary | Cloud API | — | — | Commercial baseline; weaker/less granular pronunciation scoring than Azure |

### Key technical facts
- **MFA is the accuracy leader** for phoneme boundaries (mean boundary error <15 ms in MFA 3.x: 12.11 ms TIMIT, 13.87 ms Buckeye, 10.13 ms CSJ, 14.03 ms Seoul Corpus, per arXiv 2606.18466) but is a conda/Kaldi server tool — no browser, no real-time, and it needs a pronunciation dictionary (ships G2P models). MIT-licensed, safe commercially.
- **torchaudio's `forced_align()` is the reusable primitive**: given CTC emission frames + a token sequence it returns per-token timespans and scores. The `Wav2Vec2FABundle`/`MMS_FA` bundle wraps model+tokenizer+aligner; MMS covers 1100+ languages. Caveat: torchaudio entered a maintenance phase (Python-only refactor, 2.8→2.10; I/O moved to TorchCodec), but `forced_align` was explicitly preserved in torchaudio 2.10 (Jan 2026) — still pin versions, and the (small) alignment algorithm remains easy to lift out if needed.
- **The alignment DP itself is cheap** — a Viterbi/CTC-segmentation pass over posteriors. Nothing forces it server-side; only the acoustic model matters.
- **Phoneme posteriors for scoring** come from `wav2vec2-xlsr-53-espeak-cv-ft` (Apache-2.0, IPA output) or Charsiu's frame classifier. Large XLSR is ~1.2 GB fp32; q8 quantization ~300 MB makes browser borderline-feasible but not snappy on first load.
- **GOP has moved neural (2025-2026).** Legacy Kaldi GMM-HMM GOP (ratio of forced-align likelihood to free-phone-loop max) is superseded by **CTC/logit-based GOP** — see arXiv 2506.02080 (phonological-knowledge CTC GOP), 2506.12067 (logit-based GOP evaluation), 2507.16838 (segmentation-free GOP), 2606.19910 (discrete-token surprisal, lightweight). These compute pronunciation quality directly from wav2vec2/CTC posteriors without a Kaldi lattice — far easier to run outside Kaldi and portable toward the browser.
- **GOPT** (BSD-3-Clause) is the best ready-made scoring head: consumes GOP features, outputs multi-aspect phoneme/word/utterance scores trained on **speechocean762** (5k L2-English utterances, phoneme-level mispronunciation labels — the standard benchmark).
- **sherpa-onnx** runs offline CTC ASR in-browser via WASM today, but does **not** yet ship a first-class forced aligner (only an open feature request). **transformers.js v3** runs Wav2Vec2/Whisper with WebGPU (claimed up to ~100x over WASM) — this is the realistic in-browser phoneme path.
- **License landmines: echogarden and allosaurus are GPL-3.0.** Convenient, but copyleft — do not statically bundle into a closed commercial client. MFA/Kaldi/GOPT/WhisperX/torchaudio/transformers.js/sherpa-onnx/SpeechBrain/Vosk are all permissive (MIT/BSD/Apache).
- **Singing is a known failure mode.** MFA "tends to struggle" with melisma/sustained vowels and relies on silences that songs lack; Whisper/WhisperX transcription degrades on singing and over polyphonic mixes. 2024-25 singing-specific tools (SongTrans, STARS) do transcription+alignment without silence detection/MFA, and DTW aligners (echogarden, Charsiu textless) tolerate non-speech timing better.

### Recommendation

**(a) Align the target clip transcript → phoneme timestamps (offline, one-time):** Use **MFA 3.x** for spoken-English targets — best boundaries, MIT, and it's a precompute step so conda/Kaldi cost is irrelevant. For multilingual or "vocal style" clips where you want one pip-installable stack, use **torchaudio `Wav2Vec2FABundle` + MMS_FA**. Do this server-side (Python), store phoneme spans + posterior stats as JSON alongside the clip. This is authoring-time, not runtime.

**(b) Align the USER's imitation to the same transcript + per-phoneme scoring:** Run a single **wav2vec2 phoneme-CTC model** (`xlsr-53-espeak-cv-ft`, or Charsiu `en_w2v2_fc_10ms` for English-only + smaller) on the user audio, do a CTC forced-alignment pass against the target's known phoneme sequence, then compute **CTC/logit-based GOP** per phoneme (per the 2025-26 papers) rather than legacy Kaldi GMM GOP. For richer, calibrated multi-aspect scores, feed features to a **GOPT-style head** fine-tuned on speechocean762. Do NOT collapse to one number — emit per-phoneme GOP, plus timing offset (user span vs target span) and a timbre/energy delta, matching your interpretable-dimensions requirement. Keep the wav2vec2 posteriors as the shared substrate that also drives the Flow-Mode visuals.

**(c) In-browser vs Python server:**
- *Browser-feasible (Flow Mode + light Learn Mode):* pitch/energy tracking; **transformers.js** Wav2Vec2 phoneme-CTC (WebGPU, q8/q4) for live-ish phoneme posteriors; a hand-written Viterbi/CTC-align DP in JS/WASM over those posteriors; **sherpa-onnx** WASM for offline ASR if needed. Expect a heavy first-load (100s of MB) and non-instant inference — fine for a per-utterance "score my take," not for 50-100 Hz continuous scoring.
- *Must stay Python/server:* MFA, the target-clip precompute, GOPT training/fine-tuning, forced-align on singing, and any large-embedding timbre work. **Avoid echogarden/allosaurus in the shipped product (GPL).**
- Pragmatic MVP split: precompute the target offline (server), score the user take either server-side (best quality, simplest) or in-browser with a quantized phoneme model (privacy/offline story) — architect the GOP so the same code runs both places.

**(d) Singing:** Assume MFA/WhisperX do **not** cope out of the box (melisma, sustained vowels, no silences, backing track). Mitigate: (1) you already know the target lyrics, so never rely on ASR transcription for the target — align the *given* text; (2) **source-separate vocals first** (e.g. Demucs, MIT) before aligning either target or user; (3) prefer **DTW / textless alignment** (echogarden DTW as a research reference only due to GPL, or Charsiu textless, both permissive-vs-copyleft caveats noted) or a singing-specific aligner (**SongTrans/STARS**, 2024-25) over MFA for sung clips; (4) relax boundary expectations and score sung phonemes on pitch+vowel-quality contours rather than crisp articulation timing. For the MVP, precompute and **hand-verify** sung-target alignments — treat singing alignment as an authoring pipeline, not a live one.

**Skip:** Gentle (stale, MFA supersedes), Vosk (word-only, dated) for phoneme MDD, raw Kaldi GOP recipe except as a reference/sanity baseline, and any GPL tool (echogarden, allosaurus) in the distributed client.

### Sources
- https://github.com/MontrealCorpusTools/Montreal-Forced-Aligner/releases
- https://arxiv.org/abs/2606.18466 (MFA / state of alignment 2026)
- https://montreal-forced-aligner.readthedocs.io/en/stable/user_guide/index.html
- https://github.com/m-bain/whisperX and /blob/main/pyproject.toml (BSD-2-Clause)
- https://docs.pytorch.org/audio/2.8/tutorials/ctc_forced_alignment_api_tutorial.html
- https://docs.pytorch.org/audio/2.7.0/tutorials/forced_alignment_for_multilingual_data_tutorial.html (MMS_FA)
- https://github.com/pytorch/audio/issues/3902 (torchaudio maintenance-phase plan; forced_align preserved in 2.10)
- https://github.com/lingjzhu/charsiu (MIT)
- https://huggingface.co/facebook/wav2vec2-xlsr-53-espeak-cv-ft (Apache-2.0)
- https://github.com/kaldi-asr/kaldi/tree/master/egs/gop_speechocean762
- https://github.com/YuanGongND/gopt (BSD-3-Clause)
- https://arxiv.org/pdf/2104.01378 (speechocean762)
- https://arxiv.org/pdf/2506.02080 ; https://arxiv.org/html/2506.12067v2 ; https://arxiv.org/pdf/2507.16838 ; https://arxiv.org/pdf/2606.19910 (2025-26 GOP/MDD)
- https://github.com/echogarden-project/echogarden and /blob/main/package.json (GPL-3.0)
- https://github.com/xinjli/allosaurus (GPL-3.0)
- https://k2-fsa.github.io/sherpa/onnx/wasm/index.html ; https://github.com/k2-fsa/sherpa-onnx/issues/3536
- https://github.com/alphacep/vosk-api ; https://github.com/lowerquality/gentle
- https://huggingface.co/blog/transformersjs-v3
- https://arxiv.org/html/2507.06670 (STARS) ; https://arxiv.org/html/2409.14619v2 (SongTrans) ; https://music-ir.org/mirex/wiki/2024:Lyrics-to-Audio_Alignment

### Fact-check notes
Verified against primary sources (GitHub repo pages, HF model card/blog, arXiv abstracts, torchaudio issue tracker) on 2026-07-12.

**Corrections made:**
1. **MFA version**: latest release is v3.4.1 (Jul 11, 2026), not v3.4.0. Also changed "bundles Kaldi" → "depends on Kaldi via conda" (MFA does not vendor Kaldi; it is a conda-forge dependency). MIT license and active maintenance confirmed.
2. **GOPT license**: BSD-3-Clause, not BSD-2-Clause (corrected in table, key facts, and sources).
3. **torchaudio status**: the report's "reduced-maintenance/wind-down, ships in ≤2.8" was outdated/misleading. Per pytorch/audio issue #3902, torchaudio moved to a Python-only maintenance phase (deprecations in 2.8, removals in 2.9, I/O migrated to TorchCodec), but `forced_align` (with lfilter, RNNTLoss, etc.) was explicitly **preserved** in torchaudio 2.10 (Jan 2026). Corrected table row and key-facts bullet.
4. **transformers.js WebGPU speedup**: the HF v3 announcement claims "up to 100x faster than WASM," not ~64x. Corrected.
5. **allosaurus license**: GPL-3.0 confirmed directly on the repo; removed the "verify" hedge. Noted last GitHub release is v1.0 (May 2021; v1.0.2 is the pip version), confirming inactivity.

**Verified with no change needed:** MFA <15 ms boundary-error claim (arXiv 2606.18466 abstract + per-corpus tables: 12.11/13.87/10.13/14.03 ms); WhisperX BSD-2-Clause, v3.8.6 (May 2026), active; Charsiu MIT, textless alignment and `en_w2v2_fc_10ms` model confirmed, inactive since ~2022; wav2vec2-xlsr-53-espeak-cv-ft Apache-2.0, multilingual phoneme/IPA output; echogarden GPL-3.0, v2.10.2 (Apr 2026), Node.js-based, active; sherpa-onnx issue #3536 is a real, still-open forced-alignment feature request (CTC-based, NeMo-style); all five GOP/alignment arXiv IDs exist and match their descriptions (2506.02080 phonological-knowledge CTC GOP, 2506.12067 logit-based GOP, 2507.16838 segmentation-free GOP, 2606.19910 discrete-token surprisal, 2507.06670 STARS singing transcription/alignment); speechocean762 = arXiv 2104.01378.

**Not independently verified (low decision impact):** Gentle's MIT license and Vosk/SpeechBrain/sherpa-onnx Apache-2.0 licenses (widely documented, and all are either skipped or non-load-bearing); exact XLSR-53 model size figures (~1.2 GB fp32 is consistent with a 300M-param large checkpoint); the "issue #3536 opened Apr 2026" date; SongTrans arXiv ID 2409.14619.
