# Authoring workspace (work/)

Gitignored in the public repository and never published. Tracked in the private work repository (see [docs/adding-a-building.md](../../../docs/adding-a-building.md)). It holds everything that is not meant for the website: evidence, research, native models and frozen releases.

| Path | Content |
|---|---|
| `AGENTS.md`, `STATUS.md`, `PROJECT.md`, `project.json` | Entry point for people and agents, current state, project identity and coordinate control |
| `references/` | Original evidence with `manifest.json`; `incoming/` for unverified intake |
| `research/` | Source register, `decisions.json`, coverage matrix, open questions |
| `scripts/` | Building-specific Blender scripts |
| `stages/stageNN/` | Mutable revisions: model/, viewer/, ifc/, research/, review/, REPORT.md |
| `versions/vNNN/` | Frozen releases: native source, exports, report, checksums |
| `catalog/` | Generated reference catalog (private) |
| `archive/models/` | Retired published model versions |

Steps for a new building:

1. Set a new project ID and UUID namespace in project.json. Define units, axes, north, survey datum, floor labels and intended historical date in PROJECT.md. Unknown values stay explicit.
2. Add sources to references/incoming/. Inspect, deduplicate by SHA-256 and promote useful real-building evidence into the manifest. Record original filenames, source, rights, dates and uncertainty; connect crops to original sheets.
3. From the repository root, run `python tools/reference-catalog/references.py --workspace reconstructions/<id>/work --validate`, then `python tools/reference-catalog/build.py reconstructions/<id>/work` (requires Pillow). Open catalog/index.html directly; it works offline. Rebuild after manifest changes.
4. Keep interpretation and decisions in research/, experiments and native models in stages/, review images outside references/, and immutable reviewed exports in versions/.
5. Record geometric control points and floor elevations before detailing. Keep a source-backed decision log, evidence coverage matrix, and unresolved-questions list. Distinguish measured, inferred and unknown geometry.
6. Validate source/export hashes, stable component IDs, physical-product ownership, IFC geometry and level containment, and actual viewer cutaways before a release. Publish through `tools/model-pipeline` into `../public/`. Update STATUS.md and project.json.

Do not carry over another building's product IDs, coordinates, geometry, assumed dimensions or source rights.
