# Bundeshaus model status

Release status, review findings and floor schedules of the published Bundeshaus model. The shared contract is the [model handoff](../../../../docs/model-handoff.md).

## Current model status

**v027 is the current release.** It contains 10,768 components, 1,795 reviewed products / 669 types and 2,858 unresolved reference components. The full IFCZIP covers all 4,653 represented objects with no missing receiver geometry. See [downloads and coverage](../README.md). Its floor schedules and saved views use the version-specific catalog definitions; archived versions keep their original level schedules.

### Published version

The public catalog holds only the latest version; earlier milestones are kept locally in the gitignored `work/archive/models/`. See the [published version](../README.md#published-version) and [catalog compression data](../models/compression.json). Keep release-specific evidence with the published assets; check shared dependencies before moving a version to the archive.

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
