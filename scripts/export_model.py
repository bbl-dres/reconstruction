"""Export a static .blend to a self-contained GLB and an inspection report.

Run with ordinary Python; it launches Blender in the background. The source is
only read. No source scripts are run and the .blend is never saved.
"""
import argparse
from collections import Counter
import hashlib
import gzip
import json
import os
import re
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import uuid


def sha256(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


PROCEDURAL_NODES = {"TEX_NOISE", "TEX_VORONOI", "TEX_MUSGRAVE", "TEX_WAVE", "TEX_BRICK"}


def conversion_recipe(profile):
    return {"exporterSha256": sha256(Path(__file__).resolve()),
            "profileSha256": hashlib.sha256(json.dumps(profile, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()}


def procedural_dependencies(socket):
    """Trace this input only, including group ports, reroutes and muted nodes.

    An unused Noise node, or noise feeding roughness, must not disconnect an
    independent image feeding base color. Cycles terminate conservatively.
    """
    found, visited = set(), set()

    def matching(sockets, port):
        return next((item for item in sockets if item.identifier == port.identifier), None) or sockets.get(port.name)

    def input_links(port, context):
        for link in port.links:
            output(link.from_socket, context)

    def output(port, context):
        key = (port.as_pointer(), tuple(node.as_pointer() for node in context))
        if key in visited:
            return
        visited.add(key)
        node = port.node
        if node.mute:
            for link in node.internal_links:
                if link.to_socket == port:
                    input_links(link.from_socket, context)
        elif node.type in PROCEDURAL_NODES:
            found.add(node.type)
        elif node.type == "GROUP" and node.node_tree:
            for end in node.node_tree.nodes:
                if end.type == "GROUP_OUTPUT" and end.is_active_output:
                    inner = matching(end.inputs, port)
                    if inner:
                        input_links(inner, context + (node,))
        elif node.type == "GROUP_INPUT" and context:
            outer = matching(context[-1].inputs, port)
            if outer:
                input_links(outer, context[:-1])
        else:
            for item in node.inputs:
                input_links(item, context)

    input_links(socket, ())
    return found


def apply_material_fallbacks(materials):
    """Replace unsupported procedural branches, preserving independent images."""
    warnings = []
    for mat in materials:
        if not mat.node_tree:
            continue
        fallbacks, types = [], set()
        for node in mat.node_tree.nodes:
            if node.type != "BSDF_PRINCIPLED":
                continue
            for name in ("Base Color", "Normal", "Roughness", "Metallic"):
                socket = node.inputs.get(name)
                dependencies = procedural_dependencies(socket) if socket else set()
                if dependencies:
                    types.update(dependencies)
                    fallbacks.append(name)
                    for link in list(socket.links):
                        mat.node_tree.links.remove(link)
        if fallbacks:
            warnings.append({"material": mat.name, "proceduralNodes": sorted(types), "constantFallbackInputs": fallbacks})
    return warnings


def read_glb_bytes(path):
    data = path.read_bytes()
    return gzip.decompress(data) if data[:2] == b'\x1f\x8b' else data


def report_file(path):
    return (path.with_suffix('') if path.suffix == '.gz' else path).with_suffix('.report.json')


def glb_summary(path):
    """Check packaging and summarize runtime geometry; not a glTF validator."""
    data = read_glb_bytes(path)
    magic, version, length = struct.unpack_from("<4sII", data)
    if (magic, version, length) != (b"glTF", 2, len(data)):
        raise ValueError("Invalid GLB header")
    json_size, kind = struct.unpack_from("<II", data, 12)
    if kind != 0x4E4F534A:
        raise ValueError("GLB has no JSON chunk")
    doc = json.loads(data[20:20 + json_size])
    if any("uri" in item for item in doc.get("buffers", []) + doc.get("images", [])):
        raise ValueError("Expected a self-contained GLB, found external resources")
    nodes = doc.get("nodes", [])
    meshes = doc.get("meshes", [])
    accessors = doc.get("accessors", [])
    triangles = 0
    primitives = 0
    for node in nodes:
        if "mesh" not in node:
            continue
        for primitive in meshes[node["mesh"]]["primitives"]:
            primitives += 1
            if primitive.get("mode", 4) == 4:
                accessor = primitive.get("indices", primitive["attributes"]["POSITION"])
                triangles += accessors[accessor]["count"] // 3
    return {
        "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(), "nodes": len(nodes),
        "meshNodes": sum("mesh" in node for node in nodes),
        "uniqueMeshes": len(meshes), "renderedPrimitives": primitives,
        "trianglesAcrossInstances": triangles,
        "materials": len(doc.get("materials", [])), "embeddedImages": len(doc.get("images", [])),
        "taggedMeshNodes": sum("viewer_id" in node.get("extras", {}) for node in nodes if "mesh" in node),
        "dollhouseHiddenMeshNodes": sum(bool(node.get("extras", {}).get("viewer_dollhouse_hidden")) for node in nodes if "mesh" in node),
        "extensionsUsed": doc.get("extensionsUsed", []),
    }


def worker(args):
    import bpy
    from mathutils import Vector

    source = args.source.resolve()
    output = args.output.resolve()
    profile = json.loads(args.profile.read_text(encoding="utf-8")) if args.profile else {}
    source_hash = sha256(source)
    bpy.ops.wm.open_mainfile(filepath=str(source), load_ui=False, use_scripts=False)
    scene = bpy.context.scene
    source_scene = {"objects": len(scene.objects), "meshes": sum(o.type == "MESH" for o in scene.objects),
                    "textObjects": sum(o.type == "FONT" for o in scene.objects)}
    if abs(scene.unit_settings.scale_length - 1.0) > 1e-6:
        raise ValueError("This exporter requires 1 Blender unit = 1 metre; normalize an export copy first")

    # Effective collection render visibility includes ancestors. Shared objects
    # are included if at least one collection path is renderable.
    renderable = set()
    def collect(collection, parent_visible=True):
        visible = parent_visible and not collection.hide_render
        if visible:
            renderable.update(obj.name for obj in collection.objects)
        for child in collection.children:
            collect(child, visible)
    collect(scene.collection)
    include = tuple(profile.get("includeCollectionPrefixes", []))
    required_groups = set(profile.get("requireCollectionGroupCoverage", []))
    omitted = set()
    objects = []
    for obj in scene.objects:
        if obj.type not in {"MESH", "FONT"} or obj.hide_render or obj.name not in renderable:
            continue
        if include and not any(c.name.startswith(include) for c in obj.users_collection):
            for collection in obj.users_collection:
                group = re.match(r"^(\d+)[a-z]*\s*\|", collection.name)
                if group and int(group[1]) in required_groups:
                    omitted.add(collection.name)
            continue
        objects.append(obj)
    if omitted:
        raise ValueError("Export profile omits renderable building collections: " + ", ".join(sorted(omitted)) + ". Update the profile before importing this iteration.")
    if not objects:
        raise ValueError("No renderable meshes match this profile")

    # glTF has no editable text primitive. Evaluate selected lettering in this
    # disposable Blender process, leaving the saved master and its FONT data
    # intact. Apply the same profile/visibility gate as ordinary mesh objects.
    text_conversions = []
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for index, original in enumerate(objects):
        if original.type != "FONT":
            continue
        name, world = original.name, original.matrix_world.copy()
        mesh = bpy.data.meshes.new_from_object(original.evaluated_get(depsgraph),
                                              preserve_all_data_layers=True, depsgraph=depsgraph)
        if not mesh or not mesh.polygons:
            raise ValueError("Visible text has no exportable geometry: " + name)
        original.name = name + " [editable export source]"
        converted = bpy.data.objects.new(name, mesh)
        for collection in original.users_collection:
            collection.objects.link(converted)
        converted.parent = original.parent
        converted.matrix_world = world
        for key, value in original.items():
            converted[key] = value
        converted["viewer_source_object_type"] = "FONT"
        converted["viewer_text"] = original.data.body
        objects[index] = converted
        text_conversions.append({"sourceName": name, "text": original.data.body,
                                 "vertices": len(mesh.vertices), "polygons": len(mesh.polygons)})
    bpy.context.view_layer.update()

    materials = {slot.material.name: slot.material for obj in objects for slot in obj.material_slots if slot.material}
    # Explicit coarse preview fallbacks; this does not bake procedural graphs.
    material_warnings = apply_material_fallbacks(materials.values())

    images = {}
    for mat in materials.values():
        for node in mat.node_tree.nodes if mat.node_tree else []:
            if node.type == "TEX_IMAGE" and node.image:
                img = node.image
                if not img.packed_file and img.source == "FILE" and not Path(bpy.path.abspath(img.filepath)).is_file():
                    raise FileNotFoundError(f"Missing texture: {img.name}: {img.filepath}")
                images[img.name] = {"name": img.name, "size": list(img.size), "packed": bool(img.packed_file)}

    points = []
    groups = Counter()
    ids = set()
    for obj in objects:
        collections = sorted(c.name for c in obj.users_collection)
        groups.update(collections)
        # Names are a fallback only; authored IDs persist when names change.
        obj["viewer_id"] = str(obj.get("viewer_id") or "legacy-" + hashlib.sha256(obj.name.encode()).hexdigest()[:20])
        obj["viewer_source_name"] = obj.name
        if obj["viewer_id"] in ids:
            raise ValueError(f"Duplicate viewer_id: {obj['viewer_id']}")
        ids.add(obj["viewer_id"])
        obj["viewer_source_collections"] = collections
        if "viewer_role" not in obj:
            obj["viewer_role"] = next((rule["role"] for rule in profile.get("nameRoleRules", []) if re.search(rule["pattern"], obj.name, re.IGNORECASE)),
                next((role for prefix, role in profile.get("collectionRoles", {}).items() if any(c.startswith(prefix) for c in collections)), "unclassified"))
        if "viewer_dollhouse_hidden" not in obj:
            obj["viewer_dollhouse_hidden"] = (
                any(c.startswith(tuple(profile.get("dollhouseHideCollectionPrefixes", []))) for c in collections)
                or any(fragment.casefold() in obj.name.casefold() for fragment in profile.get("dollhouseHideNameFragments", []))
            )
        points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)

    minimum = [min(point[i] for point in points) for i in range(3)]
    maximum = [max(point[i] for point in points) for i in range(3)]
    def unhide(layer):
        layer.exclude = False
        layer.hide_viewport = False
        layer.collection.hide_select = False
        layer.collection.hide_viewport = False
        for child in layer.children:
            unhide(child)
    unhide(bpy.context.view_layer.layer_collection)
    for obj in bpy.context.view_layer.objects:
        obj.select_set(False)
    for obj in objects:
        obj.hide_viewport = False
        obj.hide_select = False
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    output.parent.mkdir(parents=True, exist_ok=True)
    # Write to a temporary sibling so failed exports leave the last GLB intact.
    staged = output.with_name(f".{output.stem}-{uuid.uuid4().hex}.glb")
    try:
        result = bpy.ops.export_scene.gltf(
            filepath=str(staged), check_existing=False, export_format="GLB",
            use_selection=True, use_visible=False, use_renderable=False,
            export_extras=True, export_yup=True, export_apply=True,
            export_texcoords=True, export_normals=True, export_materials="EXPORT",
            export_image_format="AUTO", export_animations=False, export_cameras=False,
            export_lights=False, export_skins=False, export_morph=False,
            # Separate glTF nodes may share geometry while retaining each ID.
            # GPU batches need an explicit per-instance metadata contract first.
            export_gpu_instances=False,
            export_draco_mesh_compression_enable=False,
        )
        if "FINISHED" not in result:
            raise RuntimeError(f"Export failed: {result}")
        summary = glb_summary(staged)
        if summary["taggedMeshNodes"] != len(objects) or summary["meshNodes"] != len(objects):
            raise ValueError("Export did not preserve the selected mesh objects and IDs")
        if sha256(source) != source_hash:
            raise RuntimeError("Source changed during export; rerun after the model is saved")
        os.replace(staged, output)
    finally:
        if staged.exists():
            staged.unlink()
    report = {
        "schemaVersion": 1, "id": profile.get("id", source.stem),
        "title": profile.get("title", source.stem), "asset": output.name,
        "source": {"file": source.name, "bytes": source.stat().st_size, "sha256": source_hash},
        "conversion": conversion_recipe(profile),
        "blenderVersion": bpy.app.version_string,
        "coordinates": {"units": "metres", "sourceUp": "Z", "exportUp": "Y", "mapping": "Blender (x,y,z) -> glTF (x,z,-y)", "recentered": False},
        "sourceScene": source_scene,
        "evaluatedText": text_conversions,
        "selection": {"meshes": len(objects), "collections": dict(sorted(groups.items())), "boundsBlender": {"min": minimum, "max": maximum}},
        "glb": summary, "sourceImageTextures": list(images.values()),
        "proceduralMaterialFallbacks": material_warnings, "notes": profile.get("notes", []),
        "validation": "GLB packaging, embedded resource, mesh-count and metadata checks passed. Browser rendering and performance remain to be tested.",
    }
    output.with_suffix(".report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("EXPORT_RESULT " + json.dumps(summary), flush=True)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--profile", type=Path)
    parser.add_argument("--blender", help="Blender executable, otherwise BLENDER_PATH or PATH")
    parser.add_argument("--worker", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    if not args.source.is_file() or args.source.suffix.lower() != ".blend":
        parser.error("source must be an existing .blend file")
    if args.output.suffix.lower() != ".glb":
        parser.error("output must have a .glb extension")
    if args.profile and not args.profile.is_file():
        parser.error("profile does not exist")
    if args.worker:
        worker(args)
        return
    blender = args.blender or os.environ.get("BLENDER_PATH") or shutil.which("blender")
    if not blender and os.name == "nt":
        candidates = list((Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "Blender Foundation").glob("Blender */blender.exe"))
        if candidates:
            blender = str(max(candidates, key=lambda path: tuple(int(n) for n in re.findall(r"\d+", path.parent.name))))
    if not blender:
        parser.error("Set --blender or BLENDER_PATH to the Blender executable")
    command = [blender, "--background", "--factory-startup", "--disable-autoexec", "--python-exit-code", "1", "--python", str(Path(__file__).resolve()), "--", str(args.source.resolve()), "--output", str(args.output.resolve()), "--worker"]
    if args.profile:
        command += ["--profile", str(args.profile.resolve())]
    raise SystemExit(subprocess.run(command, check=False).returncode)


if __name__ == "__main__":
    main()
