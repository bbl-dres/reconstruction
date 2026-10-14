# Viewer

[← Repository](../README.md) · [Handbook](handbook.md) · [Live app](https://bbl-dres.github.io/reconstruction/)

The shared no-build Three.js viewer: how to use and develop it, and the contract a model meets to be shown in it. Every building uses the same viewer and needs no viewer code of its own. Building-specific floor schedules, Dollhouse exceptions and product counts stay in that building's private `work/` records. Performance measurements are in [viewer/PERFORMANCE.md](../viewer/PERFORMANCE.md).

The models are experimental reconstructions researched by an LLM from public data. Dimensions, unseen spaces and some properties are inferred; none is a surveyed or engineering-verified BIM model.

## Contents

- [Using the viewer](#using-the-viewer): navigation, lighting, sharing, troubleshooting
- [Development](#development): repository map, tests, performance evidence
- [Runtime](#runtime): loading, batching and the shared-view URL
- [Design and layout](#design-and-layout): tokens, languages, responsive layout and accessibility
- [Model contract](#model-contract): object properties, families and types, floors, Dollhouse, budgets
- [Asset pipeline](#asset-pipeline): Blender conversion, imports and compression
- [Annotations and geographic reference](#annotations-and-geographic-reference): `viewer.json` and the daylight location
- [BIM registry](#bim-registry): `bim.json` products, types and identity
- [IFC delivery](#ifc-delivery): reference export and interoperability
- [Delivery checklist](#delivery-checklist)

## Using the viewer

### Start locally

```sh
python tools/serve.py --building bundeshaus
```

Open the printed address, for example [localhost:8000/reconstructions/bundeshaus/](http://localhost:8000/reconstructions/bundeshaus/); the gallery is at [localhost:8000](http://localhost:8000/). Use `--port 8001` for another port; on Windows `.\tools\serve.ps1 -Building bundeshaus` also works. The server binds to localhost, never serves `work/`, `tools/`, `tests/` or dot folders, and negotiates precompressed model delivery. A generic static server works but may transfer larger files; `file://` cannot load the modules or models.

There is no build step, npm installation or backend: vanilla JavaScript and Three.js, with all runtime dependencies in the repository. Edit and refresh.

### Browser and hosting

The viewer needs WebGL 2, ES modules and import maps, fetch streams and native dialogs; walking collision uses a worker. There is no WebGL 1 fallback. Explicit gzip assets need `DecompressionStream('gzip')` when hosting delivers the raw compressed bytes. Check actual capabilities and failures rather than a browser brand.

Serve the building folder with `index.html`, `public/` and their relative paths, and keep JavaScript responses as JavaScript, not an HTML error page. Deploy the catalog only after the files it references. An old tab can keep an earlier module graph after a deployment.

Walk and Fly look by dragging, so they never need pointer lock. Clipboard access has a selectable-link fallback. Storage failures do not stop viewing but lose saved preferences. WebGL context loss shows a reload error; the scene is not restored automatically.

### Navigate and inspect

Without a shared view the page opens in **Exterior** with all levels of the published version, surroundings on in muted grey and Sun & sky off; stored preferences and URL values take precedence.

The layout follows the [v2 design study](wireframes/Bundeshaus%20Viewer%20Redesign%20v2.html) and option 1a of the [tree panel study](wireframes/Tree%20Panel%20Study.html): model tree and places floating at the top left; Lighting and Surroundings centred at the top; GitHub, All reconstructions, language, Help and More at the top right; Home and zoom at the right edge; the view dock at the bottom centre; the navigation switch at the bottom right. The interface shows no counts or statistics.

The dock chooses what the scene shows; the navigation switch chooses how you move.

| View | Shows |
|---|---|
| Exterior | The full building and its surroundings. |
| Dollhouse | The interior from outside, with enclosure, attached lining, roofs and ceilings hidden. |
| Floor plan | Orthographic top view of one level, cut 1 m above its floor. Standing objects are drawn whole; what hangs above the cut is cut away. Choose the level in the model tree; drag to pan, scroll or pinch to zoom. |

| Navigation | Controls |
|---|---|
| Orbit | Drag to orbit, right-drag to pan, scroll or pinch to zoom. |
| Fly | Starts from the current camera without collisions. WASD or arrows move, drag looks, E rises, Q descends, Shift speeds up. |
| Walk | Starts where the camera is, at eye level with collisions: from a raised view it drops onto the first surface below (a floor or the terrain); with nothing below it keeps flying. WASD or arrows move, drag looks, Shift speeds up, Space jumps. Touch screens add a direction pad. |

Fly and Walk use an eye-level lens (about 90° across on landscape screens, held between 60° and 80° vertically); Orbit keeps 45°. Switching keeps position and gaze. Fly and Walk keep the Exterior or Dollhouse visibility they started from; Floor plan returns to Orbit. Phones offer Orbit and Walk only. Clicking or tapping inspects in every mode; dragging looks around. **Home** and **Zoom to** return Fly and Walk to Orbit before framing. **Zoom in** and **Zoom out** move closer in Orbit and Floor plan and narrow the lens (up to four times) in Fly and Walk.

Exterior and Dollhouse share a camera; Floor plan keeps the focus and returns to the previous perspective. With the canvas focused, arrows rotate (pan in Floor plan), Shift + arrows pan, + / − zoom, R fits the building (only in Orbit and Floor plan, because it sits beside E), H or ? opens Help, and Escape closes a dropdown or the callout.

**Model** lists the version's levels top to bottom, then categories, types and elements. With a BIM registry, elements are whole products on their primary storey; components without a product follow their height to the nearest level as *Other components*. Without a registry, each mesh is an element grouped by its exported category and type. Choosing a level filters every view to it; choosing it again shows all levels. Rows offer **Zoom to**, **Isolate** and **Show or hide**; **Show all** clears both. Hiding is a viewing aid: collisions and shared links ignore it. **Filter** matches every word against an element's path. Long lists show 50 rows at a time. **Places** lists saved views and points of interest.

Clicking an element highlights it and opens a callout with category, level, type, room and IFC class: **Zoom to**, **Hide**, **In tree**, and **Properties & sources** with the remaining properties, inferred values with their confidence and each evidence text once. Hits behind cut planes are ignored; empty space, the close button or Escape clears the selection. Context buildings are not inspectable.

Only the latest version is published: the catalog lists it alone and retired versions stay in the building's gitignored `work/archive/models/`. A link naming a retired version opens the published one with a notice, keeping its camera, mode and compatible floor. A URL pins a version label, not immutable bytes.

### Surroundings, lighting and quality

Building and surroundings download together behind one loading card; if the surroundings fail, the building opens alone and the surroundings get their own retry. A link that turns surroundings off or opens Floor plan loads the building first. The **Surroundings** dropdown has **Show surroundings** and **Grey**, both on by default and remembered locally. Hiding surroundings does not unload them; open with `?surroundings=0` to skip the download on a constrained device.

**Lighting** opens the daylight dropdown: **Sun & sky** reveals Date, Hour in Bern, sunrise and sunset and **Now**; **Shadows** (off by default), **Brightness** and **Reset lighting** are always available. The default studio lighting ([lighting.js](../viewer/js/lighting.js)) is a fixed warm key sun from the model's south-east at 42° and a prefiltered outdoor sky, tuned to read as a sunny day without shadow maps. Daylight uses the same light budget, so toggling keeps exposure. Bern civil time includes daylight saving. The sun preview is qualitative, not daylight or energy analysis.

**More → Rendering quality** caps drawing-buffer resolution, the shadow map and the transmission buffer. The effective DPR is the lowest of device DPR, preset cap and pixel budget ([renderBudget](../viewer/js/view-layout.js)):

| Preset | Pixel budget | DPR cap | Shadow-map side | Transmission scale |
|---|---:|---:|---:|---:|
| Automatic, touch-first | 3 million | 1.25 | 1024 | 0.5 |
| Automatic, other devices | 5 million | 1.5 | 2048 | 1 |
| Lower power | 2 million | 1 | 1024 | 0.5 |
| Higher detail | 8 million | 2 | 2048 | 1 |

Presets reduce render-target cost, not download size or geometry. Automatic is an input-device heuristic, not a GPU benchmark.

### Share a view and troubleshoot

**More → Copy view link** captures version, mode, floor, camera, zoom and surroundings ([Shared view URL](#shared-view-url)); lighting, time and selection are not shared. A localhost link points to the recipient's own machine.

After a deployment, a missing module or Meshopt decoder usually means an old page: refresh fully or open a new window. Sun & sky needs a valid geographic reference for the version. For a report, include the URL, browser and OS, viewport and DPR, quality, surroundings and daylight state, the first console error and the failed request.

## Development

### Repository map

| Location | Purpose |
|---|---|
| [viewer/shell.html](../viewer/shell.html) | Shared interface markup; `{{name}}`, `{{place}}`, `{{about}}` and `{{links}}` are filled from the building configuration |
| [viewer/js/boot.js](../viewer/js/boot.js) | Loads `public/building.json` and the shell, then starts `main.js` |
| [viewer/css](../viewer/css) | Design tokens and component styles |
| [viewer/js](../viewer/js) | Scene, loading, navigation, lighting, inspection and walking |
| [viewer/js/policy-default.js](../viewer/js/policy-default.js) | Default cutaway, floor and walking policy for buildings authored to the [model contract](#model-contract) |
| [viewer/js/lighting.js](../viewer/js/lighting.js) | Shared studio lighting and the daylight light budget |
| [viewer/vendor](../viewer/vendor) | Pinned Three.js, SunCalc and Meshopt runtime |
| `reconstructions/<id>/index.html` | Thin entry page: stylesheets, import map (including `building-policy`) and `boot.js` |
| `reconstructions/<id>/public/` | `building.json`, `about.html`, `models/`, `profiles/` and, for the Bundeshaus only, a legacy `policy/` |
| [tools/model-pipeline](../tools/model-pipeline) | Blender conversion, compression, BIM registry, IFC export, audit and vendoring |
| [tools/revit/export](../tools/revit/export) | Revit export chain to GLB, `bim.json` and `viewer.json` |
| [tools/serve.py](../tools/serve.py) | Local server for the gallery and all viewers |
| [tests](../tests) | Runtime and asset-pipeline regression checks |

Three.js is pinned to 0.185.1. The vendoring scripts (`vendor_three.py`, `vendor_suncalc.py`, `vendor_meshoptimizer.py`) refresh pinned dependencies and verify integrity; runtime loading never depends on a CDN.

### Verify changes

Run from the repository root; for runtime or pipeline changes, the full suite is:

```powershell
node --test --test-isolation=none tests/*.test.mjs
python tests/import_versions_test.py
python tests/serve_test.py
python tests/bim_test.py
```

The Bundeshaus geometry tests read the archived versions from `reconstructions/bundeshaus/work/archive/models/` and are skipped without it. Tests resolve `building-policy` to the Bundeshaus policy. Browser checks remain necessary for WebGL textures, native date and time pickers and touch devices. After an import, check the building and context pair, all modes, key spaces, inspection and daylight.

### Performance evidence

Record the app revision, model hash, full camera URL, viewport, device and effective DPR, quality, lighting, surroundings, and browser, OS and hardware; the URL alone omits lighting and quality.

| Check | Evidence to record |
|---|---|
| Cold and warm load | Cache state, transfer bytes, time to usable building and to ready context separately; loading, failure and retry states |
| Repeat navigation | Exterior → Dollhouse → Plan → return, floor changes, selection and context toggles; retained focus, no stale geometry |
| Rendering cost | Same camera and lighting with and without `instances=0`; shadow refresh versus cached shadows; idle stop and background-tab pause |
| Movement and input | Walk and Fly start at once and switch in place, walls and stairs, keys released on blur; keyboard and touch tested separately |
| Fidelity | Studio and daylight, glass, texture colour and detail, section visibility and clipped picking against the same frozen views |
| Devices | Actual phones, tablets and laptops where available; memory and context-loss symptoms, browser zoom, orientation changes. Emulation is not device acceptance |

Report median and tail times over repeated runs. `renderer.info` counts allocations and submissions, not memory; the About timer measures CPU submission, not GPU time. No device frame-rate or load-time target has been set.

## Runtime

### Loading and rendering

- Fetch, decompression and preparation respond to cancellation; parsing and shader compilation already running finish first and late assets are disposed. Version changes navigate the page. See [asset-loader.js](../viewer/js/asset-loader.js) and [main.js](../viewer/js/main.js).
- Rendering runs on demand and sleeps at rest; background tabs pause. Collision is prepared into a BVH in a worker. Surroundings meshes with `viewer_role: terrain` get their own collision world, joined to the building's for walking, with triangles turned to face up; neighbouring buildings have no collision.
- Floor compatibility and walking surfaces come from the building policy: [policy-default.js](../viewer/js/policy-default.js) for buildings authored to the model contract, or a building's own `public/policy/model-policy.js` (Bundeshaus).
- Surroundings compile their shaders before they appear; a context failure has its own cleanup and retry.
- Shadows need both Sun & sky and Shadows; maps refresh only when light, visibility or coverage change.
- Glass is drawn as ordinary transparent glass ([glass.js](../viewer/js/glass.js)): glTF transmission is converted on load, with no refraction pass. Clear panes are about 25 % opaque with a tint of their colour, frosted glass up to 60 %, photographic glass at least 70 %.
- Floor plan's cut planes stay on the materials, so entering it recompiles no shaders ([plan-cut.js](../viewer/js/plan-cut.js)); shader variants are warmed in the background ([shader-warmup.js](../viewer/js/shader-warmup.js)); visibility rules run once per mode or level change ([visibility-rules.js](../viewer/js/visibility-rules.js)).
- Source assets own their geometry, materials and textures; page exit disposes them while keeping back/forward-cache pages. Selection overlays a tint and edges without touching shared materials or batches.

Output is sRGB with Khronos PBR Neutral tone mapping at exposure 1, which keeps base colours and saturation up to its highlight shoulder. This assumes physically plausible [base colours](#base-colour); the viewer does not rescale albedo.

### Static batching

[model-primitives.js](../viewer/js/model-primitives.js) normalizes compatible opaque glTF primitives into one mesh with material groups and the parent's BIM identity; separate BIM IDs are never merged. [render-instances.js](../viewer/js/render-instances.js) batches static opaque placements by shared geometry, material order, shadow flags, render order, culling and 24 m spatial cells (at least three placements). Original meshes keep their IDs, hierarchy and metadata and remain the authority for picking and collisions (layer 1; batches on layer 0). Transparent, skinned, morphed, mirrored, animated or otherwise incompatible meshes stay ordinary meshes. Changes to source transforms or visibility require `sync()`.

**Experimental `batch=1`** ([render-batches.js](../viewer/js/render-batches.js)) draws one `BatchedMesh` per material (Bundeshaus Exterior about 1,400 instead of 8,800 draw calls); picking, inspection, highlight and collision still use the original meshes. It is off by default: coplanar faces resolve differently in Floor plan, it uses about 100 MB more memory, and Safari and phones are untested.

For comparisons, add `stats=1` and open **Help → About this model** for draw calls, triangles, CPU submission time and DPR; `instances=0` disables batching at the same camera.

### Shared view URL

Coordinates are local glTF metres, Y up. Unrelated query parameters and the hash are preserved.

| Parameter | Meaning |
|---|---|
| `version` | Catalog ID, for example `bundeshaus-v027`; omitted means the published version. A retired version opens the published one with a notice. |
| `view` | `3d` (Exterior), `dollhouse`, `floorplan`, `walk`, `fly`; `orbit` and `plan` are accepted aliases. |
| `floor` | `all` or a level ID of that version's catalog entry; Floor plan requires one level. |
| `pos`, `target` | Camera and look target X,Y,Z, each component within ±10,000 m, at least 0.01 m apart. |
| `zoom` | Plan: 0.4–12; perspective: 0.05–20. Invalid values use 1. Walk always opens with its eye-level lens. |
| `height` | Unzoomed orthographic vertical span, 0.01–20,000 m; required for an explicit Floor plan camera. |
| `orbit` | Previous perspective offset direction, used when Floor plan returns to 3D. |
| `surroundings`, `muted` | `1` on, `0` off; shared values override defaults without changing stored preferences. |

The address updates with `replaceState` about three times a second; Copy view link flushes at once. Coordinates round to five decimals, invalid values fall back safely, and explicit URL cameras win over session state. Walk links never start movement. [view-url.js](../viewer/js/view-url.js) is the parser. Bookmark cameras in `viewer.json` follow their [own contract](#viewerjson).

## Design and layout

### Tokens

[shell.html](../viewer/shell.html) holds the markup; each building page loads [token.css](../viewer/css/token.css), [app-tools.css](../viewer/css/app-tools.css), then [main.css](../viewer/css/main.css). Tokens own palette, typography, spacing, radii, shadows, motion, control sizes, component widths and outer margins; component CSS owns layout, states and media queries. app-tools.css holds what every page shares: the top bar with its toolbar, dropdowns and help panel. The gallery loads it too and the splat viewers inline it (`make_viewer.py`), so change the toolbar there, not per page. [interface.js](../viewer/js/interface.js) owns tabs, dropdowns and sidebar state; [model-tree.js](../viewer/js/model-tree.js) builds the tree without the DOM.

Use semantic tokens such as `--color-text-muted`, `--color-surface-raised` and `--shadow-panel`, not one-off values. Neutral selected states mark navigation, warm accents daylight and inferred evidence, blue outlines keyboard focus, and `--color-selection` (cyan) the scene highlight. System font and rem typography; 4 px spacing steps; floating controls 40–44 px, phone dock buttons 52 px, tree rows 44 px, walking targets at least 48 px; 16 px text in touch inputs. `--viewport-*`, `--dropdown-*`, `--depth` and `--arrow-y` are runtime values, not theme tokens.

### Languages

[viewer/data/i18n.json](../viewer/data/i18n.json) holds every interface string by key in English (the default), German, French and Italian; the language menu switches them at once and the choice is remembered locally. Model content stays as authored: element, room and level names, saved places, the about page and **Properties & sources**. German uses Swiss spelling (ss, never ß).

In [shell.html](../viewer/shell.html), `data-i18n="key"` sets an element's text, `data-i18n-attr="aria-label:key title:key"` sets attributes, and `data-i18n-html` is reserved for the keyboard help's `<kbd>` markup. Code uses `t('key', { name })` from [i18n.js](../viewer/js/i18n.js) and `formatNumber` for numbers. Add each new key to all four languages: [tests/i18n.test.mjs](../tests/i18n.test.mjs) fails on a missing, unused or untranslated key, mismatched placeholders, or ß.

The gallery and the splat viewers have the same language menu with their own tables: [gallery/data/i18n.json](../gallery/data/i18n.json) and the splat overlay's `i18n.json` in the von Wattenwyl-Haus work folder. All pages remember the choice under the same key. Gallery entries in [reconstructions.json](../gallery/data/reconstructions.json) carry their own `translations`, checked by the same test.

### Responsive layout and accessibility

| Layout | Sidebar | Edge margin | Bottom gap |
|---|---|---:|---:|
| Desktop, at least 1100 px wide | Floats at the top left up to the dock; collapses to its header | 24 px | 28 px |
| Large desktop, at least 1800 × 900 | Floating, 320 px | 32 px | 32 px |
| 761–1099 px wide | Floating; starts collapsed | 24 px | 28 px |
| Phone landscape, 761–1099 px wide and at most 500 px high | Floating; starts collapsed | 16 px | 16 px |
| Phone, at most 760 px wide | Bottom sheet, collapsed to "Model · level" | 20 px | 20 px |

Margins add safe-area insets. Below a 780 px stage the dock keeps only icons; dropdowns use the available height like a sheet on small screens; the inspector callout stays between the toolbar and the dock. On phones the toolbars are icon-only, Help, GitHub and All reconstructions move into More, and Floor plan's cut slider floats above the dock. In Walk and Fly on touch screens the direction pad sits at the bottom left and Jump, Rise and Descend replace the navigation hint.

Dropdowns are native popovers that return focus to their trigger. The tree is a single Tab stop with arrow-key movement; tabs support arrows, Home and End. Reduced motion disables UI transitions and camera damping. Acceptance also includes browser zoom, keyboard-only use, a screen-reader pass and reflow at 320 CSS pixels ([W3C reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)); these are requirements, not a WCAG conformance claim. The current layout has been checked in a headless browser at 1440 × 900, 1280 × 800, 1024 × 768, 844 × 390 and 390 × 844, not on physical devices.

## Model contract

What a model must supply to be shown, inspected and exported. The Blender route writes these as object custom properties; the Revit route writes the same properties through its export chain ([Revit toolkit](../tools/revit/README.md#build-loop)). Keep the editable master and optimize a separate viewer export. Use project-wide **Family → Type → Instance**, independent of rooms.

### Status

**Implemented** items are read by the viewer; the author still supplies and verifies them where the importer does not enforce every rule. **Planned** items are not yet read.

| Contract | Status |
|---|---|
| Building and context GLBs, shared geometry, PBR images, Meshopt and gzip | Implemented |
| IDs, family, type and category, floor and room tags, cutaway roles | Implemented, with legacy compatibility rules |
| Catalog `levels` and `levelDefinitions` | Implemented |
| `viewer.json` saved views, places and properties | Implemented, versioned schema |
| Geographic reference for daylight | Implemented, as a catalog `location` block |
| `bim.json` products and types, whole-product selection, inventory | Implemented for reviewed products; other geometry keeps component inspection |
| IFC4 reference export | Implemented offline; receiving-CDE acceptance open |
| `building.json` semantic floor, room and wall registry | Planned; not read by the viewer |
| Separate `collision.glb` with route coverage | Planned; the viewer infers collision from structural meshes and terrain |
| Host propagation, KTX2, lightmaps, LOD switching | Future work |

Do not supply `EXT_mesh_gpu_instancing` or unsupported texture extensions; the viewer batches compatible meshes itself.

### Categories and object properties

Classify an object by its meaning, separately from appearance or cutaway policy:

| Group | Categories |
|---|---|
| Structure | `foundation`, `structural-wall` where known, `column`, `beam`, `brace`, `slab` |
| Envelope | `exterior-wall`, `curtain-wall`, `window`, `door`, `roof`, `roof-covering`, `skylight`, `shading-device`, `gutter`, `downpipe` |
| Interior | `interior-wall`, `ceiling`, `floor-finish`, `wall-finish`, `skirting`, `opening` |
| Circulation | `stair`, `ramp`, `landing`, `handrail`, `balustrade`, `guardrail`, `lift` |
| Furniture and fixtures | `furniture`, `chair`, `desk`, `table`, `bench`, `cabinet`, `shelving`, `seating`, `light-fixture`, `sanitary-fixture`, `equipment`, `signage` |
| Art and heritage | `sculpture`, `painting`, `mural`, `decorative-panel`, `ornament` |
| Landscape and site | `terrain`, `paving`, `road`, `retaining-wall`, `fence`, `gate`, `plant`, `planter`, `water-feature`, `site-equipment` |
| Services, only where evidenced | `duct`, `pipe`, `cable-tray`, `electrical-equipment`, `hvac-equipment`, `fire-safety-equipment` |
| Other | `unclassified` |

Use `wall` when the structural function is unknown. Do not invent hidden services, load-bearing status, fire ratings, material species or performance.

Properties export as glTF node extras. Keep placement IDs unique and nonempty, membership arrays as JSON arrays and flags as booleans.

| Property | Contract |
|---|---|
| `viewer_id` | Stable unique ID of a selectable mesh or component placement; preserved across versions, never reused |
| `viewer_category` | Semantic category, independent of render role |
| `viewer_family_id`, `viewer_family_name` | Project-wide family, for example a timber chair or a window family |
| `viewer_type_id`, `viewer_type_name` | Reusable definition with fixed geometry and materials |
| `viewer_building_id` | Owning building; distinguishes the building from context |
| `viewer_floor_ids`, `viewer_room_ids` | All floor memberships; room memberships where known |
| `viewer_model_scope` | `building`, `site` or `surroundings` ([handbook](handbook.md#building-parts-and-model-scopes)) |
| `viewer_environment` | `interior`, `exterior`, `boundary` or `unknown`; not a hide instruction |
| `viewer_classification_basis`, `_source`, `_confidence` | `authored` or `inferred`, its evidence or method, and `low` / `medium` / `high` (required when inferred) |
| `viewer_role` | `exterior-wall`, `interior-wall`, `floor`, `ceiling`, `roof`, `door`, `window`, `furniture`, `decoration`, `terrain`, `context` or `collision` |
| `viewer_cutaway_role` | `enclosure`, `overhead` or `interior` on every rendered component ([Dollhouse](#walls-and-dollhouse-visibility)) |
| `viewer_dollhouse_hidden` | Explicit boolean removal, subject to legacy compatibility rules |
| `viewer_element_id`, `viewer_parent_id` | Stable logical assembly and parent |
| `viewer_host_id`, `viewer_wall_id` | Resolvable host and wall association |
| `viewer_surface` | `inside`, `outside`, `reveal` or `solid`, where applicable |
| `viewer_system_ids` | Known service-system membership, optional |

Roles describe rendering, not meaning: a sculpture uses `decoration` even when it resembles furniture, and a glass cover can be a `ceiling`. `legacy-*` IDs depend on object names and change with them; prefer authored IDs, and document an identity migration when a component is split or replaced. Measured model bounds are not a survey.

### Families, types and instances

A family groups related products; a type fixes geometry, dimensions and materials; an instance places a type. Reuse a type across rooms and floors; a different geometry or material configuration needs a distinct type. Location has its own hierarchy (Site → Building → Storey → Space) and never duplicates exported placements. Identity is semantic, not a geometry checksum: refining a product keeps its ID, a new product gets a new one, and a visual refinement of a type needs a type revision.

Share mesh data, materials and images (in Blender `object.copy()` keeping `.data`). Per-object modifiers, material overrides or world-space UV baking silently create unique meshes, and copying meshes to change glass materials destroys linked geometry: assign materials at type level and inspect the export, not only the source. Report mesh, type and instance counts from the exported GLB; repeated family labels do not prove instancing.

A logical product (chair, window, door) can contain several material components: keep a stable assembly ID, a whole-product type and a root transform besides each component's `viewer_id`. A seating station's chair and desk remain separate products; upholstery, frame and cane are not three chairs. No component belongs to two products; parents are acyclic. Do not merge rooms, floors, rows of furniture or different products to save draw calls.

### Coordinates and floors

Metres and a stable local origin and orientation. The source scene is Z up; glTF conversion is `(x, y, z) → (x, z, −y)`, and sidecar positions, bounds and normals use the glTF frame. Never put large national-grid coordinates in vertices or apply north twice. Record a local origin and at least three non-collinear control points to compare source, GLB and IFC; the conversion tolerance is 0.001 m. This tests conversion fidelity, not the accuracy of the reconstruction.

Floors come from the catalog. A model lists its level IDs in `levels` (with `all`) and may supply `levelDefinitions`, keyed by each level ID, with a nonempty `label` and finite metre values `elevation`, `min` and `max` (`min <= elevation < max`). The floor selector, plan cut, framing and vertical navigation use those values; floor visibility uses world bounds and clipping, and Dollhouse removal still applies. This is a presentation policy, not IFC containment: author and validate storey assignments separately. Without `levelDefinitions` a building policy applies (the Bundeshaus legacy four-level policy in its `public/policy/model-policy.js`).

Cross-floor stairs, walls and landings carry all their floor IDs. Report geometry outside a level's slice instead of distorting the master, and do not add an unfinished candidate to the public catalog only to activate these controls. The semantic `building.json` registry ([schema](building.schema.json)) is not read by the viewer yet; room bounds do not establish enclosed `IfcSpace` volumes.

### Base colour

Author base colours as linear albedo in physically plausible ranges, so the shared studio light reads like a sunny day without shadows: fresh white paint about 0.80, lime plaster 0.65–0.75, sandstone 0.35–0.50, limestone and marble floors 0.45–0.65, oak 0.30–0.40, clay tile 0.20–0.30, slate and asphalt 0.08–0.15, grass 0.10–0.20. Values near 0.9 clip to white in sunlight. The viewer does not rescale albedo; fix it in the model.

### Walls and Dollhouse visibility

Split exterior walls at useful corners and floor boundaries, with stable wall IDs, outward normals, floor ownership and adjacent spaces. Keep wall solids, finishes, reveals, windows and attached decoration separately addressable and associated with their host. Thick walls cannot be opened by backface culling.

Author `viewer_cutaway_role` on every rendered component: `enclosure` (exterior shell, facade-attached details, outer linings: hidden in Dollhouse), `overhead` (roofs, ceilings, removable glass covers with their frames: hidden in Dollhouse and in a floor filter) or `interior` (kept). The role is presentation and independent of category: circulation in an exterior location can stay `interior`. Exterior and Walk restore the full building; Floor plan keeps the envelope for clipping. [policy-default.js](../viewer/js/policy-default.js) applies these tags; the Bundeshaus keeps its own policy with reviewed exceptions. Fix source tags rather than adding name-based rules, and review every floor and the all-level Dollhouse.

### Geometry, materials and budgets

Preserve silhouettes, sculpture, inscriptions and spatial detail. Construction and collision solids need finite vertices, valid winding and closed boundaries; thin decorative surfaces may stay open if documented. Check duplicate and coincident surfaces, z-fighting, islands, blocked doors, roof and ceiling intersections, headroom and mirrored normals.

Use glTF PBR materials with embedded images, UVs and normals. Bake procedural surface detail in an export copy without baking light or shadows into albedo. Colour images are sRGB; normal and ORM maps are non-colour data. Share images only when pixels, size, sampler and meaning match. Record texture provenance and redistribution terms.

Initial budgets, subject to close-view comparison:

- Small repeated objects and most normal and ORM maps: 512–1024 px.
- Large surfaces and important murals: up to 2048 px; 4096 px only for named focal surfaces.
- Building image storage below **256 MiB**, estimated as RGBA8 with mipmaps (sum of `width × height × 4 × 4/3`).
- Geometry: share prototypes; use surface detail for sub-pixel relief. No FPS or triangle ceiling has been set.

Budget exceptions need named assets and matched comparison images. Do not ship overlapping high- and low-detail copies; LOD switching is not implemented. Author glass with base colour, opacity and roughness, without relying on refraction, and remove accidental coincident or duplicate panes. Helper lights stay out of the export. Report placed and unique triangles and meshes, material groups, type reuse, image sizes, estimated image storage and delivery bytes separately.

### Walking and collision

Planned: a separate `collision.glb` in the visual model's frame with economical closed walls and floors, stair ramps, landings, headroom barriers and large obstacles, linked to logical elements and declared route coverage. Record controller radius, body and eye heights, slope and step limits and unsupported areas, and test doorways and stairs in both directions. Until then the viewer infers collision from structural meshes and terrain.

### Evidence and accuracy

Keep geometric completeness, visual detail and confidence separate: a finely modelled inferred cornice is no more surveyed than a simple inferred wall. Do not claim an industry LOD or LOI without defining its use and acceptance. For each important space or product, record the source, observation date, what was visible, what was inferred and what remains unmodelled. Unknown stays unknown, never a numeric zero or a false boolean.

## Asset pipeline

The Revit route exports through `tools/revit/export/` ([Revit toolkit](../tools/revit/README.md#export-chain)). This section covers the Blender route: `.blend` is the editable master, GLB the browser delivery format.

### Conversion and imports

Conversion needs Python 3.11+, a Blender compatible with the source (tested with 5.2.1 LTS) and, for compression, Node.js 24+; see `python tools/model-pipeline/export_model.py --help`. Prefer the version importer: it handles building and context profiles, annotations, geographic reference, validation, compression and catalog publication, and publishes a version only after both visual assets succeed.

```powershell
python tools/model-pipeline/import_versions.py 'C:\models\bundeshaus\versions' --building bundeshaus --only v027
```

Repeat `--only` for more versions; each is committed separately and the command exits nonzero if any fail. Prepared GLBs still need exactly one `.blend` in `model/` for source identity.

Only the latest version is published. After an import, retire the previous one: move its folder from `public/models/` to `work/archive/models/`, its catalog entry to `work/archive/models/catalog.json` and its `compression.json` row to the archive's, and set the catalog's `default` to the new ID (`--keep-latest` moves the folder and catalog entry only). [catalog-assets.test.mjs](../tests/catalog-assets.test.mjs) checks that the Bundeshaus publishes exactly one version.

For a standalone model:

```powershell
python tools/model-pipeline/export_model.py 'C:\models\building.blend' --output reconstructions/my-building/public/models/my-building-v001/building.glb
python tools/model-pipeline/optimize_models.py --asset reconstructions/my-building/public/models/my-building-v001/building.glb
```

Use the optimizer's printed delivery path in the catalog; it does not update the catalog. [Profiles](../reconstructions/bundeshaus/public/profiles) select building and context collections; new renderable collections need a profile update.

The [catalog parser](../viewer/js/model-catalog.js) requires `id`, `label`, a positive integer `version`, local `building`, `surroundings` and `metadata` paths and a `levels` array containing `all`. Paths start `./` and end in `.glb`, `.glb.gz` or `.json`; URLs and traversal are rejected. The [Bundeshaus catalog](../reconstructions/bundeshaus/public/models/catalog.json) is a working example.

The converter reads without saving, disables embedded scripts, evaluates static modifiers and exports meshes, materials, UVs, normals, custom properties and embedded images, with a report of hashes, statistics, IDs and material fallbacks. It does not bake procedural materials, create colliders or export animation. Validate the uncompressed GLB with the [Khronos glTF Validator](https://github.com/KhronosGroup/glTF-Validator) and keep its report beside the importer's `.report.json`; allow only the extensions the viewer supports. Annotation imports reject mismatched model IDs; notes for absent components are dropped with a warning and kept in `viewer.import.json`.

### Compression and storage

Meshopt 1.2.0 (`EXT_meshopt_compression`) with a lossless round-trip check; no quantization, simplification, image resizing or merging. Small GLBs get precompressed gzip sidecars; large assets ship as explicit `.glb.gz`. The loader detects gzip from the bytes and streams decompression; the Meshopt decoder falls back to JavaScript without WebAssembly.

```powershell
python tools/model-pipeline/optimize_models.py --prune
```

optimizes the published catalog and removes obsolete generated assets. Every shipped file must be below **100 MiB**, a hard limit rather than a target. Decoding expands the GLB in memory, so download size is not a device memory budget. Each building's `models/compression.json` and each asset's `.report.json` record sizes and recipes.

## Annotations and geographic reference

### viewer.json

Deliver `viewer.json` with the exact catalog `modelId` in the release package (`releases/vNNN/model/viewer.json`). Without one, the importer seeds compatible bookmarks from the newest published version as provisional. [viewer-metadata.schema.json](viewer-metadata.schema.json) defines version 1:

```json
{
  "schemaVersion": 1,
  "modelId": "bundeshaus-v015",
  "coordinates": "gltf-y-up-meters",
  "views": [],
  "pointsOfInterest": [],
  "objects": []
}
```

Text is plain text. IDs are 1–120 characters of letters, digits, `_` and `-`; titles at most 120 characters, descriptions and property text at most 1500. Bookmark IDs are unique across both lists; object IDs match exported `viewer_id`s.

Validate in three steps: the schema (JSON Schema Draft 2020-12; the importer only checks `modelId`), the references (unique IDs, existing objects and levels, distinct camera position and target) and the visual use (no unexpected warnings from [parseMetadata](../viewer/js/model-metadata.js), every bookmark opened). Offline schema check from the building folder:

```powershell
python -c "import json; from pathlib import Path; from jsonschema import Draft202012Validator; v=Draft202012Validator(json.loads(Path('../../docs/viewer-metadata.schema.json').read_text(encoding='utf-8'))); v.validate(json.loads(Path('public/models/bundeshaus-v027/viewer.json').read_text(encoding='utf-8')))"
```

Views and points of interest open named camera views from the Places list:

```json
{
  "id": "site-overview",
  "title": "The wider neighborhood",
  "description": "See the Bundeshaus within the surrounding city.",
  "camera": { "mode": "orbit", "frame": "site" }
}
```

| Camera field | Contract |
|---|---|
| `mode` | `orbit`, `dollhouse` or `plan`; bookmarks never enter Walk |
| `level` | `all` or a level ID of the version; Plan requires one level |
| `position`, `target` | Finite glTF-metre vectors, distinct, within ±1,000,000 per component; use both or `frame`, never both forms |
| `frame` | `building`, `level` or `site` frames from geometry; `site` requires orbit and shows surroundings |
| `height` | Positive vertical extent in metres, at most 1,000,000; required for an explicit Plan camera |

One view may carry `"start": true`: the viewer opens on it unless the link holds a camera, and Home returns to it while all levels are shown. It must be an orbit view with explicit `position` and `target`. Use it to show the main front without vegetation or neighbours in the way. Explicit plans look straight down with screen-up along glTF −Z. Convert source cameras with `(x, z, −y)` and place targets on the subject, since they become orbit pivots.

Object annotations join to one mesh by `viewer_id`; their properties take precedence over inferred descriptions:

```json
{
  "id": "principal-east-door-01",
  "title": "East chamber doorway",
  "properties": [
    {
      "label": "Likely material",
      "value": "Painted timber",
      "basis": "inferred",
      "confidence": "medium",
      "source": "Estimated from a reference photograph; construction is undocumented."
    }
  ]
}
```

Every property needs `label`, string `value`, `basis` and `source`. `authored` means explicitly supplied, not verified; `measured` means calculated from the model with method and units; `inferred` requires `confidence` and its reasoning. Omit unsupported exact dates, species or ratings. Without authored notes, the inspector estimates the category from names, labels its confidence and measures world-aligned bounds, which are not a survey.

### Geographic reference

Each version needs one geographic frame for daylight. The importer reads `model_georeference.json` from the release package (preferably `viewer/provenance/model_georeference.json`; older `research/` and `stageNN/` locations are still searched). It holds `origin_wgs84` as `[longitude, latitude, elevation]` and `architectural_rotation_degrees`, the rotation of ENU vectors into the source XY plane (Bundeshaus −7°). The importer writes a catalog `location` block:

```json
{
  "latitude": 46.946495525973354,
  "longitude": 7.444211945710425,
  "timeZone": "Europe/Zurich",
  "enuToModelDegrees": -7,
  "source": "research/model_georeference.json; ENU rotated into source-scene XY"
}
```

Do not substitute facade north or rotate the geometry again. A missing location disables only Sun & sky. The importer assigns Bern's time zone; adapt it for a site abroad. Check the sun from the east in the morning and the west in the evening ([SunCalc conventions](https://github.com/mourner/suncalc#sun-position)).

## BIM registry

`bim.json` ([schema](bim-registry.schema.json), version 1) groups exported components into whole products for selection, inventory and IFC, without changing render batches.

| Layer | Behaviour |
|---|---|
| Source master | One root per reviewed product (Blender: an empty with `bim_element_id`), keeping all component geometry, linked meshes and placements; component `viewer_id`s stay unique |
| GLB | Product parent nodes over the existing components and shared meshes; each component carries `viewer_element_id`, `viewer_parent_id`, `viewer_product_family_id` and `viewer_product_type_id` |
| `bim.json` | Project namespace, stable product and type IDs with type revisions, one owner per component, rigid product roots, component-local transforms, storeys, references, quantities and evidence, host openings, explicitly unresolved components |
| Viewer | Clicking a component highlights the whole product; the tree lists one entry per product; inventory is downloadable as JSON; IFCZIP is a separate download |
| Importer | Validates source revision, membership, references, acyclic parents, coverage and recomposed transforms; optional IFC must match source, registry and its validation record |

A missing or invalid registry falls back to component inspection. The importer and browser check references and coverage without a BIM package; the importer trusts the author's hash-bound IFC validation report.

### Identity

Keep the identity ledger with the frozen package. A product keeps its ID when it moves or is refined. Its type keeps its ID with an incremented revision when every occurrence follows a refinement and becomes a new type when one occurrence diverges. New products get new IDs; deleted IDs are never reused. Rooms are instance properties, never part of type identity. Geometry hashes find equivalence but are not identities.

Product roots are right-handed, orthonormal rigid transforms; bake scale, shear and reflection into type-local geometry. `rootMatrix × component.localMatrix` must reproduce the source within 0.001 m, and types sharing geometry must agree within 0.00001 m with matching topology and materials. All components of one element ID share its family, type and category; component classes may differ (a staircase has treads, cheeks and rails).

### Toolchain

A separate Python environment from [requirements-bim.txt](../tools/model-pipeline/requirements-bim.txt): IfcOpenShell 0.8.5, NumPy 2.3.5, JSON Schema 4.26.0, pytest 8.4.2. The reader takes a static, uncompressed GLB with embedded buffers (the prepared `viewer/building.glb`, not the web `.glb.gz`).

```sh
python -m pip install -r tools/model-pipeline/requirements-bim.txt
python -m jsonschema -i PATH/TO/vNNN/viewer/bim.json docs/bim-registry.schema.json
python tools/model-pipeline/export_ifc.py PATH/TO/vNNN/viewer/building.glb PATH/TO/vNNN/viewer/bim.json .work/<id>-registered.ifc --scope registered
python tests/bim_test.py
node --test --test-isolation=none tests/bim.test.mjs tests/instances.test.mjs
```

`--scope pilot` exports a small sample instead. The exporter writes `.ifc`, `.ifczip`, `.report.json` and `.validation.json`. To publish, supply `viewer/building.ifczip` with `viewer/building.ifc.report.json` and `viewer/bim.json`; the importer adds the `bim` and `ifc` catalog paths only after their checks pass. A regression fixture (move, refine, add and remove a product) checks retained GlobalIds and type revisions; it is not a receiving-application test.

## IFC delivery

Implemented as a tessellated **IFC4 ADD2 TC1** reference export for coordination in a CDE or BIM viewer, not yet validated in a receiving CDE. It is an additional deliverable beside the textured GLB, built offline (authoring software → IfcOpenShell → IFC) from the frozen complete source, independent of Dollhouse or floor filtering. Pin schema and tool versions; never write IFC4.3 entities into a file labelled IFC4. Parametric remodelling and quantity take-off are separate scopes. Before a production export, record the recipient's application, schema and MVD, size limits, coordinate expectations and required properties.

### Mapping and identity

Classes apply to logical products, not material components:

| Model element | IFC4 class |
|---|---|
| Interior or exterior wall | `IfcWall`; external status does not establish load-bearing capacity |
| Complete window, door | `IfcWindow`, `IfcDoor` |
| Floor structure, ceiling or finish | `IfcSlab`, `IfcCovering` |
| Column, roof | `IfcColumn`, `IfcRoof` |
| Stair or flight, ramp | `IfcStair` or `IfcStairFlight`, `IfcRamp` |
| Handrail, balustrade | `IfcRailing` |
| Chair, desk, table, cabinet | `IfcFurniture` with a reusable complete-product type |
| Light fixture | `IfcLightFixture` |
| Sculpture, ornament, unresolved pieces | A suitable class where justified, otherwise `IfcBuildingElementProxy` with category and uncertainty |

Use tessellated bodies (`IfcTriangulatedFaceSet`) with closed flags matching the topology, type geometry in its local frame and reusable representation maps per occurrence. Keep unresolved geometry as a proxy rather than dropping it.

Derive GlobalIds deterministically from project-scoped logical IDs (a namespaced UUID through `ifcopenshell.guid.compress`), never from export order or a truncated `viewer_id`. Record version, source hash, status and per-property evidence in a custom set such as `Reconstruction_Provenance`, with typed values and units; never parse inspector labels into dimensions. Do not populate structural, thermal, fire or cost properties.

### Spatial structure, openings and placement

Project → site → building → storeys, with a complete provisional storey registry. Each top-level product has one primary spatial owner plus references for cross-floor objects; do not duplicate stairs per floor or build `IfcSpace` volumes from bounding boxes. Resolve wall → opening → door/window relationships before writing them. Where host walls already contain their apertures, give `IfcOpeningElement` its placement and profile without a subtractive body: a second subtraction emptied facades in CGAL.

Before `IfcMapConversion`, record source and target CRS, units, easting and northing, vertical datum, X-axis orientation and scale. Its direction maps the local frame into map coordinates, so do not copy the ENU-to-model rotation without inverting it. Test transformed control points; when placement is uncertain, stay in local coordinates.

### Appearance, packaging and acceptance

Start with material names, colours and transparency; textures stay in the GLB. Offer `.ifc` and IFCZIP where supported, within the 100 MiB per-file limit; a large plain IFC stays local.

Accept with a representative sample first (a wall with hosted door and window, repeated chairs, a multi-storey stair, a sculpture): logical counts, stable GlobalIds after re-export, shared definitions, coordinates, spatial ownership and provenance. Run [IfcOpenShell validation](https://docs.ifcopenshell.org/ifcopenshell-python/validation.html), reopen, compare bounds and coverage, then inspect in an IFC authoring tool and the actual receiving platform, including a second revision with one moved, one refined, one added and one deleted product. Schema validity alone does not prove interoperability.

## Delivery checklist

Frozen Blender package (older `stageNN/viewer/` layouts remain supported):

```text
releases/vNNN/
  model/<id>.blend                 editable master, packed or relative dependencies
  model/viewer.json                views, places and object properties
  viewer/building_profile.json     complete intended collection inventory
  viewer/context_profile.json
  viewer/building.glb              ordinary nodes with shared meshes and images
  viewer/building.report.json
  viewer/context.glb
  viewer/context.report.json
  viewer/provenance/model_georeference.json
  viewer/bim.json                  product registry; optional
  viewer/building.ifczip           IFC4 reference export; optional
  viewer/building.ifc.report.json  source, registry and IFC validation and mapping
```

Published versions are immutable: use a new `vNNN` for refinements so links and comparisons stay reproducible.

1. **Freeze and identify.** Record the source SHA-256, authoring software and exporter versions, settings, and hashes of assets, profiles and sidecars. Do not change the source during export.
2. **Account for every placement.** Compare source and export ID sets and per-collection counts; list retained, added, retired, excluded and replaced IDs with migration mappings.
3. **Verify the asset.** Reopen the GLBs; check scale and frame, transforms, normals, UVs, embedded textures, materials, supported extensions and shared prototype reuse; compare mesh-node and unique-mesh counts; check decoded image sizes.
4. **Validate semantics.** Classification evidence, family and type links, floor and room arrays, hosts and registry coverage; `viewer.json` validates and the browser skips no authored record.
5. **Check visibility and navigation.** Exterior, all-level Dollhouse, every floor, Floor plan and Walk, plus the building's special assemblies; bookmarks, selection, camera continuity and version changes.
6. **Check daylight.** Sun & sky works from the version's own geographic record; east in the morning, west in the evening; studio lighting restores.
7. **Measure changes.** Geometry, material and image counts, estimated image storage, transfer bytes and representative timings; compare important views at fixed cameras and explain budget exceptions.
8. **Publish.** Let the importer compress and publish the catalog after building and context succeed; keep masters and intermediates outside the web repository and every shipped file below 100 MiB.

Enclosure checks need more than opening-centre rays: inspect beside openings, at storey joints and from high oblique cameras, and add downward rays for projections so a bay without its top cap is caught.
