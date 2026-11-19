"""用后台 Blender 和插件的正式入口验证营火导入。

用法：blender -b --factory-startup --python-exit-code 1 --python 此文件 --
      --addon-parent 插件上级目录 --work-dir 独立临时目录
"""

import argparse
import gzip
from pathlib import Path
import struct
import sys

import addon_utils
import bpy


CAMPFIRES = (
    ("campfire", True),
    ("campfire", False),
    ("soul_campfire", True),
    ("soul_campfire", False),
)
SPACING = 3


def write_schematic(path):
    def nbt_string(value):
        encoded = value.encode("utf-8")
        return struct.pack(">H", len(encoded)) + encoded

    def tag(kind, name, payload):
        return bytes([kind]) + nbt_string(name) + payload

    palette = [tag(3, "minecraft:air", struct.pack(">i", 0))]
    blocks = bytearray((len(CAMPFIRES)-1) * SPACING + 1)
    for index, (name, lit) in enumerate(CAMPFIRES):
        state = f"minecraft:{name}[facing=north,lit={str(lit).lower()},waterlogged=false,signal_fire=false]"
        palette.append(tag(3, state, struct.pack(">i", index + 1)))
        blocks[index * SPACING] = index + 1

    tags = [
        tag(3, "Version", struct.pack(">i", 2)),
        tag(2, "Width", struct.pack(">h", len(blocks))),
        tag(2, "Height", struct.pack(">h", 1)),
        tag(2, "Length", struct.pack(">h", 1)),
        tag(10, "Palette", b"".join(palette) + b"\0"),
        tag(7, "BlockData", struct.pack(">i", len(blocks)) + blocks),
    ]
    path.write_bytes(gzip.compress(tag(10, "Schematic", b"".join(tags) + b"\0"), mtime=0))


def geometry(mesh):
    return (
        tuple(tuple(vertex.co) for vertex in mesh.vertices),
        tuple(tuple(poly.vertices) for poly in mesh.polygons),
        tuple(tuple(corner.uv) for corner in mesh.uv_layers["UVMap"].data),
    )


def run(addon_parent, work):
    sys.dont_write_bytecode = True
    sys.path.insert(0, str(addon_parent.resolve()))
    addon_utils.enable("mcblock_mine2blend", default_set=True, persistent=False)
    prefs = bpy.context.preferences.addons["mcblock_mine2blend"].preferences
    prefs.cache_root_path = str(work / "cache")

    projection = work / "campfire-states.schem"
    write_schematic(projection)
    settings = bpy.context.scene.mine2blend
    settings.projection_path = str(projection)
    settings.emissive_enabled = True
    settings.center_model = False
    settings.place_on_ground = False
    settings.split_collections = True
    result = bpy.ops.mine2blend.import_litematic()
    assert result == {"FINISHED"} and not settings.last_error, settings.last_error

    imported = bpy.data.collections[settings.last_collection_name]
    meshes = [obj for obj in imported.all_objects if obj.type == "MESH"]
    assert len(meshes) == 1
    mesh = meshes[0].data
    corner_weights = mesh.attributes["M2B_BlockEmission"]
    assert corner_weights.domain == "CORNER"
    states = [set() for _ in CAMPFIRES]
    for poly in mesh.polygons:
        x = sum(mesh.vertices[i].co.x for i in poly.vertices) / len(poly.vertices)
        index = int(x) // SPACING
        material_name = mesh.materials[poly.material_index].name.split(".")[0]
        assert material_name == CAMPFIRES[index][0]
        states[index].update(corner_weights.data[i].value for i in poly.loop_indices)
    assert states == [{float(lit)} for _, lit in CAMPFIRES], states

    for mat in mesh.materials:
        nodes = mat.node_tree.nodes
        assert nodes["M2B Emissive Block State"].attribute_name == corner_weights.name
        shader = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
        strength = shader.inputs["Emission Strength"].links[0].from_node
        assert strength.name == "M2B Emissive Strength" and strength.inputs[1].default_value > 0

    front = mesh.uv_layers["M2B_FrontUV"].data
    back = mesh.uv_layers["M2B_BackUV"].data
    assert any(tuple(front[i].uv) != tuple(back[i].uv) for i in range(len(front)))
    original_geometry = geometry(mesh)
    obj_path, = Path(settings.last_output_dir).glob("*.obj")
    existing = set(bpy.data.objects)
    result = bpy.ops.wm.obj_import(filepath=str(obj_path), forward_axis="NEGATIVE_Z", up_axis="Y")
    assert result == {"FINISHED"}
    raw_obj, = set(bpy.data.objects) - existing
    assert original_geometry == geometry(raw_obj.data), "导入后原始几何或 UVMap 发生变化"
    print(f"CAMPFIRE_IMPORT_PASS {bpy.app.version_string}: {states}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--addon-parent", required=True, type=Path)
    parser.add_argument("--work-dir", required=True, type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    args.work_dir.mkdir(parents=True, exist_ok=False)
    assert bpy.app.background
    run(args.addon_parent, args.work_dir.resolve())
