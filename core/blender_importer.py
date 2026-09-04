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


# 转换器在 OBJ 里用 `o` 语句分区，对象名就是这三个；材质名前缀是 `o` 分割失效时的兜底。
SECTION_OBJECT_NAMES = {
    "Blocks": "方块",
    "BlockEntities": "方块实体",
    "Entities": "实体",
}


def _section_of_object(obj) -> str:
    """
    判断一个导入对象属于哪个分区。

    优先用对象名（Blender 会把 OBJ 的 `o Blocks` 导成名为 Blocks / Blocks.001 的对象）；
    对象名认不出时退回材质名前缀 —— 实体材质一律是 `entity_*`，这是转换器保证的。
    """
    base = obj.name.split(".")[0]
    if base in SECTION_OBJECT_NAMES:
        return base
    for slot in getattr(obj, "material_slots", []):
        mat = slot.material
        if mat is not None and mat.name.split(".")[0].startswith("entity_"):
            return "Entities"
    return ""


def _ensure_child_collection(name: str, parent_collection):
    coll = bpy.data.collections.get(name)
    if coll is None:
        coll = bpy.data.collections.new(name)
    if name not in {c.name for c in parent_collection.children}:
        try:
            parent_collection.children.link(coll)
        except RuntimeError:
            pass
    return coll


def split_objects_into_sections(objects: List, parent_collection) -> Dict[str, int]:
    """
    按分区把导入对象分到子集合。返回 {子集合名: 对象数}。

    认不出分区的对象留在父集合里，不强行归类 —— 宁可少分也不要放错地方。
    """
    buckets: Dict[str, List] = {}
    for obj in objects:
        section = _section_of_object(obj)
        if not section:
            continue
        buckets.setdefault(section, []).append(obj)
    if len(buckets) <= 1:
        return {}

    result: Dict[str, int] = {}
    for section, objs in buckets.items():
        label = SECTION_OBJECT_NAMES.get(section, section)
        child = _ensure_child_collection(f"{parent_collection.name}_{label}", parent_collection)
        _move_objects_to_collection(objs, child)
        result[child.name] = len(objs)
    return result


def create_entity_placeholders(placeholders: List[Dict], parent_collection, reference_objects: List) -> List:
    """
    给没有内置模型的实体（生物等）建空物体占位。

    空物体不参与渲染，只标记「这里原本站着一只什么」，用户可以自己把模型放上去。
    坐标要跟着模型一起经历缩放 / 居中 / 贴地，所以用参考对象的世界变换换算，
    而不是直接用转换器给的原始坐标。

    🔴 坐标直接喂转换器给的 OBJ 空间值，**不要自己做 Y-up→Z-up 转换**：
    `wm.obj_import` 的轴转换是放在导入对象的 transform 里的（绕 X 轴 +90°），
    没有烘焙进顶点数据，所以 `matrix_world` 已经包含了那一步。自己再转一次
    会让占位物体的 Y/Z 互换，表现成「站到楼外面或者陷进地里」。
    """
    if not placeholders:
        return []

    # 导入对象上带着 axis conversion + _apply_layout_adjustments 的整体变换
    matrix = reference_objects[0].matrix_world.copy() if reference_objects else None

    created: List = []
    for item in placeholders:
        pos = item.get("pos")
        if not isinstance(pos, (list, tuple)) or len(pos) != 3:
            continue
        entity_id = str(item.get("id", "entity")).replace("minecraft:", "")
        empty = bpy.data.objects.new(f"占位_{entity_id}", None)
        empty.empty_display_type = "PLAIN_AXES"
        empty.empty_display_size = 0.5
        local = Vector((float(pos[0]), float(pos[1]), float(pos[2])))
        empty.location = matrix @ local if matrix is not None else local
        rotation_z = -float(item.get("yaw", 0.0) or 0.0)
        empty.rotation_euler = (0.0, 0.0, rotation_z * 3.141592653589793 / 180.0)
        try:
            parent_collection.objects.link(empty)
            created.append(empty)
        except RuntimeError:
            bpy.data.objects.remove(empty, do_unlink=True)
    return created


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
    split_collections: bool = False,
    entity_placeholders: List[Dict] = None,
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

    # 占位空物体要在布局调整之后建，才能跟着模型一起缩放 / 居中 / 贴地
    placeholder_objects: List = []
    if entity_placeholders:
        placeholder_objects = create_entity_placeholders(
            entity_placeholders, target_collection, new_objects
        )

    section_counts: Dict[str, int] = {}
    if split_collections:
        section_counts = split_objects_into_sections(new_objects, target_collection)

    materials = material_utils.iter_object_materials(new_objects)
    fixed = material_utils.fix_materials(materials)

    return {
        "objects": new_objects,
        "collection": target_collection,
        "materials": materials,
        "fixed": fixed,
        "section_counts": section_counts,
        "placeholders": placeholder_objects,
        "placeholder_count": len(placeholder_objects),
    }


