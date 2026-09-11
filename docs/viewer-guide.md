# Viewer guide

[← Project overview](../README.md) · [Model handoff](model-handoff.md) · [Live app](https://bbl-dres.github.io/reconstruction/)

Using and developing the no-build building explorer: navigation, rendering, performance, design and adaptive layout. Updated 11 September 2026 for v027. Model authoring, asset conversion, BIM/IFC and annotations are maintained in the [model handoff](model-handoff.md). The [Dollhouse visibility rules](model-handoff.md#walls-and-dollhouse-visibility) define how the enclosure opens for outside views.

## Contents

- [Using the viewer](#using-the-viewer) — navigation, lighting, sharing and troubleshooting
- [Development](#development) — repository structure and verification
- [Runtime contracts](#runtime-contracts) — loading, rendering, instances and URL parameters
- [Design and adaptive layout](#design-and-adaptive-layout) — tokens, accessibility and device measurements
- [Review findings](#review-findings) — evidence, corrections and remaining validation

## Using the viewer

### Start locally

From the repository root:

```sh
python scripts/serve.py
```

Open [localhost:8000](http://localhost:8000/). Stop with Ctrl+C; use `--port 8001` for another port. On Windows, `./start-viewer.ps1` is an alternative. The server binds to localhost and negotiates precompressed model delivery. A generic static server also works, but may transfer larger files. Opening `index.html` with `file://` does not support modules and model loading.

The app uses vanilla JavaScript and Three.js, with models and runtime dependencies in the repository. There is no build step, npm installation or backend service. Edit HTML, CSS or JavaScript and refresh.

### Browser and hosting requirements

Use a browser with WebGL 2, ES modules/import maps, fetch streams, native dialogs and the JavaScript APIs used by the local loader; walking collision preparation also uses a worker. The pinned renderer has no WebGL 1 fallback. Explicit gzip assets need `DecompressionStream('gzip')` when hosting delivers their raw compressed bytes. Check capabilities and actual failures rather than assuming that a browser brand or a desktop-sized viewport proves compatibility. [Three.js renderer requirements](https://threejs.org/docs/pages/WebGLRenderer.html).

Serve the repository root, including `index.html`, `public/` and their relative paths. Keep JavaScript responses as JavaScript, not an HTML fallback/error page. The catalog and its assets must be deployed together; publish the catalog only after its referenced files are available. The local file server and deployed static site already follow this structure. Opening an old browser tab after deployment can retain an earlier module graph.

Pointer lock is only requested from a user action; Touch controls are the alternative where mouse capture is unavailable. Clipboard access has a selectable-link fallback. Storage failures do not stop viewing, but saved preferences and lighting continuity between versions may be unavailable. WebGL context loss currently shows a reload/retry error; automatic restoration of the scene is not implemented.

### Navigate and inspect

With no shared view or saved comparison to restore, the root page starts in **Dollhouse**, with all levels of the latest successfully imported catalog version. Surroundings and their muted grey style default to on, with stored preferences or URL values taking precedence. Sun & sky defaults to off; an inspection-version change can restore its lighting state.

| Mode | Behavior and controls |
|---|---|
| Exterior | Full building. Drag to orbit, right-drag to pan, scroll or pinch to zoom. |
| Dollhouse | Same camera controls, with enclosure, attached lining, roofs and ceilings hidden to expose the interior from outside. All levels has no horizontal cut; selecting a floor clips to that floor's range. |
| Floor plan | Orthographic top view of one level. Drag to pan, scroll/pinch to zoom, adjust the cut height. |
| Walk | Opens paused at the current camera. WASD/arrows move, mouse looks, Shift speeds up, Space jumps and Esc pauses. Touch controls use a direction pad and drag-to-look. |

Exterior and Dollhouse share a camera. Floor plan retains the focus and visible vertical span; returning preserves its pan/zoom and the previous perspective angle. Floor changes retain horizontal focus and zoom. **Fit building** and **Fit site** explicitly reframe the scene.

With the canvas focused, arrows rotate, Shift + arrows pan, + / − zoom and R fits the building. In Floor plan, arrows pan. H or ? opens Help. Escape dismisses dialogs and returns focus to the appropriate trigger.

Walk checks the current position against its collision world. An airborne or unsupported viewpoint starts paused in **Fly through gaps**. Choosing a room explicitly moves to a supported start. Esc/Resume retain position; Fly disables collisions, with E to rise and Q to descend. Turning Fly off returns to the last supported walking position. Touch controls provide Pause, Jump and Fly rise/descend without capturing the mouse.

**Model & floors** contains version and level selection and collapses on narrow or short screens. **Explore building → Places** lists saved viewpoints and points of interest. **Elements** searches names, categories, families and types, including objects hidden in the current mode. These are text searches, not verified BIM classification filters.

Click or tap a visible building element to highlight its mesh component and inspect its properties. Dragging or multitouch does not select; hits behind cut planes are ignored. Closing details clears the highlight. **Sources & methods** groups repeated evidence text; **Model reference** shows the original name and ID. **Back to element results** preserves the query and focused result. Context buildings are outside the current inspection scope; Walk retains mouse-look interaction.

Version changes reload the page to release the previous model and GPU resources. URL state preserves camera/mode and compatible floor/cut height; session storage also carries lighting from inspection modes. Walk is rechecked against new geometry and opens paused, without saved inspection lighting. Selection resets. The highest retained version in [the catalog](../public/models/catalog.json) is the default. Selected milestones remain available for comparison; a new iteration appears after successful import and a page refresh. A URL pins a version label, not immutable bytes: replacing an already published version changes what that link loads.

### Surroundings, lighting and quality

The building loads first, followed by the matching surroundings without moving the camera. **Fit site** shows the neighborhood; Floor plan temporarily hides it. Context loading has its own retry. **Settings → Muted surroundings** switches between subtle grey and original materials/aerial imagery. Surroundings preferences are remembered locally.

Turning surroundings off hides a loaded asset; it does not unload its geometry/textures or cancel a context download already in progress. To avoid the optional context load on a constrained device, open with `?surroundings=0` before loading. Muted grey is an appearance treatment and retains the original resources for switching back.

**Lighting**, left of Surroundings, opens the daylight panel. **Sun & sky** reveals Date, Hour in Bern, Shadows and Brightness only when enabled. **Shadows default to off**, including when first enabling the sun; turn them on explicitly for cast shadows. **Now** selects the current date/time. **Time & season sliders** offers exploratory scrubbing and calculated sun direction; the panel also shows sunrise/sunset. Date and time determine direction, with no competing manual direction slider.

Daylight initially previews today's noon. Disabling it restores black-background studio lighting and exposure, and disables shadow rendering. **Reset lighting** restores today's noon with Sun & sky and Shadows both off. Daylight brightness/shadow choices apply only while enabled; a user's explicit shadow choice survives toggling the sun or comparing versions, but a fresh visit resets it. Floor plan suppresses the sky but keeps illumination. Bern civil time includes Europe/Zurich daylight-saving changes; invalid/incomplete dates retain the last valid lighting and display guidance.

The sun preview is qualitative: approximate geometry/georeferencing, illustrative ambient fill and finite shadow maps limit accuracy. Cutaway visibility changes the shadow casters. It is not daylight-compliance or energy analysis.

**Settings → Rendering quality** changes drawing-buffer resolution, the sun shadow map and the glass transmission buffer. These are caps, not guaranteed resolutions; the effective DPR is the lowest of device DPR, the preset cap and the pixel-budget limit. Current values come from [renderBudget](../public/js/view-layout.js):

| Preset | Pixel budget | DPR cap | Shadow-map side | Transmission scale |
|---|---:|---:|---:|---:|
| Automatic, touch-first | 3 million | 1.25 | 1024 | 0.5 |
| Automatic, other devices | 5 million | 1.5 | 2048 | 1 |
| Lower power | 2 million | 1 | 1024 | 0.5 |
| Higher detail | 8 million | 2 | 2048 | 1 |

Transmission scale applies to both dimensions: 0.5 uses one quarter of the buffer pixels. The presets reduce render-target costs, not model download size, placed geometry or source image storage. Automatic is an input-device heuristic, not a GPU benchmark or adaptive FPS controller. V015's building and context image estimates total about 310 MiB before other CPU/GPU allocations; a small gzip download is not a mobile memory budget.

### Share a view and troubleshoot

**Settings → Copy view link** captures version, mode, floor, camera position/target, zoom, cut height and surroundings choices. Navigation updates the address without filling browser history. Walk links open paused. Lighting/time and selected elements are not currently shared. A localhost link points to the recipient's own machine; use the hosted app for public links. See the [URL contract](#shared-view-url-contract).

If a deployment reports a missing module or Meshopt decoder after an update, try a full refresh or a new window to clear an older page/module combination. If it persists, inspect the browser console and failed network request rather than assuming a model defect. Sun & sky requires a valid per-version geographic reference. A context error does not require reloading an already usable building.

For a reproducible report, include the page URL, browser/OS, viewport/DPR, selected quality, surroundings/daylight state, first console error and failed request/status. Distinguish transfer failure, gzip/mesh decoding, annotation warnings and WebGL context loss. Progress reaching the end of the download can still leave geometry preparation, image decoding/upload and shader compilation to finish.

## Development

### Repository map

| Location | Purpose |
|---|---|
| [index.html](../index.html) | Page, controls and local import map |
| [public/css](../public/css) | Design tokens and component styles |
| [public/js](../public/js) | Scene, loading, navigation, lighting, inspection and walking |
| [public/models](../public/models) | Catalog, versioned assets, annotations and audit data |
| [public/vendor](../public/vendor) | Pinned Three.js, SunCalc and Meshopt runtime |
| [scripts](../scripts) | Serving, conversion, compression and maintenance |
| [tests](../tests) | Runtime and asset-pipeline regression checks |
| [assets](../assets) | README artwork and actual app captures, with an image inventory |

Three.js is currently pinned to 0.185.1. Vendoring scripts (`vendor_three.py`, `vendor_suncalc.py`, `vendor_meshoptimizer.py`) refresh pinned dependencies and verify integrity; they are maintenance tools, not startup steps. Runtime loading does not depend on a CDN.

For source-model conversion, importing iterations and compression commands, see the [model asset pipeline](model-handoff.md#asset-pipeline).

### Verify changes

Run checks relevant to the change; for runtime or pipeline changes, the complete suite is:

```powershell
node --test --test-isolation=none tests/interface.test.mjs tests/rendering.test.mjs tests/viewer.test.mjs tests/loading.test.mjs tests/compression.test.mjs tests/navigation.test.mjs tests/instances.test.mjs
python tests/import_versions_test.py
python tests/serve_test.py
```

Checks cover real model IDs and geometry, cutaways/floors, metadata, instances, loading/gzip cancellation, navigation, walking and solar calculations. Browser validation remains necessary for WebGL textures, pointer lock, native date/time pickers and physical touch devices. After a new import, verify its building/context pair, all four modes, key spaces, inspection and geographic lighting.

### Release verification and performance evidence

Record the application revision, model/source hash, full camera URL, viewport, device DPR, effective DPR, quality, lighting/date/time, surroundings and browser/OS/hardware. The URL omits lighting and quality, so it is insufficient alone to reproduce a rendering comparison.

| Check | Evidence to record |
|---|---|
| Cold and warm load | Cache state, transfer bytes, time to usable building and time to ready context separately; check loading, failure and retry states. |
| Repeat navigation | Exterior → Dollhouse → Plan → return, floor changes, selection/close, three version changes and context toggles; confirm retained focus and absence of stale geometry. |
| Rendering cost | Same camera/lighting, with and without `instances=0`; distinguish shadow refresh from cached shadows. Record idle rendering stopping and background-tab pause. |
| Movement and input | Walk starts paused, explicit room move, walls/stairs, Fly return, Esc/blur/orientation pause; keyboard and touch controls tested separately. |
| Fidelity | Studio and daylight, glass, texture color/detail, section visibility and clipped picking; compare against the same frozen source views. |
| Device behavior | Actual phone/tablet/laptop where available; record memory/context-loss symptoms, browser zoom, keyboard entry and orientation changes. Emulation alone is not GPU or accessibility acceptance. |

Use several repeated runs and report median/tail times for loading or sustained navigation instead of an isolated best frame. `renderer.info` counts allocations/submissions rather than texture bytes or complete memory usage; the Help timer measures CPU submission, not GPU time. GPU timing requires a supported timer query/profiler. Compare against a matched baseline before defining a device-specific frame-rate or load-time target; none has yet been accepted for this project.

## Runtime contracts

### Loading, rendering and resource ownership

- Fetch/decompression and cooperative preparation respond to cancellation. `GLTFLoader.parseAsync()` and shader compilation already in progress are not forcibly interrupted; the loader checks cancellation afterward and disposes late assets. Version changes use a full page navigation. Unknown transfer totals use stages; download completion does not imply parsing/preparation is complete. See [asset-loader.js](../public/js/asset-loader.js) and [main.js](../public/js/main.js).
- Rendering runs on demand and sleeps at rest; walking and active camera transitions continue it. Background tabs pause. Collision input is prepared into a BVH in a worker instead of a long synchronous Octree build.
- Cutaway floor compatibility and walking-surface selection live in [model-policy.js](../public/js/model-policy.js). National Council galleries use world height to reconcile authored `upper` tags with the viewer's separate Room 301 option. Authored floors enter the collision index even when named `deck` or `dais`; legacy untagged geometry still uses name rules. Walking remains a subset of complete rendered geometry.
- Surroundings compile their shaders, including instance variants, before becoming visible. A toggle during preparation must not reveal an unfinished asset. Context failure has independent cleanup/retry.
- Shadow rendering and camera fitting are disabled by default and require both Sun & sky and Shadows. When enabled, maps refresh when light, geometry visibility or relevant coverage changes; brightness-only redraws can reuse them. Shadow coverage and keyboard pan account for the effective perspective field of view, including lens zoom. Plan shadow fitting uses the plan target.
- Lower power and touch-first Automatic halve transmission-buffer width and height, using one quarter of its pixels. Transparent/transmissive materials retain their original ordering and rendering.
- Source assets own geometry/materials/textures; release shared resources once. Final page exit disposes pending assets, batches, controls, environment/shadow targets and renderer resources, while preserving back/forward-cache pages.
- Search caches normalized BIM records and invalidates them when authored metadata arrives. Visibility labels remain live. Selection uses a separate unlit, depth-biased overlay and bounds frame, preserving original shared materials.

The renderer uses sRGB output, ACES filmic tone mapping and studio exposure 1. glTF supplies material/texture color-space semantics; do not manually gamma-correct already decoded colors or treat normal/ORM data as color. Neutral material comparisons must keep exposure, environment and tone mapping fixed. Daylight changes direct sun/sky while the studio environment remains illustrative; it is not a physically calibrated relighting of materials from the authoring software.

### Static batching contract

[model-primitives.js](../public/js/model-primitives.js) normalizes compatible opaque glTF primitive parts into one mesh with material groups and the parent's BIM identity. It retains attributes, indices, transforms and shared geometry; separate BIM IDs are never merged. Unsupported parts inherit parent metadata while keeping their original rendering.

[render-instances.js](../public/js/render-instances.js) batches static opaque placements using shared geometry, ordered material IDs, shadow flags, render order, culling policy and **24 m spatial cells**. At least three placements are required. Rooms and BIM families are not batching boundaries.

Original meshes retain IDs, hierarchy, metadata and world bounds and remain the authority for exact picking/collisions. Sources use reserved layer 1, batches layer 0, and the element raycaster includes both. A selected source also renders its highlight on layer 0. Selection does not rewrite instance matrices or alter other placements.

Transparent/transmissive, skinned/morphed, reflected/sheared, animated or otherwise incompatible meshes remain ordinary meshes; custom shadow materials and non-default layers also exclude batching. Changes to source transforms/visibility require `sync()`. Visibility changes compact matrices and recompute bounds; idle frames and selection do not upload unchanged matrices. Batch disposal releases instance resources and restores source layers, leaving source-owned geometry/materials intact.

For repeatable comparisons, add `stats=1` and open Help for draw calls, submitted triangles, CPU submission duration and DPR. Use `instances=0` to compare without batching at the same camera URL. Match viewport, DPR, quality, floor, surroundings and lighting, and distinguish frames that refreshed shadows. Counts include render passes; they are not unique triangle counts or FPS.

A historical v007 check at 1440 × 1000, DPR 1, studio/shadows and muted surroundings reduced submissions from 20,996 to 5,862 (72%) with batching. A v012 Exterior daylight check at 1280 × 720, DPR 1.25 recorded 14,904 calls with shadows refreshed versus 10,400 on a brightness-only redraw. These are labeled baselines, not v015 or physical-phone performance claims.

### Shared view URL contract

Coordinates are local glTF metres, Y up. Unrelated query parameters and the hash are preserved.

| Parameter | Meaning |
|---|---|
| `version` | Catalog ID, for example `bundeshaus-v015`; omitted on the root page means latest. |
| `view` | `3d`, `dollhouse`, `floorplan`, `walk`; `orbit`/`plan` are accepted aliases. Exterior retains `3d` for existing links. |
| `floor` | `all`, `entrance`, `lower`, `principal`, `upper`, validated for the version. Plan requires one floor; entrance is available from v010. |
| `pos`, `target` | Camera and look target X,Y,Z as comma-separated triples, each component within ±10,000 m. They must be at least 0.01 m apart to restore a camera. |
| `zoom` | Plan: 0.4–12; perspective/Walk: 0.05–20. Invalid values use 1. Perspective size also depends on target distance. |
| `height` | Unzoomed orthographic vertical span, 0.01–20,000 m; required for an explicit Floor plan camera in a link. |
| `orbit` | Previous perspective offset direction, used by Floor plan when returning to 3D. |
| `cut` | Plan cut offset, 0.5–8 m above its floor. |
| `surroundings`, `muted` | `1` on / `0` off; shared values override defaults without changing stored preferences. |

Updates use `replaceState` at most roughly three times a second while state changes; Copy view link flushes immediately and offers a selectable field if clipboard access fails. Coordinates round to five decimals. Non-finite values, blank vector components, degenerate directions and out-of-range values fall back safely. Explicit URL cameras take precedence over session comparison state. Walk links never initiate movement or pointer lock or assume a supported floor. On another aspect ratio, a shared plan preserves vertical span and focus while horizontal coverage adapts.

Lighting/time, quality, selection, dialogs and movement keys are omitted. Internal annotation camera modes and numeric bounds differ from public URLs; follow the [annotation contract](model-handoff.md#annotations-and-geographic-reference). A syntactically accepted URL is not proof that its camera lies inside the building or on a walkable floor. [view-url.js](../public/js/view-url.js) is the implemented parser.

## Design and adaptive layout

### Tokens and responsibilities

[index.html](../index.html) loads [token.css](../public/css/token.css) before [main.css](../public/css/main.css). Tokens own palette, typography, spacing, radii, shadows, motion, control sizes, panel widths and outer margins. Component CSS owns layout/states/media queries. [interface.js](../public/js/interface.js) owns focus, tabs, popover placement and measured toolbar/dock dimensions.

Use semantic tokens such as `--color-text-muted`, `--color-surface-raised` and `--shadow-panel`, avoiding one-off colors, font sizes and radii. Neutral selected states identify navigation; warm accents identify daylight and inferred evidence; blue outlines identify keyboard focus. `--color-selection` supplies the cyan scene highlight and inspector key. Its opaque unlit overlay remains legible on glass, textures and sunlight; a clipped twelve-segment bounds frame helps locate it without full-screen postprocessing.

Use the system font and rem typography. Spacing follows 4 px increments, with 2/6 px for compact nesting. Primary targets are at least 44 px; walking targets are at least 48 px even when touch controls are selected on a mouse-equipped device. Date/time inputs use at least 16 px text. Color supplements explicit labels and evidence badges.

Media-query thresholds and structural geometry remain literal. `--tools-top`, `--mode-height`, `--panel-top`, `--panel-height`, `--viewport-*` and `--dropdown-*` are runtime measurements, not theme tokens. Panel widths use CSS pixels because placement code reads them before constraining to the visual viewport.

### Responsive behavior and accessibility

| Layout | Edge margin | Bottom dock gap |
|---|---:|---:|
| Desktop | 32 px | 40 px |
| Large desktop, at least 1800 × 900 | 40 px | 48 px |
| Tablet width, 761–900 px | 24 px | 32 px |
| Phone / short landscape | 20 px | 28 px |

Both margins add safe-area insets. Camera controls follow the dock's measured height; panels use resolved viewport insets, including visible-height changes. Collapse secondary controls rather than shrinking targets. Keep all four mode labels readable and preserve a bounded scroll area with accessible close actions.

On phones, camera buttons use one row above the dock. Short landscape (500–759 px wide, at most 500 px high) uses one header row and Fullscreen beside the compact dock. Below 420 px, omit redundant current-mode header text. Walk hides model controls; short-screen walking setup can hide the header to preserve usable height.

Lighting uses a viewport sheet at widths up to 420 px or heights up to 500 px, and a toolbar-anchored panel on larger screens. Pin the title, Sun & sky and Close while the form scrolls, leave scroll clearance for focused controls, and stack date/hour fields where needed. Reset returns focus to the switch. Loading remains vertically centered in the visual viewport, with header/dock clearance and compact typography on short screens.

Only one dialog/popover should own focus. Escape closes it and restores its trigger without stealing focus from a newly opened dialog. Explore tabs support arrows/Home/End and a single selected tab in the Tab sequence. Keep tabs and Close available while scrolling; returning from details preserves results/query/focus. Reduced-motion preferences disable UI transitions and camera damping.

Acceptance also includes browser zoom/text resizing, keyboard-only operation and a screen-reader pass through loading, version/floor controls, Places/Elements, inspection and errors. Keep focus visible and out of sticky-header occlusion. Text/forms must reflow at a 320 CSS-pixel equivalent width; the spatial canvas's need for two-dimensional interaction does not exempt surrounding controls. Keep Elements/Places usable as text alternatives for exploration, without claiming they fully describe the 3D scene. These checks are requirements, not a declaration of WCAG conformance. [W3C reflow guidance](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).

Reference browser measurements from the v012 UI review:

| Viewport | Lighting top / height | Layout |
|---|---:|---|
| 320 × 568 | 20 / 520 px | Stacked inputs, internal scroll, pinned switch |
| 390 × 844 | 20 / 620 px | Two input columns |
| 568 × 320 | 20 / 272 px | Short landscape sheet |
| 768 × 1024 | 145 / 624 px | Tablet toolbar anchor |
| 1024 × 768 | 86 / 624 px | Small laptop |
| 1440 × 900 | 86 / 624 px | Desktop |
| 1920 × 1080 | 94 / 624 px | Large desktop margins |

The phone camera row occupies 44 px vertically, with targets at least 44 × 44 px. Loader centers measured at 422 px for 390 × 844, 240 px for 320 × 480 and 160 px for 568 × 320. Preserve these clearances when changing controls.

Reference captures: [desktop lighting](../assets/ui/lighting-desktop.jpg), [phone lighting](../assets/ui/lighting-phone.jpg), [landscape](../assets/ui/lighting-landscape.jpg), [phone navigation](../assets/ui/phone-viewer.jpg), [inspector](../assets/ui/inspector-phone.jpg). These are browser viewport checks, not physical iPhone/iPad tests. Native pickers vary by OS/browser; model memory remains a separate mobile constraint.

## Review findings

Domain review, 9 September 2026: checked the guide against loading/navigation/layout code, the pinned renderer and current catalog. Corrections below are documentation changes; the historical viewport captures and timings above were not remeasured in this review.

| Finding | Recommendation implemented in this guide |
|---|---|
| Quality was described as resolution-only. | Document pixel/DPR caps, shadow size and transmission scale, including the input-device heuristic. |
| Cancellation and optional-context memory behavior were overstated. | Distinguish cancellable streams from in-flight parsing/compilation; document retained hidden assets and page reloads between versions. |
| Browser and deployment prerequisites were implicit. | State WebGL 2/gzip requirements, hosting layout, failure diagnostics and fallback limits. |
| Reproducibility relied too heavily on shared URLs and old measurements. | Add omitted state, hashes, repeat-run evidence and separate CPU/GPU/memory measures. |
| Responsive dimensions could be mistaken for complete accessibility/device validation. | Add zoom, keyboard, screen-reader and physical-device acceptance, explicitly still to be performed. |

Remaining implementation choices include optional context unloading, interruptible heavy decoding and automatic graphics-context recovery; none is promised by the current guide. Update implementation claims from code and keep historical measurements labeled when changing the renderer or models.

Technical references: [Three.js GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html), [InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html), [WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html), [texture memory](https://threejs.org/manual/en/textures.html).
