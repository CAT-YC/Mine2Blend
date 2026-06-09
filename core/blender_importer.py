from mathutils import Vector
from typing import Dict, Iterable, List, Set

import bpy

from . import material_utils, path_utils


class ImporterError(Exception):
    """Blender 导入层错误，消息可直接展示给用户。"""


def _snapshot_object_names() -> Set[str]:
    return {obj.name for obj in bpy.data.objects}


def _objects_added_since(snapshot: Set[str]) -> List:
    return [obj for obj in bpy.data.objects if obj.name not in snapshot]


def _ensure_parent_collection(parent_name: str = "Mine2Blend"):
    """大合集：场景集合下的 Mine2Blend 父合集，所有投影子合集都挂在它下面。"""
    name = path_utils.safe_stem_from_path(parent_name or "Mine2Blend", "Mine2Blend")
    coll = bpy.data.collections.get(name)
    if coll is None:
        coll = bpy.data.collections.new(name)
    if name not in {c.name for c in bpy.context.scene.collection.children}:
        try:
            bpy.context.scene.collection.children.link(coll)
        except RuntimeError:
            pass
    return coll


def _ensure_collection(name: str, parent_name: str = "Mine2Blend"):
    """投影子合集：挂在大合集下，而不是直接挂场景根。"""
    parent = _ensure_parent_collection(parent_name)
    coll = bpy.data.collections.get(name)
    if coll is None:
        coll = bpy.data.collections.new(name)
    # 确保子合集挂在父合集下；若旧版本曾把它挂在场景根，解除场景根直挂
    if name not in {c.name for c in parent.children}:
        try:
            parent.children.link(coll)
        except RuntimeError:
            pass
    if name in {c.name for c in bpy.context.scene.collection.children}:
        try:
            bpy.context.scene.collection.children.unlink(coll)
        except RuntimeError:
            pass
    return coll


def _move_objects_to_collection(objects: Iterable, target_collection) -> None:
    for obj in objects:
        for src_coll in list(obj.users_collection):
            try:
                src_coll.objects.unlink(obj)
            except RuntimeError:
                pass
        try:
            target_collection.objects.link(obj)
        except RuntimeError:
            pass


def _world_bounds(objects: Iterable):
    points = []
    for obj in objects:
        if not hasattr(obj, "bound_box"):
            continue
        for corner in obj.bound_box:
            points.append(obj.matrix_world @ Vector(corner))
    if not points:
        return None
    min_v = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    max_v = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    return min_v, max_v


def _translate_objects(objects: Iterable, delta: Vector) -> None:
    for obj in objects:
        obj.location += delta


def _apply_layout_adjustments(objects: List, scale_factor: float, center_model: bool, place_on_ground: bool) -> None:
    if not objects:
        return
    scale = max(float(scale_factor or 1.0), 0.001)
    if abs(scale - 1.0) > 0.0001:
        for obj in objects:
            obj.scale = (obj.scale.x * scale, obj.scale.y * scale, obj.scale.z * scale)
        bpy.context.view_layer.update()

    bounds = _world_bounds(objects)
    if bounds is None:
        return
    min_v, max_v = bounds
    delta = Vector((0.0, 0.0, 0.0))
    if center_model:
        delta.x = -((min_v.x + max_v.x) / 2.0)
        delta.y = -((min_v.y + max_v.y) / 2.0)
    if place_on_ground:
        delta.z = -min_v.z
    if delta.length > 0:
        _translate_objects(objects, delta)
        bpy.context.view_layer.update()


def import_obj_file(
    obj_path: str,
    collection_name: str,
    scale_factor: float = 1.0,
    center_model: bool = True,
    place_on_ground: bool = True,
    forward_axis: str = "NEGATIVE_Z",
    up_axis: str = "Y",
    parent_name: str = "Mine2Blend",
) -> Dict[str, object]:
    if not obj_path:
        raise ImporterError("OBJ 路径为空")
    if not bpy.path.basename(obj_path).lower().endswith(".obj"):
        raise ImporterError("只接受 .obj 文件")

    snapshot = _snapshot_object_names()
    target_collection = _ensure_collection(collection_name, parent_name)

    try:
        result = bpy.ops.wm.obj_import(
            filepath=obj_path,
            forward_axis=forward_axis,
            up_axis=up_axis,
        )
    except Exception as exc:
        raise ImporterError(f"调用 OBJ 导入失败：{exc}")

    if "CANCELLED" in result:
        raise ImporterError("OBJ 导入被 Blender 取消")

    new_objects = _objects_added_since(snapshot)
    if not new_objects:
        raise ImporterError("OBJ 导入完成但未生成新对象")

    _move_objects_to_collection(new_objects, target_collection)
    _apply_layout_adjustments(new_objects, scale_factor, center_model, place_on_ground)

    materials = material_utils.iter_object_materials(new_objects)
    fixed = material_utils.fix_materials(materials)

    return {
        "objects": new_objects,
        "collection": target_collection,
        "materials": materials,
        "fixed": fixed,
    }