def clear_collections_by_prefix(prefix: str = "Mine2Blend") -> int:
    """清空全部：删所有投影子合集（含对象）+ 删空的父合集。返回删除对象数。"""
    clean_prefix = path_utils.safe_stem_from_path(prefix or "Mine2Blend", "Mine2Blend")
    removed = 0
    for coll in [c for c in bpy.data.collections if c.name.startswith(clean_prefix + "_")]:
        # 上一轮可能已经把它作为子集合连带删掉了
        if coll.name not in bpy.data.collections:
            continue
        removed += _remove_collection_tree(coll)
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
    """
    返回所有投影子合集（按名排序），供面板列表管理隐藏 / 删除。

    只取父合集的直接子级 —— 分区子集合（`<投影>_方块` 等）名字同样以前缀打头，
    按前缀匹配会把它们也列成独立投影。
    """
    clean_prefix = path_utils.safe_stem_from_path(prefix or "Mine2Blend", "Mine2Blend")
    parent = bpy.data.collections.get(clean_prefix)
    if parent is not None:
        children = [c for c in parent.children if c.name.startswith(clean_prefix + "_")]
    else:
        children = [c for c in bpy.data.collections if c.name.startswith(clean_prefix + "_")]
    return sorted(children, key=lambda c: c.name.lower())


def section_collections_of(collection) -> List:
    """某个投影集合下的分区子集合（方块 / 方块实体 / 实体）。"""
    if collection is None:
        return []
    labels = set(SECTION_OBJECT_NAMES.values())
    return [c for c in collection.children if c.name.rsplit("_", 1)[-1] in labels]


def _remove_collection_tree(coll) -> int:
    """删除一个集合及其所有子集合里的对象，返回删除的对象数。"""
    removed = 0
    for child in list(coll.children):
        removed += _remove_collection_tree(child)
    for obj in list(coll.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
        removed += 1
    try:
        bpy.data.collections.remove(coll)
    except Exception:
        pass
    return removed


def delete_projection_collection(collection_name: str, prefix: str = "Mine2Blend") -> int:
    """删除单个投影子合集及其对象；父合集空了一并删除。返回删除对象数。"""
    removed = 0
    coll = bpy.data.collections.get(collection_name)
    if coll is not None:
        removed = _remove_collection_tree(coll)
    clean_prefix = path_utils.safe_stem_from_path(prefix or "Mine2Blend", "Mine2Blend")
    parent = bpy.data.collections.get(clean_prefix)
    if parent is not None and not parent.children and not parent.objects:
        try:
            bpy.data.collections.remove(parent)
        except Exception:
            pass
    return removed


def clear_collection_by_name(collection_name: str) -> int:
    """
    只清空指定集合里的对象，不动其它 Mine2Blend 集合（避免导入新建筑覆盖旧建筑）。
    分区子集合一并清掉，否则重新导入时上一轮的方块 / 实体会留在子集合里。
    """
    removed = 0
    coll = bpy.data.collections.get(collection_name)
    if coll is not None:
        for child in list(coll.children):
            removed += _remove_collection_tree(child)
        for obj in list(coll.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
            removed += 1
    return removed


def _objects_recursive(coll) -> List:
    """集合及其所有子集合里的对象。分区子集合启用后，投影集合自身的 objects 是空的。"""
    out = list(coll.objects)
    for child in coll.children:
        out.extend(_objects_recursive(child))
    return out


def mine2blend_objects_excluding(prefix: str, exclude_collection_name: str) -> List:
    """收集除指定集合外的所有 Mine2Blend 导入对象，用于自动并排定位。"""
    clean_prefix = path_utils.safe_stem_from_path(prefix or "Mine2Blend", "Mine2Blend")
    parent = bpy.data.collections.get(clean_prefix)
    candidates = list(parent.children) if parent is not None else [
        c for c in bpy.data.collections if c.name.startswith(clean_prefix + "_")
    ]
    out: List = []
    for coll in candidates:
        if coll.name == exclude_collection_name:
            continue
        out.extend(_objects_recursive(coll))
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
            return _objects_recursive(coll)
    clean_prefix = path_utils.safe_stem_from_path(prefix or "Mine2Blend", "Mine2Blend")
    parent = bpy.data.collections.get(clean_prefix)
    if parent is not None:
        return _objects_recursive(parent)
    out = []
    for coll in bpy.data.collections:
        if coll.name == clean_prefix or coll.name.startswith(clean_prefix + "_"):
            out.extend(list(coll.objects))
    return out


def register():
    pass


def unregister():
    pass
