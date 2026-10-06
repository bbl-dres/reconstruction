# Viewer guide

[← Project overview](../README.md) · [Model handoff](model-handoff.md) · [Live app](https://bbl-dres.github.io/reconstruction/reconstructions/bundeshaus/)

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
python tools/serve.py --building bundeshaus
```

Open the printed address, e.g. [localhost:8000/reconstructions/bundeshaus/](http://localhost:8000/reconstructions/bundeshaus/); the gallery is at [localhost:8000](http://localhost:8000/). Stop with Ctrl+C; use `--port 8001` for another port. On Windows, `.\tools\serve.ps1 -Building bundeshaus` is an alternative. The server never serves `work/`, `tools/`, `tests/` or dot folders. The server binds to localhost and negotiates precompressed model delivery. A generic static server also works, but may transfer larger files. Opening `index.html` with `file://` does not support modules and model loading.

The app uses vanilla JavaScript and Three.js, with models and runtime dependencies in the repository. There is no build step, npm installation or backend service. Edit HTML, CSS or JavaScript and refresh.

### Browser and hosting requirements

Use a browser with WebGL 2, ES modules/import maps, fetch streams, native dialogs and the JavaScript APIs used by the local loader; walking collision preparation also uses a worker. The pinned renderer has no WebGL 1 fallback. Explicit gzip assets need `DecompressionStream('gzip')` when hosting delivers their raw compressed bytes. Check capabilities and actual failures rather than assuming that a browser brand or a desktop-sized viewport proves compatibility. [Three.js renderer requirements](https://threejs.org/docs/pages/WebGLRenderer.html).

Serve the project folder (`reconstructions/bundeshaus/`), including `index.html`, `public/` and their relative paths. Keep JavaScript responses as JavaScript, not an HTML fallback/error page. The catalog and its assets must be deployed together; publish the catalog only after its referenced files are available. The local file server and deployed static site already follow this structure. Opening an old browser tab after deployment can retain an earlier module graph.

Walk and Fly look by dragging with any pointer, so they never need pointer lock. Clipboard access has a selectable-link fallback. Storage failures do not stop viewing, but saved preferences and lighting continuity between versions may be unavailable. WebGL context loss currently shows a reload/retry error; automatic restoration of the scene is not implemented.

### Navigate and inspect

With no shared view to restore, the root page starts in **Exterior**, with all levels of the published model version. Surroundings and their muted grey style default to on, with stored preferences or URL values taking precedence. Sun & sky defaults to off.

The layout follows the [v2 design study](wireframes/Bundeshaus%20Viewer%20Redesign%20v2.html): the model tree and places in a floating panel at the top left (option 1a of the [tree panel study](wireframes/Tree%20Panel%20Study.html), keeping the compact tabs and filter), Lighting and Surroundings centred at the top, GitHub, All reconstructions, the language, Help and More at the top right, Home, zoom in and zoom out stacked at the right edge, the view dock at the bottom centre and the navigation switch at the bottom right. The interface shows no counts or statistics. The interface is available in English, German, French and Italian (see [Languages](#languages)).

The dock chooses what the scene shows; the navigation switch chooses how you move.

| View | Shows |
|---|---|
| Exterior | The full building and its surroundings. |
| Dollhouse | Enclosure, attached lining, roofs and ceilings hidden to expose the interior from outside. |
| Floor plan | Orthographic top view of one level. Drag to pan, scroll/pinch to zoom. The **Cut** height slider appears in the dock. |

| Navigation | Controls |
|---|---|
| Orbit | Drag to orbit, right-drag to pan, scroll or pinch to zoom. |
| Fly | Starts at once from the current camera without collisions. WASD/arrows move, drag looks, E rises, Q descends, Shift speeds up. |
| Walk | Starts at once at eye level with collisions; a viewpoint above the floor starts in the first room instead. WASD/arrows move, drag looks, Shift speeds up, Space jumps. Touch screens add a direction pad. |

Fly and Walk see through their own eye-level lens, about 90° across on landscape screens and held between 60° and 80° vertically so tall phone screens do not bend into a fisheye; Orbit keeps its 45° lens. Switching keeps the position and gaze, not the lens.

Fly and Walk keep the Exterior or Dollhouse visibility they started from; choosing either in the dock while on foot changes it without leaving. Floor plan returns to Orbit. Phones offer Orbit and Walk only. Every control stays in view while moving, so Orbit, Fly and Walk switch at any time, without a pause step. Switching from Fly to Walk returns to the last supported walking position, or the first room. Clicking or tapping an element inspects it in every mode; dragging looks around instead. **Home** and the inspector's **Zoom to** return Fly and Walk to Orbit before framing; the R shortcut returns home only in Orbit and Floor plan, because it sits beside E (rise). **Zoom in** and **Zoom out** move closer in Orbit and Floor plan; in Fly and Walk they narrow the eye-level lens up to four times for a closer look and never widen it.

Exterior and Dollhouse share a camera. Floor plan retains the focus and visible vertical span; returning preserves its pan/zoom and the previous perspective angle. Level changes retain horizontal focus and zoom. **Home**, at the top of the camera rail at the right edge, explicitly reframes the building.

With the canvas focused, arrows rotate, Shift + arrows pan, + / − zoom and R fits the building. In Floor plan, arrows pan. H or ? opens Help. Escape closes a dropdown and returns focus to its trigger, or closes the element callout.

**Model** lists the published version's levels, top to bottom, then categories, types and elements. With a published BIM registry, elements are whole products on their reviewed primary storey; components without a product follow their height to the nearest level and list under their registry category (types named *Other components*). Without a registry, each mesh is an element grouped by its exported category and type. Choosing a level filters the model to the elements assigned to it in the tree, in every view, without changing the view; choosing it again shows all levels. Floor plan always shows one level and also cuts at its cut height; when it picks the level itself, leaving the plan shows all levels again. Hovering or focusing a row shows **Zoom to**, **Isolate** and **Show or hide**; hidden and isolated rows keep their state icon, and **Show all** in the footer clears both. Hiding is a viewing aid: collisions and shared links ignore it. **Filter** matches every word against an element's path, so "principal window" lists the principal floor's windows. Long lists show 50 rows at a time with **More…**. Arrow keys move between rows, Right/Left expand, collapse or go to the parent, and Enter chooses. **Places** lists saved views and points of interest.

Click or tap a visible building element to highlight it. A callout opens beside the picked point with its category, level, type, room and IFC class, and follows it while the camera moves; on phones it opens below the header. **Zoom to** frames the element, **Hide** hides it and **In tree** opens its row. **Properties & sources** lists the remaining properties, the original model name and ID in the same grid, marks inferred values with their confidence, and lists each evidence text once. Choosing an element in the tree selects it the same way and frames it when it is out of view; with a level chosen, elements on another level switch the filter to theirs. Dragging or multitouch does not select; hits behind cut planes are ignored. Clicking empty space, the close button or Escape clears the selection. Context buildings are outside the current inspection scope.

Only the latest version is published: [the catalog](../reconstructions/bundeshaus/public/models/catalog.json) lists it alone, and retired versions stay in the local, gitignored `work/archive/models/` of each reconstruction ([public/README.md](../reconstructions/bundeshaus/public/README.md#published-version)). A shared link that names a retired version opens the published one with a notice; its camera, mode and compatible floor/cut height still apply. A URL pins a version label, not immutable bytes: replacing the published version changes what a link loads.

### Surroundings, lighting and quality

The building loads first, followed by the matching surroundings without moving the camera; site views under Places frame the neighborhood. Floor plan temporarily hides it. Context loading has its own retry. The **Surroundings** dropdown in the top bar has two switches: **Show surroundings** (on by default) and **Grey** (on by default; off shows the original materials/aerial imagery). Its note shows download progress and errors, with **Retry surroundings**. Surroundings preferences are remembered locally.

Turning surroundings off hides a loaded asset; it does not unload its geometry/textures or cancel a context download already in progress. To avoid the optional context load on a constrained device, open with `?surroundings=0` before loading. Muted grey is an appearance treatment and retains the original resources for switching back.

**Lighting**, left of Surroundings, opens the daylight dropdown. **Sun & sky** reveals Date, Hour in Bern, sunrise/sunset and **Now** only when enabled; **Shadows**, **Brightness** and **Reset lighting** are always available. **Shadows default to off**, including when first enabling the sun; turn them on explicitly for cast shadows. **Now** selects the current date/time. Date and time determine direction, with no competing manual direction slider.

The viewer opens in **Exterior** with studio lighting: a fixed warm key sun from the model's south-east (42° elevation) and an outdoor sky (blue zenith, bright horizon, dark ground) prefiltered once as image-based light, defined in [viewer/js/lighting.js](../viewer/js/lighting.js) for every building. It is tuned to read as a sunny day without shadow maps: sun-facing facades sit just under the tone-mapping shoulder, facades in shade at about 40 % of them, undersides darker still. **Shadows** are off by default and apply, when enabled, to both studio and daylight; Floor plan renders without shadows. Daylight initially previews today's noon; at full daylight it uses the studio light budget, so toggling keeps exposure. Disabling it restores the black-background studio sun. **Brightness** applies to both. **Reset lighting** restores studio lighting with shadows off and brightness 1. A user's explicit shadow choice survives toggling the sun or comparing versions, but a fresh visit resets it. Floor plan suppresses the sky but keeps illumination. Bern civil time includes Europe/Zurich daylight-saving changes; invalid/incomplete dates retain the last valid lighting and display guidance.

The sun preview is qualitative: approximate geometry/georeferencing, illustrative ambient fill and finite shadow maps limit accuracy. Cutaway visibility changes the shadow casters. It is not daylight-compliance or energy analysis.

**More → Rendering quality** changes drawing-buffer resolution, the sun shadow map and the glass transmission buffer. These are caps, not guaranteed resolutions; the effective DPR is the lowest of device DPR, the preset cap and the pixel-budget limit. Current values come from [renderBudget](../viewer/js/view-layout.js):

| Preset | Pixel budget | DPR cap | Shadow-map side | Transmission scale |
|---|---:|---:|---:|---:|
| Automatic, touch-first | 3 million | 1.25 | 1024 | 0.5 |
| Automatic, other devices | 5 million | 1.5 | 2048 | 1 |
| Lower power | 2 million | 1 | 1024 | 0.5 |
| Higher detail | 8 million | 2 | 2048 | 1 |

Transmission scale applies to both dimensions: 0.5 uses one quarter of the buffer pixels. The presets reduce render-target costs, not model download size, placed geometry or source image storage. Automatic is an input-device heuristic, not a GPU benchmark or adaptive FPS controller. V015's building and context image estimates total about 310 MiB before other CPU/GPU allocations; a small gzip download is not a mobile memory budget.

### Share a view and troubleshoot

**More → Copy view link** captures version, mode, floor, camera position/target, zoom, cut height and surroundings choices. Navigation updates the address without filling browser history. Walk links open walking at the linked camera. Lighting/time and selected elements are not currently shared. A localhost link points to the recipient's own machine; use the hosted app for public links. See the [URL contract](#shared-view-url-contract).

If a deployment reports a missing module or Meshopt decoder after an update, try a full refresh or a new window to clear an older page/module combination. If it persists, inspect the browser console and failed network request rather than assuming a model defect. Sun & sky requires a valid per-version geographic reference. A context error does not require reloading an already usable building.

For a reproducible report, include the page URL, browser/OS, viewport/DPR, selected quality, surroundings/daylight state, first console error and failed request/status. Distinguish transfer failure, gzip/mesh decoding, annotation warnings and WebGL context loss. Progress reaching the end of the download can still leave geometry preparation, image decoding/upload and shader compilation to finish.

## Development

### Repository map

| Location | Purpose |
|---|---|
| [viewer/shell.html](../viewer/shell.html) | Shared interface markup; `{{name}}`, `{{place}}`, `{{about}}` and `{{links}}` are filled from the building configuration |
| [viewer/js/boot.js](../viewer/js/boot.js) | Loads `public/building.json` and the shell, then starts `main.js` |
| [viewer/css](../viewer/css) | Design tokens and component styles |
| [viewer/js](../viewer/js) | Scene, loading, navigation, lighting, inspection and walking |
| [viewer/js/policy-default.js](../viewer/js/policy-default.js) | Default cutaway, floor and walking policy for buildings authored to the model contract |
| [viewer/js/lighting.js](../viewer/js/lighting.js) | Shared studio lighting (key sun, sky environment, tone mapping; shadows opt-in) and the daylight light budget for every building |
| [viewer/vendor](../viewer/vendor) | Pinned Three.js, SunCalc and Meshopt runtime |
| `reconstructions/<id>/index.html` | Thin entry page: stylesheets, import map (including `building-policy`) and `boot.js` |
| `reconstructions/<id>/public/` | `building.json`, `about.html`, `models/`, `profiles/`, `previews/`, `docs/` and an optional legacy `policy/` |
| [tools/model-pipeline](../tools/model-pipeline) | Conversion, compression, BIM registry, IFC export, audit and vendoring |
| [tools/serve.py](../tools/serve.py) | Local server for the gallery and all viewers |
| [tests](../tests) | Runtime and asset-pipeline regression checks |

A new building needs no viewer code: see [Adding a building](adding-a-building.md).

Three.js is currently pinned to 0.185.1. Vendoring scripts (`vendor_three.py`, `vendor_suncalc.py`, `vendor_meshoptimizer.py`) refresh pinned dependencies and verify integrity; they are maintenance tools, not startup steps. Runtime loading does not depend on a CDN.

For source-model conversion, importing iterations and compression commands, see the [model asset pipeline](model-handoff.md#asset-pipeline).

### Verify changes

Run checks relevant to the change from the repository root; for runtime or pipeline changes, the complete suite is:

```powershell
node --test --test-isolation=none tests/*.test.mjs
python tests/import_versions_test.py
python tests/serve_test.py
python tests/bim_test.py
```

The Bundeshaus geometry tests read the archived versions from `reconstructions/bundeshaus/work/archive/models/` and are skipped where it is missing. Tests resolve the `building-policy` import to the Bundeshaus policy, as its page does.

Checks cover real model IDs and geometry, cutaways/floors, metadata, instances, loading/gzip cancellation, navigation, walking and solar calculations. Browser validation remains necessary for WebGL textures, native date/time pickers and physical touch devices. After a new import, verify its building/context pair, all four modes, key spaces, inspection and geographic lighting.

### Release verification and performance evidence

Record the application revision, model/source hash, full camera URL, viewport, device DPR, effective DPR, quality, lighting/date/time, surroundings and browser/OS/hardware. The URL omits lighting and quality, so it is insufficient alone to reproduce a rendering comparison.

| Check | Evidence to record |
|---|---|
| Cold and warm load | Cache state, transfer bytes, time to usable building and time to ready context separately; check loading, failure and retry states. |
| Repeat navigation | Exterior → Dollhouse → Plan → return, floor changes, selection/close and context toggles; confirm retained focus and absence of stale geometry. |
| Rendering cost | Same camera/lighting, with and without `instances=0`; distinguish shadow refresh from cached shadows. Record idle rendering stopping and background-tab pause. |
| Movement and input | Walk and Fly start at once and switch in place, walls/stairs, Fly return, keys released on blur/orientation change; keyboard and touch controls tested separately. |
| Fidelity | Studio and daylight, glass, texture color/detail, section visibility and clipped picking; compare against the same frozen source views. |
| Device behavior | Actual phone/tablet/laptop where available; record memory/context-loss symptoms, browser zoom, keyboard entry and orientation changes. Emulation alone is not GPU or accessibility acceptance. |

Use several repeated runs and report median/tail times for loading or sustained navigation instead of an isolated best frame. `renderer.info` counts allocations/submissions rather than texture bytes or complete memory usage; the About timer measures CPU submission, not GPU time. GPU timing requires a supported timer query/profiler. Compare against a matched baseline before defining a device-specific frame-rate or load-time target; none has yet been accepted for this project.

## Runtime contracts

### Loading, rendering and resource ownership

- Fetch/decompression and cooperative preparation respond to cancellation. `GLTFLoader.parseAsync()` and shader compilation already in progress are not forcibly interrupted; the loader checks cancellation afterward and disposes late assets. Version changes use a full page navigation. Unknown transfer totals use stages; download completion does not imply parsing/preparation is complete. See [asset-loader.js](../viewer/js/asset-loader.js) and [main.js](../viewer/js/main.js).
- Rendering runs on demand and sleeps at rest; walking and active camera transitions continue it. Background tabs pause. Collision input is prepared into a BVH in a worker instead of a long synchronous Octree build.
- Cutaway floor compatibility and walking-surface selection live in [model-policy.js](../reconstructions/bundeshaus/public/policy/model-policy.js). National Council galleries use world height to reconcile authored `upper` tags with the viewer's separate Room 301 option. Authored floors enter the collision index even when named `deck` or `dais`; legacy untagged geometry still uses name rules. Walking remains a subset of complete rendered geometry.
- Surroundings compile their shaders, including instance variants, before becoming visible. A toggle during preparation must not reveal an unfinished asset. Context failure has independent cleanup/retry.
- Shadow rendering and camera fitting are disabled by default and require both Sun & sky and Shadows. When enabled, maps refresh when light, geometry visibility or relevant coverage changes; brightness-only redraws can reuse them. Shadow coverage and keyboard pan account for the effective perspective field of view, including lens zoom. Plan shadow fitting uses the plan target.
- Lower power and touch-first Automatic halve transmission-buffer width and height, using one quarter of its pixels. Transparent/transmissive materials retain their original ordering and rendering.
- Source assets own geometry/materials/textures; release shared resources once. Final page exit disposes pending assets, batches, controls, environment/shadow targets and renderer resources, while preserving back/forward-cache pages.
- Search caches normalized BIM records and invalidates them when authored metadata arrives. Visibility labels remain live. Selection overlays the source node with a light tint and its edges (computed once per selection), preserving original shared materials and leaving render batches untouched.

The renderer uses sRGB output, Khronos PBR Neutral tone mapping (`THREE.NeutralToneMapping`) and studio exposure 1. Neutral keeps base colours and texture saturation up to its highlight shoulder; ACES filmic, used until October 2026, scaled exposure by 1/0.6 and desaturated bright surfaces, which pushed white plaster to clipping. The light budget in lighting.js keeps a sunlit plaster facade (albedo 0.70) just under the shoulder and a shaded one at roughly 40 % of it (tests/lighting.test.mjs). This assumes physically plausible base colours (see the model handoff); the viewer does not rescale bright albedo. glTF supplies material/texture color-space semantics; do not manually gamma-correct already decoded colors or treat normal/ORM data as color. Neutral material comparisons must keep exposure, environment and tone mapping fixed. Daylight changes direct sun/sky while the studio environment remains illustrative; it is not a physically calibrated relighting of materials from the authoring software.

### Static batching contract

[model-primitives.js](../viewer/js/model-primitives.js) normalizes compatible opaque glTF primitive parts into one mesh with material groups and the parent's BIM identity. It retains attributes, indices, transforms and shared geometry; separate BIM IDs are never merged. Unsupported parts inherit parent metadata while keeping their original rendering.

[render-instances.js](../viewer/js/render-instances.js) batches static opaque placements using shared geometry, ordered material IDs, shadow flags, render order, culling policy and **24 m spatial cells**. At least three placements are required. Rooms and BIM families are not batching boundaries.

Original meshes retain IDs, hierarchy, metadata and world bounds and remain the authority for exact picking/collisions. Sources use reserved layer 1, batches layer 0, and the element raycaster includes both. A selected source also renders its highlight on layer 0. Selection does not rewrite instance matrices or alter other placements.

Transparent/transmissive, skinned/morphed, reflected/sheared, animated or otherwise incompatible meshes remain ordinary meshes; custom shadow materials and non-default layers also exclude batching. Changes to source transforms/visibility require `sync()`. Visibility changes compact matrices and recompute bounds; idle frames and selection do not upload unchanged matrices. Batch disposal releases instance resources and restores source layers, leaving source-owned geometry/materials intact.

For repeatable comparisons, add `stats=1` and open **Help → About this model** for draw calls, submitted triangles, CPU submission duration and DPR. Use `instances=0` to compare without batching at the same camera URL. Match viewport, DPR, quality, floor, surroundings and lighting, and distinguish frames that refreshed shadows. Counts include render passes; they are not unique triangle counts or FPS.

A historical v007 check at 1440 × 1000, DPR 1, studio/shadows and muted surroundings reduced submissions from 20,996 to 5,862 (72%) with batching. A v012 Exterior daylight check at 1280 × 720, DPR 1.25 recorded 14,904 calls with shadows refreshed versus 10,400 on a brightness-only redraw. These are labeled baselines, not v015 or physical-phone performance claims.

### Shared view URL contract

Coordinates are local glTF metres, Y up. Unrelated query parameters and the hash are preserved.

| Parameter | Meaning |
|---|---|
| `version` | Catalog ID, for example `bundeshaus-v027`; omitted means the published version. A retired version opens the published one with a notice. |
| `view` | `3d`, `dollhouse`, `floorplan`, `walk`; `orbit`/`plan` are accepted aliases. Exterior retains `3d` for existing links. |
| `floor` | `all`, `entrance`, `lower`, `principal`, `upper`, validated for the version. Plan requires one floor; entrance is available from v010. |
| `pos`, `target` | Camera and look target X,Y,Z as comma-separated triples, each component within ±10,000 m. They must be at least 0.01 m apart to restore a camera. |
| `zoom` | Plan: 0.4–12; perspective: 0.05–20. Invalid values use 1. Perspective size also depends on target distance. Walk always opens with its eye-level lens. |
| `height` | Unzoomed orthographic vertical span, 0.01–20,000 m; required for an explicit Floor plan camera in a link. |
| `orbit` | Previous perspective offset direction, used by Floor plan when returning to 3D. |
| `cut` | Plan cut offset, 0.5–8 m above its floor. |
| `surroundings`, `muted` | `1` on / `0` off; shared values override defaults without changing stored preferences. |

Updates use `replaceState` at most roughly three times a second while state changes; Copy view link flushes immediately and offers a selectable field if clipboard access fails. Coordinates round to five decimals. Non-finite values, blank vector components, degenerate directions and out-of-range values fall back safely. Explicit URL cameras take precedence over session comparison state. Walk links never initiate movement or pointer lock or assume a supported floor. On another aspect ratio, a shared plan preserves vertical span and focus while horizontal coverage adapts.

Lighting/time, quality, selection, dialogs and movement keys are omitted. Internal annotation camera modes and numeric bounds differ from public URLs; follow the [annotation contract](model-handoff.md#annotations-and-geographic-reference). A syntactically accepted URL is not proof that its camera lies inside the building or on a walkable floor. [view-url.js](../viewer/js/view-url.js) is the implemented parser.

## Design and adaptive layout

### Tokens and responsibilities

[shell.html](../viewer/shell.html) holds the interface markup; each building page loads [token.css](../viewer/css/token.css), then [app-tools.css](../viewer/css/app-tools.css), then [main.css](../viewer/css/main.css). Tokens own palette, typography, spacing, radii, shadows, motion, control sizes, component widths (sidebar, dropdowns, inspector) and outer margins. Component CSS owns layout/states/media and container queries. app-tools.css holds what every page shares: the top bar with its toolbar (`.toolbar.app-tools`: GitHub, All reconstructions, language, help and, in the viewer, More), its dropdowns and the help panel, with the phone (icon-only) toolbar. The gallery loads token.css and app-tools.css too, and the splat viewers carry both inlined (`make_viewer.py`), so the toolbar looks the same on every page; change it there, not per page. The viewers place it at the top right of the screen; the gallery places it at the right end of its header, which is as wide as the cards, beside Gallery | Map. [interface.js](../viewer/js/interface.js) owns tabs, dropdown placement and the sidebar/sheet state; [model-tree.js](../viewer/js/model-tree.js) builds the tree, filter and hidden sets without the DOM.

Use semantic tokens such as `--color-text-muted`, `--color-surface-raised` and `--shadow-panel`, avoiding one-off colors, font sizes and radii. Neutral selected states identify navigation; warm accents identify daylight and inferred evidence; blue outlines identify keyboard focus. `--color-selection` supplies the cyan scene highlight, pick marker and inspector key. The highlight keeps the element's own look: a light unlit tint over its surfaces, its edges in the selection color, and its hidden edges faintly through whatever covers them so it can still be found, all without full-screen postprocessing.

Use the system font and rem typography. Spacing follows 4 px increments, with 2/6 px for compact nesting. Floating controls are 40–44 px; phone dock buttons are 52 px tall and tree rows 44 px; walking targets are at least 48 px. Date/time inputs and the phone filter use 16 px text on touch screens. Color supplements explicit labels and evidence badges.

Media-query thresholds and structural geometry remain literal. `--viewport-*`, `--dropdown-*`, `--depth` (tree indent) and `--arrow-y` (callout arrow) are runtime values, not theme tokens. Dropdown widths use CSS pixels because placement code reads them before constraining to the visual viewport.

### Languages

[viewer/data/i18n.json](../viewer/data/i18n.json) holds every interface string by key in English (the default), German, French and Italian; the language menu at the top right switches them at once and the choice is remembered locally. Model content stays as authored: element, room and level names, saved places, the about page and the inspector's **Properties & sources**. German uses Swiss spelling (ss, never ß).

In [shell.html](../viewer/shell.html), `data-i18n="key"` sets an element's text, `data-i18n-attr="aria-label:key title:key"` sets attributes, and `data-i18n-html` is reserved for the keyboard help's `<kbd>` markup. Code uses `t('key', { name })` from [i18n.js](../viewer/js/i18n.js); every string may use the building's `{name}`, and numbers use `formatNumber` for the language's decimal separator. Text the code writes itself is redrawn on a language change. Add each new key to all four languages: [tests/i18n.test.mjs](../tests/i18n.test.mjs) fails on a missing, unused or untranslated key, mismatched placeholders, or ß.

The gallery and the splat viewers have the same language menu, with their own tables in the same format: [gallery/data/i18n.json](../gallery/data/i18n.json) for the gallery's interface, and [i18n.json](../reconstructions/von-wattenwyl-haus/viewer/i18n.json) beside the splat overlay, inlined by `make_viewer.py`. The gallery uses the viewer's i18n.js and interface.js. All pages remember the choice under the same key, so a language chosen on one page holds on the others. The gallery's entries in [reconstructions.json](../gallery/data/reconstructions.json) carry their own `translations`; the test checks those tables and entries too.

### Responsive behavior and accessibility

| Layout | Sidebar | Edge margin | Bottom gap |
|---|---|---:|---:|
| Desktop, at least 1100 px wide | Floats at the top left, as tall as its content up to the dock; collapses to its header | 24 px | 28 px |
| Large desktop, at least 1800 × 900 | Floating, 320 px | 32 px | 32 px |
| 761–1099 px wide | Floating; starts collapsed to its header | 24 px | 28 px |
| Phone landscape, 761–1099 px wide and at most 500 px high | Floating; starts collapsed to its header | 16 px | 16 px |
| Phone, at most 760 px wide | Bottom sheet; collapsed to "Model · level" | 20 px | 20 px |

Margins add safe-area insets. The stage is a size container: below 780 px, and below 1000 px while the Floor plan cut slider is shown, the dock keeps icons and moves its labels to screen readers so it stays clear of the navigation switch. Dropdowns align with the right edge of their trigger inside the stage; on screens up to 420 px wide or 500 px high they use the available height like a sheet. The inspector callout stays between the toolbar and the dock and flips to the left of its point near the right edge. Below a 1280 px stage the top bar's All reconstructions link keeps only its icon, and below 1000 px Lighting and Surroundings do too, so the bar stays clear of the sidebar. On phones the toolbars are icon-only: Lighting and Surroundings sit just left of the toolbar, which shows the language code, and Help, GitHub and All reconstructions move into More; the dock combines views with Orbit and Walk above the sheet; Floor plan's cut slider floats above the dock; the tree keeps only the show/hide button. Walk and Fly hide nothing: on touch screens the direction pad sits at the bottom left (above the dock on phones) and Jump, Rise and Descend take the navigation hint's place.

Dropdowns are native popovers: Escape or an outside click closes them and focus returns to the trigger. The tree is a single Tab stop with arrow-key movement; the active row's actions follow its label in the Tab order and are revealed on hover or focus. Sidebar and help tabs support arrows/Home/End with a single selected tab in the Tab sequence. Reduced-motion preferences disable UI transitions and camera damping.

Acceptance also includes browser zoom/text resizing, keyboard-only operation and a screen-reader pass through loading, level choice, the model tree and Places, inspection and errors. Keep focus visible on controls; the 3D view draws no outline because every click focuses it for its keyboard shortcuts. Text/forms must reflow at a 320 CSS-pixel equivalent width; the spatial canvas's need for two-dimensional interaction does not exempt surrounding controls. Keep the model tree and Places usable as text alternatives for exploration, without claiming they fully describe the 3D scene. These checks are requirements, not a declaration of WCAG conformance. [W3C reflow guidance](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).

The v2 layout was checked in a headless browser at 1440 × 900, 1280 × 800, 1024 × 768, 844 × 390 and 390 × 844; these are viewport checks, not physical phone/tablet tests. The reference captures in [previews/ui](../reconstructions/bundeshaus/public/previews/ui/) and the v012 measurements of the earlier layout are historical and need replacing with captures of this layout. Native pickers vary by OS/browser; model memory remains a separate mobile constraint.

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
