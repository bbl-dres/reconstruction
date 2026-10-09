# IDS files

[← BIM modelling guide](../README.md)

Machine-readable information requirements (buildingSMART [IDS 1.0](https://github.com/buildingSMART/IDS)) for the three federated models. They encode the [LOI table](../README.md#3-level-of-information-loi-the-minimum-always-complete) and the structural rules that an IFC export must meet. IDS checks information, not geometry: the audit and a visual review stay necessary ([checks](../mistakes-and-checks.md#release-checks)).

| File | Model | Specifications |
|---|---|---|
| [building.ids](building.ids) | Building | RB-01 storeys (name, elevation, in the building) · RB-02 building in the site · RB-03 elements named and contained in a storey · RB-04 `ReconstructionEvidence` (product id, category, classification basis, confidence, source) · RB-05 doors and windows fill an opening and state their size · RB-06 stair flights belong to a stair · RB-07–09 `IsExternal` on walls, doors, windows · RB-10 material on structural and envelope elements · RB-11 slab predefined type · RB-12 rooms as `IfcSpace` with number, name and net floor area · RB-13 evidence class of the geometry · RB-14 covering predefined type |
| [site.ids](site.ids) | Building site (parcel) | RS-01 shared site · RS-02 terrain present · RS-03 site elements named, contained in the site, with evidence · RS-04 no storeys |
| [surroundings.ids](surroundings.ids) | Surroundings | RU-01 context buildings named and in the site · RU-02 context elements state their source and evidence class · RU-03 no storeys |

Specifications whose name starts with `[target]` are agreed requirements that the repository's exporter does not yet write (see the [gap analysis](../research/repo-gap-analysis.md)). Report them as open; do not remove them to make a model pass.

## Run

```bash
pip install -r tools/model-pipeline/requirements-bim.txt       # ifcopenshell and ifctester 0.8.5
python -m ifctester docs/bim-modelling-guide/ids/building.ids building.ifc -r Console
python -m ifctester docs/bim-modelling-guide/ids/building.ids building.ifc -r Html -o build/review/ids-building.html
```

The [golden example](../examples/golden/) passes all three files (`tests/ifc_audit_test.py`).

## Notes on writing IDS

- IDS 1.0 `partOf` relations are limited to aggregation, group assignment, spatial containment, nesting and `IFCRELVOIDSELEMENT IFCRELFILLSELEMENT` (an element filling an opening in a host). "Has a type" cannot be required; `ifc_audit.py` checks typing.
- A predefined type inherited from the type object is checked with an *entity* facet (`<entity><predefinedType>`), not an *attribute* facet.
- Property data types matter: `ProductId` is `IFCIDENTIFIER`, `Source` is `IFCTEXT`, labels are `IFCLABEL`, as written by `tools/model-pipeline/export_ifc.py`.
- Values are in SI units, whatever the model's units.
