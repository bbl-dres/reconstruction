"""BIM structure audit of an IFC or IFCZIP file against the BIM modelling guide (docs/bim-modelling-guide/).

    python tools/model-checks/ifc_audit.py <model.ifc|model.ifczip> --out <report.json> [--model-type building|site|surroundings]
                                           [--geometry] [--max-proxy-share 0.1]

Runs in the BIM Python environment (tools/model-pipeline/requirements-bim.txt), not in Blender. Reports what a
coordination model needs and agents most often get wrong: storeys and spatial containment, IfcBuildingElementProxy
share, type assignment and type reuse, representation kinds, wall/opening/filling relationships, stairs decomposed
into flights, materials, property sets, names and GlobalIds. With --geometry it also reports elements whose height
range crosses a storey band (walls running through two floors) and building elements below the lowest or above the
highest storey. --model-type selects the rules of the three federated models: a building has storeys and
contains its elements in them; a site model (the parcel) and a surroundings model contain their elements in the
IfcSite (or a context IfcBuilding) and need no storeys; surroundings may consist of massing proxies. Findings are numbers and lists to read, not a pass/fail verdict; the exit code is 1 only when a rule
marked "error" in the report fails.
"""
import argparse
import json
import os
import sys
import zipfile
import tempfile
from collections import Counter, defaultdict

import ifcopenshell
import ifcopenshell.util.element as ue
import ifcopenshell.util.unit as uu

# Physical building elements: what a reviewer expects to select, type and count. Openings, spatial zones,
# annotations and distribution ports are not products in this sense.
PHYSICAL = ("IfcBuildingElement", "IfcFurnishingElement", "IfcDistributionElement", "IfcElementAssembly",
            "IfcBuiltElement", "IfcCivilElement", "IfcGeographicElement", "IfcTransportElement")
EXPECTED = ("IfcWall", "IfcSlab", "IfcRoof", "IfcColumn", "IfcBeam", "IfcStair", "IfcRailing", "IfcDoor", "IfcWindow",
            "IfcCovering", "IfcFurniture", "IfcFurnishingElement", "IfcSpace")


def open_model(path):
    if path.lower().endswith(".ifczip"):
        with zipfile.ZipFile(path) as z:
            name = next(n for n in z.namelist() if n.lower().endswith(".ifc"))
            tmp = tempfile.mkdtemp()
            return ifcopenshell.open(z.extract(name, tmp))
    return ifcopenshell.open(path)


def physical(f):
    seen = {}
    for cls in PHYSICAL:
        try:
            for e in f.by_type(cls):
                seen[e.id()] = e
        except RuntimeError:  # class absent from this schema
            pass
    return list(seen.values())


def body_kind(e):
    rep = e.Representation
    if not rep:
        return "none"
    kinds = [r.RepresentationType for r in rep.Representations if r.RepresentationIdentifier in ("Body", None, "Facetation")]
    return kinds[0] or "unspecified" if kinds else "no-body"


def share(n, d):
    return round(n / d, 4) if d else None


