"""Build the golden example of the BIM modelling guide: three federated IFC4 models of a small invented pavilion.

    python docs/bim-modelling-guide/examples/golden/build_golden_example.py [OUT_DIR]

Runs in the BIM Python environment (tools/model-pipeline/requirements-bim.txt; tested with IfcOpenShell 0.8.5 and
0.9.0). Writes golden-building.ifc, golden-site.ifc and golden-surroundings.ifc next to this script unless OUT_DIR
is given. Every GlobalId derives from a stable id, so a rebuild keeps all GlobalIds (what a CDE compares between
revisions); entity numbers (#n) in the file may differ between runs and IfcOpenShell versions.

The pavilion is invented. It shows the rules of docs/bim-modelling-guide/README.md, not a real building:

- one local origin and one (example) LV95 map conversion, identical in all three files;
- building: two storeys; straight wall segments per storey from top of slab to underside of the slab above;
  slabs over the full footprint; every door and window in an opening of its host wall; typed doors, windows,
  walls, slabs, columns, beam, stair and furniture with shared representation maps; a stair as one IfcStair
  aggregating two flights, a landing and a railing; rooms as IfcSpace with number, name and net floor area;
  one material per type; Pset_*Common.IsExternal; ReconstructionEvidence on every product;
- site (parcel only): terrain with the building footprint left open, paving, a garden wall, a gate, typed trees;
  everything contained in the IfcSite shared with the building model;
- surroundings: terrain outside the parcel and one neighbouring building as a typed massing proxy.
"""
import math
import sys
import uuid
from pathlib import Path

import numpy as np
import ifcopenshell
import ifcopenshell.api.aggregate
import ifcopenshell.api.context
import ifcopenshell.api.feature
import ifcopenshell.api.geometry
import ifcopenshell.api.georeference
import ifcopenshell.api.material
import ifcopenshell.api.project
import ifcopenshell.api.pset
import ifcopenshell.api.root
import ifcopenshell.api.spatial
import ifcopenshell.api.type
import ifcopenshell.api.unit
import ifcopenshell.guid
from ifcopenshell.util.shape_builder import ShapeBuilder

NAMESPACE = uuid.UUID("6f0b1c52-1f4e-4c55-9a51-8d1f6e0c2a10")  # fixed project namespace of the example
PROJECT = "golden-pavilion"
SITE_ID = "golden-pavilion-site"  # the one IfcSite shared by building and site models
EXAMPLE_CRS = dict(Eastings=2600000.0, Northings=1200000.0, OrthogonalHeight=540.0)  # example values only, not a real site


def gid(ident):
    return ifcopenshell.guid.compress(uuid.uuid5(NAMESPACE, ident).hex)


