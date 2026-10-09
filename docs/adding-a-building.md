# How to create a new reconstruction

[← Repository](../README.md) · [Handbook](reconstruction-handbook.md) · [Conventions](conventions.md) · [Agent brief](agent-brief-template.md) · [Model handoff](model-handoff.md)

Start here when a person or agent adds a building. This is the setup and delivery sequence; conventions define the contracts and the handbook explains modelling. Read `CONTRIBUTING.md`, then the selected building's `work/AGENTS.md`, `README.md`, `STATUS.md` and `project.json` if it already exists. Resume existing work rather than creating a second workspace.

## 1. Identify the building and choose the first deliverable

Record official name, aliases, address, country, source, components in scope and intended historical state. Give the building a lowercase slug and its own product/decision namespace. Distinguish neighbouring buildings and similarly named sites. A gallery map pin does not establish survey control.

| Route | Minimum useful evidence | First deliverable |
|---|---|---|
| Research only | Reliable identity and source leads; geometry not calibrated | Gallery research card, private library, coverage matrix and next actions |
| Scripted Blender / BIM | Calibratable plans/measurements, relative heights and photographs to check interpretation | Limited architectural model with evidence, stable product IDs, floor/cutaway metadata and validation |
| Gaussian splat | Reusable multi-view dataset with suitable overlap/poses, or an authorized survey | Dataset/pose audit, small training trial, held-out image checks and viewer result |

Random photographs are useful architectural evidence but do not automatically make a trainable splat dataset. A 360° tour may have large gaps between positions; assess novel views as well as capture viewpoints. For a new survey, establish access, photography conditions, overlap and reference measurements before promising a reconstruction.

Examples inspected for this guide:

| Project | Reuse the method | Do not copy |
|---|---|---|
| [Landgut Lohn](../reconstructions/landgut-lohn/) | Scripted control/build/release sequence, panorama measurements, typed products and viewer checks | Coordinates, dimensions, IDs, room inventory or rights |
| [Bundeshaus](../reconstructions/bundeshaus/) | Archive interpretation, semantic products and release validation | Legacy stage folders, naming exceptions or building-specific policy |
| [Villa Maraini](../reconstructions/villa-maraini/) | International identity, archive handoff, revision reconciliation and PDF/TIFF inspection | Swiss datum defaults or an assumption that recent filenames prove measured/current conditions |
| [Römerholz](../reconstructions/roemerholz/) | Honest research landing and acquisition priorities before geometry | A release number when no model exists |
| [Von Wattenwyl-Haus](../reconstructions/von-wattenwyl-haus/) | [Splat pipeline](../reconstructions/von-wattenwyl-haus/docs/pipeline.md), pose experiments and quality assessment | Its legacy folder structure as a new Blender template |

## 2. Create the public/private skeleton

Copy `templates/reconstruction/` to the new, **nonexistent** `reconstructions/<id>/` folder. Do not overwrite an existing project. Replace all template placeholders in public and private files.

```text
reconstructions/<id>/
  index.html                         shared viewer entry, or research landing initially
  README.md                          visitor description and local entry point
  public/                            publishable data only
    building.json  about.html  models/  profiles/  previews/  docs/
  work/                              ignored by the public repository
    README.md  AGENTS.md  STATUS.md  HISTORY.md  project.json
    references/  research/  build/  releases/  archive/
```

Verify the boundary before adding evidence (repository-root commands; replace `<id>`):

```powershell
git check-ignore -v reconstructions/<id>/work/x
git -C reconstructions/<id>/work init -b main
git status --short
```

Initialize a **local** work repository only when one does not exist. Commits, tags, remotes, pushes and deployment follow the owner's authorization; copying a template does not authorize creating a hosted repository or pushing. Record an uncommitted release honestly when commits were not requested. Work `.gitignore` excludes binaries; SHA-256 inventories preserve their identity. Adopt Git LFS only when needed and authorized.

Fill `work/README.md` and `project.json`: scope/state, namespace, units, phase, paths, known frames, source floor labels and translations. Leave unknown values unset. `latestRelease` stays null until validation. Replace example floors, walk starts, place and time zone; empty lists/maps are appropriate during research. Keep one living `work/build/`.

