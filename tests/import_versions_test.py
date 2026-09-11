"""Importer integration checks without Blender or external source changes."""
import hashlib
import json
from pathlib import Path
import struct
import sys
import shutil
import unittest
import uuid
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from export_model import glb_summary, read_glb_bytes
from import_versions import export_profile, handoff_file, prepared_export, write_json, model_levels, model_location, import_annotations
from optimize_models import optimize_asset, prune_unused_assets


class PreparedImportTests(unittest.TestCase):
    def setUp(self):
        (ROOT / ".work").mkdir(exist_ok=True)
        self.temp = (ROOT / ".work" / f"import-test-{uuid.uuid4().hex}").resolve()
        self.temp.mkdir()
        self.addCleanup(self.clean_fixture)
        self.folder = self.temp / "v007"
        self.package = self.folder / "stage06/viewer"
        self.package.mkdir(parents=True)
        self.output = self.temp / "imported"
        self.source_hash = hashlib.sha256(b"unchanged source fixture").hexdigest()
        self.profile = {"includeCollectionPrefixes": ["07e |"]}
        self.make_asset()

    def clean_fixture(self):
        # Delete only the uniquely created test directory inside this workspace.
        assert self.temp.parent == (ROOT / ".work").resolve() and self.temp.name.startswith("import-test-")
        shutil.rmtree(self.temp)

    def make_asset(self, duplicate=False):
        doc = {"asset": {"version": "2.0"}, "scene": 0, "scenes": [{"nodes": [0, 1]}],
               "nodes": [{"mesh": 0, "translation": [x, 0, 0], "extras": {
                   "viewer_id": "one" if duplicate else str(x), "viewer_source_collections": ["07e | Circulation"],
                   "viewer_family_id": "chair", "viewer_type_id": "chair-standard"}} for x in [0, 2]],
               "meshes": [{"primitives": [{"attributes": {"POSITION": 0}}]}],
               "buffers": [{"byteLength": 36}], "bufferViews": [{"buffer": 0, "byteLength": 36}],
               "accessors": [{"bufferView": 0, "componentType": 5126, "count": 3, "type": "VEC3", "min": [0, 0, 0], "max": [1, 1, 0]}]}
        encoded = json.dumps(doc).encode()
        encoded += b" " * (-len(encoded) % 4)
        binary = struct.pack("<9f", 0, 0, 0, 1, 0, 0, 0, 1, 0)
        asset = self.package / "building.glb"
        asset.write_bytes(struct.pack("<4sII", b"glTF", 2, 28 + len(encoded) + len(binary)) +
                         struct.pack("<II", len(encoded), 0x4E4F534A) + encoded + struct.pack("<II", len(binary), 0x004E4942) + binary)
        write_json(asset.with_suffix(".report.json"), {
            "source": {"sha256": self.source_hash}, "coordinates": {"units": "metres", "exportUp": "Y", "recentered": False},
            "glb": glb_summary(asset), "selection": {"collections": {"07e | Circulation": 2}}})
        return asset

    def test_prepared_package_preserves_bytes_shared_meshes_and_ids_on_reimport(self):
        source_bytes = (self.package / "building.glb").read_bytes()
        output, report = prepared_export(self.folder, self.output, "building", self.source_hash, self.profile)
        self.assertEqual(output.read_bytes(), source_bytes)
        self.assertEqual(report["glb"]["meshNodes"], 2)
        self.assertEqual(report["glb"]["uniqueMeshes"], 1)
        self.assertEqual(report["import"]["method"], "verified-authored-glb")
        modified = output.stat().st_mtime_ns
        prepared_export(self.folder, self.output, "building", self.source_hash, self.profile)
        self.assertEqual(output.stat().st_mtime_ns, modified)

    def test_stale_or_corrupted_package_is_rejected_before_publishing(self):
        with self.assertRaisesRegex(ValueError, "Blender source"):
            prepared_export(self.folder, self.output, "building", "stale", self.profile)
        asset = self.package / "building.glb"
        asset.write_bytes(asset.read_bytes() + b"extra")
        with self.assertRaises(ValueError):
            prepared_export(self.folder, self.output, "building", self.source_hash, self.profile)
        self.assertFalse(self.output.exists())

    def test_duplicate_placement_ids_are_rejected(self):
        self.make_asset(duplicate=True)
        with self.assertRaisesRegex(ValueError, "unique placement IDs"):
            prepared_export(self.folder, self.output, "building", self.source_hash, self.profile)

    def test_stale_annotations_are_audited_without_changing_the_source_or_valid_notes(self):
        supplied = self.package / 'viewer.json'
        metadata = self.output / 'viewer.json'
        data = {'schemaVersion': 1, 'modelId': 'bundeshaus-v007',
                'views': [{'id': 'overview', 'camera': {'mode': 'orbit', 'frame': 'building'}}],
                'objects': [{'id': '0', 'title': 'Retained chair'}, {'id': 'retired', 'title': 'Old gallery'}],
                'pointsOfInterest': [{'id': 'south-public-entrance', 'camera': {'level': 'lower'}}]}
        write_json(supplied, data)
        original = supplied.read_bytes()
        import_annotations(supplied, metadata, data['modelId'], {'0', '2'}, ['all', 'entrance'])
        result = json.loads(metadata.read_text())
        audit = json.loads((self.output / 'viewer.import.json').read_text())
        self.assertEqual(result['objects'], data['objects'][:1])
        self.assertEqual(result['views'], data['views'])
        self.assertEqual(result['pointsOfInterest'][0]['camera']['level'], 'entrance')
        self.assertEqual(audit['omittedObjects'], data['objects'][1:])
        self.assertEqual(audit['sourceAnnotationSha256'], hashlib.sha256(original).hexdigest())
        self.assertEqual(audit['retainedObjectNotes'], 1)
        exported = metadata.read_bytes()
        import_annotations(supplied, metadata, data['modelId'], {'0', '2'}, ['all', 'entrance'])
        self.assertEqual(metadata.read_bytes(), exported)
        self.assertEqual(supplied.read_bytes(), original)
        # A later corrected source clears the omission audit instead of retaining stale findings.
        data['objects'] = data['objects'][:1]
        write_json(supplied, data)
        import_annotations(supplied, metadata, data['modelId'], {'0', '2'}, ['all', 'entrance'])
        self.assertEqual(json.loads((self.output / 'viewer.import.json').read_text())['omittedObjects'], [])

    def test_invalid_annotation_identity_fails_before_publishing(self):
        supplied = self.package / 'viewer.json'
        metadata = self.output / 'viewer.json'
        for objects in [[{'id': '0'}, {'id': '0'}], [{'id': None}], [None]]:
            write_json(supplied, {'modelId': 'bundeshaus-v007', 'objects': objects})
            with self.assertRaises(ValueError):
                import_annotations(supplied, metadata, 'bundeshaus-v007', {'0'}, ['all'])
            self.assertFalse(metadata.exists())
        write_json(supplied, {'modelId': 'wrong-version', 'objects': []})
        with self.assertRaisesRegex(ValueError, 'modelId'):
            import_annotations(supplied, metadata, 'bundeshaus-v007', {'0'}, ['all'])

    def test_missing_declared_collection_is_rejected(self):
        self.profile['includeCollectionPrefixes'].append('08e | South public entrance')
        with self.assertRaisesRegex(ValueError, 'omits collections'):
            prepared_export(self.folder, self.output, 'building', self.source_hash, self.profile)
        self.assertFalse(self.output.exists())

    def test_large_delivery_uses_gzip_without_losing_geometry_or_retaining_oversized_files(self):
        original, _ = prepared_export(self.folder, self.output, 'building', self.source_hash, self.profile)
        # The fixture's JSON is highly compressible, like the real BIM metadata.
        with patch('optimize_models.MAX_FILE_BYTES', 700):
            delivery, report = optimize_asset(original)
            self.assertEqual(delivery.suffix, '.gz')
            self.assertLess(delivery.stat().st_size, 700)
            self.assertFalse(delivery.with_suffix('').exists())
            self.assertEqual(glb_summary(delivery)['meshNodes'], 2)
            self.assertEqual(glb_summary(delivery), report['glb'])
            self.assertEqual(hashlib.sha256(read_glb_bytes(delivery)).hexdigest(), report['glb']['sha256'])
            self.assertEqual(optimize_asset(delivery)[0], delivery)
            catalog = self.temp / 'catalog.json'
            write_json(catalog, {'models': [{'id': 'test', 'building': './imported/' + delivery.name}]})
            prune_unused_assets(catalog)
            self.assertTrue(delivery.exists())
            self.assertFalse(original.exists())
            self.assertEqual(optimize_asset(delivery)[0], delivery)

    def test_entrance_level_follows_authored_room_membership(self):
        self.assertNotIn('entrance', model_levels([{'extras': {'viewer_source_name': 'Old lobby'}}]))
        self.assertIn('entrance', model_levels([{'extras': {'viewer_room_ids': ['south-public-lobby']}}]))

    def test_pruning_preserves_catalog_assets_and_cache_works_without_originals(self):
        original, _ = prepared_export(self.folder, self.output, "building", self.source_hash, self.profile)
        optimized, report = optimize_asset(original)
        catalog = self.temp / "catalog.json"
        write_json(catalog, {"models": [{"id": "test", "building": "./imported/" + optimized.name}]})
        count, _ = prune_unused_assets(catalog)
        self.assertEqual(count, 2)
        self.assertFalse(original.exists())
        self.assertTrue(optimized.is_file())
        cached, repeated = optimize_asset(optimized)
        self.assertEqual(cached, optimized)
        self.assertEqual(repeated, report)
        self.assertEqual(prune_unused_assets(catalog), (0, 0))
        optimized.with_suffix(".glb.gz").write_bytes(b"damaged")
        with self.assertRaisesRegex(RuntimeError, "Reimport"):
            optimize_asset(optimized)

    def test_pruning_refuses_an_incomplete_catalog(self):
        original, _ = prepared_export(self.folder, self.output, "building", self.source_hash, self.profile)
        catalog = self.temp / "catalog.json"
        write_json(catalog, {"models": [{"id": "test", "building": "./imported/missing.glb"}]})
        with self.assertRaisesRegex(ValueError, "missing assets"):
            prune_unused_assets(catalog)
        self.assertTrue(original.exists())

    def test_authored_profile_and_primary_metadata_precedence(self):
        write_json(self.package / "building_profile.json", self.profile)
        profile = export_profile(self.folder, "building", "bundeshaus-v007")
        self.assertEqual(profile["includeCollectionPrefixes"], ["07e |"])
        self.assertIn(7, profile["requireCollectionGroupCoverage"])
        write_json(self.package / "viewer.json", {"modelId": "stage"})
        self.assertEqual(handoff_file(self.folder, "viewer.json"), self.package / "viewer.json")
        write_json(self.folder / "model/viewer.json", {"modelId": "primary"})
        self.assertEqual(handoff_file(self.folder, "viewer.json"), self.folder / "model/viewer.json")

    def test_georeference_supports_portable_packages_and_existing_research(self):
        geo = {"origin_wgs84": [7.4442, 46.9465, 541.29], "architectural_rotation_degrees": -7}
        write_json(self.package / "provenance/model_georeference.json", geo)
        location = model_location(self.folder)
        self.assertEqual(location["enuToModelDegrees"], -7)
        self.assertEqual(location["latitude"], 46.9465)
        self.assertEqual(location["timeZone"], "Europe/Zurich")
        self.assertIn("stage06/viewer/provenance/", location["source"])
        write_json(self.folder / "stage11/viewer/provenance/model_georeference.json", {**geo, "architectural_rotation_degrees": -8})
        self.assertEqual(model_location(self.folder)["enuToModelDegrees"], -8)
        write_json(self.folder / "viewer/provenance/model_georeference.json", geo)
        self.assertTrue(model_location(self.folder)["source"].startswith("viewer/provenance/"))
        write_json(self.folder / "research/model_georeference.json", geo)
        self.assertTrue(model_location(self.folder)["source"].startswith("research/"))

    def test_missing_or_invalid_georeference_is_never_guessed_from_another_version(self):
        self.assertIsNone(model_location(self.folder))
        path = self.package / "provenance/model_georeference.json"
        geo = {"origin_wgs84": [7.4442, 46.9465, 541.29], "architectural_rotation_degrees": -7}
        for invalid in [{}, {**geo, "origin_wgs84": [7, 91, 0]}, {**geo, "architectural_rotation_degrees": float('nan')},
                        {**geo, "architectural_rotation_degrees": "-7"}, {**geo, "origin_wgs84": [True, 46, 0]}]:
            write_json(path, invalid)
            with self.assertRaisesRegex(ValueError, "Invalid geographic reference"):
                model_location(self.folder)

    def test_stage_research_georeference_keeps_daylight_available_for_v015_layout(self):
        geo = {"origin_wgs84": [7.4442, 46.9465, 541.29], "architectural_rotation_degrees": -7}
        write_json(self.folder / "stage9/research/model_georeference.json", {**geo, "architectural_rotation_degrees": -6})
        write_json(self.folder / "stage14/research/model_georeference.json", geo)
        location = model_location(self.folder)
        self.assertEqual(location["enuToModelDegrees"], -7)
        self.assertTrue(location["source"].startswith("stage14/research/"))
        write_json(self.package / "provenance/model_georeference.json", {**geo, "architectural_rotation_degrees": -8})
        self.assertEqual(model_location(self.folder)["enuToModelDegrees"], -8, "Public handoff locations keep precedence")
        (self.package / "provenance/model_georeference.json").unlink()
        write_json(self.folder / "stage14/research/model_georeference.json", {**geo, "origin_wgs84": [7, 91, 0]})
        with self.assertRaisesRegex(ValueError, "Invalid geographic reference"):
            model_location(self.folder)


if __name__ == "__main__":
    unittest.main()