class Model:
    """Small helper around one IFC file: project setup, typed products, evidence."""

    def __init__(self, name, project_id):
        self.f = ifcopenshell.api.project.create_file(version="IFC4")
        f = self.f
        self.project_id = project_id
        self.keyed = set()  # entities whose GlobalId derives from a semantic id
        self.project = self.entity("IfcProject", project_id, name)
        units = [ifcopenshell.api.unit.add_si_unit(f, unit_type=t) for t in ("LENGTHUNIT", "AREAUNIT", "VOLUMEUNIT")]
        units.append(ifcopenshell.api.unit.add_si_unit(f, unit_type="PLANEANGLEUNIT"))
        ifcopenshell.api.unit.assign_unit(f, units=units)
        model = ifcopenshell.api.context.add_context(f, context_type="Model")
        self.body = ifcopenshell.api.context.add_context(f, context_type="Model", context_identifier="Body", target_view="MODEL_VIEW", parent=model)
        ifcopenshell.api.georeference.add_georeferencing(f)
        ifcopenshell.api.georeference.edit_georeferencing(
            f, projected_crs={"Name": "EPSG:2056", "Description": "CH1903+ / LV95 (example values, not a real site)"},
            coordinate_operation=dict(EXAMPLE_CRS, XAxisAbscissa=1.0, XAxisOrdinate=0.0, Scale=1.0))
        self.builder = ShapeBuilder(f)
        self.materials = {}
        self.types = {}

    def entity(self, cls, ident, name, **attrs):
        e = ifcopenshell.api.root.create_entity(self.f, ifc_class=cls, name=name, predefined_type=attrs.pop("predefined_type", None))
        e.GlobalId = gid(ident)
        self.keyed.add(e.id())
        for k, v in attrs.items():
            setattr(e, k, v)
        return e

    def place(self, product, x=0.0, y=0.0, z=0.0, rot_deg=0.0):
        m = np.eye(4)
        c, s = math.cos(math.radians(rot_deg)), math.sin(math.radians(rot_deg))
        m[:3, :3] = [[c, -s, 0], [s, c, 0], [0, 0, 1]]
        m[:3, 3] = [x, y, z]
        ifcopenshell.api.geometry.edit_object_placement(self.f, product=product, matrix=m)

    def material(self, name, category):
        if name not in self.materials:
            self.materials[name] = ifcopenshell.api.material.add_material(self.f, name=name, category=category)
        return self.materials[name]

    def type(self, cls, ident, name, representation, material, predefined_type="NOTDEFINED", **attrs):
        """One type = one fixed geometry and material configuration, shared by all its occurrences."""
        t = self.entity(cls, "type:" + ident, name, predefined_type=predefined_type, **attrs)
        ifcopenshell.api.geometry.assign_representation(self.f, product=t, representation=representation)
        ifcopenshell.api.material.assign_material(self.f, products=[t], material=self.material(*material))
        self.types[ident] = t
        return t

    def occurrence(self, cls, ident, name, type_id, container, at=(0, 0, 0, 0), predefined_type=None, evidence=None, **attrs):
        e = self.entity(cls, ident, name, predefined_type=predefined_type, **attrs)
        self.place(e, *at)
        ifcopenshell.api.type.assign_type(self.f, related_objects=[e], relating_type=self.types[type_id])
        if container is not None:
            ifcopenshell.api.spatial.assign_container(self.f, products=[e], relating_structure=container)
        self.evidence(e, ident, evidence or {})
        return e

    def part(self, cls, ident, name, representation, material, parent, at=(0, 0, 0, 0), predefined_type=None, evidence=None):
        """An untyped part of an assembly (stair flight, landing, railing): contained through its parent."""
        e = self.entity(cls, ident, name, predefined_type=predefined_type)
        self.place(e, *at)
        ifcopenshell.api.geometry.assign_representation(self.f, product=e, representation=representation)
        ifcopenshell.api.material.assign_material(self.f, products=[e], material=self.material(*material))
        ifcopenshell.api.aggregate.assign_object(self.f, products=[e], relating_object=parent)
        self.evidence(e, ident, evidence or {})
        return e

    def evidence(self, product, ident, ev):
        pset = ifcopenshell.api.pset.add_pset(self.f, product=product, name="ReconstructionEvidence")
        f = self.f  # value types as written by tools/model-pipeline/export_ifc.py
        ifcopenshell.api.pset.edit_pset(f, pset=pset, properties={
            "ProductId": f.createIfcIdentifier(ident), "Category": f.createIfcLabel(ev.get("category", product.is_a()[3:].lower())),
            "ClassificationBasis": f.createIfcLabel("authored"), "EvidenceBasis": f.createIfcLabel(ev.get("basis", "inferred")),
            "Confidence": f.createIfcLabel(ev.get("confidence", "medium")), "Source": f.createIfcText(ev.get("source", "Golden example; invented geometry"))})

    def common(self, product, pset, **props):
        p = ifcopenshell.api.pset.add_pset(self.f, product=product, name=pset)
        ifcopenshell.api.pset.edit_pset(self.f, pset=p, properties=props)

    # geometry helpers -------------------------------------------------------------------------------------------
    def box(self, dx, dy, dz, x=0.0, y=0.0, z=0.0):
        """Extruded rectangle dx × dy centred on (x, y), from z up by dz."""
        x0, y0, x1, y1 = float(x - dx / 2), float(y - dy / 2), float(x + dx / 2), float(y + dy / 2)
        return self.prism([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], float(dz), z=float(z))

    def prism(self, points, depth, z=0.0, holes=()):
        b = self.builder
        return b.extrude(b.profile(b.polyline(points, closed=True), inner_curves=[b.polyline(h, closed=True) for h in holes]), depth, position=(0.0, 0.0, z))

    def rep(self, *items):
        return self.builder.get_representation(self.body, list(items))

    def mesh(self, verts, faces):
        return ifcopenshell.api.geometry.add_mesh_representation(self.f, context=self.body, vertices=[verts], faces=[faces])

    def write(self, path, description):
        # IfcOpenShell gives relationships, property sets and quantity sets random GlobalIds. Re-key them from the
        # (deterministic) construction order so that a rebuild keeps every GlobalId and a CDE sees no false changes.
        for e in self.f.by_type("IfcRoot"):
            if e.id() not in self.keyed:
                e.GlobalId = gid(f"{self.project_id}#{e.is_a()}#{e.id()}")
        # Unordered sets (relationship members, units) are built from Python sets; sort them for a stable file.
        for e in list(self.f.by_type("IfcRelationship")) + list(self.f.by_type("IfcUnitAssignment")):
            for attr in ("RelatedObjects", "RelatedElements", "Units"):
                if hasattr(e, attr) and getattr(e, attr):
                    setattr(e, attr, sorted(getattr(e, attr), key=lambda x: x.id()))
        self.f.header.file_description.description = (f"ViewDefinition [ReferenceView_V1.2]; {description}",)
        self.f.header.file_name.name = Path(path).name
        self.f.header.file_name.organization = ("bbl-dres/reconstruction",)
        self.f.write(str(path))