## 3. Organize and inspect evidence

Read `work/references/README.md` **before importing files**. Organize by architectural content; delivery provenance belongs in metadata:

```text
references/
  incoming/                       unverified queue
  photos/<space-or-source>/
  floor-plans/<collection>/
  sections/<collection>/
  elevations/<collection>/
  site/<collection>/         # non-photographic site evidence; all photos go under photos/
  documents/<collection>/         mixed publications and context
  derived/<collection>/<source>/  faithful crops/page renders/text extracts
  manifest.json  manifest.schema.json  INDEX.md
  catalog/                        generated browsing aid
```

Do not create delivery-based top-level folders such as `archive-email-YYYY-MM-DD/`, `user/` or `public/`. A mixed PDF stays intact under `documents/`; registered page derivatives can describe plans/photos separately. Preserve received filenames, stable IDs, SHA-256, dates and date basis, rights, depicted state, source identity and limitations. Public accessibility is not a redistribution licence.

Before intake, hash the file and query the manifest. Identical bytes share one record; preserve additional source identities and filename aliases. Similar plans/different revisions are not duplicates. For migrations, retain `legacyPaths`, record the mapping in `research/reference-library/`, update live consumers and validate; preserve historical acquisition facts.

```powershell
python tools/reference-catalog/references.py --workspace reconstructions/<id>/work --intake <file> --source <URL-or-attachment-identity>
python tools/reference-catalog/references.py --workspace reconstructions/<id>/work --validate
python tools/reference-catalog/build.py reconstructions/<id>/work
```

Intake is not promotion. Inspect title blocks, revisions, **all PDF pages and TIFF frames**. Use raster previews and native-resolution crops when sheets are too large to read. Filename year, CAD template date, PDF creation, design and close-out dates are different facts. Separate existing, proposed and executed conditions. Preserve qualifications such as “drawn visually”; architectural drawings are not automatically measured surveys.

Interpretation/calibration belongs in `research/`, model renders/overlays in `build/review/`, GIS/terrain in `research/geodata/`. Link derivatives to originals. Resolve sources through manifest ID/current path, not a hard-coded delivery folder.

For federal archives, see [BAR research](bundesarchiv-research.md). Discovery, authenticated access, ordering and downloading are separate steps. A human collaborator can authenticate and supply files plus dossier/delivery provenance; agents must not promise unattended access or request credentials.

## 4. Establish dates and control

Create a coverage matrix by facade, room and level. Record contradictions in `research/decisions.json`, choose a coherent state and explain cross-date corroboration. Define floor crosswalks separately for each component: source “piano 4” is not automatically a fourth above-ground storey.

Calibrate sheets from dimension strings/graphic scale bars; record page/pixel points, transforms, residuals and an independent check. Printed scale alone is insufficient. Establish relative floor/slab/roof heights and common plan alignment. Every measurement needs a source and confidence. Unknowns remain unknown or explicitly marked study placeholders.

Use the country's appropriate authorities. Swiss projects can use swisstopo/GWR and LV95/LN02 where confirmed. Abroad, investigate local/regional/national sources and global terrain fallbacks; see [Elevation sources](elevation-sources.md) and [Italian geodata discovery](italian-geodata.md). Record horizontal **and vertical** datums, resolution, date, coverage and licence. Test actual data at the site: a catalogue's bounding rectangle may enclose large gaps. DEM/DSM and terrain/building heights differ; a 30 m grid cannot establish villa steps or roof detail.

