"""Real Blender integration checks; generates only a tiny .work fixture.

blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python tests/export-blender.py
"""
from pathlib import Path
import json
import sys
import tempfile
import struct
import zlib
from types import SimpleNamespace
import bpy

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from export_model import apply_material_fallbacks, worker, sha256


def material(name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    return mat, mat.node_tree.nodes, mat.node_tree.links, mat.node_tree.nodes.get("Principled BSDF")


mat, nodes, links, bsdf = material("Image and procedural roughness")
image = nodes.new("ShaderNodeTexImage")
noise = nodes.new("ShaderNodeTexNoise")
bump = nodes.new("ShaderNodeBump")
links.new(image.outputs["Color"], bsdf.inputs["Base Color"])
links.new(noise.outputs["Fac"], bsdf.inputs["Roughness"])
links.new(noise.outputs["Fac"], bump.inputs["Height"])
links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
result = apply_material_fallbacks([mat])
assert bsdf.inputs["Base Color"].is_linked
assert not bsdf.inputs["Normal"].is_linked and not bsdf.inputs["Roughness"].is_linked
assert set(result[0]["constantFallbackInputs"]) == {"Normal", "Roughness"}
print("PASS: independent base-color image survives procedural roughness and bump")

mat, nodes, links, bsdf = material("Unused noise")
nodes.new("ShaderNodeTexNoise")
image = nodes.new("ShaderNodeTexImage")
links.new(image.outputs["Color"], bsdf.inputs["Base Color"])
assert apply_material_fallbacks([mat]) == []
assert bsdf.inputs["Base Color"].is_linked
print("PASS: disconnected procedural nodes do not affect images")

mat, nodes, links, bsdf = material("Group ports")
group = bpy.data.node_groups.new("Independent outputs", "ShaderNodeTree")
group.interface.new_socket(name="Color", in_out="INPUT", socket_type="NodeSocketColor")
group.interface.new_socket(name="Color", in_out="OUTPUT", socket_type="NodeSocketColor")
group.interface.new_socket(name="Noise", in_out="OUTPUT", socket_type="NodeSocketFloat")
incoming = group.nodes.new("NodeGroupInput")
outgoing = group.nodes.new("NodeGroupOutput")
noise = group.nodes.new("ShaderNodeTexNoise")
group.links.new(incoming.outputs["Color"], outgoing.inputs["Color"])
group.links.new(noise.outputs["Fac"], outgoing.inputs["Noise"])
instance = nodes.new("ShaderNodeGroup"); instance.node_tree = group
image = nodes.new("ShaderNodeTexImage")
links.new(image.outputs["Color"], instance.inputs["Color"])
links.new(instance.outputs["Color"], bsdf.inputs["Base Color"])
links.new(instance.outputs["Noise"], bsdf.inputs["Roughness"])
result = apply_material_fallbacks([mat])
assert bsdf.inputs["Base Color"].is_linked and not bsdf.inputs["Roughness"].is_linked
assert result[0]["constantFallbackInputs"] == ["Roughness"]
print("PASS: group outputs traced independently through their input ports")

mat, nodes, links, bsdf = material("Muted bypass")
image = nodes.new("ShaderNodeTexImage")
noise = nodes.new("ShaderNodeTexNoise")
mix = nodes.new("ShaderNodeMixRGB"); mix.mute = True
links.new(image.outputs["Color"], mix.inputs[1])
links.new(noise.outputs["Color"], mix.inputs[2])
links.new(mix.outputs[0], bsdf.inputs["Base Color"])
assert apply_material_fallbacks([mat]) == []
assert bsdf.inputs["Base Color"].is_linked
print("PASS: muted procedural branch follows Blender's bypass")

# End-to-end: source hash, embedded image, shared geometry and per-object IDs.
bpy.ops.wm.read_factory_settings(use_empty=True)
folder = ROOT / ".work/export-regression"
folder.mkdir(parents=True, exist_ok=True)
temporary = folder / "tmp"
temporary.mkdir(exist_ok=True)
tempfile.tempdir = str(temporary)
mat, nodes, links, bsdf = material("Shared chair material")
image = nodes.new("ShaderNodeTexImage")
# Use an ordinary packed PNG, as supplied by the model author. Generated images
# take a separate Blender re-encoding path that is outside this regression.
def chunk(kind, payload):
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload))
texture = folder / "fixture.png"
texture.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 8, 8, 8, 2, 0, 0, 0))
                    + chunk(b"IDAT", zlib.compress((b"\x00" + bytes([77, 102, 204]) * 8) * 8)) + chunk(b"IEND", b""))
image.image = bpy.data.images.load(str(texture))
image.image.pack()
noise = nodes.new("ShaderNodeTexNoise")
links.new(image.outputs["Color"], bsdf.inputs["Base Color"])
links.new(noise.outputs["Fac"], bsdf.inputs["Roughness"])
bpy.ops.mesh.primitive_cube_add()
original = bpy.context.object
original.name = "Chair 1"; original.data.materials.append(mat)
original["viewer_id"] = "chair-1"
original["viewer_role"] = "furniture"
original["viewer_floor_ids"] = ["principal"]
for index in [2, 3]:
    obj = original.copy()  # shared mesh data, equivalent to Alt+D
    obj.name = f"Chair {index}"; obj.location.x = index * 3
    obj["viewer_id"] = f"chair-{index}"
    bpy.context.collection.objects.link(obj)
source = folder / "linked-chairs.blend"
# One new collection simulates a model iteration adding another building layer.
added = bpy.data.collections.new("07z | New test wing")
bpy.context.scene.collection.children.link(added)
third = bpy.data.objects['Chair 3']
for collection in list(third.users_collection):
    collection.objects.unlink(third)
added.objects.link(third)
bpy.ops.wm.save_as_mainfile(filepath=str(source), check_existing=False)
source_hash = sha256(source)
output = folder / "linked-chairs.glb"
worker(SimpleNamespace(source=source, output=output, profile=None))
assert sha256(source) == source_hash
data = output.read_bytes()
doc = json.loads(data[20:20 + int.from_bytes(data[12:16], "little")])
objects = [node for node in doc["nodes"] if "mesh" in node]
assert len(objects) == 3 and len(doc["meshes"]) == 1
assert {node["mesh"] for node in objects} == {0}
assert {node["extras"]["viewer_id"] for node in objects} == {"chair-1", "chair-2", "chair-3"}
assert all(node["extras"]["viewer_floor_ids"] == ["principal"] for node in objects)
assert "baseColorTexture" in doc["materials"][0]["pbrMetallicRoughness"]
assert len(doc["images"]) == 1 and "bufferView" in doc["images"][0]
assert "EXT_mesh_gpu_instancing" not in doc.get("extensionsUsed", [])
print("PASS: converter keeps one shared mesh, three selectable IDs, embedded albedo and unchanged source")

profile = folder / 'incomplete-profile.json'
profile.write_text(json.dumps({'includeCollectionPrefixes': ['02 |'], 'requireCollectionGroupCoverage': [7]}), encoding='utf-8')
try:
    worker(SimpleNamespace(source=source, output=folder / 'must-not-export.glb', profile=profile))
except ValueError as error:
    assert '07z | New test wing' in str(error) and 'omits renderable building collections' in str(error)
else:
    raise AssertionError('A newly added building collection must not disappear silently')
assert sha256(source) == source_hash
print('PASS: an uncovered building collection stops export with its name and leaves the source unchanged')
