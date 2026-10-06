# Building evidence library

Browse the **[HTML catalog](catalog/index.html)**. Start with **[manifest.json](manifest.json)** for machine-readable discovery, [INDEX.md](INDEX.md) for browsing and [manifest.schema.json](manifest.schema.json) for validation. This is the authoritative current reference index; old folder manifests have been consolidated.

## What belongs here

Only evidence of the **real building**: photographs (including screenshots of photographic panoramas), original drawings, floor plans, sections, elevations, site plans and contextual publications. Faithful page renders, crops and extracted drawing text are allowed in `derived/` with a parent-source link. They are never substitutes for the original sheet.

Do not store reconstruction renders, viewer screenshots, model comparisons, invented geometry or generated textures here. Put model review artifacts in `../build/review/`. Secondary illustrations are in `../research/secondary-illustrations/`; web-page captures in `../research/source-pages/`; GIS/terrain files in `../research/geodata/`; photogrammetric map views in `../research/geospatial-imagery/`.

## Structure

```text
references/
  manifest.json             # one record per distinct file, stable content ID
  manifest.schema.json      # JSON Schema 2020-12
  INDEX.md                  # generated human-readable index
  incoming/                 # unverified intake; separate manifest, excluded from evidence
  photos/<space-or-source>/ # real photographs; tour faces grouped by panorama ID
  floor-plans/<collection>/ # original floor and seating plans
  sections/<collection>/    # original sections
  elevations/<collection>/  # original facade drawings
  site/<photos-or-plans>/   # real site images and plans
  documents/<collection>/  # publications and historic context
  derived/<collection>/<source>/ # faithful drawing extracts/contact sheets
```

Do not create parallel `user/` and `public/` libraries: who supplied a file belongs in provenance, not in its architectural location. Keep the received filename whenever possible. The manifest distinguishes the **original filename** recovered from a URL/attachment from the **ingested filename** assigned during earlier work. Unknown originals remain an empty list; they are not fabricated.

## Agent workflow

1. Query the manifest by `kind`, `location.spaces`, `location.levels`, `collectionId` or tags. Read `review.limitations`, date basis, rights and provenance before treating a source as evidence.
2. Use `id` in findings and decisions. Use `path` to open the current file. Resolve historical paths through `legacyPaths`; record every future migration in `../research/reference-library/`.
3. Inspect an original plan's title block, orientation, scale and revision before measuring. Photo directions, panorama cube-face names and model coordinates are different concepts.
4. Keep interpretation in `../research/`, model changes in `../build/`, and immutable releases in `../releases/`. Never overwrite the evidence with annotated/model overlays.
5. Before intake, compute SHA-256. If identical bytes exist, append the new source URL/attachment and alias to that record. Otherwise add a new file/record and validate. Similar-looking different revisions are **not** duplicates.

```powershell
python tools/reference-catalog/references.py --workspace reconstructions/<id>/work --space north-entrance
python tools/reference-catalog/references.py --workspace reconstructions/<id>/work --kind floor-plan --level og1
python tools/reference-catalog/references.py --workspace reconstructions/<id>/work --query '144146'
python tools/reference-catalog/references.py --workspace reconstructions/<id>/work --resolve 'user/reference_04.png'
python tools/reference-catalog/references.py --workspace reconstructions/<id>/work --validate
```

Run from the building project root. The helper uses Python's standard library; install/use `jsonschema` separately if full schema validation is required. Integrity validation checks IDs, paths, hashes, byte sizes, parent links and forbidden binary model formats. A human/visual review remains necessary to reject images of a reconstruction.

## Metadata conventions

- `location.levels`: project-native labels, not viewer menu keys. Define these labels in the identity table of ../README.md, including their source datum and translations.
- `location.spaces`: stable lowercase identifiers, with source room titles preserved in descriptions. Broad/legacy labels have low confidence; unknown locations stay empty.
- `dates.created` may be a year or date; `createdBasis` distinguishes a printed sheet/revision from a filename or tour generation date.
- `orientation.north`, `orientation.view`, `scale` remain null when unverified.
- `rights.publicationAllowed: null` means **not established**, never permission. Legacy credits and claims are preserved verbatim; verify before publishing.
- `provenance.legacyRecords` retains imported metadata losslessly. Old metadata paths identify the historical record; find its moved copy in `../research/reference-library/legacy/`.
- `derivation.sourceAssetIds` links crops/page renders/contact sheets to original files. Unknown processing parameters remain null.


## Source roles, intake context and decisions

The catalog's Source role filter distinguishes photographic records, historic records, alteration drawings, seating snapshots, contextual documents and navigation aids. It does not imply a photograph is current or a revision drawing is as-built. Derivatives inherit the original source role.

Capture an incoming item's intended date and building state when known:
`python tools/reference-catalog/references.py --workspace reconstructions/<id>/work --intake <file> --source <URL-or-attachment-path> --intended-date 2008 --building-state historic`
These are supplied intake context, not verified metadata; inspect the source before promotion. Omit unknown dates. `--gaps` lists missing acquisition sources, dates and source roles; `--source-role historic-record` queries the verified manifest.

Record competing claims and decisions in research/decisions.json, referencing manifest IDs. Keep competing values, their datums and the evidence needed to resolve them. Do not mark a decision adopted without an explicit resolution. Library validation checks decision source links. Use research/decisions.schema.json for full schema validation.
