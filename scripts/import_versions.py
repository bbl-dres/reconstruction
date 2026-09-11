"""Convert saved Bundeshaus iterations and publish a local viewer catalog.

Unchanged exports are reused. Source/recipe-hash filenames keep the previous catalog
usable until BOTH exports for a revision are complete. Source .blend files are
read-only, and Blender's embedded scripts are disabled by export_model.py.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import sys
from export_model import conversion_recipe, glb_summary, read_glb_bytes
from optimize_models import optimize_asset, prune_unused_assets, valid_cached_asset, recipe as compression_recipe
from bim_registry import validate_registry

REPO = Path(__file__).resolve().parents[1]
MODELS = REPO / "public/models"


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    staged = path.with_suffix(path.suffix + ".tmp")
    staged.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    staged.replace(path)


def hash_file(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def glb_document(path):
    data = read_glb_bytes(path)
    return json.loads(data[20:20 + int.from_bytes(data[12:16], "little")])


def numbered_stages(folder):
    return sorted((path for path in folder.glob("stage*") if path.is_dir() and re.fullmatch(r"stage\d+", path.name)),
                  key=lambda path: int(path.name[5:]), reverse=True)


def handoff_directories(folder):
    """Prefer the public handoff locations, then the newest numbered stage."""
    return [folder / "model", folder / "viewer", folder] + [path / "viewer" for path in numbered_stages(folder)]


def handoff_file(folder, name):
    return next((directory / name for directory in handoff_directories(folder) if (directory / name).is_file()), None)


def model_location(folder):
    """Read this version's geographic frame, including portable viewer packages."""
    candidates = [folder / "research/model_georeference.json"]
    for directory in handoff_directories(folder):
        candidates += [directory / "provenance/model_georeference.json", directory / "model_georeference.json"]
    # v015 keeps its geographic record alongside the stage's research instead
    # of duplicating it in viewer/provenance. Use the same coordinate validation.
    candidates += [stage / "research/model_georeference.json" for stage in numbered_stages(folder)]
    geo_path = next((path for path in candidates if path.is_file()), None)
    if geo_path is None:
        print(f"Warning: {folder.name} has no geographic reference; Sun & sky will be unavailable", file=sys.stderr)
        return None
    geo = read_json(geo_path)
    origin = geo.get("origin_wgs84")
    rotation = geo.get("architectural_rotation_degrees")
    finite = lambda value: isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
    if (not isinstance(origin, list) or len(origin) != 3 or not all(finite(value) for value in origin)
            or abs(origin[0]) > 180 or abs(origin[1]) > 90 or not finite(rotation) or abs(rotation) > 360):
        raise ValueError(f"Invalid geographic reference in {geo_path}: expected WGS84 origin and ENU rotation")
    return {"latitude": origin[1], "longitude": origin[0], "timeZone": "Europe/Zurich",
            "enuToModelDegrees": rotation,
            "source": geo_path.relative_to(folder).as_posix() + "; ENU rotated into Blender XY"}


def export_profile(folder, kind, model_id):
    profile_name = "bundeshaus-v003.json" if kind == "building" else "bundeshaus-v003-surroundings.json"
    profile = read_json(REPO / "scripts/profiles" / profile_name)
    supplied = handoff_file(folder, "building_profile.json" if kind == "building" else "context_profile.json")
    if supplied:
        # Keep the collection-coverage guard and legacy fallback roles while
        # accepting the author's complete inventory and explicit overrides.
        profile.update(read_json(supplied))
    profile["id"] = model_id + ("-surroundings" if kind == "surroundings" else "")
    profile["title"] = f"Bundeshaus Bern - {model_id.split('-')[-1]} {kind}"
    return profile


