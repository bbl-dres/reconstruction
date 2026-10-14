# Viewer performance review

[← Viewer guide](../docs/viewer.md) · [Model contract](../docs/viewer.md#model-contract)

Review of the shared Three.js building viewer for load time, frame time and memory, with the Bundeshaus (`bundeshaus-v027`) as the large case and Landgut Lohn, Römerholz and Villa Maraini as small ones. 13 October 2026.

**Status:** the owner approved the quick wins Q1–Q5 and `BatchedMesh` batching (M1) behind a URL flag. They are implemented in the viewer; see [Implemented](#implemented) for what changed and the before and after numbers. The review sections below describe the viewer **before** these changes, and their line references are to that state. Exporter and model proposals (Q6, M2–M6, S1–S5) remain proposals.

Measurement scripts are in [viewer/perf/](perf/) (see [How to reproduce](#how-to-reproduce)).

## Contents

- [Implemented](#implemented)
- [Summary](#summary)
- [How the viewer works today](#how-the-viewer-works-today)
- [Measurements](#measurements)
- [Findings](#findings)
- [Recommendations](#recommendations)
- [Implementation plan](#implementation-plan)
- [How to reproduce](#how-to-reproduce)

## Implemented

13 October 2026, after the owner's approval. Viewer only: no model, exporter or gallery file changed. `node --test --test-isolation=none tests/*.test.mjs`: **153 / 153** pass (136 before, plus 17 new).

### What changed

| # | Change | Files |
|---|---|---|
| Q1 | **Glass without refraction.** At load, each transmissive material becomes blended glass ([glass.js](js/glass.js), called from [main.js:409](js/main.js#L409) and, for the surroundings, [main.js:583](js/main.js#L583)): `transmission` 0, transparent, no depth writes, drawn once for both faces (`forceSinglePass`). Its transmission becomes opacity: clear panes about 0.25, frosted and diffusing glass up to 0.6, glass with an image (the photographic dome) at least 0.7. Clear glass keeps 15 % of its colour as a tint: lit like a wall, the full colour turned it milky. Roughness, IOR and specular stay. Three.js no longer draws the scene a second time for refraction. The muted grey surroundings keep their opaque grey windows, because conversion runs after the muted style is made. | `js/glass.js` (new), `js/main.js`; `tests/glass.test.mjs` (new) |
| Q2 | **Floor plan without recompiles.** Every building material carries Floor plan's two cut planes from loading onwards, parked 10⁹ m away outside Floor plan ([plan-cut.js](js/plan-cut.js), [main.js:488 `updateCutPlanes`](js/main.js#L488)). Floor plan's uncut furniture copies carry two permanently parked planes, so they share the same programs. The per-material `needsUpdate` on entering and leaving the plan is gone. | `js/plan-cut.js` (new), `js/main.js`; `tests/visibility.test.mjs` |
| Q3 | **Shadows compiled in the background.** When Shadows is switched on, or as soon as the Lighting menu opens, the shadow variants of all programs compile with `KHR_parallel_shader_compile` while frames keep drawing without shadows. That includes the shadow pass's own depth programs, through stand-ins for three's depth materials. Shadows switch on once the driver reports them linked ([main.js:1027 `prepareShadows`](js/main.js#L1027), [shader-warmup.js](js/shader-warmup.js)). | `js/shader-warmup.js` (new), `js/main.js`; `tests/visibility.test.mjs` |
| Q3+ | **Compilation that accounts for clipping planes.** `renderer.compileAsync` takes the plane count from the renderer's last draw, not from each material, so with Q2 it compiled the wrong variants. `compileScene` primes the count with an invisible one-triangle draw into a 1 × 1 target, then compiles one object per material and kind. It replaces `compileAsync` at load ([main.js:435](js/main.js#L435), [main.js:601](js/main.js#L601)). | `js/shader-warmup.js`, `js/main.js` |
| Q4 | **One visibility pass per change.** The model scope and policy answers are worked out once per mesh and view or level and remembered ([visibility-rules.js](js/visibility-rules.js); [main.js:498 `applyVisibility`](js/main.js#L498)). `refreshSurroundings` re-applies visibility only when the surroundings switch differs from the state last applied ([main.js:541](js/main.js#L541)). It no longer does so on every download-progress event or redrawn interface, so each mode or level change runs one pass instead of two. | `js/visibility-rules.js` (new), `js/main.js`; `tests/visibility.test.mjs` |
| Q5 | **Downloads before the sky.** The sky environment (PMREM, a few hundred milliseconds of shader compilation on the main thread) is built after the model requests have gone out ([main.js:336 `ensureEnvironment`](js/main.js#L336), [main.js:398](js/main.js#L398)), instead of before the catalog request. | `js/main.js` |
| M1 | **`?batch=1`: one `BatchedMesh` per material.** Off by default. All static opaque single-material meshes are batched per material and vertex layout, repeated or not ([render-batches.js](js/render-batches.js), selected at [main.js:107](js/main.js#L107)). Each batch draws with its own copy of the material, sharing the cut planes, so programs never switch between batched and unbatched variants. Visibility mirrors the sources through `setVisibleAt`. A member whose material differs from the batch's (Floor plan's uncut furniture) is drawn as its own mesh meanwhile, and the muted surroundings swap the batch material with their members. Sources stay on the element layer for picking, highlight overlays, the BIM registry and collisions. `render-instances.js` exports its eligibility test (`batchable`) for both. | `js/render-batches.js` (new), `js/render-instances.js`, `js/main.js`; `tests/batches.test.mjs` (new) |

**Cache keys:**
- `boot.js` loads `main.js?v=20261013-perf`, and the entry pages load `boot.js?v=20261013-perf`: `reconstructions/*/index.html` and `_template/index.html`.
- `render-instances.js?v=sync-3` and `inspection.js?v=clip-3` were bumped.
- The new modules start at `rules-1`, `parked-1`, `blend-1`, `warmup-1` and `batch-1`.
- The owner's opening-view behaviour (`openStartView`, `resetView`, `metadataLoad`) and the about-link rebasing in `boot.js` are unchanged.

### Before and after

Same method as [Measurements](#measurements): Edge 155 headless, Intel Arc 140T integrated GPU, 1600 × 900 at DPR 1, local server. CPU / GPU are milliseconds per frame (median); ranges cover two runs each. "Before" was measured on the same day's code just before the changes.

| Bundeshaus | Before | After, default | After, `?batch=1` |
|---|---:|---:|---:|
| First frame (controls enabled) | 4.3–4.7 s | 3.5–3.6 s | 3.4–4.0 s |
| Longest task (the first frame) | 1.6–1.8 s | 0.8 s | 0.5–0.6 s |
| Shader programs compiled inside the first frame | 11 | 0 | 0 |
| Exterior: draw calls · CPU / GPU | 18,000 · 59–64 / 52–57 | 8,800 · **30–31 / 22–25** | 1,400 · **12–13 / 21–34** |
| Dollhouse: CPU / GPU | 35–40 / 32–43 | 19 / 17–18 | 9 / 17–18 |
| Floor plan: CPU / GPU | 20–21 / 16–18 | 11–12 / 7–10 | 7–8 / 7–8 |
| One level chosen: CPU / GPU | 12 / 16–17 | 7–8 / 8–13 | 5 / 10–11 |
| Walk: CPU / GPU | 48–49 / 41–42 | 27–29 / 21–23 | 12–13 / 16–17 |
| Exterior with shadows: CPU / GPU | 59–61 / 47–53 | 31–36 / 24–40 | 12–13 / 25–32 |
| Entering Floor plan | 1.0 s freeze (14 programs) | **no freeze** (0 programs) | no freeze |
| Switching Shadows on | 1.8–1.9 s blocked on 26 programs | **19–26 ms** blocked; the first shadow frame 120–135 ms | 13–18 ms; 56–70 ms |
| Dollhouse button / level filter (synchronous) | 24–26 / 12–13 ms | 13 / 3–4 ms | 18 / 3–4 ms |
| Memory after GC: page / GPU process | 0.88 / 2.6–2.7 GB | 0.85 / 2.1–2.2 GB | 0.94–0.96 / 2.0 GB |

| Landgut Lohn | Before | After, default | After, `?batch=1` |
|---|---:|---:|---:|
| First frame | 1.64 s | 1.22 s | 1.20 s |
| Exterior: draw calls · CPU / GPU | 2,943 · 10.5 / 9.2 | 1,430 · 3.6 / 4.4 | 111 · 2.2 / 4.4 |
| Dollhouse · Floor plan · Walk CPU | 6.7–7.9 · 5.0 · 7.5–7.9 | 3.1 · 1.9 · 3.2 | 1.8 · 1.6 · 2.1 |
| Entering Floor plan | 0.87 s freeze (11 programs) | no freeze | no freeze |
| Switching Shadows on | 1.16 s | 37 ms frame | 25 ms frame |
| GPU process memory | 1.0 GB | 0.59 GB | 0.58 GB |

| Bundeshaus, phone emulation (4× CPU, 390 × 844) | Before (morning run) | After, default | After, `?batch=1` |
|---|---:|---:|---:|
| First frame | 16.7 s | 15.0 s | 14.2 s |
| Exterior · Dollhouse · Floor plan · Walk CPU | 482 · 239 · 129 · 526 | 200 · 122 · 76 · 245 | **73 · 47 · 40 · 108** |
| Switching Shadows on | 2.8 s | 0.9 s first shadow frame | 0.26 s |

- **Default view:** Exterior is now about twice as fast in every mode. Freezes that came from shader compilation are gone at load, on Floor plan and on Shadows.
- **`?batch=1`:** Exterior is about five times as fast. On the integrated GPU it is now limited by the GPU: 8.2 M triangles, mostly interior furniture. M3 and the model proposals (simplified context buildings, furniture) are the next levers there.
- **Phones:** emulation improves 2.4× by default and 6.6× with batching. Memory, still about 3 GB across processes, remains the blocker for phones (M2–M6, S1–S2).

### Checked in a browser

Built-in browser pane and headless Edge on the local server; no console errors in any of these runs.

- **Modes:** Bundeshaus Exterior, Dollhouse, Floor plan (principal floor) and Walk. Saved places switch modes and cameras.
- **Shadows:** switching them on and off in Exterior and in the Dollhouse cutaway.
- **Römerholz:** opens on its start view, the garden front (`pos=40,40,50`, `target=-15,0,-2`), and Home returns there from the Site view.
- **Picking:** picks the same element at the view centre in every run.
- **With `?batch=1`:** hiding a level, Grey surroundings off and on, and Floor plan with uncut furniture.

The only network error seen was Landgut Lohn's missing `/favicon.ico` (404), unrelated to these changes.

[perf/compare-views.mjs](perf/compare-views.mjs) renders saved cameras in several set-ups and counts visibly differing pixels:

| Bundeshaus view | `?batch=1` vs default | Before (refraction) vs after |
|---|---:|---:|
| Exterior | 0.04 % | 1.2 % (roof glazing) |
| Dollhouse | 0.04 % | 0.1 % |
| Floor plan, principal floor | **0.9 %** | 0 % |
| Ständeratssaal | 0.06 % | 1.7 % (windows) |
| North foyer | 0 % | 0 % |

Landgut Lohn and Römerholz: `?batch=1` differs from the default by 0–0.01 %.

- **Glass:** the chamber windows now read as before, with clear panes slightly lighter than with refraction. Two kinds of glass look clearly different without refraction: the large roof glazing (*v006 inner diffusing glass* under clear roof glass) now reads milky instead of showing a blurred view of the hall below, and frosted panes no longer blur what is behind them.
- **Floor plan with `?batch=1`:** in the cut, a wall's base face and the floor beneath it lie in the same plane. Batched and individually drawn surfaces compute positions along slightly different paths, so on several gallery walls the wall's base wins the depth test, which shows as red and terracotta bands, where the floor won before. Other views are unaffected.

### Is `?batch=1` ready to become the default?

**Not yet.** It is functionally complete: picking, inspection, the BIM registry, cutaways, floor filters, hide and isolate, highlights, the muted surroundings, Walk collision and shadows behave as by default, and the tests cover the batching rules. It is about five times faster on the CPU. Before switching:

1. **Floor plan bands.** Remove the coincident wall-base and floor faces in the model (the contract already asks for no coincident surfaces), or keep Floor plan on the default path.
2. **Other browsers and devices.** Test Safari and iOS, where `WEBGL_multi_draw` may be missing; Three falls back to one draw per element, still without per-object state changes. Test a mid-range Android phone.
3. **Memory.** Batches copy their geometry, about +100 MB in the page process for the Bundeshaus. The source arrays stay for picking and collisions; they could be released once picking reads the batches.

### Not done

- Exporter and model proposals (Q6, M2–M6, S1–S5): out of scope.

## Summary

The small models are fine: Römerholz and Villa Maraini open in 1.1–1.7 s and draw a frame in 6–11 ms on a laptop. The Bundeshaus is slow for four separate reasons, in this order of impact:

1. **Too many draw calls, so the CPU is the bottleneck.** The Exterior view submits about **18,000 draw calls and 16.6 million triangles per frame**, taking **61–67 ms of CPU** per frame (about 15 fps) on an Intel Arc laptop GPU and **57 ms** on an NVIDIA RTX laptop GPU: the faster GPU does not help. The model has 15,545 meshes (10,901 building, 4,644 surroundings); the current instancing merges only 7,500 repeated placements.
2. **The glass transmission pass doubles every frame.** 13 glass materials (670 meshes) use `KHR_materials_transmission`. Whenever any of them is on screen, Three.js draws every opaque object a second time into a transmission buffer. Skipping that redraw in a test run cut the Exterior from 18,200 to 9,100 draw calls and from 61–67 to 39 ms CPU per frame, in every mode. The extra shader variants also cause most of the freezes below.
3. **Shader compilation freezes the page:** 1.1–1.2 s inside the first frame, **1.0–1.8 s when opening Floor plan** and **2.1–3.1 s when switching Shadows on**, because these variants are compiled synchronously on first use.
4. **Download and memory.** The Bundeshaus transfers **111 MB** (half of it PNG textures) before the first frame, which takes 18 s at 50 Mbit/s and 45 s at 20 Mbit/s. Once loaded, the browser holds about **3.6 GB** of private memory across the page and GPU processes on the integrated GPU (renderer peak 1.9 GB during loading). That is far beyond what phones allow.

Phone emulation (4× CPU slowdown, 390 × 844 screen) gives about **2 fps in Exterior** and 17 s to the first frame on a local network. Real phones were not tested; with this memory footprint, a crash or reload of the tab is likely on many of them.

**What to do first:** three small, low-risk viewer changes. Together they remove the freezes and halve the frame time without touching the model:

- draw glass without the transmission pass (Q1, owner decision on the glass look);
- keep the Floor plan clipping configuration constant (Q2);
- compile the shadow shaders before switching shadows on (Q3).

The structural fix for the draw-call problem is **`BatchedMesh` per material** in the viewer (M1). A prototype on the real model cut Exterior draw calls from 17,300 to 1,800 and CPU frame time from 66–75 ms to 25 ms. It keeps per-element identity for picking, cutaways and the BIM registry. Phones additionally need less content: simplified context buildings, interior culling from outside, recompressed textures and eventually a phone package (Q6, M3, M4, S1–S2).

| Top findings | Measured now | Expected gain |
|---|---|---|
| Transmission pass redraws everything | 18.2k draws, 61–67 ms CPU (Exterior) | −50 % draws and frame time in every mode; −0.9 s first frame (measured with the pass's redraw skipped) |
| Draw-call bound frames | 3.4 µs CPU per draw; 18k draws | BatchedMesh prototype: 1.8k draws, 25 ms CPU (with Q1); target ≤ 15 ms after tuning |
| Shader freezes | 1.0–1.8 s Floor plan, 2.1–3.1 s Shadows on, 1.1 s in first frame | Freezes removed (Q1–Q3) |
| Transfer 111 MB | images 56 MB, geometry 51 MB | −35 to −45 MB from texture recompression, deduplication and context simplification (estimate) |
| Memory 3.6 GB (integrated GPU) | textures 218 MB raw (266.6 MiB estimate with mipmaps, above the 256 MiB budget), geometry 230 MB, transient copies | −0.3 to −1 GB with KTX2, quantisation and sequential loading (estimate) |

## How the viewer works today

### Load path

| Step | Where | What happens | Thread |
|---|---|---|---|
| Boot | [boot.js](js/boot.js) | Fetches `building.json`, the shell and i18n in parallel, then imports `main.js` | main |
| Renderer | [main.js:251 `initialize`](js/main.js#L251) | WebGL 2 context, `antialias: true`, sRGB, Neutral tone mapping, local clipping on, shadows off (`autoUpdate = false`). Builds the sky environment with PMREM ([lighting.js:53](js/lighting.js#L53)), which compiles shaders synchronously (0.3–0.4 s), and only then calls `loadCatalog()` ([main.js:313](js/main.js#L313)) | main |
| Catalog, metadata | [main.js:316 `loadCatalog`](js/main.js#L316) | `catalog.json`, then `viewer.json` (1.9 MB for the Bundeshaus) and the building load in parallel | main |
| Download | [asset-loader.js:36 `downloadGLB`](js/asset-loader.js#L36) | Building and surroundings download **in parallel** ([main.js:364–365](js/main.js#L364)). The Bundeshaus files are explicit `.glb.gz` without `Content-Encoding`, so the page inflates them with `DecompressionStream` ([asset-loader.js:97](js/asset-loader.js#L97)) on the main thread, chunk by chunk, into one buffer of the full GLB size | main |
| Parse | [asset-loader.js:116 `loadGLB`](js/asset-loader.js#L116) → `GLTFLoader.parseAsync` | `JSON.parse` of the GLB JSON chunk (27.5 MB for the Bundeshaus building), a copy of the binary chunk, a copy per buffer view, a Blob copy per image, Meshopt decoding with WASM **on the main thread** (no `useWorkers`, [meshopt-decoder.js:16](js/meshopt-decoder.js#L16)). Images decode through `createImageBitmap` | main (images off-thread) |
| Prepare | [asset-loader.js:128 `prepareStaticModel`](js/asset-loader.js#L128) | Merges multi-primitive placements ([model-primitives.js:32](js/model-primitives.js#L32)), freezes matrices, caches world bounds per mesh; yields every 8 ms. [main.js:608 `prepareAsset`](js/main.js#L608) sets anisotropy and collects materials | main, sliced |
| Render batching | [render-instances.js:22](js/render-instances.js#L22) | `InstancedMesh` for 3 or more placements sharing geometry, materials and a 24 m cell; sources move to layer 1 for picking | main |
| Compile | [main.js:401](js/main.js#L401), [main.js:567](js/main.js#L567) | `renderer.compileAsync` for the building, then the surroundings and their instances (non-blocking with `KHR_parallel_shader_compile`) | GPU process |
| Present | [main.js:410–418](js/main.js#L410) | Waits for the surroundings, then renders the first frame: uploads every texture and buffer, and compiles the variants that `compileAsync` did not cover (the transmission-pass variants) synchronously | main + GPU process |
| After first frame | [main.js:1168 `loadBim`](js/main.js#L1168) | BIM registry (4.5 MB), validation and model tree, then a visibility pass: about 0.3 s more | main |
| Walk, on demand | [main.js:818 `prepareWalk`](js/main.js#L818) | Collision input copied on the main thread ([collision-data.js:14](js/collision-data.js#L14)); a binary BVH is built in a module worker ([collision-worker.js](js/collision-worker.js)) | worker |

### Per frame

- **Render on demand** ([frame-loop.js](js/frame-loop.js), [main.js:1867 `render`](js/main.js#L1867)): one queued frame at most; idle frames were measured at zero. Controls and walking request frames; background tabs pause.
- **Draw calls:** one per visible mesh and material group, after Three's per-object frustum culling ([three.module.js:17825 `projectObject`](vendor/three/build/three.module.js#L17825)). The render batching cuts the Bundeshaus Exterior from 29,600 calls (`?instances=0`) to 18,000.
- **Transmission pass:** when a transmissive mesh is in the render list, [three.module.js:17747](vendor/three/build/three.module.js#L17747) calls `renderTransmissionPass`. It redraws **every opaque object** ([three.module.js:18039](vendor/three/build/three.module.js#L18039)) into a half-float, 4× multisampled target with mipmaps, then draws double-sided glass from behind. That pass renders without tone mapping and in linear colour, so every material switches shader program twice per frame ([three.module.js:18476](vendor/three/build/three.module.js#L18476)).
- **Program switching:** batches share their material with the source meshes ([render-instances.js:42](js/render-instances.js#L42)). The instancing flag therefore also switches each shared material's program, and every switch recomputes the program parameters (`getParameters`, about 4 ms per frame in the profile).
- **Shadows:** off by default. When on, the 2048² map (1024² on touch) is refreshed only when light, visibility or coverage change ([shadow-fit.js](js/shadow-fit.js), [main.js:635](js/main.js#L635)). A refresh adds about 7,500 draws.
- **Pixel ratio:** capped by preset and a pixel budget ([view-layout.js:27 `renderBudget`](js/view-layout.js#L27)); MSAA through `antialias: true`.
- **Picking:** on click or tap only, no hover. A bounds prefilter over all meshes, then exact raycasts in distance order ([inspection.js:10 `pickHit`](js/inspection.js#L10)). Selection adds tint and edge overlays ([inspection.js:99](js/inspection.js#L99)).
- **Walk:** a capsule against the BVH, 120 Hz substeps ([walking.js:141](js/walking.js#L141)).

### Interactions

- **Visibility** ([main.js:464 `applyVisibility`](js/main.js#L464)) walks every building mesh. For each mesh it evaluates the model scope (walks the parents, [model-scope.js:3](js/model-scope.js#L3)), the building policy (about ten regular expressions per mesh for the Bundeshaus, [model-policy.js:60](../reconstructions/bundeshaus/public/policy/model-policy.js#L60)), the level and the hidden set. It then syncs the instance batches, toggles clipping on every material (setting `needsUpdate`, [main.js:481–485](js/main.js#L481)) and computes the visible bounds twice ([main.js:622](js/main.js#L622)).
- **The same change runs this pass twice:** `setMode` calls it ([main.js:745](js/main.js#L745)), then `updateInterface` ([main.js:748](js/main.js#L748)) → `updateSurroundings` ([main.js:882](js/main.js#L882)) → `refreshSurroundings`, which calls it again ([main.js:509](js/main.js#L509)). `setLevel` does the same ([main.js:1135](js/main.js#L1135), [main.js:1145](js/main.js#L1145)). While surroundings download after opening, every progress event calls `refreshSurroundings` ([main.js:541](js/main.js#L541)) and so runs the full pass.
- **Floor plan** adds clipping planes to every building material and gives furniture-type elements unclipped clones ([main.js:62](js/main.js#L62), [main.js:472](js/main.js#L472)). Both change the shader program key and force recompiles.
- **Shadows** toggle `renderer.shadowMap.enabled` and set `needsUpdate` on every material ([main.js:963 `applyLightingAppearance`](js/main.js#L963)), so every program recompiles.

### What is already right

On-demand rendering, shadows off by default with cached shadow maps, DPR and pixel caps, frozen matrices for static models, `compileAsync` before presenting, cancellation, a BVH for collisions built in a worker (0.53 s, 0.1 ms per walking step), picking that tests only a handful of meshes exactly, and opaque instancing. None of these needs rework.

## Measurements

### Set-up

| | |
|---|---|
| Machine | Intel Core Ultra 7 265H (16 logical CPUs), 31.5 GB RAM, Windows 11 Pro 10.0.26200 |
| GPUs | Intel Arc Pro 140T, integrated (used by default); NVIDIA RTX PRO 1000 Blackwell Laptop GPU (forced with `--force_high_performance_gpu`) |
| Browser | Microsoft Edge 155.0.4283.45, headless (new), ANGLE Direct3D 11, WebGL 2; `EXT_disjoint_timer_query_webgl2` and `WEBGL_multi_draw` available |
| Viewer | Three.js 0.185.1, meshoptimizer 1.2.0; `?stats=1`; automatic quality |
| Viewport | 1600 × 900 CSS px at DPR 1 (effective DPR 1.00). Phone emulation: 390 × 844 at DPR 3 (effective 1.25, canvas 487 × 1055), touch, coarse pointer, 4× CPU throttling |
| Server | `python tools/serve.py --port 8047` on loopback: download times are not network times |
| Node | 24.16.0, for the asset and CPU-only profiles |

**CPU** per frame is the time spent in the frame callback. **GPU** time is the timer query's elapsed time over the same frame. When the CPU is the bottleneck, that elapsed time includes the GPU waiting for commands, so it tracks the CPU figure. Run-to-run variation was about ±15 %; ranges are given where several runs exist (4 runs on the integrated GPU for the Bundeshaus).

### Assets

From [perf/glb-stats.mjs](perf/glb-stats.mjs). GPU estimates are unique geometry as stored (float32) and textures as RGBA8 with mipmaps, the model contract's formula.

| Asset | Transfer | GLB | JSON chunk | Images | Mesh nodes | Unique meshes | Placed triangles | GPU geometry | GPU textures | Materials (transmissive) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Bundeshaus building | 85.8 MB | 210.6 MB | 27.5 MB | 53.4 MB (92) | 10,901 | 8,413 | 6.81 M | 145.5 MB | 279.5 MB (266.6 MiB) | 186 (13) |
| Bundeshaus surroundings | 25.5 MB | 114.5 MB | 10.8 MB | 3.1 MB (9) | 4,644 | 801 | 1.79 M | 115.6 MB | 67.7 MB | 15 (1) |
| Landgut Lohn building / surroundings | 3.2 / 6.3 MB | 9.7 / 10.1 MB | 2.4 / 2.5 MB | 2.1 / 1.9 MB | 1,414 / 1,833 | 989 / 246 | 0.17 / 0.31 M | 6.0 / 7.0 MB | 39.1 / 22.4 MB | 80 (3) / 28 |
| Römerholz building / surroundings | 0.4 / 8.8 MB | 4.0 / 15.3 MB | 2.3 / 1.4 MB | none | 1,276 / 708 | 1,117 / 600 | 0.05 / 0.94 M | 1.8 / 19.4 MB | — | 26 / 24 |
| Villa Maraini building / surroundings | 4.2 / 4.3 MB | 24.7 / 20.9 MB | 5.1 / 2.3 MB | none | 2,683 / 1,187 | 1,892 / 866 | 0.84 / 0.81 M | 24.8 / 25.3 MB | — | 50 / 71 |

The Bundeshaus in more detail:

- **Transfer by content:**
  - Building, 85.8 MB: images 53.3 MB (incompressible PNG/JPEG); geometry about 30.6 MB, of which 22.1 MB is uncompressed float views after gzip and the rest Meshopt-compressed views; JSON 1.9 MB after gzip.
  - Surroundings, 25.5 MB: geometry about 21.8 MB, images 3.0 MB, JSON 0.7 MB.
  - Meshopt is kept for only 2,195 of the building's buffer views. The lossless pipeline stores a view uncompressed when gzip alone is smaller, which is the usual case for unfiltered float data ([meshopt_glb.mjs:74](../tools/model-pipeline/meshopt_glb.mjs#L74)).
- **Images:**
  - 92 in the building, 85 unique: 9.1 MB of duplicates (`wandelhalle_parquet_basecolor` three times, `giron_original` twice, …).
  - 87 are PNG, including photographic and generated RGB textures (`floral_textile_generated` 1254² is 3.9 MB).
  - One is 5000 × 1796, above the contract's 2048 px norm.
  - The GPU estimate of 266.6 MiB exceeds the contract's 256 MiB building budget (v015 was 245.5 MiB).
- **Triangles:**
  - Interior elements: 5.57 M of 6.81 M placed triangles (82 %) and 7,294 of 10,901 nodes.
  - Furniture: 3.37 M; the *Timber chair* family alone is 2.56 M triangles over 1,360 placements (38 %).
  - Per node: median 92 triangles; 5,735 nodes under 100.
- **Surroundings:** two neighbouring buildings (*Context EGID 1230654* and *2243898*) carry 821k of 1.79 M triangles and 63.5 MB of the 115.6 MB geometry. The terrain (136k triangles) stores unshared vertices, 17.8 MB.
- **Node extras:** 18.7 MB of the 27.5 MB JSON. Prose repeats: `viewer_visibility_basis` has one distinct value on 8,842 nodes, `viewer_classification_source` 30 values on 10,213 nodes.
- **Materials:** all 186 are double-sided.

### Loading

[perf/browser-profile.mjs](perf/browser-profile.mjs), integrated GPU, loopback server, cold HTTP cache. Times are from navigation.

| Model | Download starts | First frame (controls enabled) | Model tree ready | Main-thread long tasks before first frame | Largest long task |
|---|---:|---:|---:|---:|---:|
| Bundeshaus (6 runs) | 0.64–1.13 s | **4.2–5.3 s** | +0.3–0.5 s | 3.0–3.8 s | 1.5–1.9 s (first frame) |
| Bundeshaus, `?surroundings=0` | 1.38 s | 6.4 s (single run; load was noisier) | +0.5 s | 4.4 s | 2.9 s |
| Landgut Lohn | 1.09 s | 2.2–2.7 s | +0.3 s | 1.6 s | 0.7 s |
| Villa Maraini | — | 1.7 s | — | — | — |
| Römerholz | 0.68–1.01 s | 1.1–1.5 s | +0.3 s | 1.0 s | 0.55–0.72 s (start-up) |

Bundeshaus phases, from a typical run:

| Phase | Time | Main thread |
|---|---:|---|
| Start-up to catalog request | 0.64 s | module graph, WebGL context (0.13 s), sky PMREM shader compile (0.31–0.40 s) |
| Download both files (loopback) | 0.77 → 1.49 s | gzip inflation and chunk copies (~0.1 s of JS plus native inflation) |
| Parse | 1.49 → 2.35 s | GLTFLoader 0.5 s (binary chunk and JSON 0.14 s, buffer-view copies 0.09 s, image Blob copies 0.06 s); surroundings 0.2 s |
| Prepare | 2.35 → 2.66 s | primitive merging, bounds, instancing, `compileAsync` |
| First frame | 2.66 → 4.17 s (1.5 s task) | **shader waits 1.13 s** (11 programs not covered by `compileAsync`), texture upload 0.17–0.30 s (91 textures, 218 MB RGBA), buffer upload 0.16–0.25 s (21,175 buffers, 230 MB) |

- **Shader waits per model:** models without transmissive glass compile nothing in the first frame. Römerholz waited 0.08 s and Villa Maraini compiled 0 programs, against 6 programs for Landgut Lohn and 11 for the Bundeshaus.
- **With real networks:** the 111.2 MB Bundeshaus pair takes 9 s at 100 Mbit/s, 18 s at 50 Mbit/s, 45 s at 20 Mbit/s and 89 s at 10 Mbit/s, and it comes on top of the times above. The small models are 8.5–9.5 MB.
- **JSON sidecars:** the BIM registry (4.5 MB) and `viewer.json` (1.9 MB) are served uncompressed by the local server. GitHub Pages compresses JSON, which is not verified here.

CPU-only costs in Node ([perf/load-profile.mjs](perf/load-profile.mjs), no textures, no GPU), Bundeshaus:

- **Building:** gunzip 340–356 ms, JSON parse 90–100 ms, Meshopt decode 58 ms (55.7 MB), whole `GLTFLoader` parse 600–665 ms, `prepareStaticModel` 24–28 ms, instancing 31–44 ms.
- **Surroundings:** parse 207–230 ms, prepare 133–154 ms.
- **After the first frame:** BIM JSON 16 ms and validation 33–41 ms; model tree 25–30 ms; metadata 7–8 ms.

### Frame time per mode

Orbit drag (Exterior, Dollhouse), pan (Floor plan) or walking forward, about 3 s each. **CPU / GPU are milliseconds per frame (median).** 16.7 ms is 60 fps; 33 ms is 30 fps.

| Bundeshaus | Draw calls | Submitted triangles | Integrated GPU: CPU / GPU | NVIDIA: CPU / GPU | Phone emulation: CPU |
|---|---:|---:|---:|---:|---:|
| Exterior | 18,000 | 16.6 M | **61–67 / 54–65** | 57 / 45 | 482 |
| Dollhouse (all levels) | 10,400–10,900 | 13.2 M | 36–63 / 33–61 | 36 / 27 | 239 |
| Floor plan (default level) | 5,190 | 8.4 M | 20–21 / 16–28 | 24 / 16 | 129 |
| Exterior, one level chosen | 2,700–3,000 | 4.0 M | 11–13 / 18–35 | 11 / 7 | 65 |
| Exterior, shadows on (map cached) | 16,000–17,000 | 16.3 M | 60–92 / 52–90 | 60 / 45 | 445 |
| Walk, outside, forward | 14,000 | 14.9 M | 52–59 / 45–64 | 51 / 38 | 526 |
| Exterior, `?instances=0` | 29,600 | 16.6 M | 101 / 93 | — | — |
| Exterior, `?surroundings=0` | 15,400 | 13.6 M | 65 / 55 | — | — |

| Small models, Exterior | Draw calls | Triangles | Integrated GPU: CPU / GPU | Phone emulation: CPU |
|---|---:|---:|---:|---:|
| Römerholz | 2,000 | 1.0 M | 6.1 / 6.8 | — |
| Landgut Lohn (transmissive glass) | 3,300 | 0.8 M | 18.2 / 17.6 | 72 |

- **About 3.4 µs of CPU per draw call:** CPU time is proportional to draw calls in every row and does not change with the GPU.
- **Profile of an Exterior frame:** the cost is spread over per-draw work in Three: `renderBufferDirect`, vertex-array lookup, attribute version checks, `setProgram`, matrix products, layer tests. Program-parameter recomputation (`getParameters`) takes another ~4 ms per frame.

### Interactions

Synchronous cost of the control, plus the first slow frame after it. Integrated GPU.

| Action | Bundeshaus | Shader programs compiled | Landgut Lohn | Römerholz | Bundeshaus, phone emulation |
|---|---|---:|---|---|---|
| Dollhouse / Exterior button | 21–31 ms | 0 | 3–5 ms | 2 ms | 160–180 ms |
| Floor plan button | 27–38 ms, then a **1.0–1.8 s frame** | 14 | 4 ms, then 1.0 s | 2 ms, then 0.29 s | 199 ms, then 1.5 s |
| Level filter on / off | 11–15 / 14–32 ms | 0 | 2 ms | 1–2 ms | 89 / 115 ms |
| Click to inspect (pick, callout, highlight) | 16–22 ms, next frame +40–60 ms | 4–5 | 7 ms | 8 ms | 26 ms (no element hit) |
| Shadows on | **2.1–3.1 s frame** | 26 | 1.1 s | 0.32 s | 2.8 s |
| Walk preparation (worker; page stays responsive) | 0.9–1.0 s | — | 0.3 s | 0.27 s | 3.2 s |

In Node, one `applyVisibility` pass costs 8–11 ms for the Bundeshaus and under 1 ms for the small models. Picking takes 2–3 ms median and 7–8 ms worst, over 60 clicks aimed at visible elements: 34–53 candidate boxes, 3 exact raycasts.

### Memory

Private memory per process after a forced garbage collection, at the end of a full interaction run. The peak is the highest commit charge during the run. On the integrated GPU, textures and buffers live in shared system memory and are counted in the GPU process.

| | JS heap | Page (renderer) process | Peak page process | GPU process | Dedicated VRAM |
|---|---:|---:|---:|---:|---:|
| Bundeshaus, integrated GPU (3 runs) | 122–124 MB | 0.88–0.89 GB | 1.79–1.90 GB | 2.68–2.75 GB | shared |
| Bundeshaus, NVIDIA (no GC) | 234 MB | 1.83 GB | — | 1.92 GB | 1.0 GB |
| Bundeshaus, phone emulation | 119 MB | 0.86 GB | 1.54 GB | 2.20 GB | shared |
| Landgut Lohn | 29–53 MB | 0.26–0.35 GB | 0.42 GB | 0.67 GB | shared |
| Villa Maraini | — | 0.33 GB | 0.47 GB | 0.64 GB | shared |
| Römerholz | 65 MB | 0.28 GB | 0.36 GB | 0.45 GB | shared |

Known contributors for the Bundeshaus:

- 230 MB of vertex and index buffers uploaded; the CPU copies are kept too (`BufferAttribute` arrays).
- 218 MB of decoded RGBA texture data, plus mipmaps on the GPU, with the decoded `ImageBitmap`s retained after upload.
- Render targets: the 4× MSAA canvas, about 46 MB at 1600 × 900; the half-float 4× MSAA transmission target with its resolved mipmapped copy, about 60 MB; the shadow map when on.
- While parsing, both assets in parallel: the full GLB buffers (325 MB), GLTFLoader's binary-chunk copies (287 MB), per-view copies and image Blobs. This is the 1.9 GB peak.

### What-if experiments

These measure candidate changes without changing the viewer.

**1. Transmission pass without its opaque redraw.** `browser-profile.mjs --what-if no-transmission-pass` serves `three.module.js` with that one draw call skipped, in memory and for that run only. Glass still renders with its transmission shader.

| Bundeshaus, integrated GPU | Today | Redraw skipped |
|---|---:|---:|
| Exterior draw calls · CPU / GPU per frame | 18,200 · 61–67 / 54–65 ms | 9,100 · **38.6 / 25.7 ms** |
| Dollhouse CPU | 36–63 ms | 20.3 ms |
| Floor plan CPU | 20–21 ms | 10.8 ms |
| Walk CPU | 52–59 ms | 30.1 ms |
| First frame; shader wait in it | 4.2–5.3 s; 1.13 s | 4.05 s; 0.26 s |
| Programs at load | 27 | 16 |
| Floor plan freeze | 1.0–1.8 s | 0.58 s |
| Shadows-on freeze | 2.1–3.1 s | 1.45 s |
| GPU process memory | 2.68–2.75 GB | 2.45 GB |

**2. `BatchedMesh` per material.** [perf/batching-benchmark.html](perf/batching-benchmark.html) loads the model with the viewer's own loader, preparation and lighting. It then renders the Exterior and Dollhouse home views, orbiting, in three set-ups:

- *today's instancing*;
- *batched*: one `BatchedMesh` per (material, attribute layout) for all opaque single-material meshes, shared geometry stored once, per-element visibility through `setVisibleAt`, the sources kept on layer 1 for picking;
- *batched + glass*: as batched, with the transmissive materials drawn as blended glass.

| Bundeshaus, Exterior | Draw calls | Triangles | Integrated GPU: CPU / GPU | NVIDIA: CPU / GPU | 4× CPU throttle: CPU | Dollhouse CPU (integrated) | First render |
|---|---:|---:|---:|---:|---:|---:|---:|
| Today's instancing | 17,336 | 16.6 M | 66–75 / 55–64 | 63 / 50 | 435 | 38–42 | 1.9 s |
| Batched | 2,204 | 16.6 M | 34.7 / 31.5 | — | — | 18.5 | 1.6 s |
| Batched + glass | 1,775 | 8.4 M | **25–30 / 21–25** | **24 / 19** | 235 | 10.5–12 | **0.6 s** |
| …, no per-instance culling | 1,775 | 8.5 M | 21.1 / 16.8 | — | — | 7.6 | 0.6 s |

| Landgut Lohn, Exterior | Draw calls | CPU / GPU |
|---|---:|---:|
| Today's instancing | 4,469 | 11.8 / 9.9 ms |
| Batched + glass | 272 | 3.6 / 5.5 ms |

- **Batching:** 211 batches hold 14,533 meshes. Building them takes 120–175 ms, and the batch geometry is a 178 MB copy on the CPU (the sources stay for picking and collisions). Visibility changes through `setVisibleAt` cost 5–28 ms, comparable to today.
- **Remaining cost:** the prototype is not tuned. In its profile:
  - program-parameter recomputation, about 4.5 ms per frame: batches share materials with unbatched meshes, so each material switches between the batching and plain shader variants;
  - per-instance culling, 4–5 ms;
  - an index-texture upload, about 1 ms;
  - the ~1,560 draws that stay individual: glass, multi-material and mirrored meshes.
- **Phones:** under 4× CPU throttling the gain shrinks to 1.85×. Phones need less content as well as batching.

**3. Interior contents hidden from outside** (Node estimate, [perf/load-profile.mjs](perf/load-profile.mjs)). Hiding the 4,906 interior furniture and decoration meshes in the Exterior home view takes it from 17,500 draws and 16.7 M triangles to 14,000 and 7.1 M. Combined with glass without the transmission pass: 7,000 draws and 3.6 M triangles.

## Findings

| # | Finding | Evidence |
|---|---|---|
| F1 | **Frames are bound by draw-call submission on the CPU.** About 3.4 µs per call; 18k calls in Exterior; the NVIDIA GPU does not change CPU time. 15,545 meshes; one node per (element, placement, material); median 92 triangles per node; instancing merges 7,501 placements into 926 batches and leaves about 8,000 meshes individual. | Frame-time table; [render-instances.js:22](js/render-instances.js#L22) |
| F2 | **The transmission pass doubles every frame** while any of 670 glass meshes is on screen, and adds tone-mapping and colour-space program variants that every material switches into and out of each frame. | What-if 1; [three.module.js:18039](vendor/three/build/three.module.js#L18039), [three.module.js:18476](vendor/three/build/three.module.js#L18476) |
| F3 | **Synchronous shader compilation freezes the page.** 11 transmission variants in the first frame (1.1 s); 14 clipping variants on Floor plan (1.0–1.8 s); 26 shadow variants on Shadows on (2.1–3.1 s); the PMREM sky compile before the catalog fetch (0.3–0.4 s). Smaller models have the same pattern at a smaller scale. | Interactions table; [main.js:481–485](js/main.js#L481), [main.js:963](js/main.js#L963), [main.js:267](js/main.js#L267) |
| F4 | **111 MB transfer before the first frame**, half of it images: PNG for photographic or generated colour textures, 9.1 MB of duplicates, an image of 5000 × 1796. Geometry is float32 without quantisation; Meshopt is skipped for most views. The texture estimate (266.6 MiB) is above the contract's 256 MiB building budget. | Assets |
| F5 | **Two context buildings dominate the surroundings:** 821k triangles and 63.5 MB of GPU geometry for grey context. The terrain stores unshared vertices. | Assets |
| F6 | **Content invisible from outside is drawn anyway.** Interior elements are 82 % of triangles; the *Timber chair* family alone is 38 %. | Assets; what-if 3 |
| F7 | **Memory is far above a phone budget:** about 3.6 GB private on the integrated GPU after loading, a 1.9 GB peak in the page process, 1 GB of VRAM on the NVIDIA GPU. Contributors: textures (218 MB raw), geometry (230 MB, plus CPU copies), retained decoded images, the transmission target, and both assets parsed in parallel. | Memory |
| F8 | **Visibility work is repeated.** One pass costs 8–11 ms (Node) and runs twice per mode or level change, and on every surroundings progress event once the viewer is open. It costs 21–38 ms per switch on the laptop and 160–200 ms with phone throttling. | [main.js:745–748](js/main.js#L745), [main.js:509](js/main.js#L509), [main.js:541](js/main.js#L541) |
| F9 | **The JSON chunk is 27.5 MB**, 18.7 MB of it node extras with repeated provenance prose. Parsing costs 90–145 ms on the laptop, more on phones, and it enlarges the heap. | Assets; CPU profile |
| F10 | **Program switching** between instanced and plain variants of shared materials costs about 4 ms per frame today; the prototype shows the same for `BatchedMesh`. | CPU profiles |
| F11 | **The first frame waits for the surroundings.** This is by design, but the two parallel parses raise the memory peak, and the first frame includes the surroundings' uploads. | [main.js:364](js/main.js#L364), [main.js:410](js/main.js#L410) |
| F12 | **Minor costs:** Meshopt decoding on the main thread (58 ms), main-thread gzip inflation of explicit `.glb.gz` files (spread over the download), small per-frame allocations in Walk (`capsule.clone()` per substep, [walking.js:157](js/walking.js#L157)), layout reads while the callout is open. None is significant at today's frame times. | Node profile; code |

## Recommendations

Ranked by expected gain against effort and risk. *Where* says whether the change belongs to the viewer, the exporter or pipeline, or model authoring. Every change must keep working:

- picking and inspection cards;
- BIM registry ownership (whole-product selection, `bim.members`);
- cutaway roles and Dollhouse rules;
- floor filters, Floor plan cut and uncut furniture;
- Walk and Fly collision, including terrain;
- muted surroundings;
- shared view links;
- i18n (every new string in four languages, [tests/i18n.test.mjs](../tests/i18n.test.mjs));
- phone layouts.

### Quick wins

| # | Change | Where | Expected gain | Effort | Risk | Files and tests |
|---|---|---|---|---|---|---|
| Q1 | **Glass without the transmission pass.** At load, turn transmissive materials into blended physical glass (`transmission = 0`, `transparent`, opacity from the material, `depthWrite = false`, IOR and specular kept for reflections). Optionally keep true transmission on *Higher detail*. | Viewer | Measured: −50 % draw calls and GPU work in every mode (Exterior 61–67 → ~39 ms CPU), first frame −0.9 s, Floor plan freeze 1.0–1.8 → 0.6 s, Shadows freeze 2.1–3.1 → 1.5 s; ~60 MB less render-target memory (estimate) | ½–1 day | **Glass looks different**: no refraction or roughness blur for frosted and diffusing glass, chandelier crystal and the photographic dome. Needs a side-by-side check at fixed cameras. Changes the guide's statement that transmissive materials keep their rendering | [main.js `prepareAsset`](js/main.js#L608) or [asset-loader.js](js/asset-loader.js); [docs/viewer.md](../docs/viewer.md); `rendering`, `instances` (glass stays unbatched), new unit test for the conversion |
| Q2 | **No recompiles for Floor plan.** Keep both clipping planes on every building material (and on the uncut clones) at all times, parked out of range outside Floor plan; change only the plane constants. | Viewer | −1.0–1.8 s freeze entering and leaving Floor plan (−0.3–1.0 s on small models) | ½ day | Low. Check clipped shadows, `pickHit`'s clipped-hit test (out-of-range planes clip nothing) and the highlight's `followClipping` | [main.js:62](js/main.js#L62), `updateCutPlanes`, [main.js:481–485](js/main.js#L481); `cutaway`, `rendering`, `navigation` |
| Q3 | **Compile before switching shadows on.** Enable the shadow map, `await renderer.compileAsync(scene, camera)` with a short *Preparing shadows…* status, then render. Optionally warm up in idle time when the Lighting menu opens. | Viewer | The 2.1–3.1 s freeze (1.1 s on Landgut Lohn) becomes a non-blocking wait | ½–1 day | Low to medium: toggling again during compilation, daylight changes | [main.js:963](js/main.js#L963), [daylight.js](js/daylight.js); i18n key; `lighting`, `i18n` |
| Q4 | **One visibility pass per change.** `refreshSurroundings` re-applies visibility only when the surroundings switch or mode actually changed, never on download progress. Cache each mesh's static policy answers per (view, level): userData does not change after load; the tree- and hidden-set parts stay live. | Viewer | Mode and level switches 21–38 → ~5–10 ms (160–200 → ~40 ms with phone throttling); no repeated passes while surroundings download | ½–1 day | Low: the cache must be cleared when the registry or tree replaces level membership | [main.js:464](js/main.js#L464), [main.js:493](js/main.js#L493); `cutaway`, `viewer`, `model-tree` |
| Q5 | **Start the download before the sky.** Call `loadCatalog()` before `createSkyEnvironment`, or build the environment while the download runs. | Viewer | The 111 MB download starts 0.3–0.4 s earlier on every connection | Hours | Low | [main.js:251–313](js/main.js#L251) |
| Q6 | **Cheap model fixes.** Deduplicate identical images. Simplify the two context buildings (821k triangles to tens of thousands). Index the terrain mesh. | Authoring, exporter | −9 MB transfer and the duplicate textures; −0.8 M triangles per Exterior frame; about −60 MB GPU geometry and about −12 MB transfer (estimate) | 1–2 days with reimport | Low: context only; the contract already asks for image reuse | Blender source, [tools/model-pipeline](../tools/model-pipeline); catalog and report regeneration; `catalog-assets`, `compression` |

### Medium

| # | Change | Where | Expected gain | Effort | Risk | Files and tests |
|---|---|---|---|---|---|---|
| M1 | **`BatchedMesh` per material for static opaque meshes**, replacing the internals of `render-instances.js`. Batches per (material, attribute layout), optionally per spatial region. Mirror `mesh.visible` with `setVisibleAt` in `sync()`. Give batches their own material clones so programs never switch. Keep transparent, mirrored and multi-material meshes as they are, and batch glass later. | Viewer | Measured prototype: Exterior 17.3k → 1.8–2.2k draws, CPU 66–75 → 25–35 ms, Dollhouse 38–42 → 10–18 ms, first render 1.9 → 0.6 s (with Q1). Target after tuning ≤ 15 ms Exterior on this laptop | 1–2 weeks | Medium. +180 MB CPU geometry copy unless source arrays are released. Floor plan's uncut furniture needs its sources drawn while its instances are hidden. Swap the batch material for muted surroundings. Multi-draw fallback where `WEBGL_multi_draw` is missing. Selection overlays stay children of the sources (unchanged) | [render-instances.js](js/render-instances.js), [main.js](js/main.js) (`applyVisibility`, surroundings style); rewrite [tests/instances.test.mjs](../tests/instances.test.mjs) for the same guarantees (layer 1 picking, no proxy raycasts, visibility compaction, disposal); guide's *Static batching contract* |
| M2 | **Building first, surroundings after.** Present the building as soon as it is ready and load the surroundings afterwards, one asset at a time. | Viewer | First frame after 86 MB instead of 111 MB (−23 % download); lower memory peak; first frame without the surroundings' uploads | 1–2 days | UX contract change ("appear together"); surroundings appear later | [main.js:339 `loadModel`](js/main.js#L339), [main.js:528](js/main.js#L528); guide; `viewer`, `interface` |
| M3 | **Interior culling from outside.** In Exterior, with the camera outside the building's bounds plus a margin (with hysteresis), hide interior furniture and decoration. | Viewer policy | Estimate: Exterior triangles 16.7 M → 7.1 M (3.6 M with Q1); fewer draws; GPU time roughly halved | 2–3 days | Medium: views through glass, open doors and the dome show empty rooms; per-building policy decision | [main.js `applyVisibility`](js/main.js#L464), building policies; `cutaway`, `viewer` |
| M4 | **Texture delivery.** Colour textures as JPEG (or WebP through `EXT_texture_webp`, which GLTFLoader already supports); normal maps stay lossless. Resize to the contract's sizes (the 5000 px image to ≤ 2048). | Exporter or pipeline, authoring | Building images 53 → ~10–15 MB transfer (estimate); texture estimate back under 256 MiB; faster decoding | 2–4 days | Compression artefacts on murals and inscriptions; provenance records | [optimize_models.py](../tools/model-pipeline/optimize_models.py), [export_model.py](../tools/model-pipeline/export_model.py); contract; `compression`, `catalog-assets` |
| M5 | **Slim node extras.** Keep the fields the viewer and policies read; move repeated provenance prose to a lookup in `viewer.json` or the BIM registry, referenced by key. | Exporter, small viewer change | JSON 27.5 → ~9 MB; parse −50–70 ms on the laptop (more on phones); smaller heap; ~−1 MB transfer | 2–3 days | Inspection cards must show the same sources ([model-metadata.js](js/model-metadata.js) `describeElement` reads `viewer_classification_source`) | [x10_build_glb.py:432](../tools/revit/export/x10_build_glb.py#L432), [export_model.py](../tools/model-pipeline/export_model.py); `viewer`, `bim` |
| M6 | **Geometry quantisation.** Meshopt with `KHR_mesh_quantization` and filters: octahedral normals, 16-bit texture coordinates, 16-bit positions where node-local extents keep the error within tolerance, float otherwise. | Pipeline | Estimate: geometry transfer ~50 → 15–25 MB, GPU geometry 230 → 120–140 MB | ~1 week | Changes the lossless policy; must pass the BIM and IFC tolerance checks (1 mm). The viewer already reads normalised attributes (collision input, primitive merging) | [meshopt_glb.mjs](../tools/model-pipeline/meshopt_glb.mjs), [optimize_models.py](../tools/model-pipeline/optimize_models.py); contract; `compression`, `loading`, `bim` |

### Structural

| # | Change | Where | Expected gain | Effort | Risk |
|---|---|---|---|---|---|
| S1 | **KTX2 textures** (Basis Universal: UASTC for normals, ETC1S or UASTC for colour). Vendor `KTX2Loader` and the Basis transcoder (Apache-2.0) with version and licence records in [THIRD_PARTY.md](THIRD_PARTY.md). | Pipeline and viewer | GPU texture memory −75–85 %; no PNG decode or mipmap generation at load | 1–2 weeks | New dependency; contract lists KTX2 as future work; visual QA |
| S2 | **Phone package.** A reduced model per building: shell and level contents, simplified context, half-size textures, chosen by device class or quality, with stable ID mapping as the contract requires. | Authoring and viewer | Makes the Bundeshaus viable on phones (memory is the blocker) | Weeks | Content parity, two packages to maintain |
| S3 | **Simplified furniture prototypes**, e.g. the *Timber chair*: cane weave as texture and normal detail. | Authoring | Up to −2 M placed triangles | Days per family | Fidelity of close views; the contract already lists chairs and cane weave as budget priorities |
| S4 | **Persistent cache** for content-hashed assets (Cache Storage or a service worker), so repeat visits skip the 111 MB. | Viewer | Repeat visits: download → 0 | 3–5 days | Storage quota, eviction and update rules |
| S5 | **Room or zone loading and occlusion culling for Walk.** | Viewer, authoring | Large, interior views | Weeks | Complexity |

### Considered and not recommended now

- **three-mesh-bvh** (MIT, could be vendored): picking already takes 2–8 ms and Walk already uses a BVH built in a worker. No measured need.
- **Parsing in a worker:** Three objects must be created on the main thread. Only Meshopt decoding (58 ms; `MeshoptDecoder.useWorkers(2)` is a one-line option) and JSON parsing could move. Low gain.
- **Adaptive pixel ratio and quality:** frames are CPU-bound and caps already exist. Revisit after Q1 and M1, when the GPU share becomes visible.
- **Fewer exporter nodes:** in Three.js each primitive is one draw call, so moving an element's materials into one node saves nothing. Merging different elements breaks the contract and per-element identity. Batching belongs at runtime (M1).
- **Single-sided materials** for verified closed solids, as the contract already recommends: a modest GPU gain, and it removes the back-face glass pass. Worth doing with the next authoring round, after Q1.

## Implementation plan

Proposed order, each step a separate change to approve and verify. **Status, 13 October:** steps 2 and 3 are done, and step 5 is done behind `?batch=1` but is not the default yet (see [Implemented](#implemented)).

1. **Baseline.** Keep the scripts in `viewer/perf/` and this report's numbers as the baseline. Re-run [browser-profile.mjs](perf/browser-profile.mjs) for the Bundeshaus and Landgut Lohn before and after every step.
2. **Freezes and repeated work (Q5, Q4, Q2).** Viewer only, no visual change. Accept when the Floor plan freeze is gone (0 programs compiled on entry), a mode switch costs ≤ 10 ms on the laptop and all tests pass (136/136 today).
3. **Glass and shadows (Q1, Q3).** Owner decision on the glass look, with side-by-side captures at fixed cameras in studio and daylight. Accept when Exterior is ≤ 40 ms CPU on the integrated GPU, there is no freeze on Shadows on and the first frame compiles no programs. Update the viewer guide.
4. **Model fixes (Q6, M4, M5).** Next model version: deduplicated images, simplified context buildings, recompressed textures within the contract's budget, slim extras. Verify transfer, the texture estimate, inspection cards and the IFC and BIM checks.
5. **Batching (M1).** Behind a URL flag first, compared with today's instancing as `?instances=0` is today. Then the default, once parity tests cover picking, highlights, cutaways, floor filters, Floor plan uncut furniture, muted surroundings, shadows and collisions. Accept at ≤ 15 ms Exterior CPU on this laptop.
6. **Loading order and interior culling (M2, M3).** Owner decisions on the UX contract.
7. **Phones (M6, S1, S2).** Quantisation and KTX2, then a phone package. Measure on real devices (an iPhone and a mid-range Android) for memory, load and frame time. Emulation cannot show those limits.

Each step: `node --test --test-isolation=none tests/*.test.mjs`, the browser profile, phone emulation, and a manual pass through all four modes, Walk, inspection and a language switch.

## How to reproduce

All scripts are in **`viewer/perf/`**, read-only and dependency-free (Node 24 built-ins, the vendored Three.js and meshoptimizer, a locally installed Edge or Chrome). Nothing in `viewer/js`, the tests or the tools uses them. `tests/modules.test.mjs` scans only `viewer/js`. `tools/serve.py` serves the folder like the rest of the site, so it would be published if committed; delete it or move it to `tools/` if that is unwanted.

| Script | Measures |
|---|---|
| [glb-stats.mjs](perf/glb-stats.mjs) | GLB structure: sizes, JSON, images, meshes, triangles, reuse, materials, GPU estimates. `node viewer/perf/glb-stats.mjs [--summary] [file.glb[.gz]…]` |
| [load-profile.mjs](perf/load-profile.mjs) | CPU-only load phases with the viewer's modules in Node, visibility passes, an emulated draw count per mode, picking, collision build, walking step, what-if counts. `node --expose-gc viewer/perf/load-profile.mjs [building] [--no-surroundings] [--json]` |
| [browser-profile.mjs](perf/browser-profile.mjs) | The real viewer in headless Edge: load timeline, long tasks, WebGL uploads and shader waits, network and failed requests, console errors, frame CPU and GPU per mode, interaction costs, process memory. `node viewer/perf/browser-profile.mjs --building bundeshaus [--gpu high] [--mobile] [--query "batch=1"] [--cpu-profile] [--no-interact] [--what-if no-transmission-pass]`. The what-if patch targets the viewer before Q1, which has no transmission pass left to skip |
| [compare-views.mjs](perf/compare-views.mjs) | Screenshots of saved cameras in several set-ups, and the share of visibly differing pixels: parity of `?batch=1`, and glass before and after (`--old-glass` serves a no-op `glass.js`, in memory). `node viewer/perf/compare-views.mjs --building bundeshaus --out <folder> [--variant name=query] [--old-glass]` |
| [batching-benchmark.html](perf/batching-benchmark.html) with [run-page.mjs](perf/run-page.mjs) | Today's instancing compared with the `BatchedMesh` prototype. `node viewer/perf/run-page.mjs "http://127.0.0.1:8047/viewer/perf/batching-benchmark.html?building=bundeshaus&variant=batched-glass" [--gpu high] [--throttle 4] [--cpu-profile]` (variants `instances`, `batched`, `batched-glass`; `&sort=0`, `&cull=0`, `&surroundings=0`) |

Start the server first with `python tools/serve.py --port 8047` from the repository root. The browser scripts start their own headless Edge on DevTools port 9347 with a temporary profile, and remove both afterwards. Ports 8000, 8014, 8024, 8031 and 9333 were in use on this machine and were avoided. Expect ±15 % between runs; close other GPU-heavy applications, and compare medians of several runs.
