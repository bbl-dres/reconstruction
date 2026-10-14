# Reference library tool

`references.py` manages each reconstruction's evidence library in `reconstructions/<id>/work/references/`: intake into `incoming/`, validation of `manifest.json` (hashes, paths, duplicates, derivative parents, decision sources, unindexed files) and queries. The `research/` sub-folder of the library holds interpretation and is skipped by the validator; the generated HTML catalog was retired on 2026-10-12 (the manifest and `research/register.md` are the index).

- `python tools/reference-catalog/references.py --workspace reconstructions/<id>/work --validate` verifies the library.
- `python tools/reference-catalog/references.py --workspace reconstructions/<id>/work --intake <file> --source <URL-or-identity>` copies an unverified item into `incoming/`.
- `python tools/reference-catalog/references.py --workspace reconstructions/<id>/work --resolve <old-path-or-source-id>` finds current records.

Run from the repository root; standard library only. Source files and metadata belong in the workspace, never in this folder. Model screenshots belong in `work/reviews/`.
