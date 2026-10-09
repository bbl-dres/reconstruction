"""BIM modelling guide: IFC audit, IDS files and golden example. Uses the optional pinned BIM toolchain
(tools/model-pipeline/requirements-bim.txt) and skips without it."""
from pathlib import Path
import json, subprocess, sys, tempfile, unittest

ROOT = Path(__file__).resolve().parents[1]
GUIDE = ROOT / 'docs' / 'bim-modelling-guide'
GOLDEN = GUIDE / 'examples' / 'golden'
sys.path.insert(0, str(ROOT / 'tools' / 'model-checks'))
try:
    import ifcopenshell
    import ifcopenshell.api.root, ifcopenshell.api.unit, ifcopenshell.api.context, ifcopenshell.api.aggregate
    import ifcopenshell.api.spatial, ifcopenshell.api.project
    import ifc_audit
except ImportError:
    ifcopenshell = None
try:
    import ifctester.ids
except ImportError:
    ifctester = None


def failed(report):
    return {r['rule'] for r in report['rules'] if not r['pass']}


@unittest.skipIf(ifcopenshell is None, 'BIM toolchain not installed')
class IfcAuditTest(unittest.TestCase):
    def test_golden_models_pass_their_rules(self):
        for kind in ('building', 'site', 'surroundings'):
            report = ifc_audit.audit(str(GOLDEN / f'golden-{kind}.ifc'), geometry=True, model_type=kind)
            self.assertEqual((report['errors'], report['warnings']), (0, 0), (kind, failed(report)))

    def test_golden_building_shows_the_guide(self):
        report = ifc_audit.audit(str(GOLDEN / 'golden-building.ifc'))
        self.assertEqual(report['proxyShare'], 0)
        self.assertEqual(report['openings']['doorsAndWindowsFillingAnOpening'], report['openings']['doorsAndWindows'])
        self.assertEqual(report['stairs']['stairsDecomposedIntoFlights'], report['stairs']['stairs'])
        self.assertGreater(report['spatial']['spaces'], 0)
        self.assertGreater(report['types']['meanOccurrencesPerUsedType'], 1)

    def test_broken_model_fails_the_right_rules(self):
        f = ifcopenshell.api.project.create_file(version='IFC4')
        project = ifcopenshell.api.root.create_entity(f, ifc_class='IfcProject', name='broken')
        ifcopenshell.api.unit.assign_unit(f)
        ifcopenshell.api.context.add_context(f, context_type='Model')
        site = ifcopenshell.api.root.create_entity(f, ifc_class='IfcSite', name='site')
        building = ifcopenshell.api.root.create_entity(f, ifc_class='IfcBuilding', name='building')
        storey = ifcopenshell.api.root.create_entity(f, ifc_class='IfcBuildingStorey', name='EG')
        ifcopenshell.api.aggregate.assign_object(f, products=[site], relating_object=project)
        ifcopenshell.api.aggregate.assign_object(f, products=[building], relating_object=site)
        ifcopenshell.api.aggregate.assign_object(f, products=[storey], relating_object=building)
        ifcopenshell.api.root.create_entity(f, ifc_class='IfcWall', name='floating wall')            # not contained
        door = ifcopenshell.api.root.create_entity(f, ifc_class='IfcDoor', name='door in no opening')
        proxy = ifcopenshell.api.root.create_entity(f, ifc_class='IfcBuildingElementProxy', name='roof as proxy')
        stair = ifcopenshell.api.root.create_entity(f, ifc_class='IfcStair', name='stair as one tread')
        ifcopenshell.api.spatial.assign_container(f, products=[door, proxy, stair], relating_structure=storey)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'broken.ifc'
            f.write(str(path))
            report = ifc_audit.audit(str(path))
        rules = failed(report)
        self.assertEqual(report['errors'], 1)
        for expected in ('every element contained in the spatial structure or part of an assembly',
                         'IfcBuildingElementProxy share <= 0.1', 'every element typed (or part of a typed assembly)',
                         'every door and window fills an opening in a wall', 'stairs decomposed into flights (and landings)',
                         'rooms modelled as IfcSpace', 'every element has a material'):
            self.assertIn(expected, rules)

    def test_golden_rebuild_keeps_every_global_id(self):
        # A CDE compares revisions by GlobalId; entity numbering (#n) may differ between runs.
        ids = lambda p: sorted((e.is_a(), e.GlobalId) for e in ifcopenshell.open(str(p)).by_type('IfcRoot'))
        with tempfile.TemporaryDirectory() as tmp:
            subprocess.run([sys.executable, str(GOLDEN / 'build_golden_example.py'), tmp], check=True, capture_output=True)
            for kind in ('building', 'site', 'surroundings'):
                self.assertEqual(ids(Path(tmp) / f'golden-{kind}.ifc'), ids(GOLDEN / f'golden-{kind}.ifc'), kind)


@unittest.skipIf(ifcopenshell is None or ifctester is None, 'ifctester not installed')
class IdsTest(unittest.TestCase):
    def test_ids_files_are_valid_and_golden_models_pass(self):
        for kind in ('building', 'site', 'surroundings'):
            spec = ifctester.ids.open(str(GUIDE / 'ids' / f'{kind}.ids'), validate=True)
            spec.validate(ifcopenshell.open(str(GOLDEN / f'golden-{kind}.ifc')))
            failing = [s.name for s in spec.specifications if not s.status]
            self.assertEqual(failing, [], kind)


if __name__ == '__main__':
    unittest.main()