def site_and_building(m, building_ident, building_name):
    site = m.entity("IfcSite", SITE_ID, "Golden pavilion parcel", LongName="Parcel 1234 (example)")
    ifcopenshell.api.aggregate.assign_object(m.f, products=[site], relating_object=m.project)
    m.place(site)
    if building_ident is None:
        return site, None
    building = m.entity("IfcBuilding", building_ident, building_name)
    ifcopenshell.api.aggregate.assign_object(m.f, products=[building], relating_object=site)
    m.place(building)
    return site, building


# ---------------------------------------------------------------------------------------------------------------
# Building model
# ---------------------------------------------------------------------------------------------------------------
L, W = 10.0, 6.0             # footprint, outer faces of the exterior walls
EXT, INT = 0.40, 0.15        # wall thicknesses
SLAB = 0.25                  # structural slab thickness
LEVELS = {"eg": 0.0, "og": 3.20}
ROOF_TOP = 6.40              # top of the roof slab
H = {"eg": LEVELS["og"] - SLAB, "og": ROOF_TOP - SLAB - LEVELS["og"]}   # wall height: top of slab to underside of slab above


def building_model():
    m = Model("Golden pavilion - building", "golden-pavilion-project-building")
    site, building = site_and_building(m, "golden-pavilion-building", "Golden pavilion")
    storeys = {}
    for sid, z in LEVELS.items():
        s = m.entity("IfcBuildingStorey", "storey-" + sid, {"eg": "EG", "og": "OG1"}[sid], Elevation=z, LongName={"eg": "Erdgeschoss", "og": "1. Obergeschoss"}[sid])
        m.place(s, z=z)
        storeys[sid] = s
    ifcopenshell.api.aggregate.assign_object(m.f, products=list(storeys.values()), relating_object=building)

    # Types. Walls are straight extrusions along their local X axis; thickness along local +Y.
    def wall_rep(length, height, thickness):
        return ifcopenshell.api.geometry.add_wall_representation(m.f, context=m.body, length=length, height=height, thickness=thickness)

    # A wall type fixes thickness and material; each occurrence has its own length, so walls carry their own body.
    for ident, name, mat in [("wall-ext-40", "Exterior wall 40 cm, sandstone", ("Sandstone", "stone")),
                             ("wall-int-15", "Interior wall 15 cm, plastered brick", ("Brick, plastered", "brick"))]:
        t = m.entity("IfcWallType", "type:" + ident, name, predefined_type="SOLIDWALL")
        ifcopenshell.api.material.assign_material(m.f, products=[t], material=m.material(*mat))
        m.types[ident] = t
    for ident, name, mat in [("slab-floor-25", "Floor slab 25 cm", ("Reinforced concrete", "concrete")),
                             ("slab-roof-25", "Flat roof slab 25 cm", ("Reinforced concrete", "concrete"))]:
        t = m.entity("IfcSlabType", "type:" + ident, name, predefined_type="ROOF" if "roof" in ident else "FLOOR")
        ifcopenshell.api.material.assign_material(m.f, products=[t], material=m.material(*mat))
        m.types[ident] = t
    roof_type = m.entity("IfcRoofType", "type:roof-flat", "Flat roof", predefined_type="FLAT_ROOF")
    ifcopenshell.api.material.assign_material(m.f, products=[roof_type], material=m.material("Reinforced concrete", "concrete"))
    m.types["roof-flat"] = roof_type
    door = ifcopenshell.api.geometry.add_door_representation(m.f, context=m.body, overall_height=2.10, overall_width=1.00, operation_type="SINGLE_SWING_LEFT")
    m.type("IfcDoorType", "door-oak-100x210", "Door, oak, 1.00 x 2.10", door, ("Oak", "wood"), predefined_type="DOOR", OperationType="SINGLE_SWING_LEFT")
    window = ifcopenshell.api.geometry.add_window_representation(m.f, context=m.body, overall_height=1.40, overall_width=1.20, partition_type="SINGLE_PANEL")
    m.type("IfcWindowType", "window-120x140", "Window, painted timber, 1.20 x 1.40", window, ("Timber, painted", "wood"), predefined_type="WINDOW", PartitioningType="SINGLE_PANEL")
    m.type("IfcColumnType", "column-30x30", "Column 30 x 30, sandstone", m.rep(m.box(0.30, 0.30, H["eg"] - 0.30, 0.15, 0.15)), ("Sandstone", "stone"), predefined_type="COLUMN")
    m.type("IfcBeamType", "beam-30x30", "Beam 30 x 30, timber", m.rep(m.box(0.30, 3.00, 0.30, 0.15, 1.50)), ("Timber", "wood"), predefined_type="BEAM")
    m.type("IfcStairType", "stair-two-runs", "Straight stair, two runs with landing", m.rep(m.box(0.01, 0.01, 0.01)), ("Sandstone", "stone"), predefined_type="TWO_STRAIGHT_RUN_STAIR")
    m.types["stair-two-runs"].RepresentationMaps = None  # the stair's geometry lives in its parts
    # Furniture types: origin at the centre of the footprint on the floor, front facing local -Y (Blender's front view).
    seat = m.rep(m.box(0.45, 0.45, 0.05, 0, 0, 0.43), m.box(0.45, 0.05, 0.45, 0, 0.20, 0.48),
                 *[m.box(0.04, 0.04, 0.43, x, y) for x in (-0.20, 0.20) for y in (-0.20, 0.20)])
    m.type("IfcFurnitureType", "chair-oak", "Chair, oak", seat, ("Oak", "wood"), predefined_type="CHAIR", AssemblyPlace="NOTDEFINED")
    table = m.rep(m.box(1.60, 0.90, 0.04, 0, 0, 0.72), *[m.box(0.06, 0.06, 0.72, x, y) for x in (-0.77, 0.77) for y in (-0.42, 0.42)])
    m.type("IfcFurnitureType", "table-oak-160", "Table, oak, 1.60 x 0.90", table, ("Oak", "wood"), predefined_type="TABLE", AssemblyPlace="NOTDEFINED")

    def wall(ident, name, type_id, storey, x, y, rot, length, thickness, external):
        e = m.entity("IfcWall", ident, name, predefined_type="SOLIDWALL")
        m.place(e, x, y, LEVELS[storey], rot)
        ifcopenshell.api.geometry.assign_representation(m.f, product=e, representation=wall_rep(length, H[storey], thickness))
        ifcopenshell.api.type.assign_type(m.f, related_objects=[e], relating_type=m.types[type_id])
        ifcopenshell.api.spatial.assign_container(m.f, products=[e], relating_structure=storeys[storey])
        m.common(e, "Pset_WallCommon", IsExternal=external)
        m.evidence(e, ident, {"category": "exterior-wall" if external else "interior-wall", "basis": "measured", "confidence": "high",
                              "source": "Golden example plan, sheet EG/OG (invented)"})
        return e

    walls = {}
    for sid in LEVELS:
        # Butt joints: the long walls run the full length, the short walls fit between them. No overlap, no gap.
        walls[sid + "-s"] = wall(f"wall-{sid}-s", f"{sid.upper()} south wall", "wall-ext-40", sid, 0.0, 0.0, 0, L, EXT, True)
        walls[sid + "-n"] = wall(f"wall-{sid}-n", f"{sid.upper()} north wall", "wall-ext-40", sid, L, W, 180, L, EXT, True)
        walls[sid + "-w"] = wall(f"wall-{sid}-w", f"{sid.upper()} west wall", "wall-ext-40", sid, 0.0, W - EXT, 270, W - 2 * EXT, EXT, True)
        walls[sid + "-e"] = wall(f"wall-{sid}-e", f"{sid.upper()} east wall", "wall-ext-40", sid, L, EXT, 90, W - 2 * EXT, EXT, True)
    walls["eg-i"] = wall("wall-eg-i1", "EG partition Halle/Saal", "wall-int-15", "eg", 6.15, EXT, 90, W - 2 * EXT, INT, False)

    def opening(ident, host, x_along, z, width, height, thickness):
        """Opening in the host wall's local frame: x along the wall, from the wall's base."""
        o = m.entity("IfcOpeningElement", ident, "Opening " + ident, predefined_type="OPENING")
        ifcopenshell.api.geometry.assign_representation(m.f, product=o, representation=m.rep(m.box(width, thickness + 0.10, height, x_along + width / 2, thickness / 2, z)))
        o.ObjectPlacement = m.f.createIfcLocalPlacement(host.ObjectPlacement, m.f.createIfcAxis2Placement3D(m.f.createIfcCartesianPoint((0.0, 0.0, 0.0))))
        ifcopenshell.api.feature.add_feature(m.f, feature=o, element=host)
        return o

    def filling(cls, ident, name, type_id, host, storey, x_along, z, width, height, external, rot_host, host_xy):
        o = opening("opening-" + ident, host, x_along, z, width, height, EXT if external else INT)
        hx, hy = host_xy
        c, s = math.cos(math.radians(rot_host)), math.sin(math.radians(rot_host))
        e = m.occurrence(cls, ident, name, type_id, storeys[storey], at=(hx + c * x_along, hy + s * x_along, LEVELS[storey] + z, rot_host),
                         predefined_type=cls[3:].upper(), OverallWidth=width, OverallHeight=height,
                         evidence={"category": cls[3:].lower(), "basis": "measured", "confidence": "medium", "source": "Golden example facade photo (invented)"})
        ifcopenshell.api.feature.add_filling(m.f, opening=o, element=e)
        m.common(e, "Pset_" + cls[3:] + "Common", IsExternal=external)
        return e

    filling("IfcDoor", "door-eg-entrance", "Entrance door", "door-oak-100x210", walls["eg-s"], "eg", 2.0, 0.0, 1.0, 2.1, True, 0, (0.0, 0.0))
    filling("IfcDoor", "door-eg-saal", "Door Halle/Saal", "door-oak-100x210", walls["eg-i"], "eg", 1.0, 0.0, 1.0, 2.1, False, 90, (6.15, EXT))
    for i, x in enumerate((4.0, 7.5)):
        filling("IfcWindow", f"window-eg-s{i + 1}", f"EG south window {i + 1}", "window-120x140", walls["eg-s"], "eg", x, 0.9, 1.2, 1.4, True, 0, (0.0, 0.0))
        filling("IfcWindow", f"window-og-s{i + 1}", f"OG1 south window {i + 1}", "window-120x140", walls["og-s"], "og", x, 0.9, 1.2, 1.4, True, 0, (0.0, 0.0))

    # Slabs: full footprint, between the wall bands. The OG slab has the stair void.
    STAIR_Y = W - EXT - 1.0  # the stair runs against the inner face of the north wall, no gap
    stair_void = [(0.5, STAIR_Y), (5.56, STAIR_Y), (5.56, W - EXT), (0.5, W - EXT)]  # ends where the top riser meets the slab
    footprint = [(0, 0), (L, 0), (L, W), (0, W)]
    for ident, name, sid, z, holes in [("slab-eg", "EG floor slab", "eg", -SLAB, ()), ("slab-og", "OG1 floor slab", "og", LEVELS["og"] - SLAB, (stair_void,))]:
        e = m.entity("IfcSlab", ident, name, predefined_type="FLOOR")
        m.place(e, z=z)
        ifcopenshell.api.geometry.assign_representation(m.f, product=e, representation=m.rep(m.prism(footprint, SLAB, holes=holes)))
        ifcopenshell.api.type.assign_type(m.f, related_objects=[e], relating_type=m.types["slab-floor-25"])
        ifcopenshell.api.spatial.assign_container(m.f, products=[e], relating_structure=storeys[sid])
        m.common(e, "Pset_SlabCommon", IsExternal=sid == "eg")
        m.evidence(e, ident, {"category": "slab", "basis": "inferred", "source": "Slab thickness from typical construction; levels from section (invented)"})
    roof = m.entity("IfcRoof", "roof", "Flat roof", predefined_type="FLAT_ROOF")
    m.place(roof, z=ROOF_TOP - SLAB)
    ifcopenshell.api.type.assign_type(m.f, related_objects=[roof], relating_type=roof_type)
    ifcopenshell.api.spatial.assign_container(m.f, products=[roof], relating_structure=storeys["og"])
    m.evidence(roof, "roof", {"category": "roof"})
    rs = m.entity("IfcSlab", "roof-slab", "Roof slab", predefined_type="ROOF")
    m.place(rs, z=ROOF_TOP - SLAB)
    ifcopenshell.api.geometry.assign_representation(m.f, product=rs, representation=m.rep(m.prism(footprint, SLAB)))
    ifcopenshell.api.type.assign_type(m.f, related_objects=[rs], relating_type=m.types["slab-roof-25"])
    ifcopenshell.api.aggregate.assign_object(m.f, products=[rs], relating_object=roof)
    m.evidence(rs, "roof-slab", {"category": "roof"})

    # Columns and beam in the Saal: separate elements, never part of a wall or slab mesh.
    for i, y in enumerate((1.5, 4.2)):
        c = m.occurrence("IfcColumn", f"column-eg-{i + 1}", f"EG Saal column {i + 1}", "column-30x30", storeys["eg"], at=(7.73, y - 0.15, 0.0, 0), predefined_type="COLUMN",
                         evidence={"category": "column", "basis": "measured", "confidence": "high", "source": "Golden example plan EG (invented)"})
    m.occurrence("IfcBeam", "beam-eg-1", "EG Saal beam", "beam-30x30", storeys["eg"], at=(7.73, 1.35, H["eg"] - 0.30, 0), predefined_type="BEAM",
                 evidence={"category": "beam", "source": "Golden example section (invented)"})

    # Stair: one IfcStair aggregating flight, landing, flight and railing. 18 risers of 0.178 m, goings 0.26 m:
    # each flight has 8 risers and 8 treads; the landing front and the OG slab edge are risers 9 and 18.
    riser, going, width = LEVELS["og"] / 18, 0.26, 1.0
    stair = m.occurrence("IfcStair", "stair-1", "Stair EG-OG1", "stair-two-runs", storeys["eg"], at=(0.5, STAIR_Y, 0.0, 0), predefined_type="TWO_STRAIGHT_RUN_STAIR",
                         evidence={"category": "stair", "basis": "measured", "source": "Riser count from plan (invented)"})

    def flight_profile(n):
        # n risers and n treads; the front edge of the landing (or of the slab above) is the next riser.
        pts = [(0.0, 0.0)]
        for k in range(n):
            pts += [(k * going, (k + 1) * riser), ((k + 1) * going, (k + 1) * riser)]
        pts += [(n * going, n * riser - 0.20), (0.20, 0.0)]  # end face and soffit; nothing below the flight's floor level
        return pts

    def flight_rep(n):
        b = m.builder
        prof = b.profile(b.polyline(flight_profile(n), closed=True))
        return m.rep(b.extrude(prof, width, position=(0.0, 0.0, 0.0), extrusion_vector=(0.0, 0.0, 1.0), position_z_axis=(0.0, -1.0, 0.0), position_x_axis=(1.0, 0.0, 0.0)))  # profile Y = up, extruded towards -Y

    run = 8 * going
    m.part("IfcStairFlight", "stair-1-flight-1", "Flight 1", flight_rep(8), ("Sandstone", "stone"), stair, at=(0.5, STAIR_Y + width, 0.0, 0), predefined_type="STRAIGHT")
    m.part("IfcSlab", "stair-1-landing", "Half landing", m.rep(m.box(0.9, width, 0.20, 0.45, width / 2, -0.20)), ("Sandstone", "stone"), stair,
           at=(0.5 + run, STAIR_Y, 9 * riser, 0), predefined_type="LANDING")
    m.part("IfcStairFlight", "stair-1-flight-2", "Flight 2", flight_rep(8), ("Sandstone", "stone"), stair, at=(0.5 + run + 0.9, STAIR_Y + width, 9 * riser, 0), predefined_type="STRAIGHT")
    # Railing follows the pitch line: handrail 0.90 m above the tread nosings, posts on the treads.
    nosing = [(0.0, riser), (run, 9 * riser), (run + 0.9, 9 * riser), (2 * run + 0.9, LEVELS["og"])]
    rail = m.mesh(*sloped_bars([(a, b) for a, b in zip(nosing, nosing[1:])], 0.05, 0.05, 0.90, posts=3))
    m.part("IfcRailing", "stair-1-railing", "Stair railing", rail, ("Steel, painted", "steel"), stair, at=(0.5, STAIR_Y, 0.0, 0), predefined_type="BALUSTRADE")  # on the open edge, inside the void

    # Furniture: one type, many occurrences (placements only, shared geometry).
    m.occurrence("IfcFurniture", "table-saal-1", "Saal table", "table-oak-160", storeys["eg"], at=(7.8, 2.95, 0.0, 0), predefined_type="TABLE",
                 evidence={"category": "table", "source": "Golden example panorama node 3 (invented)"})
    for i, (x, y, r) in enumerate([(7.4, 2.25, 180), (8.2, 2.25, 180), (7.4, 3.65, 0), (8.2, 3.65, 0)]):  # every chair faces the table
        m.occurrence("IfcFurniture", f"chair-saal-{i + 1}", f"Saal chair {i + 1}", "chair-oak", storeys["eg"], at=(x, y, 0.0, r), predefined_type="CHAIR",
                     evidence={"category": "chair", "source": "Golden example panorama node 3 (invented)"})

    # Rooms: IfcSpace per room, inner wall faces, finished floor to underside of slab; NetFloorArea measured from the polygon.
    def space(ident, number, name, sid, poly, holes=()):
        sp = m.entity("IfcSpace", ident, number, LongName=name, predefined_type="SPACE", CompositionType="ELEMENT")
        m.place(sp, z=LEVELS[sid])
        ifcopenshell.api.geometry.assign_representation(m.f, product=sp, representation=m.rep(m.prism(poly, H[sid], holes=holes)))
        ifcopenshell.api.aggregate.assign_object(m.f, products=[sp], relating_object=storeys[sid])
        area = polygon_area(poly) - sum(polygon_area(h) for h in holes)
        q = ifcopenshell.api.pset.add_qto(m.f, product=sp, name="Qto_SpaceBaseQuantities")
        ifcopenshell.api.pset.edit_qto(m.f, qto=q, properties={"NetFloorArea": round(area, 2), "Height": round(H[sid], 2)})
        m.common(sp, "Pset_SpaceCommon", Reference=number, IsExternal=False)
        m.evidence(sp, ident, {"category": "space", "basis": "measured", "source": "Room outline from plan (invented)"})
        return sp

    space("space-eg-01", "EG.01", "Halle", "eg", [(EXT, EXT), (6.0, EXT), (6.0, W - EXT), (EXT, W - EXT)])
    space("space-eg-02", "EG.02", "Saal", "eg", [(6.15, EXT), (L - EXT, EXT), (L - EXT, W - EXT), (6.15, W - EXT)])
    space("space-og-01", "OG1.01", "Obergeschoss", "og", [(EXT, EXT), (L - EXT, EXT), (L - EXT, W - EXT), (EXT, W - EXT)], holes=[stair_void])
    return m


