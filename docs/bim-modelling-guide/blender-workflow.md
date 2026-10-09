# Working in Blender

[← BIM modelling guide](README.md) · [Element rules](element-rules.md) · [Mistakes and checks](mistakes-and-checks.md)

How to drive Blender so that the model follows the guide and stays reproducible. Agents work in two ways, and both are allowed:

- **Background scripts** (`blender --background <file> --python <script>`): the build. Every model change ends up here, in `work/build/scripts/` ([conventions](../conventions.md#script-prefixes-in-buildscripts)).
- **Live Blender through an MCP server** (for example [mcp-for-blender](https://github.com/ahujasid/mcp-for-blender), or a Bonsai MCP for native IFC): inspecting, trying an edit, looking at the result. Fast and convenient, but a hand edit in a live session is not reproducible until it is in a script.

Other tools (Bonsai/BlenderBIM, Rhino, Revit, FreeCAD) are possible for a building if its brief says so; the result must still meet the guide and come through the same pipeline.

## Rules for live work through MCP

These come from the repository's own incidents ([pitfalls](../pitfalls.md#process)) and from how the better public Blender and IFC agent servers are designed ([research](research/agent-skills.md#patterns-worth-adopting)).

1. **Inspect before you edit.** Ask the scene first: what objects, which collection, which `viewer_*` properties, where they stand. Use [inspect_objects.py](examples/blender/inspect_objects.py) to get one line of facts per object (storey, height above floor, scale, mirroring, open edges, n-gons, shared mesh, modifiers) instead of guessing from a screenshot.
2. **Small steps that print what they did.** One call does one thing (create a wall, place a door type, fix one stair junction) and prints the facts needed to check it. Long jobs (a full rebuild, an export, a render series) run as background scripts: long MCP calls time out.
3. **Every edit becomes script or data.** An MCP edit is a draft. Before the next build, move it into the build script or into the research data it reads (`research/derived/…json`), rebuild from scratch and check that the result is the same. A `.blend` changed by hand only is lost at the next rebuild.
4. **Never create twice.** Look up the object by `viewer_id` first; delete the old object *and its mesh* before re-creating; keep the id. Re-running a creation call produces `.001` duplicates.
5. **Types, not copies.** Place repeated products as linked duplicates of the prototype in the `Types` collection (`proto.copy()` keeping `.data`, or `Alt+D`), never `Shift+D` or `bpy.ops.object.duplicate()` without `linked=True`.
6. **Look after every visible change.** Take an aimed view of the place you changed (top view of the storey, the elevation, the junction) and actually read it; then the overview. A passing property check does not show a stair standing 20 cm from its wall.
7. **Write version- and language-proof code.** Find shader nodes by `type` (`BSDF_PRINCIPLED`), not by their displayed name; read enum values at runtime; set colours on node inputs. Prefer `bpy.data` and `bmesh` over `bpy.ops` operators that depend on the UI context.
8. **Save deliberately.** MCP edits bypass Blender's undo history in some servers; save the working file before a risky edit and after a good one (`build/model/`), never into a frozen release.
9. **Keep evidence private.** Turn off telemetry and prompt or screenshot upload in the MCP server's settings (check them; some collect usage data by default), and run the server only on a single-user machine: these servers execute arbitrary Python from a local port without authentication. Plans, tour images and photographs in `work/` must not leave the machine.
10. **No generated or downloaded architecture.** Do not use the servers' asset search, AI 3D generation or model import for building parts. Textures only with a recorded open licence (for example CC0).

## Building blocks

| Task | How | Example |
|---|---|---|
| Walls from plan lines | One extruded quad mesh per straight segment, origin at the start of the face line, openings as quads around the hole | [build_walls_from_plan.py](examples/blender/build_walls_from_plan.py) `wall_mesh()` |
| Door and window types | Prototype in the hidden `Types` collection; placements are linked duplicates with `viewer_host_id` | same script, `TYPES` |
| Properties | `ob["viewer_floor_ids"] = ["eg"]` (lists stay lists, booleans stay booleans) | same script, `tag()` |
| Hygiene before export | scale 1, determinant > 0, no modifiers on instances, manifold, outward normals, quads | same script, `hygiene()`; [tools/model-checks/hygiene.py](../../tools/model-checks/hygiene.py) |
| GLB check | instances share meshes, ids on every node, no GPU instancing | same script, `export()` |
| Facts about objects | one JSON line per object | [inspect_objects.py](examples/blender/inspect_objects.py) |
| Rendering in background mode | Cycles with few samples (Workbench renders blank without a display) | [pitfalls](../pitfalls.md#process) |

## Scene setup

- Units metric, unit scale 1.0, length in metres; Z up.
- Collections as in the [conventions](../conventions.md#names): `<Part>_<FLOOR>`, `Site`, `Context`, `Types` (hidden), `Reference` (hidden underlays and cameras), and `Spaces` (hidden room volumes, not exported to the GLB).
- The model sits at the local origin of the [shared control package](federated-models.md#the-shared-control-package); never at map coordinates.
- Reference images and point clouds go in `Reference`, never in exported collections.
