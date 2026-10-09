# Conventions

[← Repository](../README.md) · [Handbook](reconstruction-handbook.md) · [Pitfalls](pitfalls.md) · [Adding a building](adding-a-building.md) · [Model handoff](model-handoff.md)

The fixed rules every Blender reconstruction follows: folder layout, names, frames, records and git. The [handbook](reconstruction-handbook.md) explains the work itself; the [model handoff](model-handoff.md) defines the object properties the viewer reads.

## Building folder

```text
reconstructions/<id>/
  index.html        thin viewer page (from templates/reconstruction/)
  README.md         one paragraph for visitors of the repository
  public/           committed and published on GitHub Pages
  work/             gitignored here; its own private repository
```

`public/` holds only what may be published: `building.json`, `about.html`, `profiles/`, `models/` (the latest release only), `previews/`, `docs/`. Everything else – evidence, research, native models, releases, review images – stays in `work/`.

## Work folder

Every building's `work/` has the same top level. Nothing else belongs there.

```text
work/
  README.md       identity table (name, scope, intended state, frames, floors) and where to start
  AGENTS.md       building-specific rules for agents, on top of the shared docs
  STATUS.md       current release, what is next, open questions – updated after every step
  HISTORY.md      one entry per release and per closed stage; links into releases/ and archive/
  project.json    machine-readable identity: id, namespace, latestRelease, frames, paths, release list
  references/     original evidence, indexed in manifest.json (validator-enforced)
    incoming/       unverified intake queue
    derived/        registered derivatives of evidence: crops, page renders, stitched panoramas
    catalog/        generated HTML catalog (tools/reference-catalog/build.py); not tracked
  research/       interpretation: source register, decisions.json, coverage matrix, measurements, derived data
    derived/        data computed by build scripts and read by the build (plan calibration and topology, georeference, roof fit …)
  build/          the one living authoring folder
    README.md       how to rebuild and release, script index
    scripts/        every script this building needs, flat, with stable prefixes (below)
    model/          the working .blend, generated specs, textures
    review/         latest check results and review images (overwritten on every run)
    tmp/            scratch: import profiles, IFC scratch, logs; not tracked
  releases/       frozen packages vNNN/ – never edited after freezing
  archive/        history: retired public copies (models/), old stage folders (stages/), superseded entry points (legacy/), renders of older releases (renders/)
  downloads/      optional: raw, re-downloadable acquisitions (tour tiles, bulk geodata); not tracked
```

Rules:

- **One living build.** There are no parallel stage copies. A change is made in `build/`, checked, then frozen into `releases/vNNN/`. The history of a change lives in git (commits and tags of the work repository) and in `HISTORY.md`, not in copied folders.
- **Frozen means frozen.** A release folder is never edited. Corrections go into the next release. Exceptions need the user's explicit decision and are recorded in `HISTORY.md` (example: renders of older releases moved to `archive/renders/` on 2026-10-06).
- **references/ holds evidence only.** Each file is a registered asset in `manifest.json`; `tools/reference-catalog/references.py --validate` fails on anything else. Model screenshots, comparison sheets and traces go to `build/review/` or `research/`.
- **Evidence is filed by content.** Follow the template's `references/README.md`: `photos/`, `floor-plans/`, `sections/`, `elevations/`, `site/`, `documents/`, and `derived/<collection>/<source>/`. All original photographs belong under `photos/`, including garden and site views; do not create `site/photos/`. Email/archive delivery is provenance, not a new top-level folder. Preserve IDs, bytes, filenames and legacy paths during migrations; log the mapping in `research/reference-library/`.
- **Raster access copies belong in `references/derived/`.** Start visual inspection with a colour PNG at about 2048 pixels on its long edge. Reuse registered previews; retain larger detail views only when they add readable information or are cited by existing controls. For tiny dimensions, render a bounded crop or overlapping tiles around 1200–1800 pixels instead of a giant full sheet. Record source ID/hash, page/frame, crop, resolution and renderer; keep the PDF/TIFF unchanged. Provide collection/source README links so agents can discover previews without opening heavy vectors. Contact sheets with review labels, tracings and model comparisons belong in `build/review/` or `research/`.
- **Only the latest release is public.** Older public copies move to `work/archive/models/` (`import_versions.py --keep-latest`).
- **Review images are rebuilt, not kept.** `build/review/` is overwritten by each run; the release copies what it needs into `releases/vNNN/validation/`. Only the current release keeps its renders and review images; when the next release is frozen, those of the previous one move to `archive/renders/vNNN/` (same relative paths).