def sloped_bars(segments, width, depth, height, posts=3):
    """Mesh of a handrail along (x, z) segments at `height` above them, with `posts` posts per segment."""
    verts, faces = [], []

    def bar(p, q, y0, y1):
        i = len(verts)
        (x0, z0), (x1, z1) = p, q
        for (x, z) in ((x0, z0), (x1, z1)):
            for y in (y0, y1):
                verts.extend([(x, y, z), (x, y, z + depth)])
        # vertices: 0..3 at p (y0 low, y0 high, y1 low, y1 high), 4..7 at q
        faces.extend([[i + a for a in f] for f in ([0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [1, 3, 7, 5], [0, 4, 6, 2])])

    for (x0, z0), (x1, z1) in segments:
        bar((x0, z0 + height), (x1, z1 + height), 0.0, width)
        for k in range(posts):
            t = (k + 0.5) / posts
            x, z = x0 + t * (x1 - x0), z0 + t * (z1 - z0)
            for dz0, dz1 in [(0.0, height)]:
                i = len(verts)
                for (xx, zz) in ((x - 0.02, z), (x + 0.02, z)):
                    for y in (0.005, width - 0.005):
                        verts.extend([(xx, y, zz + dz0), (xx, y, zz + dz1)])
                faces.extend([[i + a for a in f] for f in ([0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [1, 3, 7, 5], [0, 4, 6, 2])])
    return verts, faces


def polygon_area(p):
    return abs(sum(p[i][0] * p[(i + 1) % len(p)][1] - p[(i + 1) % len(p)][0] * p[i][1] for i in range(len(p)))) / 2


# ---------------------------------------------------------------------------------------------------------------
# Site model: the parcel only, contained in the shared IfcSite
# ---------------------------------------------------------------------------------------------------------------
PARCEL = [(-8.0, -10.0), (22.0, -10.0), (22.0, 14.0), (-8.0, 14.0)]
GROUND = -0.15   # terrain meets the plinth 15 cm below the EG finished floor


def site_model():
    m = Model("Golden pavilion - site", "golden-pavilion-project-site")
    site, _ = site_and_building(m, None, None)
    m.common(site, "Pset_LandRegistration", LandID="1234 (example)")
    # Terrain: one mesh for the parcel with the building footprint left open (no terrain inside the building).
    outer, inner = PARCEL, [(0, 0), (L, 0), (L, W), (0, W)]
    verts = [(x, y, GROUND) for x, y in outer] + [(x, y, GROUND) for x, y in inner]
    faces = [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]
    m.type("IfcGeographicElementType", "terrain", "Terrain, grass", m.mesh(verts, faces), ("Grass", "soil"), predefined_type="TERRAIN")
    m.occurrence("IfcGeographicElement", "site-terrain", "Parcel terrain", "terrain", site, predefined_type="TERRAIN",
                 evidence={"category": "terrain", "basis": "measured", "confidence": "medium", "source": "swissALTI3D 0.5 m (example)"})
    m.type("IfcSlabType", "paving-sandstone", "Paving, sandstone slabs", m.rep(m.box(1.6, 10.0, 0.10, 0.8, 5.0, -0.10)), ("Sandstone", "stone"), predefined_type="USERDEFINED", ElementType="PAVING")
    m.occurrence("IfcSlab", "site-path-1", "Entrance path", "paving-sandstone", site, at=(1.7, -10.0, GROUND + 0.10, 0), predefined_type="USERDEFINED", ObjectType="PAVING",
                 evidence={"category": "paving", "source": "SWISSIMAGE orthophoto (example)"})
    # Garden wall along the south boundary, split at the entrance path; the gap holds the gate. Like building walls,
    # each segment has its own extrusion; the type fixes thickness and material.
    gwt = m.entity("IfcWallType", "type:garden-wall", "Garden wall 30 cm, rubble stone", predefined_type="SOLIDWALL")
    ifcopenshell.api.material.assign_material(m.f, products=[gwt], material=m.material("Rubble stone", "stone"))
    m.types["garden-wall"] = gwt
    for ident, name, x0, x1 in [("site-garden-wall-sw", "South garden wall, west", PARCEL[0][0], 1.7), ("site-garden-wall-se", "South garden wall, east", 3.3, PARCEL[1][0])]:
        gw = m.entity("IfcWall", ident, name, predefined_type="SOLIDWALL")
        m.place(gw, x0, PARCEL[0][1], GROUND)
        ifcopenshell.api.geometry.assign_representation(m.f, product=gw, representation=ifcopenshell.api.geometry.add_wall_representation(m.f, context=m.body, length=x1 - x0, height=1.20, thickness=0.30))
        ifcopenshell.api.type.assign_type(m.f, related_objects=[gw], relating_type=gwt)
        ifcopenshell.api.spatial.assign_container(m.f, products=[gw], relating_structure=site)
        m.common(gw, "Pset_WallCommon", IsExternal=True)
        m.evidence(gw, ident, {"category": "boundary-wall", "basis": "measured", "source": "Cadastral survey boundary feature (example)"})
    m.type("IfcDoorType", "gate-steel-160", "Garden gate, steel, 1.60 x 1.10", m.rep(m.box(1.60, 0.04, 1.10, 0.80, 0.15, 0.0)), ("Steel, painted", "steel"), predefined_type="GATE", OperationType="DOUBLE_DOOR_SINGLE_SWING")
    m.occurrence("IfcDoor", "site-gate-1", "Entrance gate", "gate-steel-160", site, at=(1.7, PARCEL[0][1], GROUND, 0), predefined_type="GATE", OverallWidth=1.60, OverallHeight=1.10,
                 evidence={"category": "gate", "basis": "measured", "source": "Street-side photograph (example)"})
    m.type("IfcGeographicElementType", "tree-deciduous-8m", "Tree, deciduous, 8 m", m.rep(m.box(0.3, 0.3, 3.0, 0, 0), m.box(4.0, 4.0, 5.0, 0, 0, 3.0)), ("Foliage", "vegetation"), predefined_type="USERDEFINED", ElementType="TREE")
    for i, (x, y) in enumerate([(-4.0, 8.0), (16.0, 9.0), (17.0, -5.0)]):
        m.occurrence("IfcGeographicElement", f"site-tree-{i + 1}", f"Tree {i + 1}", "tree-deciduous-8m", site, at=(x, y, GROUND, 0), predefined_type="USERDEFINED", ObjectType="TREE",
                     evidence={"category": "plant", "basis": "measured", "source": "swissTLM3D single trees (example)"})
    return m


# ---------------------------------------------------------------------------------------------------------------
# Surroundings model: outside the parcel, low detail
# ---------------------------------------------------------------------------------------------------------------
def surroundings_model():
    m = Model("Golden pavilion - surroundings", "golden-pavilion-project-surroundings")
    site = m.entity("IfcSite", "golden-pavilion-surroundings", "Golden pavilion surroundings")
    ifcopenshell.api.aggregate.assign_object(m.f, products=[site], relating_object=m.project)
    m.place(site)
    big = [(-60.0, -60.0), (80.0, -60.0), (80.0, 60.0), (-60.0, 60.0)]
    verts = [(x, y, GROUND - 0.5) for x, y in big] + [(x, y, GROUND) for x, y in PARCEL]
    faces = [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]
    m.type("IfcGeographicElementType", "terrain-context", "Terrain, context", m.mesh(verts, faces), ("Ground, context", "soil"), predefined_type="TERRAIN")
    m.occurrence("IfcGeographicElement", "context-terrain", "Context terrain", "terrain-context", site, predefined_type="TERRAIN",
                 evidence={"category": "terrain", "basis": "measured", "source": "swissALTI3D 2 m (example)"})
    nb = m.entity("IfcBuilding", "context-building-1", "Neighbour, Musterweg 3", CompositionType="ELEMENT")
    ifcopenshell.api.aggregate.assign_object(m.f, products=[nb], relating_object=site)
    m.place(nb, 30.0, 0.0, GROUND)
    m.type("IfcBuildingElementProxyType", "massing-12x8x9", "Building massing (LOD2-like block)", m.rep(m.box(12.0, 8.0, 9.0, 6.0, 4.0)), ("Facade, context", "plaster"), predefined_type="USERDEFINED", ElementType="MASSING")
    m.occurrence("IfcBuildingElementProxy", "context-building-1-massing", "Neighbour massing", "massing-12x8x9", nb, at=(30.0, 0.0, GROUND, 0), predefined_type="USERDEFINED", ObjectType="MASSING",
                 evidence={"category": "context", "basis": "measured", "confidence": "medium", "source": "swissBUILDINGS3D 3.0 (example)"})
    return m


def main():
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent
    out.mkdir(parents=True, exist_ok=True)
    for model, name, text in [(building_model(), "golden-building.ifc", "golden example, building model"),
                              (site_model(), "golden-site.ifc", "golden example, site model (parcel)"),
                              (surroundings_model(), "golden-surroundings.ifc", "golden example, surroundings model")]:
        model.write(out / name, text)
        print("wrote", out / name)


if __name__ == "__main__":
    main()
