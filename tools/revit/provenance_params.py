# -*- coding: utf-8 -*-
"""The provenance parameter set every Revit reconstruction binds (docs/handbook.md, Evidence classes and provenance).

One definition, used by shared_parameters.py (writes the shared-parameter file with fresh GUIDs for a building prefix)
and by provenance_stage.py (binds the file and fills the values from the stage tags). Names are prefixed per building:
'RH_Method', 'VM_Method'. Pure Python 2/3, no Revit import.

(suffix, spec, binding, categories, description)
  spec: text | number | integer      binding: instance | type
  categories: model | room | project | type-model
"""
PARAMS = [
    ('RegistryId', 'text', 'instance', 'model', 'Product id (the Mark): <building>-<part>-<floor>-<kind>-<nnn>'),
    ('Building', 'text', 'instance', 'model', 'Building part code of the ensemble (e.g. VIL, GAL, SITE, CTX); drives the export sets'),
    ('Part', 'text', 'instance', 'model', 'Package or component the element belongs to (facade, interior, site ...)'),
    ('EvidenceSource', 'text', 'instance', 'model', 'Source aliases and reference ids the geometry rests on (XX-SNNN, ref-...)'),
    ('Method', 'text', 'instance', 'model', 'measured-vector | scaled-drawing | photo-scaled | photo-presence | lidar | cadastral | transferred | inferred | owner-instruction | unknown-placeholder'),
    ('Confidence', 'text', 'instance', 'model', 'high | medium | low'),
    ('StateDate', 'text', 'instance', 'model', 'Date or period of the state the element represents'),
    ('ConstructionPeriod', 'text', 'instance', 'model', 'Construction phase of the real element, where known'),
    ('Tol_H', 'number', 'instance', 'model', 'Horizontal positional tolerance in metres'),
    ('Tol_V', 'number', 'instance', 'model', 'Vertical positional tolerance in metres'),
    ('LOD', 'integer', 'instance', 'model', 'Level of development of this element (100, 200, 300, 400)'),
    ('Decisions', 'text', 'instance', 'model', 'Decision ids (XX-DNNN) that shaped the element'),
    ('Findings', 'text', 'instance', 'model', 'Open review finding ids; cleared when fixed'),
    ('Stage', 'text', 'instance', 'model', 'Stage that created or last changed the element (sNN)'),
    ('Licence', 'text', 'instance', 'model', 'Licence of the data the element derives from, where it restricts reuse'),
    ('StructuralRole', 'text', 'instance', 'model', 'Assumed structural role (bearing, non-bearing, retaining ...); no certification'),
    ('StructuralBasis', 'text', 'instance', 'model', 'Basis of the assumed structural role'),
    ('GeometryBasis', 'text', 'type', 'type-model', 'Simplification statement of the type (what is modelled, what is left out)'),
    ('NameSource', 'text', 'instance', 'room', 'Room name as the source names it'),
    ('PlanArea', 'number', 'instance', 'room', 'Room area as the source states it (m2)'),
    ('AreaDeviation', 'number', 'instance', 'room', 'Model area minus source area (m2)'),
    ('VerticalDatum', 'text', 'instance', 'project', 'Vertical datum and the origin height of the model'),
    ('Georeference', 'text', 'instance', 'project', 'CRS, origin and rotation of the shared coordinates'),
]

MODEL_CATS = ['OST_Walls', 'OST_Floors', 'OST_Roofs', 'OST_Ceilings', 'OST_Doors', 'OST_Windows', 'OST_Columns',
              'OST_StructuralColumns', 'OST_StructuralFraming', 'OST_Stairs', 'OST_StairsRailing', 'OST_Railings', 'OST_GenericModel',
              'OST_Furniture', 'OST_Casework', 'OST_LightingFixtures', 'OST_PlumbingFixtures', 'OST_SpecialityEquipment', 'OST_MechanicalEquipment',
              'OST_Mass', 'OST_Toposolid', 'OST_Topography', 'OST_Planting', 'OST_Site', 'OST_Entourage', 'OST_Parking', 'OST_Roads',
              'OST_CurtainWallPanels', 'OST_CurtainWallMullions', 'OST_Cornices', 'OST_ShaftOpening', 'OST_Ramps', 'OST_Parts',
              'OST_SiteProperty']
ROOM_CATS = ['OST_Rooms']
PROJECT_CATS = ['OST_ProjectInformation']
