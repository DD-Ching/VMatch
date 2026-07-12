## Real-time rendering stack for VMatch's "two voices in an acoustic space" visualization

### Candidates

| Name | Repo/URL | License | Platform | Maturity/maintenance | Real-time/browser feasibility | Notes |
|---|---|---|---|---|---|---|
| three.js (r185) | github.com/mrdoob/three.js | MIT | WebGL2 + WebGPU | Very active; r185 released Jul 1 2026 (r184 Apr, r183 Feb, r182 Dec 2025 — cadence now ~2mo) | Excellent | `WebGPURenderer` with **automatic WebGL2 fallback**; TSL (Three Shading Language) compiles one shader codebase to WGSL or GLSL. TSL compiler got a 3x perf improvement in r184. Manual still calls WebGPURenderer path "under development" but it is the clearly signaled future; WebGLRenderer is maintenance-only for new features. |
| pixi.js v8 | github.com/pixijs/pixijs | MIT | WebGL + WebGPU (2D) | Very active; v8.16.0 Feb 4 2026, v8.19.0 Jun 2026 | Good, but 2D-only | Fast 2D scene graph with a feature-complete WebGPU backend (pixi's own docs still recommend WebGL for production). No 3D camera/depth, weak fit for a volumetric "acoustic space." |
| regl | github.com/regl-project/regl | MIT | WebGL 1/2 | Dormant-ish: last npm release 2.1.1 (~mid-2025), API frozen for years | Fine but stagnant | Elegant functional WebGL, zero deps. No WebGPU story, no ecosystem for postprocessing/lines. Skip for new work in 2026. |
| OGL | github.com/oframe/ogl | Unlicense (public domain) | WebGL2 | Maintained but small; no tagged releases (rolling) | Good for minimal builds | ~29 kB total minzipped (core 8 kB). You hand-write all GLSL, no WebGPU, no bloom/line ecosystem — you'd rebuild everything three gives free. |
| react-three-fiber v9 | github.com/pmndrs/react-three-fiber | MIT | wraps three | Active; v9 shipped with new scheduler | Excellent | WebGPURenderer supported via async `gl` factory prop; first-class TSL hooks (`useNodes`, `usePostProcessing`); most drei helpers work, some postprocessing edge cases remain. Use only if the app shell is React anyway. |
| pmndrs/postprocessing | github.com/pmndrs/postprocessing | Zlib | WebGL only | Active; v6.39.2 Jun 28 2026 | Excellent (WebGL path) | Best-in-class mipmap-blur bloom for WebGLRenderer. **Does not support WebGPURenderer** — there you use three's built-in TSL `PostProcessing`/bloom node instead. |
| GPUComputationRenderer | three.js `examples/jsm/misc/` | MIT | WebGL2 | Ships with three, stable for years | Proven to ~1M particles | Classic FBO ping-pong (positions/velocities in float textures). Legacy-but-reliable; the modern equivalent is TSL compute + storage buffers. |
| meshline (pmndrs fork of THREE.MeshLine) | github.com/pmndrs/meshline | MIT (per npm) | three.js/WebGL | v3.3.1, last publish Jun 2024; low churn but the canonical maintained fork (original spite/THREE.MeshLine is abandoned) | Good | Billboarded triangle-strip lines with width/taper/dash — works, but per-frame geometry updates for long dynamic trails are CPU-side. |
| TrailRendererJS | github.com/mkkellogg/TrailRendererJS | license not stated in README (verify before use) | three.js | Stale; community fork `nitrogem35/TrailRendererJS-fixed` exists because three deprecations broke it | Usable with care | Attach motion trails to any Object3D. Fine for prototyping; for production prefer custom instanced ribbon geometry or GPU-side trail history. |

### Key technical facts

- **WebGPU coverage mid-2026:** Chrome/Edge (since 2023), Safari 26 by default (macOS Tahoe 26 / iOS 26, Sept 2025), Firefox 141+ on Windows (Jul 2025), Firefox 145/147 on Apple-Silicon macOS (late 2025/Jan 2026). Firefox Linux/Android still in progress. ~80%+ of global users. So WebGPU is real, but a WebGL2 fallback is still mandatory for a consumer product in 2026.
- **three.js gives you the fallback for free:** `import * as THREE from 'three/webgpu'` → `WebGPURenderer` uses WebGPU, silently falls back to a WebGL2 backend; TSL transpiles to WGSL or GLSL per backend. `forceWebGL: true` for testing. One renderer, one shader codebase.
- **The fallback's sharp edge is compute.** WebGL2 has no compute stage. Three's WebGL backend has only limited `compute()` support (transform-feedback based); storage textures, atomics, and shared memory are WebGPU-only. Newest built-in postprocessing (SSGI, SSS, improved DoF) is WebGPU-only. If your particle sim is written as WebGPU compute, it will not "just work" on the WebGL2 backend — verify per feature or design around it.
- **The portable sim technique is still FBO ping-pong:** positions/velocities in RGBA float textures updated by fragment passes (GPUComputationRenderer pattern). This runs on both backends, and 100k–1M particles at 60 fps was already proven on 2014-era hardware (David Li's demos, The Spirit). You can express the ping-pong passes in TSL so the same code serves both backends today and can be swapped for storage-buffer compute later.
- **Official example to crib:** `webgpu_tsl_compute_attractors_particles` (three.js examples) — attractor-driven particle sim in TSL compute; `webgpu_postprocessing_bloom` — native TSL bloom.
- **Trails/ribbons:** for two emitters with flowing trails, the robust GPU approach is a "history texture" (each row/column = one trail's past positions, shifted each frame in the sim pass) driving **instanced ribbon geometry** (a static strip of quads whose vertices fetch position by trail-index + age). meshline is fine for a first prototype; CPU-updated lines won't scale to hundreds of long trails.
- **Organic motion:** curl noise over a low-frequency simplex field is the standard recipe (divergence-free → fluid-looking, no sim needed). Reference implementation: `cabbibo/glsl-curl-noise` (155 stars, **no license file — reimplement rather than copy**); the math is public (Bridson 2007). Attract-to-target + curl-noise-jitter maps beautifully to "your voice converging on the target voice."
- **Bloom on mid-range laptops (Iris Xe class):** mipmap/downsample-chain bloom (pmndrs `BloomEffect` or three's TSL bloom) at half resolution, HalfFloat render targets, no MSAA when postprocessing (use FXAA/SMAA or none — bloom hides aliasing). Biggest perf killer is **overdraw from large additive sprites**, not particle count: keep points 1–3 px with additive blending and depthWrite off; 100k tiny additive points + half-res bloom is comfortably 60 fps on integrated GPUs.
- **pixi v8, regl, OGL:** pixi is 2D-only (wrong shape for a 3D acoustic space, though fine if you later decide the space is flat); regl is effectively frozen (last release ~2025, no WebGPU path); OGL is lovely and tiny but you'd hand-roll bloom, lines, compute, and lose the TSL dual-backend story.

### Exemplary open-source demos/repos worth studying

1. **David Li — Fluid Particles** (WebGL GPGPU particle fluid, ~1.2k stars): https://github.com/dli/fluid (also `dli/flow` — volumetric particle flow, and `dli/waves`)
2. **Edan Kwan — The Spirit** (MIT; curl-noise + noise-derivative smoky particle trails — the closest existing aesthetic to VMatch's "living voice entity"): https://github.com/edankwan/The-Spirit
3. **three.js official — TSL compute attractor particles** (the modern WebGPU pattern to copy): https://threejs.org/examples/webgpu_tsl_compute_attractors_particles.html
4. **Codrops — Dreamy particle effect with GPGPU** (Dec 2024, full tutorial + repo, three.js FBO pipeline): https://tympanus.net/codrops/2024/12/19/crafting-a-dreamy-particle-effect-with-three-js-and-gpgpu/
5. **Interactive Particles Music Visualizer** (audio-reactive three.js, ARKx/Coala-inspired, beat detection + GPGPU noise): https://github.com/tgcnzn/Interactive-Particles-Music-Visualizer
6. **Maxime Heckel — Field Guide to TSL and WebGPU** (best current written reference for TSL particle/compute patterns, with live demos): https://blog.maximeheckel.com/posts/field-guide-to-tsl-and-webgpu/

### Recommendation

**Use vanilla three.js r18x with `WebGPURenderer` (automatic WebGL2 fallback) and write all shaders in TSL.** This is the only option in mid-2026 that gives one codebase across both APIs, an MIT license, and a live ecosystem. Take react-three-fiber v9 + drei only if the product shell is React; the audio→visual hot loop (50–100 Hz analysis frames driving uniforms/storage buffers) is cleaner as an imperative `renderer.setAnimationLoop` regardless — don't route per-frame audio features through React state.

**Target: WebGPU-first, WebGL2-fallback — but architect the particle sim as TSL ping-pong texture passes, not compute, for the MVP.** Rationale: ping-pong runs identically on both backends (compute does not), and it is provably sufficient for the MVP spec (100k+ particles, 2 emitters, trails, bloom at 60 fps — hardware from a decade ago did this). Keep the sim behind a small interface so a WebGPU storage-buffer/compute implementation can replace it post-MVP for atomics/shared-memory tricks (e.g., spatial binning for inter-entity interaction).

Concrete MVP pipeline:
- **Sim:** two 512×512 float RGBA position/velocity texture pairs (one per voice entity ≈ 262k particles each, dial down to 256×256 on weak GPUs), updated by TSL passes: attract-to-formation + curl noise (reimplement Bridson-style curl, don't vendor the unlicensed gist) + audio-feature uniforms (pitch offset → vertical field, energy → turbulence, convergence metric → attractor blend between entities).
- **Trails:** history-texture + instanced ribbon quads (GPU-only, scales to thousands of trail segments); prototype first pass with pmndrs/meshline if needed, but plan to replace it. Skip TrailRendererJS (stale, unclear license).
- **Bloom:** three's built-in TSL bloom node on WebGPU; pmndrs/postprocessing v6 `BloomEffect` (Zlib, actively released as of Jun 2026) if you find yourself on the WebGL path with the classic renderer. Half-res, HalfFloat, no MSAA.
- **Skip:** pixi.js (2D scene graph, wrong primitive for a spatial two-entity scene), regl (frozen, no WebGPU), OGL (fine library, but you'd rebuild bloom/lines/compute and lose the dual-backend transpiler), custom raw-WebGPU engine (months of cost for zero MVP benefit).

### Sources

- https://github.com/mrdoob/three.js/releases (r185 Jul 1 2026; r184/r183/r182 dates, TSL/WebGPU changelog items)
- https://threejs.org/manual/en/webgpurenderer.html (fallback behavior, `forceWebGL`, TSL transpilation, `three/webgpu` import, WebGPU-only postprocessing)
- https://web.dev/blog/webgpu-supported-major-browsers and https://caniuse.com/webgpu (browser support); byteiota.com/webgpu-2026-70-browser-support-15x-performance-gains (Firefox 141/145/147, Safari 26 timeline)
- https://pixijs.com/blog/8.16.0 and https://github.com/pixijs/pixijs/releases (pixi v8 status); https://pixijs.com/8.x/guides/components/renderers (WebGPU "recommend WebGL for production")
- https://github.com/regl-project/regl + npm search results (regl 2.1.1, dormancy)
- https://github.com/oframe/ogl (Unlicense, 29 kB, WebGL2)
- https://r3f.docs.pmnd.rs/tutorials/v9-migration-guide and https://github.com/pmndrs/react-three-fiber/issues/3352 (R3F v9 WebGPU/TSL support)
- https://github.com/pmndrs/postprocessing (Zlib, v6.39.2 Jun 28 2026, WebGL-only)
- https://github.com/pmndrs/meshline (v3.3.1, maintained fork); https://github.com/mkkellogg/TrailRendererJS and https://github.com/nitrogem35/TrailRendererJS-fixed
- https://threejsroadmap.com/blog/introduction-to-webgpu-compute-shaders and https://discourse.threejs.org/t/webgpu-compute-shaders-support/66758 (compute unavailable/limited on WebGL2 fallback; transform-feedback note)
- https://threejs.org/examples/webgpu_tsl_compute_attractors_particles.html ; https://threejs.org/examples/webgpu_postprocessing_bloom.html
- https://blog.maximeheckel.com/posts/field-guide-to-tsl-and-webgpu/ ; https://tympanus.net/codrops/2024/12/19/crafting-a-dreamy-particle-effect-with-three-js-and-gpgpu/
- https://github.com/dli (paint 3k / fluid 1.2k / waves 1.1k / flow 932 stars); https://github.com/edankwan/The-Spirit (MIT, curl noise)
- https://github.com/cabbibo/glsl-curl-noise (exists, 155 stars, no license stated)
- https://github.com/tgcnzn/Interactive-Particles-Music-Visualizer (audio-reactive three.js reference)

### Fact-check notes

Verified against primary sources (GitHub repos/releases, npm registry, threejs.org manual, pixijs.com blog, Mozilla Gfx blog / web.dev via search):

- **three.js r185 Jul 1 2026** — confirmed the r185 release exists and is the latest, dated Jul 1; r184/r183/r182 month spacing matches the report (GitHub's date rendering omits years, but r185 as current latest in Jul 2026 confirms the claimed timeline). MIT license, WebGPURenderer automatic WebGL2 fallback, `forceWebGL`, TSL→WGSL/GLSL transpilation, "experimental/under development" wording, and WebGPU-only SSGI/SSS/DoF postprocessing all confirmed verbatim from the threejs.org WebGPURenderer manual page.
- **pixi.js v8.16.0 Feb 4 2026** — confirmed via pixijs.com/blog/8.16.0 (dated Feb 4, 2026). Added to the table that releases have continued through v8.19.0 (Jun 2026), reinforcing "very active."
- **regl** — 2.1.1 is the latest on npm, MIT; npm shows it published "a year ago" (≈mid-2025), consistent with the report's dormancy claim. No v2.1.1 GitHub tag exists (tags stop at v1.6.1, 2020), further supporting "effectively frozen."
- **OGL** — Unlicense (public domain) confirmed; 29 kB total / 8 kB core minzipped confirmed; "No releases published" (rolling) confirmed.
- **pmndrs/postprocessing** — Zlib license and v6.39.2 released Jun 28, 2026 confirmed; repo documents WebGLRenderer only, no WebGPURenderer support mentioned. Confirmed.
- **meshline** — MIT confirmed via npm. **CORRECTION:** last publish of v3.3.1 was **Jun 3, 2024** (npm registry timestamp), not "~mid-2025" as originally stated. Table updated. The "canonical maintained fork" framing stands, but it is lower-churn than the report implied.
- **TrailRendererJS** — repo exists, no LICENSE file and no license stated in README (report's caution confirmed); fork `nitrogem35/TrailRendererJS-fixed` exists and its README confirms it was created because three.js deprecations broke the original.
- **WebGPU browser support** — Safari 26 ships WebGPU enabled by default (macOS Tahoe 26/iOS 26, Sep 2025); Firefox 141 shipped WebGPU on Windows Jul 2025 (Mozilla Gfx blog); Firefox 145 added Apple-Silicon macOS (Tahoe 26+), Linux/Android still pending. All confirmed; report's conclusion (WebGL2 fallback still mandatory) stands.
- **Demo repos** — dli/fluid exists (MIT, 1.2k stars, PIC/FLIP GPU fluid); edankwan/The-Spirit exists (MIT, curl-noise smoky particles); cabbibo/glsl-curl-noise exists (155 stars, **no license file** — report's "reimplement, don't copy" advice confirmed); tgcnzn/Interactive-Particles-Music-Visualizer exists (MIT, three.js + GSAP + beat detection, ARKx/Coala-inspired). All confirmed.
- Not independently re-verified (secondary/low-risk): r3f v9 TSL hook names, TSL 3x compiler speedup attribution to r184 specifically, exact byteiota coverage-percentage figure (~80% is consistent with caniuse-cited coverage elsewhere).

Total corrections: 1 (meshline publish date), plus 1 currency addition (pixi v8.19.0). All license, existence, and feasibility claims in the Recommendation section held up.
