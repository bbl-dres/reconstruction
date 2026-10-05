# Incoming evidence — not yet verified

Drop new files here when provenance, building location or usefulness is unclear. This is a quarantine/intake area, **not** part of the verified evidence catalog. Do not cite an incoming file as an established architectural fact.

Use `python tools/reference-catalog/references.py --workspace reconstructions/<id>/work --intake <file> --source <URL-or-attachment-path> --note <what-is-known>` from the repository root. Intake preserves the received filename (adds a hash suffix only on collision), records SHA-256, bytes, source, timestamp and `pending-review` status. Files added manually must be indexed before promotion.

Before promotion: inspect the content, reject model renders/screenshots, check exact duplicates, recover available provenance, identify kind/location or mark unknown, record rights and uncertainty, move the original into the appropriate evidence folder, add the main manifest record, and mark the incoming entry `promoted` with its asset ID. Unhelpful or reconstruction content belongs outside references or may be deleted when authorized. Never invent missing metadata just to clear this queue.

## Source roles, intake context and decisions

The catalog's Source role filter distinguishes photographic records, historic records, alteration drawings, seating snapshots, contextual documents and navigation aids. It does not imply a photograph is current or a revision drawing is as-built. Derivatives inherit the original source role.

Capture an incoming item's intended date and building state when known:
`python tools/reference-catalog/references.py --workspace reconstructions/<id>/work --intake <file> --source <URL-or-attachment-path> --intended-date 2008 --building-state historic`
These are supplied intake context, not verified metadata; inspect the source before promotion. Omit unknown dates. `--gaps` lists missing acquisition sources, dates and source roles; `--source-role historic-record` queries the verified manifest.

Record competing claims and decisions in research/decisions.json, referencing manifest IDs. Keep competing values, their datums and the evidence needed to resolve them. Do not mark a decision adopted without an explicit resolution. Library validation checks decision source links. Use research/decisions.schema.json for full schema validation.
