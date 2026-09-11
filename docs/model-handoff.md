# Model handoff

[← Project overview](../README.md) · [Viewer guide](viewer-guide.md)

The authoring and delivery contract for model iterations: BIM structure, linked families, geometry/material budgets, conversion, annotations and IFC reference export. Updated 11 September 2026 for v027. Keep current requirements here; version-specific evidence stays beside its frozen model assets.

A large language model (LLM) researched publicly available data for this experimental reconstruction, which was created with 3D modeling software. Dimensions, unseen spaces and some properties are inferred. It is not a surveyed or engineering-verified BIM model.

## Contents

- [Modeling handoff](#modeling-handoff) — BIM categories, families, coordinates, cutaways and performance
- [Asset pipeline](#asset-pipeline) — source-model conversion, version imports, compression and storage
- [Annotations and geographic reference](#annotations-and-geographic-reference) — saved views, properties and daylight metadata
- [Product registry and quantities](#product-registry-and-quantities) — implemented instances, counts, identity and validation
- [IFC delivery](#ifc-delivery) — implemented reference exporter and remaining interoperability requirements
- [Delivery checklist](#delivery-checklist) — frozen packages and acceptance
- [Current model status](#current-model-status) — verified baseline and remaining work
- [Review findings](#review-findings) — clarified requirements and validation evidence

The [annotation JSON schema](viewer-metadata.schema.json) is the separate machine-readable definition of the implemented `viewer.json` format. The separate [BIM registry schema](bim-registry.schema.json) defines implemented `bim.json` v1; neither file defines surveyed building geometry.

## Modeling handoff

### Current support and planned contracts

Preserve the editable master and optimize a separate viewer export. Use project-wide **Family → Type → Instance**, independent of rooms. The first IFC use is reference/coordination in a CDE or BIM viewer; it does not replace GLB delivery.

**Required for current GLB delivery** means the author must supply and verify it, even where the importer does not enforce every rule automatically. **Recommended** items improve quality within an iteration. **Planned** room-volume, authored collision, host-propagation and receiving-CDE requirements remain separate milestones. The optional reviewed product registry and tessellated IFC exporter described below are implemented. Keep schema versions explicit and document intentional exceptions against a frozen source hash.

| Contract | Status |
|---|---|
| Building/context GLBs, shared geometry, PBR images, Meshopt/gzip | Implemented. Ordinary glTF nodes share meshes and retain placement identities. |
| IDs, family/type/category, floor/room tags and cutaway flags | Implemented with legacy compatibility rules; optional catalog level definitions support version-specific floor schedules. |
| `viewer.json` saved views, places and properties | Implemented; use the versioned schema. |
| Geographic reference for daylight | Imported into a separate catalog `location` block. |
| `building.json` semantic floor/room/wall registry | Modeling target; not yet consumed by the app. Changing it alone does not change viewer levels. |
| Separate `collision.glb` and authored route coverage | Modeling target; not yet consumed. The viewer infers collisions from visual structural meshes. |
| `bim.json` products/types, whole-product selection, inventory and quantity evidence | Implemented for reviewed products; unregistered geometry retains legacy component inspection. |
| Host propagation and camera-facing wall removal | Future work. Five reviewed IFC host relationships do not implement wall-removal propagation. |
| IFC4 reference export | Implemented offline with shared representation maps, typed data and validation reports; receiving-CDE acceptance remains open. |
| KTX2, lightmaps and authored LOD switching | Future integrations, not current GLB acceptance requirements. |

Do not supply `EXT_mesh_gpu_instancing` batches or unsupported texture extensions as a silent optimization. The viewer performs its own compatible opaque batching; exporter/library support alone does not mean an extension is integrated here.

### BIM categories and object properties

Classify the object by its meaning, separately from appearance or cutaway policy. Suggested categories cover:

| Group | Categories to distinguish |
|---|---|
| Structure | `foundation`, `structural-wall` where known, `column`, `beam`, `brace`, `slab` |
| Envelope | `exterior-wall`, `curtain-wall`, `window`, `door`, `roof`, `roof-covering`, `skylight`, `shading-device`, `gutter`, `downpipe` |
| Interior | `interior-wall`, `ceiling`, `floor-finish`, `wall-finish`, `skirting`, `opening` |
| Circulation | `stair`, `ramp`, `landing`, `handrail`, `balustrade`, `guardrail`, `lift` |
| Furniture and fixtures | `furniture`, `chair`, `desk`, `table`, `bench`, `cabinet`, `shelving`, `seating`, `light-fixture`, `sanitary-fixture`, `equipment`, `signage` |
| Art and heritage | `sculpture`, `painting`, `mural`, `decorative-panel`, `ornament` |
| Landscape/site | `terrain`, `paving`, `road`, `retaining-wall`, `fence`, `gate`, `plant`, `planter`, `water-feature`, `site-equipment` |
| Services, only where evidenced | `duct`, `pipe`, `cable-tray`, `electrical-equipment`, `hvac-equipment`, `fire-safety-equipment` |
| Other | `unclassified` |

Use `wall` when its structural function is unknown. Do not invent hidden services, load-bearing status, fire ratings, material species or engineering performance. Use consistent machine-readable category values; the list above is guidance rather than a new closed schema.

Custom properties belong on source-scene **objects** and export as glTF node extras. Keep placement IDs unique/nonempty, membership arrays as JSON arrays and flags as booleans.

| Property | Contract |
|---|---|
| `viewer_id` | Stable unique selectable mesh/component placement ID. Preserve across versions; never reuse for an unrelated object. |
| `viewer_category` | Semantic category, independent of render role. |
| `viewer_family_id`, `viewer_family_name` | Project-wide family, for example timber chair or a window family. |
| `viewer_type_id`, `viewer_type_name` | Reusable definition with fixed geometry/material configuration; current IDs can describe components. |
| `viewer_building_id` | Owning building; distinguish the central building from context. |
| `viewer_floor_ids`, `viewer_room_ids` | All applicable floor memberships; room memberships where known. Location belongs to the placement. |
| `viewer_environment` | `interior`, `exterior`, `boundary` or `unknown`; not a hide instruction. |
| `viewer_classification_basis` | `authored` or `inferred`; authored does not imply independently verified. |
| `viewer_classification_source` | Evidence or classification method. |
| `viewer_classification_confidence` | `low`, `medium`, `high`; required for inferred classification. |
| `viewer_role` | Rendering/cutaway role from the list below. |
| `viewer_cutaway_role` | Reviewed presentation: `enclosure`, `overhead` or `interior`. Author on every rendered component; independent of physical category and product ownership. See [Dollhouse visibility](#walls-and-dollhouse-visibility). |
| `viewer_dollhouse_hidden` | Explicit boolean removal policy, subject to current legacy compatibility rules. |
| `viewer_element_id`, `viewer_parent_id` | Stable logical assembly identity and parent relationship; progressively complete for whole-product IFC. |
| `viewer_host_id`, `viewer_wall_id` | Resolvable host/wall association; document whether references identify placements, assemblies or wall groups. |
| `viewer_surface` | `inside`, `outside`, `reveal` or `solid`, where applicable. |
| `viewer_system_ids` | Optional known service-system membership. |

Author roles from `exterior-wall`, `interior-wall`, `floor`, `ceiling`, `roof`, `door`, `window`, `furniture`, `decoration`, `terrain`, `context`, `collision`. Legacy aliases are compatibility details. Sculpture uses a decoration role, even when a seated pose resembles furniture. A glass cover can be a ceiling; its material does not determine its role.

Existing `legacy-*` IDs depend on object names and change when those names change. Prefer authored IDs. Splitting/replacing a component needs a documented identity migration. Keep classification evidence separate from per-property evidence; measured model bounds are not a survey.

### Families, types and linked instances

A family describes related products; a type fixes geometry, dimensions and material configuration; an instance places that type. The same chair/window type should be reused across rooms and floors. Different locations do not require different types. Conversely, a changed geometry/material configuration may require a distinct type.

Location has its own hierarchy: Site → Building → Storey → Space. Collections may organize both families and locations, but references to the same object must not duplicate exported placements. Preserve family/type identities across iterations; a unique sculpture can have one family, one type and one occurrence.

Identity is semantic, not a geometry checksum. Refining the same modeled product preserves its occurrence ID; an intentional new product/type gets a new ID. A visual refinement to an existing type needs a type revision or release record, while material/dimension variants within the same release remain distinct types. Keep old published definitions reproducible. A hash may identify an export payload without becoming the sole identity of the real-world interpretation.

Use linked mesh datablocks in the source scene (`object.copy()` retaining `.data`), shared materials and shared images. Evaluate/bake static modifiers once on an export prototype where possible, then reuse it. Per-object modifier evaluation, material overrides or world-coordinate UV baking can accidentally create unique GLB meshes; inspect the export as well as the source scene. Normalize transforms in the export copy without breaking placement, normals or reuse; handle mirrored types deliberately.

One logical chair, window or door can contain reusable material components. Keep a stable assembly ID, whole-element type identity and root transform in addition to each component's existing `viewer_id`/type. Do not repurpose component type IDs as complete-product types. A seating station's chair and desk remain separate products. Whole-object selection and IFC grouping must not count upholstery, frame and cane as separate chairs.

For `bim.json` v1, define each logical element with its ID, complete-product type, root transform, member component IDs, primary spatial owner and additional references. Define each component's transform relative to that root and validate that recomposition reproduces its current world transform. No component may belong to two physical products; parent relationships must be acyclic. This is a registry requirement, not an unversioned extension of `viewer.json`.

Keep object-level selection and cutaway control. Do not merge entire rooms, floors, furniture rows or different BIM objects to reduce draw calls. Consolidate equivalent materials on the type prototype; multiple material groups still create multiple render submissions. Linked geometry reduces storage and submission overhead, not the triangle cost of every visible occurrence.

### Coordinates, floors and semantic registry

Use metres and a stable local origin/orientation. The source scene is Z up; glTF conversion is `(x, y, z) → (x, z, -y)`. Viewer sidecar positions, bounds, normals and elevations use the final glTF frame. Normals are directions; camera positions are eye positions, not ground starts. Preserve building/context alignment and geographic rotation across versions; do not place large national-grid coordinates directly in render vertices or apply north rotation twice.

Record a local origin and at least three recognizable non-collinear control points, with units/frame identified, to compare the source scene, GLB and any IFC output. Verify vertical direction, door handing and building/context overlap. For geometry-preserving export, a proposed numerical acceptance tolerance is 0.001 m for transformed control points and bounds; record maximum deviations and declare any intentional simplification separately. This tests conversion fidelity, not millimetre accuracy of the reconstructed building. Do not infer that camera field limits of ±1,000,000 m are a recommended render-coordinate range.

Current viewer policy:

| Floor ID | Finished-floor elevation | Slice | Coverage |
|---|---:|---:|---|
| `entrance` | −4.20 m | −4.9…0.25 m | South public lobby/arcade and intersecting connecting stairs |
| `lower` | 0 m nominal slice datum | −0.5…7.1 m | Lower hall and Galerie des Alpes (fitted restaurant floor +1.90 m) |
| `principal` | 7.55 m | 7.1…18.9 m | Principal rooms and galleries |
| `upper` | 19.35 m | 19…30.8 m | Room 301, not the entire attic/dome |

These are provisional viewer slices, not certified storeys. Report out-of-slice geometry and request a viewer-policy change instead of distorting the master. Cross-floor stairs, atrium walls and landings need all relevant floor IDs. Keep `south-public-lobby` and `south-public-arcade`; use canonical `room-301` with an explicit migration for `conference-room-301`. Do not mistake `07c | Principal-floor room divisions` for Room 301.

Continue supplying a scoped `building.json` with schema version, units/frame, asset paths, datum, floor definitions, rooms, wall groups and navigation coverage. Add a machine-readable registry schema and validate unique IDs, references, aliases, finite bounds and unit normals. Include every declared space or explicitly enumerate the subset; the current registry is incomplete. Room bounds are useful metadata but do not establish enclosed `IfcSpace` volumes.

The source registry's legacy `planCutHeight` represents an absolute elevation (for example 9.05 m); the UI slider is an offset above the floor. A versioned registry migration should use unambiguous `planCutElevation`/`planCutOffset`. Do not add floor elevation twice. A geographic datum in this registry alone does not configure the viewer's daylight location.

### Walls and dollhouse visibility

Split exterior walls at useful corners/floor boundaries, with stable wall IDs, unit outward normals, floor ownership and adjacent-space references. Keep wall solids, inner/outer finishes, reveals, windows/frames and attached decoration separately addressable and associated with their host. Thick walls cannot be opened by backface culling alone. Retain true openings and distinguish visual holes from verified wall → opening → door/window relationships.

| Assembly | Required Dollhouse behavior |
|---|---|
| Exterior shell, roof and facade-attached details | Hide together, including group `02`/`02d` south columns, capitals, balconies, cornices and joints; retain interior columns. |
| Four `02b` connecting galleries | Keep passage walls, decks, piers, arches, columns and balustrades; hide roofs, attic and upper cornice/entablature. Exterior location alone must not remove circulation. |
| Main-staircase Three Confederates | Keep sculpture and pedestal: interior decoration, cutaway-visible. Do not apply broad facade-sculpture rules. |
| Facade sculpture | Hide with its exterior host; retain sculpture category/decoration role. |
| Removable ceilings/glass covers | Hide cover panels, frames and ribs together. Keep interior glazing, structural slabs and separately controllable finishes. |
| Room 301 | Keep interior furniture and separately authored pendant fixtures through the 30.8 m upper limit. Hide roof-fitted enclosing walls, glazing, outer lining and its separate ceiling diffuser using reviewed presentation tags. |
| South public entrance | Keep lobby/arcade finishes and connecting circulation in the correct entrance slice. |

Exterior and Walk restore the full building. Floor plan keeps the envelope for height clipping. [model-policy.js](../public/js/model-policy.js) applies native presentation tags first in Dollhouse, with a reviewed component-ID fallback and retained legacy corrections for older assets. The visibility rules above describe enclosure handling and floor clipping. Correct future source tags rather than adding broader name-based rules. Review every supported floor and all-level Dollhouse; do not filter unknown content away to conceal missing semantics.

### Geometry, materials and performance

Preserve recognizable silhouettes, sculptures, inscriptions and spatial detail. Construction/collision solids need finite vertices, valid winding and closed boundaries. Thin/open decorative surfaces can be intentional; document them instead of forcing all ornament watertight. Check duplicate/coincident surfaces, z-fighting, disconnected islands, blocked doors, roof/ceiling intersections, headroom and mirrored normals.

Use glTF PBR materials, embedded images, UVs and normals. Bake procedural **surface detail** in an export copy, keeping sunlight, ambient illumination and cast shadows out of albedo. Base-color/emissive images use their appropriate color space; normal/ORM maps are non-color data. Preserve nonconstant AO and meaningful normal detail; omit genuinely flat normal maps and use scalar factors for constant roughness/metalness.

Share images when decoded pixels, dimensions, sampler and interpretation match. Different material names or duplicate filenames do not prove reuse. Prefer tileable surfaces and appropriate UV scaling over rebaking the same material for every placement. Preserve master artwork and reference/texture provenance, including redistribution terms where known; public availability alone does not establish reuse permission.

Initial export budgets, subject to close-view comparisons:

- Small repeated objects and most normal/ORM maps: 512–1024 px.
- Large surfaces and important murals: normally at most 2048 px; reserve 4096 px for named focal surfaces with visible benefit.
- Building image storage estimate: below **256 MiB**, with a future smaller mobile profile. Estimate RGBA8 plus mipmaps as the sum of `width × height × 4 × 4/3`; this is not measured GPU residency and excludes other resources. V015 meets this estimate at 245.51 MiB.
- Geometry: prioritize shared chair prototypes, cane weave, tiny carving, mouldings, balusters and round-part subdivisions. Use surface detail for subpixel relief; retain meaningful silhouettes and artwork. No fixed FPS or triangle ceiling has been established for target devices.

Budget exceptions need named assets and matched comparison images. Do not ship overlapping high/low-detail copies; authored LOD switching is not implemented. An optional reduced-detail package needs stable ID mappings before becoming a default. Test studio and daylight appearances at matching cameras/FOVs; exposure or camera changes alone do not prove improved geometry.

Use transmission only where refraction visibly helps. Remove accidental coincident panes and opaque/transmissive duplicates while retaining intended outer doors, revolving doors, interior screens and security glazing. Test single-sided rendering on verified closed solids, keeping two-sided treatment for necessary thin/open surfaces. Authoring helper lights stay outside mesh exports; ray-visibility settings in the 3D modeling software do not control viewer lights.

Report placed and unique triangles/meshes, material groups, repeated-type reuse, image dimensions/duplicates, estimated image storage and delivery bytes separately. Measure desktop/mobile timings with viewport, DPR, quality, mode, camera, surroundings and shadow-refresh state. Compression and pixel-resolution controls do not resolve high geometry or texture-memory costs.

### Walking and collision package

Supply `collision.glb` separately in exactly the visual model's frame, with economical closed structural walls/floors, stair ramps, landings, headroom barriers and large obstacles. Associate colliders with logical elements and declared route coverage. They remain active when visual walls hide. A changed doorway requires regeneration or an explicit stale-coverage warning; visibly closed doors remain obstacles unless a matching open state is supplied.

Record source/collision hashes, controller radius, body/eye heights, slope/step limits, ground versus eye starts and unsupported areas. Test continuous swept movement, doorway clearance, safe starts and stairs in both directions. Existing source tests cover a central/east route, not the entire building; south entrance, secondary stairs and Room 301 require separate validation. Re-run with the actual viewer controller when this package is integrated. Source-side route tests do not certify the app's current independently inferred collision world.

### Evidence and geometric accuracy

Keep geometric completeness, visual detail and factual confidence separate. A finely modeled inferred cornice is not more accurately surveyed than a simple inferred wall. Do not assign an industry LOD/LOI designation without defining the intended use and acceptance criteria for this reconstruction.

For each important space/product, record its source reference (photo/tour URL plus a stable view or image identifier), observation date where available, what was visible, what was inferred and what remains unmodeled. Distinguish measured-from-model dimensions, photo-derived estimates and externally documented dimensions. Mark deliberately closed/open surfaces, missing interiors and representative furniture explicitly; no data must remain unknown rather than becoming a numeric zero or a false boolean. Classification confidence alone does not validate dimensions or material composition.

## Asset pipeline

### Source-model conversion and version imports

Use `.blend` as the editable master and **GLB** as the browser delivery format. The source scene includes application-specific data and procedural graphs; the viewer consumes evaluated mesh geometry and supported glTF materials instead of loading editable source files directly.

Conversion requires Python 3.11+ and 3D modeling software compatible with the `.blend` source format and the exporter API; the converter was tested with authoring software version 5.2.1 LTS. Offline compression also requires Node.js 24+. Run `python scripts/export_model.py --help` for executable selection and discovery options.

Import selected milestones with `--only`; repeat the option to choose additional iterations:

```powershell
python scripts/import_versions.py 'C:\models\bundeshaus\versions' --only v027
```

For this project, prefer the version importer: it manages building/context profiles, annotations, geographic reference, validation, compression and catalog publication together. It accepts editable source files or complete prepared GLBs with matching reports. It publishes a version only after both visual assets succeed. Source/converter/profile hashes control reuse; source/recipe filenames keep the old catalog usable during re-export. Malformed geographic references fail before conversion; missing references warn.

Prepared GLBs still require **exactly one `.blend` in `model/`** for source identity; they are not a source-free import path. Importing many versions commits each successful catalog entry separately, can continue after another version fails, and exits nonzero if any fail. It is not one transaction across the whole archive. Inspect the final failed-version list before publishing. Per-version metadata currently keeps the fixed `viewer.json` filename, so the pipeline is not an immutable snapshot system for replaced releases.

For a standalone model:

```powershell
python scripts/export_model.py 'C:\models\building.blend' --output public/models/my-building/building.glb
python scripts/optimize_models.py --asset public/models/my-building/building.glb
```

Use the optimizer's printed delivery path in the catalog. A single-asset optimization does not update the catalog for you. Omitting `--profile` exports all renderable static meshes; [profiles](../scripts/profiles) select building/context collections and supply provisional roles.

The current [catalog parser](../public/js/model-catalog.js) requires `id`, `label`, positive integer `version`, local `building`, `surroundings` and `metadata` paths, and a supported `levels` array containing `all`. Paths start `./`, use the allowed local name characters and end in `.glb`/`.glb.gz` or `.json`; arbitrary URLs and traversal are rejected. Surroundings are optional to display, but their path is currently required in a catalog entry. Supply the matching context/annotations or deliberately extend the catalog contract; a lone GLB is not a complete new entry. [The current catalog](../public/models/catalog.json) is a working example.

The exporter can handle another building, but the importer, floor IDs/bounds, room starts, compatibility rules and geographic time-zone mapping currently describe the Bundeshaus. Reusing the app for a different building requires an explicit policy/profile review; `building.json` does not yet make those settings generic.

The converter reads without saving the source, disables embedded scripts, evaluates static modifiers and exports meshes, materials, UVs, normals, object custom properties and embedded images. Reports record source hashes, statistics, IDs and material fallbacks. It does not create floor layers/colliders or export animation and non-mesh objects. Procedural materials are **not baked automatically**: supported constant Principled inputs provide reported fallbacks; existing image textures remain intact.

The import profile must cover every intended collection. New renderable collections in the numbered building groups require an explicit profile update; prepared packages must match the declared inventory. Compare source/export IDs and collection counts before interpreting missing content as a viewer filtering problem.

Current prepared-asset checks cover source/report hashes, a self-contained GLB, IDs, inventory and coordinate declarations; they do not independently certify topology, semantic correctness or every glTF extension. List both `extensionsUsed` and `extensionsRequired`, allow only the app's configured features, and reject unsupported required extensions before release. Keep a glTF structural validation report as well as a browser check; a matching custom export report is not a substitute for either.

Authored annotation imports reject mismatched model IDs and malformed/duplicate object IDs. Notes referring to absent exported components are omitted from the viewer with a warning, while their original records and the source annotation hash are retained in `viewer.import.json`. This changes no geometry and does not reassign an old note to a guessed replacement. Correct stale authoring records before the next release; investigate unexpected omissions against the complete source/export inventory. The import audit also records the legacy south-entrance bookmark level correction. Full schema and semantic validation remain separate release checks.

Use the [Khronos glTF Validator](https://github.com/KhronosGroup/glTF-Validator) on the prepared uncompressed GLB before optimization, keeping its JSON report separately from the importer's `.report.json`. Validator extension support is not universal: review unsupported-extension warnings, retain the pipeline's Meshopt round-trip evidence and test the actual optimized delivery through the app's loader. Do not label unexamined warnings as a clean validation pass.

### Compression and storage

The pipeline uses Meshopt 1.2.0 and `EXT_meshopt_compression`, with a lossless round-trip check of buffer views, including embedded image bytes. It does not quantize, simplify, resize images, merge semantic objects or create authored GPU instance batches. Per-buffer-view selection chooses the representation that compresses better with gzip. Compression reduces transfer/storage; it does not remove placed triangles or decoded texture costs.

Small delivery GLBs have precompressed gzip sidecars. Large assets ship as explicit `.glb.gz` catalog entries so raw files above the hosting limit need not live in Git. The local server negotiates small-asset gzip with `Accept-Encoding`, `Vary`, HEAD and conditional requests; absent, stale or declined sidecars fall back to the raw small GLB. Explicit `.glb.gz` paths also work on generic static hosting.

The loader detects gzip from actual body bytes and streams decompression, so it supports both raw gzip and responses already decoded by the server. Progress uses the decoded GLB header length, not compressed `Content-Length`; it cannot exceed 100%. The local Meshopt decoder uses a JavaScript reference fallback if WebAssembly is blocked, with a possible speed cost.

To optimize the whole published catalog consistently and remove obsolete generated assets:

```powershell
python scripts/optimize_models.py --prune
```

The optimizer validates assets before catalog publication and protects active delivery files/sidecars while pruning. A valid matching recipe can be reused. If the recipe changes or an asset is damaged after raw files were pruned, reimport from the source. Keep editable masters and large conversion intermediates outside the web repository. Every shipped file must be below **100 MiB**; a large gzip file is rejected too. Pruning does not rewrite Git history or alter source masters.

Treat 100 MiB as a hard packaging limit, not a desirable target or a total-site budget. Allow headroom for future changes and measure the archive's combined transfer/storage cost. Decode is not constant-memory streaming: gzip is streamed into a complete GLB buffer, then Meshopt expands views and images are decoded/uploaded. Include these transient allocations, geometry, shadow/transmission targets and context when assessing a device budget. Hiding already-loaded context does not recover its memory.

[public/models/compression.json](../public/models/compression.json) records catalog-wide compression sizes and the current recipe; historical releases can retain earlier pipeline hashes, recorded per version. Each asset's `.report.json` retains its actual recipe and verification evidence. Updating the size summary does not require re-encoding unchanged releases. Use those data files for current totals instead of maintaining a second size table here.

Run the relevant [viewer and pipeline checks](viewer-guide.md#verify-changes) after an import or converter change.

## Annotations and geographic reference

### The implemented viewer.json contract

Deliver `versions/vNNN/model/viewer.json` with the exact catalog `modelId`. The importer also discovers annotations in `viewer/`, version root and numbered `stageNN/viewer/` folders newest first. Prefer the simple layout for new packages. Without an authored file, it seeds compatible v003 bookmarks and ID-matched notes as provisional, and does not overwrite existing repo annotations unless source annotations are supplied.

[viewer-metadata.schema.json](viewer-metadata.schema.json) defines version 1. Minimal file:

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

Text is plain text, not HTML. IDs are 1–120 characters using letters, digits, `_` and `-`; titles are at most 120 characters and descriptions/property text at most 1500. Use unique bookmark IDs across both lists and object IDs matching exported `viewer_id` values. The viewer inserts content as text.

Validation has three distinct stages:

| Stage | Required check and current enforcement |
|---|---|
| Schema | Validate with a JSON Schema Draft 2020-12 validator against the file above; reject duplicate JSON keys as well. The importer checks `modelId` but does **not** run the full schema. |
| References and semantics | Check unique IDs across bookmark lists, unique exported component IDs, matching model ID, object-ID existence, available levels, distinct camera position/target and actual plan orientation. These cross-file/geometric rules are not all expressible in the current schema. |
| Runtime and visual use | [parseMetadata](../public/js/model-metadata.js) skips malformed records and truncates some text instead of being a strict schema validator. Require zero unexpected warnings and open each bookmark to check visibility/pivot/framing. Successful import or an empty console alone is not complete validation. |

For an offline schema check, install `jsonschema` in the chosen authoring Python environment if needed (it is not a browser/startup dependency), then run from the repo root:

```powershell
python -c "import json; from pathlib import Path; from jsonschema import Draft202012Validator; v=Draft202012Validator(json.loads(Path('docs/viewer-metadata.schema.json').read_text(encoding='utf-8'))); v.validate(json.loads(Path('public/models/bundeshaus-v027/viewer.json').read_text(encoding='utf-8')))"
```

This command validates shape only; still perform the reference and visual checks. New registry/IFC metadata needs its own versioned schema rather than additional unsupported properties in annotation v1.

Views describe inspection arrangements; points of interest describe places/features. Both open named camera views from the list, not in-scene markers or guided walking routes. Each has `id`, `title`, `description` and `camera`:

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
| `mode` | `orbit`, `dollhouse`, `plan`; bookmarks do not enter Walk or capture the mouse. |
| `level` | `all`, `entrance`, `lower`, `principal`, `upper`; Plan requires an individual level available in that version. |
| `position`, `target` | Both finite three-number vectors in glTF metres, distinct and within ±1,000,000 per component. Use both or use `frame`, never both forms. |
| `frame` | `building`, `level`, `site` derives framing from geometry; site requires orbit and enables surroundings. |
| `height` | Positive vertical extent in metres, at most 1,000,000, required for an explicit Plan camera. |

Explicit plans look straight down, with screen-up along glTF negative Z. Convert source-scene camera positions and targets using `(x, z, -y)`; do not use latitude/longitude or pixels. Targets become orbit pivots, so place them on the subject instead of an arbitrary ten metres ahead of a distant camera. Photo-match FOV/calibration and animated paths are not imported. Check bookmarks for Room 301, the staircase, galleries and public entrance; preserve useful existing authored views.

Object annotations join to one mesh by `viewer_id`; sidecar properties with matching labels take precedence over inferred/extras-derived descriptions:

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

Every property requires `label`, string `value`, `basis` and `source`. `authored` means explicitly supplied, not automatically verified; `measured` means calculated from the model, with method/units stated; `inferred` requires `confidence: low / medium / high` and evidence/reasoning. Use consistent labels for category, family/type, location, likely finish, sourced historical notes and modeling completeness. Omit unsupported exact dates/species/ratings.

Without authored notes, the inspector estimates category from names and labels its confidence, and measures the full mesh's world-aligned X × Y × Z bounds. Rotation can enlarge those extents; they do not describe a clipped portion or physical survey. Validate schema and semantic references and check the console for skipped records. Use [existing annotations](../public/models/bundeshaus-v027/viewer.json) as a working example.

### Geographic reference for daylight

Keep one consistent geographic frame per version. The importer checks `research/model_georeference.json` first, then `provenance/model_georeference.json` or a directly placed equivalent inside `model/`, `viewer/`, the version root and numbered `stageNN/viewer/` folders newest first. Finally it checks numbered `stageNN/research/` locations newest first. A portable handoff should use `viewer/provenance/model_georeference.json` rather than relying on older research folders.

Preserve `origin_wgs84` as `[longitude, latitude, elevation]` and `architectural_rotation_degrees` as the rotation of ENU vectors into the source-scene XY plane. The current model uses **−7°**, followed by translation; translation does not change sunlight direction. The importer produces this separate catalog shape:

```json
{
  "latitude": 46.946495525973354,
  "longitude": 7.444211945710425,
  "timeZone": "Europe/Zurich",
  "enuToModelDegrees": -7,
  "source": "research/model_georeference.json; ENU rotated into source-scene XY"
}
```

This is not an addition to the annotation schema. The viewer rotates east/north/up into the model and converts to glTF axes; do not substitute facade north or rotate geometry again. Missing/invalid location disables Sun & sky while normal viewing remains possible. The importer currently assigns Bern's time zone; adapt it for a different building. Reconcile projected coordinates and height datum separately before survey-grade IFC map placement. Check sun from the east in the morning and west in the evening. [SunCalc conventions](https://github.com/mourner/suncalc#sun-position).

## Product registry and quantities

### Findings and implemented recommendation — v021

The existing viewer already instances compatible opaque meshes at render time. The missing layer was physical ownership: one chair could be several independently selectable material meshes, while a station ID could include both chair and desk. A material/type label alone could not support counts. V021 adds a separate semantic index without rebuilding render batches or merging the whole building into a single object.

| Implemented layer | Behavior |
|---|---|
| Editable source master | One empty root per reviewed product, preserving all component geometry, linked mesh datablocks and world placements. Product-root custom property `bim_element_id`; component `viewer_id` stays unique. |
| Ordinary GLB | 937 product parent nodes, existing material components and shared glTF mesh definitions. Per-component `viewer_element_id`, `viewer_parent_id`, `viewer_product_family_id` and `viewer_product_type_id` support author inspection. No `EXT_mesh_gpu_instancing` is added. |
| `bim.json`, schema version 1 | Project namespace, stable product/type IDs and type revisions, one owner per component, rigid product roots, component-local affine transforms, storeys, references, quantities/evidence, host openings and explicit unresolved components. |
| Viewer | Clicking any reviewed component highlights the complete product and one world bounds box. Search lists one entry per product; unresolved components remain searchable. Inventory includes hidden floors and is downloadable as JSON. Optional IFCZIP is a separate download, not parsed in the browser. |
| Importer | Validates source/model revision, membership, references, acyclic parents, coverage and recomposed component transforms. Optional IFC delivery must match source, registry, ZIP hash, registered-product count and successful offline validation record. Filenames are content-hashed. Legacy releases need no registry. |

The browser catches missing or invalid optional registries and keeps ordinary component inspection available. JSON Schema validates the full offline document shape; the normal importer and browser implement semantic/reference checks without installing a BIM package. The importer trusts the author's hash-bound IFC validation report; it does not re-run IfcOpenShell or certify an uploaded file.

### Reviewed quantities and evidence

V021 registers **937 products / 92 types / 3,741 owned components**, leaving **5,996 of 9,737 components explicitly unresolved**. The modeled chair and stool categories are complete: **527 chairs and three café stools**. They are not a census of the real building. The National Council has 289 modeled chairs across roles, including 200 distinct member seat numbers (188 general, six tellers and six bureau seats).

Other registered subsets are 339 desks, 44 sculpture/relief groups, three art supports, ten engaged pilasters, three café windows, five wall products, two double doors and one ceremonial stair system. Furniture such as benches, miscellaneous tables, cabinets and 14 desk-tagged components still needs product-membership review. Geometry and frame/material components must never be counted as independent windows, doors or chairs.

The three arched café windows each have **6.472873 m² modeled opening area** and approximately **5.299455 m² net glazing**. Opening area uses the authored rectangular-plus-semicircular aperture. Net glazing unions the projected glass triangles and subtracts opaque frame/casing projections; front/back faces count once. Their subtotals are 19.418620 m² and 15.898365 m². Outer-frame projected area is **null/unknown**, as are whole-building window totals. These are custom evidence-bearing quantities, not an asserted industry measurement standard or survey.

One legacy material batch contained four disconnected transverse walls. Splitting it into four real wall parts preserves its 196 triangles and permits unambiguous café north/south door hosts. Five reviewed wall–opening–filling relationships now exist (three windows and two double doors, each door counted once with integer `leafCount=2`). Other host relationships remain unresolved. The ceremonial stair has one primary spatial containment plus one additional storey reference. The four storey elevations remain provisional; no closed `IfcSpace` volumes are synthesized from bounding boxes.

The host walls already contain their authored apertures and are not all Boolean-ready solids. A second subtractive IFC opening body caused an empty façade in CGAL and very slow OpenCascade processing. The implemented reference export therefore gives each `IfcOpeningElement` its placement, exact local profile/depth properties and host/filling relationships, with no separate subtractive Body. Source wall geometry is preserved. All five final relationships pass default geometry handling in both engines with identical host bounds. This is semantic opening support, not editable parametric void geometry.

### Identity and authoring rules

Keep the migration's identity ledger and source mappings with the frozen modeling package. Preserve a product ID when it moves or its geometry is refined. Preserve its type ID with an incremented type revision when every occurrence follows the refinement; create a new type when one occurrence becomes a distinct variant. New products receive new IDs; deleted products disappear without reusing their IDs. Geometry hashes discover equivalence and bind payloads, but are not release identities. Rooms are instance properties and never part of type identity.

Product roots must be right-handed, orthonormal rigid transforms. Bake scale, shear and reflection into type-local component geometry. `rootMatrix × component.localMatrix` must reproduce the source within 0.001 m conversion tolerance. The IFC exporter rejects incompatible types even when their world bounding boxes happen to match; shared local vertices must agree within 0.00001 m with matching topology and materials. The current maximum type-local difference is below 0.000001 m. This numerical fidelity says nothing about reconstruction accuracy.

### Offline toolchain and commands

Use a separate Python environment and [requirements-bim.txt](../scripts/requirements-bim.txt): IfcOpenShell **0.8.5**, NumPy **2.3.5**, JSON Schema **4.26.0**, pytest **8.4.2** (used by IfcOpenShell EXPRESS validation). The browser and normal importer need none of these packages. The geometry reader accepts static, uncompressed, ordinary triangle GLB with embedded buffers; use the prepared authoring `viewer/building.glb`, not the web `*.glb.gz` Meshopt asset.

```sh
python -m pip install -r scripts/requirements-bim.txt
python -m jsonschema -i PATH/TO/v021/viewer/bim.json docs/bim-registry.schema.json
python scripts/export_ifc.py PATH/TO/v021/viewer/building.glb PATH/TO/v021/viewer/bim.json .work/bundeshaus-pilot.ifc --scope pilot
python scripts/export_ifc.py PATH/TO/v021/viewer/building.glb PATH/TO/v021/viewer/bim.json .work/bundeshaus-registered.ifc --scope registered
python tests/bim_test.py
node --test --test-isolation=none tests/bim.test.mjs tests/instances.test.mjs
```

The exporter produces `.ifc`, `.ifczip`, `.report.json` and `.validation.json`. The pilot has 16 products across 12 types; the registered export has all 937 reviewed products and 92 representation maps. To publish the registered package, supply it as `viewer/building.ifczip` with `viewer/building.ifc.report.json` and `viewer/bim.json` alongside the frozen source and prepared GLB reports. The existing version importer adds optional `bim`/`ifc` catalog paths only after their checks pass. A pilot file cannot be mislabeled as the registered viewer download.

### Validation and remaining milestones

Both IFC files pass IFC4 schema/EXPRESS checks and reopen in IfcOpenShell. All 937 registered objects pass independent geometry-bound comparisons with a maximum 0.0000006 m difference. All 937 product definitions are also checked for rigid placements and type-local vertex/topology/material equivalence. Native parenting preserves source world vertices within 0.0000082 m; the prepared GLB's recomposed component transforms match its predecessor within floating-point precision. Material colors/transparency are exported, while the textured GLB remains the presentation asset.

The automated revision fixture moves a product, refines another type's geometry without changing its AABB, adds a product and removes one. It confirms retained occurrence/type GlobalIds, incremented type revision, mapped reuse and typed integer properties through actual IFC write/reopen. This is an exporter regression test, **not a receiving-application revision test**. Viewer regression checks cover retained milestones, selection, geometry and navigation.

Next priorities are to review remaining windows/doors and their hosts, then other furniture and structural assemblies; reconcile room/storey ownership and navigation; and test the IFC in the intended CDE/application. Native parametric families, survey-grade coordinates, building-wide quantity completeness, editable door behavior and receiving-MVD compliance are not claimed. Existing rendering instancing already handles repeated opaque components; semantic grouping alone is not an FPS optimization. Continue profiling texture memory and draw calls before adding KTX2, room-based loading or LOD.

## IFC delivery

The latest full-building IFCZIP includes reviewed products and explicitly unclassified reference geometry. See [downloads and coverage](../public/README.md). A passing subset geometry test must not be described as whole-building IFC acceptance.

### Scope and export route

**Implemented in v021 as a tessellated reference exporter; not yet validated in a receiving CDE.** The confirmed use is a classified, inspectable reference/coordination model in a CDE or BIM viewer. Use **IFC4 ADD2 TC1 (4.0.2.1)** as the implemented schema baseline, with mesh geometry, element types, a useful spatial tree, stable revision identity and provenance. Pin schema/tool versions in the export record; do not silently generate IFC4.3 entities while labeling a file IFC4. Parametric remodeling and dependable quantity take-off are separate scopes. The receiving platform is still unspecified; verify its importer and formal Model View Definition requirements before claiming compliance. [IFC4 ADD2 TC1 specification](https://standards.buildingsmart.org/IFC/RELEASE/IFC4/ADD2_TC1/HTML/cover.htm).

Before a production export, record the recipient's application/version, accepted schema/MVD, file/ZIP and texture limits, coordinate expectations and required properties. A sample can proceed with the proposed baseline, but CDE upload success is not evidence that geometry, properties or revision comparison work correctly.

IFC-capable 3D modeling software can create an IFC project and save `.ifc` separately from the editable source scene. Meshes need entities, spatial ownership and properties; a format dropdown alone does not add these meanings.

For repeated releases, use an offline **3D modeling software → IfcOpenShell → IFC** pipeline from the frozen complete source, independent of visible Dollhouse/floor filtering. Disable embedded scripts, evaluate shared definitions once and retain transforms/materials. If the authoring software's Python environment cannot load the required IfcOpenShell package, export a geometry/metadata intermediate and construct IFC in a pinned standalone environment. Keep GLB for the current textured app; IFC is an additional deliverable. [Mesh representation API](https://docs.ifcopenshell.org/autoapi/ifcopenshell/api/geometry/add_mesh_representation/index.html), [type assignment](https://docs.ifcopenshell.org/autoapi/ifcopenshell/api/type/assign_type/index.html).

### Product identity, classification and placement

Start with the central building including furniture/sculpture; make surroundings a separate optional file. Apply classes to logical products after grouping, not every material component:

| Model element | Proposed IFC4 mapping |
|---|---|
| Interior/exterior wall | `IfcWall`; external status does not establish load-bearing capacity |
| Complete window / door | `IfcWindow` / `IfcDoor` |
| Floor structure / ceiling or finish | `IfcSlab` / `IfcCovering` |
| Column / roof | `IfcColumn` / `IfcRoof` |
| Stair or flight / ramp | `IfcStair` or `IfcStairFlight` / `IfcRamp` |
| Handrail, balustrade | `IfcRailing` |
| Chair, desk, table, cabinet | `IfcFurniture` with an appropriate reusable complete-product type |
| Light fixture | `IfcLightFixture` |
| Sculpture, ornament, unresolved pieces | Suitable classified entity where justified, otherwise `IfcBuildingElementProxy`, retaining category and uncertainty |

Use tessellated representations first, for example IFC4 `IfcTriangulatedFaceSet`, with closed-solid flags matching actual topology and a suitable Body representation context. Keep type geometry in its local frame and occurrences relative to their spatial/assembly placement; do not bake a world transform into vertices and apply it again through placement. An IFC class name does not guarantee native editable wall/door behavior in another application. Preserve open decorative surfaces honestly and keep unresolved geometry through explicit fallbacks rather than dropping it. [IFC4 tessellation](https://standards.buildingsmart.org/IFC/RELEASE/IFC4/ADD2_TC1/HTML/schema/ifcgeometricmodelresource/lexical/ifctriangulatedfaceset.htm).

Complete logical membership, whole-product type identity and assembly root transforms. Prefer one physical product with several styled representation items over one furniture entity per upholstery/frame/cane mesh. Preserve component IDs in a source-to-IFC mapping. Use reusable representation maps and per-occurrence placements; family grouping can remain a custom property. [IFC4 mapped representations](https://standards.buildingsmart.org/IFC/RELEASE/IFC4/ADD2_TC1/HTML/schema/ifcgeometryresource/lexical/ifcmappeditem.htm).

Derive stable GlobalIds from project-scoped logical IDs, not export order or version-specific seeds. The same retained object keeps its identity across revisions. Document standalone-component fallbacks, splits, replacements and retired IDs. Record version/source hash, reconstruction status and per-property evidence in custom property sets such as `Reconstruction_Provenance`. Do not populate unsupported structural, thermal, fire or cost properties.

Use a persistent project namespace plus a deterministic UUID mapping (or a persisted GUID registry), encoded with `ifcopenshell.guid.compress`; IFC GlobalIds use a specific 22-character encoding, not a truncated `viewer_id`. Give project/site/building/storeys, types and products their own unique stable IDs. Different export detail profiles of the same logical product should retain product identity, with profile/revision recorded separately. [IfcOpenShell GUID API](https://docs.ifcopenshell.org/autoapi/ifcopenshell/guid/index.html).

The current annotation values are display strings. IFC numeric dimensions need typed values and explicit units; never parse a rounded inspector label into a construction dimension. Use applicable standard property sets only when their meaning is supported, and project-specific sets for reconstruction evidence; retain unknown values as absent. Keep reusable type properties separate from placement-specific facts and declare any external classification system/edition rather than treating local categories as a certified classification. [IfcOpenShell property typing](https://docs.ifcopenshell.org/autoapi/ifcopenshell/api/pset/edit_pset/index.html).

Create a project/site/building/storey hierarchy with an explicitly provisional but complete storey registry, including the entrance. Spatial hierarchy uses aggregation; product containment and assembly decomposition have separate roles. Each top-level product has one primary spatial owner; use additional floor references for cross-floor objects and contain decomposed pieces through their parent. Do not duplicate stairs per floor or manufacture `IfcSpace` volumes from bounding boxes. The [IFC4 containment definition](https://standards.buildingsmart.org/IFC/RELEASE/IFC4/ADD2_TC1/HTML/schema/ifcproductextension/lexical/ifcrelcontainedinspatialstructure.htm) distinguishes containment, spatial references and hierarchy.

Resolve wall → opening → door/window relationships before authoring void/fill semantics; visual holes and incomplete wall-group tags are insufficient evidence. Keep metres and the source scene's Z-up local frame, or explicitly reverse the Y-up conversion if using GLB data. Preserve approximate geographic reference/north and reconcile coordinate/height datums before projected-CRS conversion. Sunlight metadata alone is insufficient for surveyed placement.

Record source/target CRS, units, easting/northing, vertical datum, local X-axis orientation and scale before using `IfcMapConversion`. Its direction maps the local engineering frame into map coordinates; do not copy the source's ENU-to-model −7° value without accounting for the inverse transform. Test transformed control points, not just a north arrow. When map placement remains uncertain, retain local coordinates and label the approximate geographic evidence. [IFC4 map conversion](https://standards.buildingsmart.org/IFC/RELEASE/IFC4/ADD2_TC1/HTML/schema/ifcrepresentationresource/lexical/ifcmapconversion.htm).

### Appearance, packaging and acceptance

Start with material names, colors and transparency. Evaluate texture support and packaging only after the receiving application is known; IFC presentation support does not imply parity with PBR materials in the source scene or Three.js viewer. Keep GLB for the fully textured presentation and keep the initial IFC acceptance based on geometry, readable colors and semantic data.

Shared representations reduce repeated storage, not every rendering cost. V021 registered IFC is about 26.16 MB, or 4.44 MB as IFCZIP. Receiving-application opening time remains unmeasured. Offer `.ifc` and IFCZIP only where supported; measure before choosing Git storage or a release download. The same 100 MiB per-file repository constraint applies. A reduced-detail export needs a distinct file/profile and source mappings, while retaining GlobalIds for the same logical products.

First build a representative sample: a wall with hosted door/window, repeated complete chairs, a multi-storey stair and a sculpture. Check logical counts, stable GlobalIds after re-export, shared definitions, coordinates/scale, spatial ownership and provenance. Run [syntax/schema validation](https://docs.ifcopenshell.org/ifcopenshell-python/validation.html), reopen/regenerate geometry, compare bounds and full source coverage, then inspect in an IFC authoring application and the actual receiving CDE/BIM viewer. Schema validity alone does not prove interoperability. After that, export the latest full building and automate subsequent versions.

The receiving-app check must include a second revision with one moved product, one geometry refinement, one addition and one deletion. Confirm that the platform recognizes retained GlobalIds, selects whole logical products, shows typed properties and places the model correctly. Record tool versions, source/IFC hashes, validation output, unresolved fallbacks and maximum geometric deviations. Do not claim editable BIM behavior or dependable quantities from successful display alone.

These IFC milestones do not block the existing GLB viewer. Model preparation priorities are complete logical assemblies, the floor/host registry, reviewed fallback classifications and documented solid/finish/decorative distinctions.

## Delivery checklist

Preferred frozen modeling-package layout; older numbered `stageNN/viewer/` packages remain supported:

```text
versions/vNNN/
  model/bundeshaus_bern.blend       editable master, packed/relative dependencies
  model/viewer.json                implemented views, places and object properties
  viewer/building_profile.json     complete intended collection inventory
  viewer/context_profile.json
  viewer/building.glb              ordinary nodes with shared meshes and images
  viewer/building.report.json
  viewer/context.glb
  viewer/context.report.json
  viewer/provenance/model_georeference.json
  viewer/bim.json                  reviewed product/type/instance registry v1; optional
  viewer/building.ifczip           registered IFC4 reference subset; optional
  viewer/building.ifc.report.json  source/registry/IFC validation and mapping
  viewer/building.json             broader room/wall navigation registry; future integration
  viewer/collision.glb             scoped navigation package; future integration
  viewer/README.md                 version changes, coverage, provenance, limitations
```

The package README is version evidence from the modeling project, not another general requirements document. A future manifest should express readiness/coverage; current import validation uses source/report matches and successful completion of both visual assets.

Published `vNNN` directories should be immutable snapshots. Use a new version for refinements so saved links and comparisons remain reproducible. If an existing label is deliberately refreshed during development, record both source hashes and state that older links now resolve to changed content. A release manifest should tie the source, GLBs, annotations, profiles, geographic record and optional IFC/collision files to the same frozen revision; readiness is an author declaration until automated validation exists.

1. **Freeze and identify.** Record source SHA-256, authoring software and exporter versions, settings and hashes of assets, profiles and sidecars. Do not mutate the source during export. Save a new `vNNN` iteration rather than renaming an older published one.
2. **Account for every placement.** Compare exact source/export ID sets and per-collection counts. List retained, added, retired, intentionally excluded and replaced IDs, with migration mappings. No export-order identities or silently omitted collections.
3. **Verify the asset.** Reopen GLBs independently; check metre scale/frame, transforms, normals, UVs, embedded textures, materials, supported extensions and shared prototype reuse. Demonstrate linked geometry for at least one furniture, window and door type where present; compare mesh-node and unique-mesh counts. Check decoded image pixels/dimensions, not only compressed sizes. Preserve collection/profile compatibility until the import profiles are explicitly updated.
4. **Validate semantics.** Check classification evidence, family/type links, floor/room arrays, host namespaces, aliases and registry coverage. Annotation JSON must validate, all references resolve within their documented scope, and the browser must not skip authored records.
5. **Check visibility and navigation.** Test Exterior, all-level Dollhouse, every floor, Floor plan and Walk. Cover four galleries, Three Confederates, south entrance, Room 301 walls/fixtures, glass ceiling covers and facade columns/statues. Check bookmarks, selection, camera continuity and version changes. Keep route coverage honest.
6. **Check daylight.** Confirm that the imported version enables Sun & sky using its own geographic record; test east morning/west evening, date/hour controls and studio restoration.
7. **Measure changes.** Record geometry/material/image counts, estimated image storage, transfer bytes and representative browser timings with viewport/DPR/lighting. Compare important interiors and exterior silhouettes at fixed cameras. Explain budget exceptions and remaining defects.
8. **Publish compatible delivery assets.** Let the importer apply verified lossless compression and publish the catalog after building/context success. Keep raw masters/intermediates outside the web repo and all shipped files below 100 MiB. Future IFC/collision/LOD deliverables must declare their integration status rather than implying current runtime support.

## Current model status

**v027 is the current release.** It contains 10,768 components, 1,795 reviewed products / 669 types and 2,858 unresolved reference components. The full IFCZIP covers all 4,653 represented objects with no missing receiver geometry. See [downloads and coverage](../public/README.md). Its floor schedules and saved views use the version-specific catalog definitions; older retained versions keep their original level schedules.

### Retained milestones

The public catalog keeps the first release, the latest validated release and three representative intermediate versions. See the [retained milestones](../public/README.md#retained-viewer-milestones) and [catalog compression data](../public/models/compression.json). Keep release-specific evidence with retained assets; remove retired model directories after checking shared dependencies.

The viewer still has no filled section caps, drafting-quality plan linework or dynamic doors. Floors and reconstructed geometry remain approximate. Walking checks cover selected starting positions, not whole-building accessibility. Physical-device memory/FPS acceptance and the actual CDE importer remain to be validated.

## Review findings

Delivery-contract review, 9 September 2026: checked importer/exporter behavior, schema versus runtime validation, GLB node metadata and IFC4/IfcOpenShell documentation. This reviewed delivery contracts, not source-model topology or receiving-application interoperability.

| Finding | Recommendation implemented in this handoff |
|---|---|
| Author requirements and automatic enforcement were easy to confuse. | Mark current versus planned contracts and separate schema, reference and visual validation; add an executable offline schema check. |
| Standalone/ready-GLB import appeared more generic than the implementation. | Document required source master, complete catalog paths, Bundeshaus policy dependencies and per-version publication/failure behavior. |
| Stable IDs did not fully specify revisions and assembly ownership. | Distinguish semantic IDs from payload hashes, define planned logical membership/transforms and require immutable published snapshots. |
| Geometric precision and reconstruction confidence lacked distinct acceptance. | Add conversion-control points/tolerance and per-space evidence/completeness without implying survey accuracy. |
| IFC4 recommendations linked to other schema editions and omitted exchange details. | Pin the proposed IFC4 ADD2 TC1 baseline, align references, specify GUID encoding, typed properties, map-transform direction and receiving-app revision tests. |
| Download compression could be mistaken for device-memory suitability. | Describe peak decode/resource costs and packaging limits separately from model budgets. |

The v021 implementation below closes the reviewed product-registry and IFC sample/exporter milestones. Open work remains full architectural product coverage, authoritative room/host registries, authored collision geometry and receiving-application interoperability. Keep general findings here; retain release-specific evidence with the frozen package.

Technical references: [Three.js GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html), [texture memory](https://threejs.org/manual/en/textures.html).


### v022 correction delta

943 reviewed products / 96 types; all 937 v021 product identities retained. The added subset covers two entrance bear supports, two empty figurative bowls and two curved secondary staircase assemblies. The six sculpture relocations preserve IDs. 5,996 components remain unresolved. All 943 IFC geometry comparisons and schema validation pass.

Visible included source-scene text (`FONT`) objects now export as evaluated meshes with their source text and transform metadata; the source remains editable. The text-export regression covers visibility, parent transforms and source preservation alongside the existing export integration test. v022 evidence and photo/model comparison accompany its model assets.


## Version-specific floor schedules

A catalog model may supply `levelDefinitions`, keyed by each non-`all` ID in its `levels` list. Each entry requires a nonempty `label` and finite metre-valued `elevation`, `min`, and `max`, with `min <= elevation < max`. The floor selector, plan cut, framing and vertical navigation use that version's values. Models without this field retain the legacy four-level policy, including Upper = Room 301.

For models using an explicit schedule, floor visibility uses prepared world bounds and clipping rather than legacy floor tags or the Room-301-only restriction. Explicit dollhouse enclosure/overhead removal still applies. This is a presentation policy, not IFC containment: author and validate BIM storey assignments separately. Preserve local finished-floor offsets in the model and registry; a reference storey is not a command to flatten every room to one elevation.

Do not add an unfinished candidate to the public catalog merely to activate these controls. Bind the schedule to the validated frozen model on release.


### v027 update

v027 supplies `levelDefinitions` and uses the selected catalog level list for saved-view validation. Its full IFC includes 1,795 reviewed products plus 2,858 explicitly unclassified reference components; these are not additional reviewed physical counts. Old releases keep their historical schedules. Raw v027 IFC stays local; IFCZIP is the public download. No physical quantity totals are inferred from the tessellated reference geometry.

The stage38 revision remains v027. It includes coordinated floor geometry and separate National Council gallery boxes. Original v027 source and public files are preserved in the local authoring archive. Room301 footprint registration remains an open accuracy task.


Stage39 retains v027: corrected third-office outline and independent north vestibule; west foyer aperture aligned. The low side passage / Hochparterre level transition remains an evidence gap.


Stage40 retains v027: 10,768 components, 1,795 products, 671 types. Carpet and portal-glass components belong to existing stair/door products. Connector vertical taper is removed; the original southern roof pitch is retained. Floor substrates carry `viewer_cutaway_role: interior` and `viewer_role: floor`.


### v027 stage43 wall and hall coordination

The second-floor archive infill excludes the open dome hall and both vaulted side galleries. Third-office infill was retired in stage42. Walls crossing the existing storey datums are split into level components, preserving original component IDs on the lowest part and recording suffixed identities for upper parts. Reviewed product identities are unchanged. Interior partitions and gallery backing walls have an explicit interior cutaway role; facade-attached linings and roof/vault overhead assemblies remain removable. See the local stage43 report for the complete identity migration, evidence and validation. These are coordination datums, not surveyed dimensions.