An explicitly local architectural study can proceed from calibrated plans and supported relative heights while geographic control remains unresolved. Document local origin/axes, omit unsupported map conversion and geographic sunlight, and keep the gallery pin separate. See [Frames and units](conventions.md#frames-and-units). For site context, follow [Terrain and surroundings in Blender](terrain-and-surroundings.md), including add-on choices, footprint registration and the separate vertical tie.

For terraced gardens, model lawn, paving, retaining walls, stairs and ramps as separate elements. Even a detailed DTM cannot replace their construction geometry. Identify a site's section cut before using its levels; distinguish horizontal distance labels from spot elevations. If an unscaled section is proportionally calibrated against another dated drawing, record the two sources, independent checks and uncertainty, and call the result inferred relative control. Do not extend one section's wall heights or ramp grades across the whole property. Replace only a documented local terrain patch, checking the original surface outside it and every stair-to-ground junction. Conflicting basin, stair or wall positions stay unresolved until independent evidence distinguishes them.

## 5. Build and validate a coherent first version

Put scripts in `work/build/scripts/`: `s` control, `b` build, `v` validation, `r` release. Write control data to `research/derived/`, scene to `build/model/` and checks to `build/review/`. Copy useful methods into this project rather than importing another building's private code/data.

Blender products follow the [model handoff](model-handoff.md): stable `viewer_id`, role, category/family/type, floor membership, cutaway policy and building-specific evidence/basis tags. Use metres, local coordinates and unit scales. Build actual openings and supported floor connections; reuse geometry for identical products. Missing evidence is a documented limit, not an invitation to add detail.

Compare against sources and run [shared checks](../tools/model-checks/README.md): hygiene, coplanar overlap, Dollhouse and furniture where applicable. Record omissions as not applicable or unresolved with reasons. Overlays, room areas, floor bands and source comparisons matter as well as code checks.

Splat projects follow the existing [splat pipeline](../reconstructions/von-wattenwyl-haus/docs/pipeline.md) as a method reference and document rights, pose/scale basis, training and quality. The Blender exporter does not convert splats. Preserve the public/private boundary and explain necessary structure differences.

## 6. Freeze, import and review locally

Follow the [release checklist](reconstruction-handbook.md#release-checklist). Prepare a candidate under `build/tmp/candidate-releases/vNNN/` and import that parent folder for local review first. Keep it private and uncommitted while checking the viewer; repair the living build and regenerate the candidate as needed. Freeze only after validation; exactly one `.blend` plus `viewer.json` goes into `releases/vNNN/model/`. Package reports, checks, hashes, BIM/IFC exports and geographic control where established. Verify that the source hash in every export matches the final native scene. Record explicitly when geographic placement remains unvalidated. Once frozen, corrections take the next release number.

Fill `public/building.json` against [its schema](building.schema.json), including supported levels, export profiles, time zone and walk starts. Import a Blender release through the shared pipeline:

```powershell
python tools/model-pipeline/import_versions.py reconstructions/<id>/work/releases --building <id> --only v001 --keep-latest
```

This creates the public catalog/assets and retires older public versions to `work/archive/models/`. Only the latest release is public. Never publish original plans, photographs of unclear rights, traces or native scenes. Match profiles to actual collection names and inspect exported building/context geometry, IDs and floor metadata.

Add/update `gallery/data/reconstructions.json` and a preview in `gallery/assets/`. Supply `de`, `fr`, `it` summaries/tags and localized names where appropriate. A research card links to a useful research landing, not a broken empty viewer. Use a model-only preview after validation. Record the map location source: swisstopo for Swiss address/EGID matches, an identified appropriate source abroad.

```powershell
python tools/serve.py --building <id>
node --test --test-isolation=none tests/*.test.mjs
```

Inspect Exterior, Dollhouse on every floor, Plan/Section and Walk, inspection and context visibility. Assess BIM/IFC and geographic lighting against actual control. Shared runtime/pipeline changes also need the Python tests in the [viewer guide](viewer-guide.md#verify-changes). Report real outcomes and untested hardware/access limits.

## 7. Leave a resumable handoff

Update `STATUS.md`, `project.json`, `HISTORY.md`, the build README and public description. State what was built, evidence/state, reproduction commands, validation, gaps and the next useful human contribution. Check both repositories' status and that private evidence is ignored. Deliver the native model, report and local viewer link where applicable. Commit/push/deploy only when authorized by the owner.

A fresh agent should resume from these files without reconstructing the conversation. Preserve unresolved questions and exact source identities.