def audit(path, geometry=False, max_proxy=0.10, model_type="building"):
    f = open_model(path)
    schema = f.schema
    els = physical(f)
    n = len(els)
    by_class = Counter(e.is_a() for e in els)
    storeys = sorted(f.by_type("IfcBuildingStorey"), key=lambda s: s.Elevation if s.Elevation is not None else 0)
    unit = uu.calculate_unit_scale(f)

    uncontained, untyped, unnamed, nomaterial, nopset = [], [], [], [], []
    types = Counter()
    kinds = Counter()
    per_storey = Counter()
    for e in els:
        container = ue.get_container(e)
        parent = ue.get_aggregate(e) or (e.Decomposes[0].RelatingObject if getattr(e, "Decomposes", None) else None)
        nested = getattr(e, "Nests", None)
        if container is None and parent is None and not nested:
            uncontained.append(e)
        if container is not None:
            per_storey[container.Name or container.GlobalId] += 1
        t = ue.get_type(e)
        if t is None and parent is None:
            untyped.append(e)
        elif t is not None:
            types[t.id()] += 1
        if not (e.Name or "").strip():
            unnamed.append(e)
        if ue.get_material(e, should_skip_usage=True) is None and (t is None or ue.get_material(t) is None):
            nomaterial.append(e)
        psets = ue.get_psets(e)
        if not any(k.startswith("Pset_") for k in psets):
            nopset.append(e)
        kinds[body_kind(e)] += 1

    type_entities = [t for t in f.by_type("IfcTypeObject") if t.is_a("IfcElementType") or t.is_a("IfcTypeProduct")]
    used = [t for t in type_entities if types.get(t.id())]
    with_maps = [t for t in used if getattr(t, "RepresentationMaps", None)]

    walls = [e for e in els if e.is_a("IfcWall")]
    voided = {r.RelatingBuildingElement.id() for r in f.by_type("IfcRelVoidsElement")}
    filled = {r.RelatedBuildingElement.id() for r in f.by_type("IfcRelFillsElement")}
    fillings = [e for e in els if e.is_a("IfcDoor") or e.is_a("IfcWindow")]
    stairs = [e for e in els if e.is_a("IfcStair")]
    flights = [e for e in els if e.is_a("IfcStairFlight")]
    stairs_with_parts = [s for s in stairs if any(p.is_a("IfcStairFlight") for p in ue.get_decomposition(s))]
    wall_ext = [w for w in walls if ue.get_psets(w).get("Pset_WallCommon", {}).get("IsExternal") is not None]
    proxies = by_class.get("IfcBuildingElementProxy", 0)
    gids = Counter(x.GlobalId for x in f.by_type("IfcRoot"))

    report = {
        "schemaVersion": 1, "file": os.path.basename(path), "modelType": model_type, "ifcSchema": schema,
        "lengthUnitToMetre": unit,
        "mapConversion": bool(f.by_type("IfcMapConversion")) if schema != "IFC2X3" else None,
        "spatial": {
            "sites": len(f.by_type("IfcSite")), "buildings": len(f.by_type("IfcBuilding")),
            "storeys": [{"name": s.Name, "elevation": s.Elevation} for s in storeys],
            "spaces": len(f.by_type("IfcSpace")),
            "elementsPerContainer": dict(per_storey.most_common()),
        },
        "elements": n, "byClass": dict(by_class.most_common()),
        "missingExpectedClasses": [c for c in EXPECTED if not (f.by_type(c) if c == "IfcSpace" else [e for e in els if e.is_a(c)])] if model_type == "building" else [],
        "proxyShare": share(proxies, n),
        "uncontainedShare": share(len(uncontained), n),
        "untypedShare": share(len(untyped), n),
        "types": {"defined": len(type_entities), "used": len(used), "withRepresentationMaps": len(with_maps),
                  "meanOccurrencesPerUsedType": round(sum(types.values()) / len(used), 2) if used else None,
                  "singleUseTypes": sum(1 for v in types.values() if v == 1)},
        "bodyRepresentation": dict(kinds.most_common()),
        "unnamedShare": share(len(unnamed), n),
        "withoutMaterialShare": share(len(nomaterial), n),
        "withoutStandardPsetShare": share(len(nopset), n),
        "openings": {"walls": len(walls), "wallsWithOpenings": sum(1 for w in walls if w.id() in voided),
                     "openingElements": len(f.by_type("IfcOpeningElement")),
                     "doorsAndWindows": len(fillings), "doorsAndWindowsFillingAnOpening": sum(1 for e in fillings if e.id() in filled)},
        "stairs": {"stairs": len(stairs), "stairsDecomposedIntoFlights": len(stairs_with_parts), "flights": len(flights)},
        "wallsWithIsExternal": len(wall_ext),
        "duplicateGlobalIds": [k for k, v in gids.items() if v > 1][:20],
        "samples": {
            "uncontained": [f"{e.is_a()} {e.Name}" for e in uncontained[:10]],
            "untyped": [f"{e.is_a()} {e.Name}" for e in untyped[:10]],
        },
    }
    building = model_type == "building"
    if geometry and building:
        report["geometry"] = storey_bands(f, els, storeys, unit)

    misplaced = [e for e in els if (c := ue.get_container(e)) is not None and building and not c.is_a("IfcBuildingStorey") and not c.is_a("IfcSpace")]
    report["samples"]["containedOutsideStoreys"] = [f"{e.is_a()} {e.Name}" for e in misplaced[:10]]
    rules = [
        ("one site, one building, at least one storey" if building else "one site", "error",
         report["spatial"]["sites"] >= 1 and (not building or (report["spatial"]["buildings"] >= 1 and len(storeys) >= 1))),
        ("every element contained in the spatial structure or part of an assembly", "error", not uncontained),
        ("building elements are contained in storeys (or spaces), not in the site or building", "warning", not misplaced),
        ("no duplicate GlobalIds", "error", not report["duplicateGlobalIds"]),
        (f"IfcBuildingElementProxy share <= {max_proxy}", "warning", model_type == "surroundings" or (report["proxyShare"] or 0) <= max_proxy),
        ("every element typed (or part of a typed assembly)", "warning", not untyped),
        ("every door and window fills an opening in a wall", "warning", not building or report["openings"]["doorsAndWindowsFillingAnOpening"] == len(fillings)),
        ("stairs decomposed into flights (and landings)", "warning", len(stairs_with_parts) == len(stairs)),
        ("rooms modelled as IfcSpace", "warning", not building or report["spatial"]["spaces"] > 0),
        ("every element has a name", "warning", not unnamed),
        ("every element has a material", "warning", not nomaterial),
        ("every wall states IsExternal", "warning", len(wall_ext) == len(walls)),
    ]
    if geometry and building:
        rules.append(("no element crosses a storey band (except stairs, shafts, atria marked multi-storey)", "warning", not report["geometry"]["crossingStoreys"]))
    report["rules"] = [{"rule": r, "severity": s, "pass": bool(p)} for r, s, p in rules]
    report["errors"] = sum(1 for r, s, p in rules if s == "error" and not p)
    report["warnings"] = sum(1 for r, s, p in rules if s == "warning" and not p)
    return report


