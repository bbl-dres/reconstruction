# v020 — statues and art

Added or replaced 44 rough sculpture/relief groups and three architectural support groups (47 logical records, 49 material meshes). Removed 28 generic placeholders. The existing Three Confederates, paintings, glazing and flags are retained.

The northern roof now has a standing Independence and seated Executive/Legislative, griffins, seated Liberty/Peace and two historians. The south parapet has six professions. Four drum relief groups suggest the vigilance themes. The hall gains bears, four armed staircase figures, Winkelried, Niklaus von Flue and the Arrival relief. National Council additions cover Tell, Stauffacher, eight gallery terms and the Sage group. The west courtyard gains Berna, four season allegories and their fountain.

All figures use simple drapery, posed limbs and identifying attributes at the requested Three Confederates level. They have stable ART IDs across material components, subject/attribution/source metadata and explicit approximation notes. Existing source assets and reference images remain unchanged.

Validation: 9696 unrelated meshes retain their source geometry and transforms; 24 base support probes pass; all 2,532 inherited route probes pass with the new visual objects included. The source adds 217,280 triangles gross before placeholder removal. National Council seating is unchanged from the verified v019 inventory (200 numbered member positions, 289 complete NR chairs). Whole-building walking remains false; upper stair links remain incomplete.

The PDF compares real photographs with rendered model views. The workspace viewer uses the current reconstruction repo importer, Three.js loader and visibility policies. Frozen release diagnostics include geometry, material/texture audits and browser rendering checks. External repository files are not modified in this phase.

Known limits: silhouettes, relief composition, fine faces, heraldry and some tools remain approximate. Minor façade devices and remote wing carvings are documented for a finer pass. Berna's season ordering is not asserted. Tilo (2023) is intentionally outside the archived-tour period. See [sources and complete register](research/ART_SOURCES.md) and [machine-readable register](research/art_register.json).

Source SHA-256: `75f93353af3a4a086ab9a5cdf5400e25ecb641aae960ea7db9081d9bfe67f6a4`.

Next authorized phase: read reconstruction/docs/model-handoff.md, document and implement BIM-like instances and IFC support. This is separate from the completed art geometry pass.
