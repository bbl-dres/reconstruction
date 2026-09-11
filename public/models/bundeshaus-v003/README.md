# Bundeshaus v003 test export

This version is a building-only preview exported from the supplied packed v003 source file. The current hashed `building-meshopt-*.glb` and `surroundings-meshopt-*.glb` filenames are listed in `../catalog.json`. The root viewer resolves that catalog; original uncompressed exports have been removed.

The surroundings asset is optional context from the same source and coordinate frame: terrain/public realm, 322 neighboring building objects and seven wing-facade objects. It contains the embedded aerial terrain image and is approximately 65 MB before compression. The viewer loads it only when Surroundings is enabled. Its statistics and source hash are in the matching `surroundings-meshopt-*.report.json`. Main-building and hidden reference geometry are excluded from this asset.

See the matching `building-meshopt-*.report.json` for the reproducible source hash, exact statistics and export limitations. The source master remains in its original project. Terrain, surrounding city blocks, wing facades, hidden reference shells, cameras and lights are omitted.

Compression preserves all 662 mesh placements, unique IDs and three embedded images. The automated viewer checks use this catalog asset for geometry, walking and cutaway regressions. All compressed and uncompressed buffer views are compared byte-for-byte during optimization.

The file includes three photographic image textures. Procedural stone, wood and marble details use constant-color preview fallbacks pending texture baking. The GLB is not expected to match the offline reference renders.

Each mesh has `viewer_id`, `viewer_source_name`, `viewer_role`, `viewer_source_collections` and `viewer_dollhouse_hidden` in its glTF extras. The visibility flag reproduces the existing v003 cutaway recipe, including hiding room 301 to expose lower rooms; it is not an authored floor-selection system. The generic `exterior`/`interior` roles are legacy hints, not the finer semantic contract requested for future models.

This is an incomplete research reconstruction. The source's building geometry, photographic references and third-party data retain their original attribution and licensing; the repository's software license does not relicense those assets. Original coverage/provenance documentation is in the supplied v003 project's `research/ACCURACY_AND_COVERAGE.md` and `research/SOURCE_REGISTER.md`.