def storey_bands(f, els, storeys, unit, tol=0.05):
    """Height range of every element against the storey bands [elevation_i, elevation_i+1).

    Parts of an assembly (curtain-wall mullions, stair flights) follow their parent and are not reported."""
    import ifcopenshell.geom
    s = ifcopenshell.geom.settings()
    s.set("use-world-coords", True)
    elev = [float(x.Elevation or 0) * unit for x in storeys]
    zr = {}
    it = ifcopenshell.geom.iterator(s, f, include=els)
    if it.initialize():
        while True:
            sh = it.get()
            v = sh.geometry.verts
            if v:
                zs = v[2::3]
                zr[sh.id] = (min(zs), max(zs))
            if not it.next():
                break
    crossing, below = [], []
    multi = ("IfcStair", "IfcStairFlight", "IfcRamp", "IfcRampFlight", "IfcRailing", "IfcTransportElement", "IfcCurtainWall", "IfcRoof", "IfcColumn")
    for e in els:
        if e.id() not in zr:
            continue
        lo, hi = zr[e.id()]
        if elev and lo < elev[0] - 3.0 and not e.is_a("IfcFooting") and not e.is_a("IfcPile"):
            below.append(f"{e.is_a()} {e.Name} z={lo:.2f}")
        bands = [i for i in range(len(elev)) if hi > elev[i] + tol and (i + 1 == len(elev) or lo < elev[i + 1] - tol)]
        inside = [i for i in range(1, len(elev)) if lo < elev[i] - tol and hi > elev[i] + tol]
        if inside and not any(e.is_a(c) for c in multi) and ue.get_aggregate(e) is None:
            crossing.append(f"{e.is_a()} {e.Name} z={lo:.2f}..{hi:.2f}")
    return {"elementsWithGeometry": len(zr), "crossingStoreys": crossing[:200], "crossingStoreysCount": len(crossing),
            "farBelowLowestStorey": below[:50]}


def main():
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("model")
    p.add_argument("--out", required=True)
    p.add_argument("--geometry", action="store_true", help="also compute height ranges (slower)")
    p.add_argument("--max-proxy-share", type=float, default=0.10)
    p.add_argument("--model-type", choices=("building", "site", "surroundings"), default="building")
    a = p.parse_args()
    report = audit(a.model, a.geometry, a.max_proxy_share, a.model_type)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    json.dump(report, open(a.out, "w"), indent=1, ensure_ascii=False)
    keys = ("modelType", "ifcSchema", "elements", "proxyShare", "uncontainedShare", "untypedShare", "errors", "warnings")
    print("IFC_AUDIT", json.dumps({k: report[k] for k in keys}))
    for r in report["rules"]:
        if not r["pass"]:
            print(f"  {r['severity']}: {r['rule']}")
    sys.exit(1 if report["errors"] else 0)


if __name__ == "__main__":
    main()