def prepared_export(folder, output_dir, kind, source_hash, profile):
    """Import a verified author GLB without rerunning their scripts or shaders."""
    names = ["building.glb"] if kind == "building" else ["surroundings.glb", "context.glb"]
    for directory in handoff_directories(folder):
        for name in names:
            asset = directory / name
            report_path = asset.with_suffix(".report.json")
            if not asset.is_file() or not report_path.is_file():
                continue
            report = read_json(report_path)
            if report.get("source", {}).get("sha256") != source_hash:
                raise ValueError(f"Prepared asset {asset} does not match this version's Blender source")
            coordinates = report.get("coordinates", {})
            if coordinates.get("units") != "metres" or coordinates.get("exportUp") != "Y" or coordinates.get("recentered") is not False:
                raise ValueError(f"Prepared asset {asset} must retain metre-scale Y-up model coordinates")
            summary = glb_summary(asset)
            if summary != report.get("glb"):
                raise ValueError(f"Prepared asset {asset} does not match its GLB report")
            doc = glb_document(asset)
            nodes = [node for node in doc["nodes"] if "mesh" in node]
            ids = [node.get("extras", {}).get("viewer_id") for node in nodes]
            if not nodes or not all(isinstance(value, str) and value for value in ids) or len(set(ids)) != len(ids):
                raise ValueError(f"Prepared asset {asset} must preserve unique placement IDs")
            if "EXT_mesh_gpu_instancing" in summary["extensionsUsed"]:
                raise ValueError("Prepared GPU batches require a per-placement visibility and selection adapter")
            prefixes = tuple(profile.get("includeCollectionPrefixes", []))
            counts = {}
            for node in nodes:
                collections = node.get("extras", {}).get("viewer_source_collections", [])
                if prefixes and not any(collection.startswith(prefixes) for collection in collections):
                    raise ValueError(f"Prepared asset {asset} has an element outside its collection profile")
                for collection in collections:
                    counts[collection] = counts.get(collection, 0) + 1
            if counts != report.get("selection", {}).get("collections"):
                raise ValueError(f"Prepared asset {asset} does not preserve its reported collection inventory")
            missing = [prefix for prefix in prefixes if not any(name.startswith(prefix) for name in counts)]
            if missing:
                raise ValueError(f"Prepared asset {asset} omits collections from its complete profile: {', '.join(missing)}")
            output = output_dir / f"{kind}-{source_hash[:12]}-{summary['sha256'][:12]}.glb"
            output_dir.mkdir(parents=True, exist_ok=True)
            if not output.is_file() or hash_file(output) != summary["sha256"]:
                staged = output.with_suffix(".glb.tmp")
                try:
                    shutil.copyfile(asset, staged)
                    if hash_file(staged) != summary["sha256"]:
                        raise RuntimeError("Prepared asset changed while copying; retry after the author finishes saving")
                    staged.replace(output)
                finally:
                    staged.unlink(missing_ok=True)
            report["asset"] = output.name
            report["import"] = {"method": "verified-authored-glb", "packageAsset": asset.relative_to(folder).as_posix(),
                                "packageReportSha256": hash_file(report_path)}
            write_json(output.with_suffix(".report.json"), report)
            print(f"Import prepared {kind}: {summary['meshNodes']} objects, {summary['uniqueMeshes']} shared mesh definitions, {summary['bytes']:,} bytes", flush=True)
            return output, report
    return None