def clear_collections_by_prefix(prefix: str = "Mine2Blend") -> int:
    """清空全部：删所有投影子合集（含对象）+ 删空的父合集。返回删除对象数。"""
    clean_prefix = path_utils.safe_stem_from_path(prefix or "Mine2Blend", "Mine2Blend")
    removed = 0
    for coll in [c for c in bpy.data.collections if c.name.startswith(clean_prefix + "_")]:
        for obj in list(coll.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
            removed += 1
        try:
            bpy.data.collections.remove(coll)
        except Exception:
            pass
    parent = bpy.data.collections.get(clean_prefix)
    if parent is not None:
        for obj in list(parent.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
            removed += 1
        if not parent.children and not parent.objects:
            try:
                bpy.data.collections.remove(parent)
            except Exception:
                pass
    return removed


def list_projection_collections(prefix: str = "Mine2Blend") -> List:
    """返回所有投影子合集（按名排序），供面板列表管理隐藏 / 删除。"""
    clean_prefix = path_utils.safe_stem_from_path(prefix or "Mine2Blend", "Mine2Blend")
    children = [c for c in bpy.data.collections if c.name.startswith(clean_prefix + "_")]
    return sorted(children, key=lambda c: c.name.lower())


def delete_projection_collection(collection_name: str, prefix: str = "Mine2Blend") -> int:
    """删除单个投影子合集及其对象；父合集空了一并删除。返回删除对象数。"""
    removed = 0
    coll = bpy.data.collections.get(collection_name)
    if coll is not None:
        for obj in list(coll.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
            removed += 1
        try:
            bpy.data.collections.remove(coll)
        except Exception:
            pass
    clean_prefix = path_utils.safe_stem_from_path(prefix or "Mine2Blend", "Mine2Blend")
    parent = bpy.data.collections.get(clean_prefix)
    if parent is not None and not parent.children and not parent.objects:
        try:
            bpy.data.collections.remove(parent)
        except Exception:
            pass
    return removed


def clear_collection_by_name(collection_name: str) -> int:
    """只清空指定集合里的对象，不动其它 Mine2Blend 集合（避免导入新建筑覆盖旧建筑）。"""
    removed = 0
    coll = bpy.data.collections.get(collection_name)
    if coll is not None:
        for obj in list(coll.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
            removed += 1
    return removed


def mine2blend_objects_excluding(prefix: str, exclude_collection_name: str) -> List:
    """收集除指定集合外的所有 Mine2Blend 导入对象，用于自动并排定位。"""
    clean_prefix = path_utils.safe_stem_from_path(prefix or "Mine2Blend", "Mine2Blend")
    out: List = []
    for coll in bpy.data.collections:
        if coll.name == exclude_collection_name:
            continue
        if coll.name.startswith(clean_prefix + "_"):
            out.extend(list(coll.objects))
    return out


def arrange_beside_existing(new_objects: List, existing_objects: List, gap: float = 2.0) -> bool:
    """把新导入的对象整体平移到已有 Mine2Blend 对象的 +X 一侧，避免堆在原点重叠。"""
    if not new_objects or not existing_objects:
        return False
    existing_bounds = _world_bounds(existing_objects)
    new_bounds = _world_bounds(new_objects)
    if existing_bounds is None or new_bounds is None:
        return False
    shift_x = (existing_bounds[1].x + gap) - new_bounds[0].x
    if abs(shift_x) < 1e-6:
        return False
    _translate_objects(new_objects, Vector((shift_x, 0.0, 0.0)))
    bpy.context.view_layer.update()
    return True


def objects_for_last_or_prefix(last_collection_name: str, prefix: str) -> List:
    if last_collection_name:
        coll = bpy.data.collections.get(last_collection_name)
        if coll is not None:
            return list(coll.objects)
    clean_prefix = path_utils.safe_stem_from_path(prefix or "Mine2Blend", "Mine2Blend")
    out = []
    for coll in bpy.data.collections:
        if coll.name == clean_prefix or coll.name.startswith(clean_prefix + "_"):
            out.extend(list(coll.objects))
    return out


def register():
    pass


def unregister():
    pass
