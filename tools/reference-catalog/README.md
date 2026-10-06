# Reference catalog tools

Shared tools for each reconstruction's evidence library in `reconstructions/<id>/work/references/`. `build.py` generates an offline HTML catalog in `work/references/catalog/` (generated, skipped by the validator) from `references/manifest.json` and the separate incoming queue: search filenames, source IDs, descriptions and provenance; filter by kind, space or level. No remote libraries or network requests are needed. The generated catalog shows private evidence and therefore stays in `work/`.

- `python tools/reference-catalog/build.py reconstructions/<id>/work` rebuilds HTML, references/INDEX.md and photo thumbnails from accepted evidence.
- `python tools/reference-catalog/references.py --workspace reconstructions/<id>/work --validate` verifies evidence integrity.
- `python tools/reference-catalog/references.py --workspace reconstructions/<id>/work --intake <file> --source <URL-or-path>` copies an unverified item into incoming.
- `python tools/reference-catalog/references.py --workspace reconstructions/<id>/work --resolve <old-path-or-source-id>` finds current records.

Run from the repository root. Thumbnail generation uses Pillow; the query/intake/validation helper uses the standard library. Source files and editable metadata belong in the workspace's references/, never in this tool directory. Model screenshots belong in `work/build/review/`. Thumbnails are derived only from accepted evidence; incoming images are not promoted automatically.

## Source roles, intake context and decisions

The catalog's Source role filter distinguishes photographic records, historic records, alteration drawings, seating snapshots, contextual documents and navigation aids. It does not imply a photograph is current or a revision drawing is as-built. Derivatives inherit the original source role.

Capture an incoming item's intended date and building state when known:
`python tools/reference-catalog/references.py --workspace reconstructions/<id>/work --intake <file> --source <URL-or-attachment-path> --intended-date 2008 --building-state historic`
These are supplied intake context, not verified metadata; inspect the source before promotion. Omit unknown dates. `--gaps` lists missing acquisition sources, dates and source roles; `--source-role historic-record` queries the verified manifest.

Record competing claims and decisions in research/decisions.json, referencing manifest IDs. Keep competing values, their datums and the evidence needed to resolve them. Do not mark a decision adopted without an explicit resolution. Library validation checks decision source links. Use research/decisions.schema.json for full schema validation.