def export(source, output_dir, kind, source_hash, model_id, blender):
    folder = source.parent.parent
    profile = export_profile(folder, kind, model_id)
    prepared = prepared_export(folder, output_dir, kind, source_hash, profile)
    if prepared:
        return prepared
    recipe = conversion_recipe(profile)
    for report_path in output_dir.glob(f"{kind}-meshopt-*.report.json"):
        cached = read_json(report_path)
        candidate = output_dir / cached['asset']
        if candidate.resolve().parent != output_dir.resolve():
            continue
        if (cached.get("conversion") == recipe and cached.get("source", {}).get("sha256") == source_hash
                and valid_cached_asset(candidate, cached, compression_recipe())):
            print(f"Reuse compressed {candidate.relative_to(REPO)}", flush=True)
            return candidate, cached
    recipe_hash = hashlib.sha256(json.dumps(recipe, sort_keys=True).encode()).hexdigest()[:12]
    # Exporter/profile fixes must invalidate the cache too. A distinct filename
    # keeps the previous catalog usable until both revised assets are ready.
    candidates = [output_dir / f"{kind}-{source_hash[:12]}-{recipe_hash}.glb",
                  output_dir / f"{kind}-{source_hash[:12]}.glb", output_dir / f"{kind}.glb"]
    for candidate in candidates:
        report_path = candidate.with_suffix(".report.json")
        if candidate.is_file() and report_path.is_file():
            report = read_json(report_path)
            if report.get("conversion") == recipe and report["source"]["sha256"] == source_hash and report["glb"]["sha256"] == hash_file(candidate):
                print(f"Reuse {candidate.relative_to(REPO)}", flush=True)
                return candidate, report
    output = candidates[0]
    profile_path = REPO / ".work/import-profiles" / f"{model_id}-{kind}.json"
    write_json(profile_path, profile)
    command = [sys.executable, str(REPO / "scripts/export_model.py"), str(source), "--output", str(output), "--profile", str(profile_path)]
    if blender:
        command += ["--blender", blender]
    print(f"Export {model_id} / {kind}", flush=True)
    subprocess.run(command, check=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    report = read_json(output.with_suffix(".report.json"))
    if report["source"]["sha256"] != source_hash:
        raise RuntimeError("Source changed between exports; wait for the model agent to finish saving and retry")
    print(f"Exported {kind}: {report['glb']['meshNodes']} objects, {report['glb']['bytes']:,} bytes", flush=True)
    return output, report


def model_levels(mesh_nodes):
    has_entrance = any(set(node.get('extras', {}).get('viewer_room_ids', [])) & {'south-public-lobby', 'south-public-arcade'}
                       for node in mesh_nodes)
    has_upper = any("301" in node.get("extras", {}).get("viewer_source_name", "") for node in mesh_nodes)
    return ["all"] + (["entrance"] if has_entrance else []) + ["lower", "principal"] + (["upper"] if has_upper else [])


def import_annotations(supplied, metadata_file, model_id, ids, levels):
    """Keep notes for exported components, recording stale notes without changing geometry."""
    source_bytes = supplied.read_bytes()
    annotations = json.loads(source_bytes)
    if annotations.get("modelId") != model_id:
        raise ValueError(f"{supplied} must declare modelId {model_id}")
    objects = annotations.get("objects", [])
    if (not isinstance(objects, list) or any(not isinstance(item, dict)
            or not isinstance(item.get("id"), str) or not item["id"] for item in objects)):
        raise ValueError(f"{supplied} must contain object records with nonempty string IDs")
    if len({item['id'] for item in objects}) != len(objects):
        raise ValueError(f"{supplied} contains duplicate object annotation IDs")
    omitted = [item for item in objects if item['id'] not in ids]
    if omitted:
        annotations['objects'] = [item for item in objects if item['id'] in ids]
    corrections = []
    if 'entrance' in levels:
        for place in annotations.get('pointsOfInterest', []):
            if place.get('id') == 'south-public-entrance' and place.get('camera', {}).get('level') == 'lower':
                place['camera']['level'] = 'entrance'
                corrections.append({'id': place['id'], 'field': 'camera.level', 'from': 'lower', 'to': 'entrance'})
    audit = {'schemaVersion': 1, 'modelId': model_id,
             'sourceAnnotationSha256': hashlib.sha256(source_bytes).hexdigest(),
             'retainedObjectNotes': len(objects) - len(omitted), 'corrections': corrections,
             'omittedObjects': omitted,
             'omissionReason': 'No exported building mesh has this ID; original notes retained here for author review.'}
    write_json(metadata_file.with_name('viewer.import.json'), audit)
    write_json(metadata_file, annotations)
    if omitted:
        print(f"Warning: {model_id}: omitted {len(omitted)} stale object notes; "
              "see viewer.import.json. No geometry was removed.", file=sys.stderr, flush=True)


def import_bim_assets(folder, output, doc, model_id, source_hash):
    """Bind optional reviewed products and validated IFC to this source revision."""
    optional = {}
    supplied_bim = handoff_file(folder, 'bim.json')
    if not supplied_bim and handoff_file(folder, 'building.ifczip'):
        raise ValueError('IFC delivery requires its reviewed BIM registry')
    if supplied_bim:
        registry = read_json(supplied_bim)
        validation = validate_registry(registry, doc, model_id, source_hash)
        # Source-hashed filenames keep the previously published catalog usable
        # if a later step fails or the same version is imported again.
        registry_file = output / ('bim-' + hash_file(supplied_bim)[:16] + '.json')
        write_json(registry_file, registry)
        write_json(registry_file.with_suffix('.validation.json'), validation)
        optional['bim'] = './' + registry_file.relative_to(MODELS).as_posix()
        # An IFC package is optional and must include its source-bound validation
        # record. Geometry/schema checking belongs to the pinned offline exporter.
        ifc_zip = handoff_file(folder, 'building.ifczip')
        ifc_report = handoff_file(folder, 'building.ifc.report.json')
        if ifc_zip:
            if not ifc_report: raise ValueError('IFC delivery is missing its validation record')
            report = read_json(ifc_report)
            if (report.get('sourceSha256') != source_hash or report.get('schemaValidation') != 'PASS'
                or report.get('geometryErrors') != [] or report.get('ifczipSha256') != hash_file(ifc_zip)
                or report.get('registrySha256') != hash_file(supplied_bim)
                or report.get('scope') != 'registered' or report.get('products') != validation['products']
                or report.get('geometryProductsChecked') != validation['products']):
                raise ValueError('IFC validation does not match this source/registry/package')
            if ifc_zip.stat().st_size >= 100 * 1024 * 1024: raise ValueError('IFCZIP exceeds the repository file budget')
            target = output / ('reference-' + hash_file(ifc_zip)[:16] + '.ifczip')
            shutil.copy2(ifc_zip, target)
            write_json(target.with_suffix('.report.json'), report)
            optional['ifc'] = './' + target.relative_to(MODELS).as_posix()
    return optional


def import_version(folder, blender):
    location = model_location(folder)
    sources = list((folder / "model").glob("*.blend"))
    if len(sources) != 1:
        raise ValueError(f"Expected one .blend in {folder / 'model'}, found {len(sources)}")
    source = sources[0]
    source_hash = hash_file(source)
    model_id = "bundeshaus-" + folder.name
    output = MODELS / model_id
    building, building_report = export(source, output, "building", source_hash, model_id, blender)
    surroundings, _ = export(source, output, "surroundings", source_hash, model_id, blender)
    building, building_report = optimize_asset(building)
    surroundings, _ = optimize_asset(surroundings)
    if hash_file(source) != source_hash:
        raise RuntimeError("Source changed while importing; catalog entry was not updated")
    doc = glb_document(building)
    mesh_nodes = [node for node in doc["nodes"] if "mesh" in node]
    ids = {node.get("extras", {}).get("viewer_id") for node in mesh_nodes}
    levels = model_levels(mesh_nodes)
    optional = import_bim_assets(folder, output, doc, model_id, source_hash)
    metadata_file = output / "viewer.json"
    supplied = handoff_file(folder, "viewer.json")
    if supplied:
        import_annotations(supplied, metadata_file, model_id, ids, levels)
    elif not metadata_file.exists():
        annotations = read_json(MODELS / "bundeshaus-v003/viewer.json")
        annotations["modelId"] = model_id
        annotations["objects"] = [entry for entry in annotations["objects"] if entry["id"] in ids]
        # Imported fallback bookmarks are explicitly provisional; authors can replace them.
        for key in ("views", "pointsOfInterest"):
            annotations[key] = [entry for entry in annotations[key] if entry["camera"].get("level", "all") in levels]
        for entry in annotations["pointsOfInterest"]:
            entry["description"] = "Provisional viewpoint adapted from v003. Model coverage may differ in this iteration."
        write_json(metadata_file, annotations)
    return {
        "id": model_id, "label": folder.name, "version": int(folder.name[1:]),
        "building": "./" + building.relative_to(MODELS).as_posix(),
        "surroundings": "./" + surroundings.relative_to(MODELS).as_posix(),
        "metadata": "./" + metadata_file.relative_to(MODELS).as_posix(),
        "sourceSha256": source_hash, "levels": levels,
        "meshCount": building_report["glb"]["meshNodes"],
        "location": location,
        **optional,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("versions", type=Path, help="Source folder containing v001, v002, etc.")
    parser.add_argument("--blender")
    parser.add_argument("--only", action="append", metavar="vNNN", help="Import only this saved version; repeat to select several")
    args = parser.parse_args()
    folders = sorted((folder for folder in args.versions.iterdir() if folder.is_dir() and re.fullmatch(r"v\d+", folder.name)), key=lambda folder: int(folder.name[1:]))
    if not folders:
        parser.error("No version folders found")
    if args.only:
        missing = set(args.only) - {folder.name for folder in folders}
        if missing:
            parser.error("Unknown versions: " + ", ".join(sorted(missing)))
        folders = [folder for folder in folders if folder.name in args.only]
    catalog_path = MODELS / "catalog.json"
    entries = {entry["id"]: entry for entry in read_json(catalog_path)["models"]} if catalog_path.is_file() else {}
    failed = []
    for folder in folders:
        try:
            entry = import_version(folder, args.blender)
            entries[entry["id"]] = entry
            write_json(catalog_path, {"schemaVersion": 1, "models": sorted(entries.values(), key=lambda entry: entry["version"], reverse=True)})
            prune_unused_assets(catalog_path, {entry["id"]})
        except (OSError, ValueError, RuntimeError, subprocess.CalledProcessError) as error:
            failed.append(folder.name)
            print(f"Could not import {folder.name}: {error}", file=sys.stderr, flush=True)
            if isinstance(error, subprocess.CalledProcessError):
                detail = error.stderr or error.stdout or ""
                print((detail.decode(errors="replace") if isinstance(detail, bytes) else detail)[-4000:], file=sys.stderr)
    print(f"Catalog contains {len(entries)} versions. Failed: {', '.join(failed) or 'none'}", flush=True)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