### Old layout → new layout

Folders of the old layout and where they went (2026-10-06). Frozen release documents keep their old paths; read them through this table.

| Old | New |
|---|---|
| `versions/vNNN/` | `releases/vNNN/` |
| `stages/stageNN/` (active stage) | `build/` (`scripts/`, `model/`, `review/`); stage report → `HISTORY.md` and `archive/stages/stageNN/` |
| `stages/stageNN/` (closed) | `archive/stages/stageNN/` |
| `stages/stageNN/research/*.json` read by the build | `research/derived/` |
| `scripts/` | `build/scripts/` |
| `catalog/`, `tools/reference-catalog/index.html` | `references/catalog/` |
| `import-profiles/` | `build/tmp/import-profiles/` |
| `PROJECT.md` | `README.md` (identity table) |
| `decision-record.md`, `source-record.md`, `release-checklist.md` | this page (records) and the [handbook](reconstruction-handbook.md#release-checklist) |
| root `model/`, `renders/`, `comparison/`, `exports/`, `templates/` (Bundeshaus) | `archive/legacy/` and `archive/exports/` |

## Names

| Thing | Rule | Example |
|---|---|---|
| Building id | lowercase slug, also the namespace prefix of every product id | `landgut-lohn` |
| Release | `vNNN`, three digits, never reused; a published model is `<id>-vNNN`. The Bundeshaus v027 revisions (`v027-revision-stage43`) are a legacy exception; new work takes the next number | `v008`, `landgut-lohn-v008` |
| Floor ids | short, lowercase, as in `building.json` `pipeline.levels` | `eg`, `og1`, `dg` |
| Product ids | `<id>-<building part>-<floor>-<kind>-<nnn>`, stable across releases | `lohn-dependance-eg-door-007` |
| Decisions | `<PREFIX>-D<NNN>` in `research/decisions.json` | `LL-D033` |
| Collections | `Site`, `<Part>_<FLOOR>` (`Main_House_EG`), `Context`, `Types` (hidden type library), `Reference` (hidden underlays and cameras) | |

### Script prefixes in `build/scripts/`

| Prefix | Step | Examples |
|---|---|---|
| `s` | survey and control: plan calibration, georeference, LiDAR fits, panorama poses and measurements | `s01_plan_calibration.py`, `s20_pano_measure.py` |
| `c` | context and surroundings | `c03_context_spec.py` |
| `b` | build: spec, textures, Blender scene | `b00_build_spec.py`, `b10_build_blender.py` |
| `v` | building-specific validation (shared checks live in `tools/model-checks/`) | `v10_camera_renders.py`, `v60_report.py` |
| `r` | release: viewer.json, BIM registry, pipeline, previews | `r30_release_pipeline.sh` |
| none | acquisition and helpers | `tour_download.py`, `frames.py` |

Scripts find the work folder from their own location (`Path(__file__).resolve().parents[2]`) or take it as the first argument. They write only to `build/`, `research/derived/` or a release folder named on the command line.

## Frames and units

- Metres, 1 Blender unit = 1 m, Z up.
- Record the site's actual coordinate reference system and a suitable local origin in `project.json`; vertices never carry large map coordinates. For Swiss survey data this is commonly a rounded LV95 point (EPSG:2056). **Do not apply LV95 to a building outside Switzerland.**
- Heights: state the source's vertical datum and origin height: model z = H − origin. LN02/LHN95 are Swiss examples, not defaults for other countries. Never infer a datum solely from a printed altitude.
- If geographic control is unresolved, an explicitly labelled **local architectural study** can proceed from calibrated plans and supported relative levels. Record its local origin and axis directions, leave unknown projected CRS/absolute elevation/true-north rotation unset, and report that geographic placement is unvalidated. A visitor map pin is not survey control. Do not fabricate an IFC map conversion or daylight rotation to satisfy an exporter; document/omit unsupported geographic features.
- The rotation from east/north to the model axes (`enuToModelDeg`) and the WGS84 origin go into `research/derived/model_georeference.json`, which every release copies into `research/` and `viewer/provenance/`.
- Plan frames (per sheet) are calibrated from dimension strings and scale bars, never from the printed scale; the plan → model transform is recorded once (`research/derived/georeference.json`).

## Evidence classes

Every dimension, opening, material and furnishing item is one of:

- **measured** – read from a plan dimension, LiDAR, a calibrated photograph or a panorama with known camera height;
- **inferred** – from proportion, symmetry, typical construction or a panorama with assumed camera height; the basis is recorded;
- **unknown** – modelled as a marked placeholder and logged; never closed with invented geometry.

Objects carry the class and source in building-prefixed properties (`lohn_basis`, `lohn_source`); the hygiene check can require them (`--require`).

## Records

### Decision (`research/decisions.json`, schema `decisions.schema.json`)

One entry per contradiction or source-backed choice: id, status (proposed / adopted / superseded), date, problem and affected ids, evidence ids (must resolve in `references/manifest.json`), observed facts, inference and alternatives, chosen implementation with units, confidence, validation, release. Adopted decisions need a resolution.

### Source (`references/manifest.json`, schema `manifest.schema.json`)

Per asset: original path and SHA-256; author or publisher and URL or attachment identity; retrieved and original date (or unknown); rights and permitted uses (or unknown); building, room, level; scale, units, north and datum where it is a drawing; what it supports, with page or pixel coordinates; derived files and processing steps. Intake through `references.py --intake`; promotion only after inspection.

### Release (`releases/vNNN/`)

```text
releases/vNNN/
  README.md        what changed, file table with the .blend SHA-256, how to reproduce
  REPORT.md        checks and figures, open points, repository state
  SHA256SUMS       model, viewer.json, georeference, GLBs, reports, IFCZIP
  model/           exactly one .blend + viewer.json
  research/        model_georeference.json
  viewer/          prepared GLBs, bim.json, IFC exports, provenance/
  validation/      the check results of this release (camera-match renders only while it is the current release)
```

## Git

| Repository | Holds | Rule |
|---|---|---|
| public (`reconstruction`) | viewer, tools, docs, tests, gallery, each building's `public/` | everything committed is published; `work/` is ignored; check `git status` before every commit |
| private work repository, one per building | that building's `work/` | text, data, scripts and records are tracked; binaries (`.blend`, GLB, images, PDF, LiDAR, video) are not, until Git LFS is set up (see `.gitignore`) |

- When the owner has authorized commits, commit each work release (`Release vNNN: …`) and tag it (`vNNN`). Without that authorization, leave the validated files local and record the uncommitted state; do not invent a commit/tag. The tag `pre-restructure` marks the old layout.
- Releases list their binaries in `SHA256SUMS`, so a release stays verifiable without the binaries in git.
- Never commit plans, tour imagery, photographs of unknown rights or traces to the public repository.

## Glossary

| Term | Meaning |
|---|---|
| Evidence | A registered source file in `references/` |
| Derived | Faithful source previews/crops/text in `references/derived/`; interpreted calibration or model control in `research/derived/`. Extracted photographs go under `references/photos/` and retain parent links |
| Build | The living authoring state in `build/` |
| Release | A frozen, validated package in `releases/vNNN/` |
| Published version | The one release imported into `public/models/` |
| Dollhouse | Viewer mode that removes roofs, ceilings and the enclosure (`viewer_cutaway_role` enclosure / overhead) |
| Camera-match | Render of the model from a solved panorama or photograph pose, compared side by side |
| Type / instance | A shared mesh (`Types` collection) and its placements; one parameter set is one type |
