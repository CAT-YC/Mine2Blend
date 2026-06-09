import bpy

from ..core import blender_importer, material_utils


class MINE2BLEND_OT_fix_materials(bpy.types.Operator):
    bl_idname = "mine2blend.fix_materials"
    bl_label = "修复材质"
    bl_description = "重跑 Closest、透明和染色处理，用于修正导入后的材质显示"

    def execute(self, context):
        settings = context.scene.mine2blend
        if settings.fix_selected_only:
            objects = list(context.selected_objects)
            if not objects:
                settings.last_error = "没有选中任何对象"
                self.report({"WARNING"}, settings.last_error)
                return {"CANCELLED"}
        else:
            objects = blender_importer.objects_for_last_or_prefix(
                settings.last_collection_name,
                settings.collection_prefix,
            )
            if not objects:
                settings.last_error = "没有找到 Mine2Blend 导入对象"
                self.report({"WARNING"}, settings.last_error)
                return {"CANCELLED"}

        materials = material_utils.iter_object_materials(objects)
        if not materials:
            settings.last_error = "目标对象上没有可处理的材质"
            self.report({"WARNING"}, settings.last_error)
            return {"CANCELLED"}

        fixed = material_utils.fix_materials(materials)
        settings.last_material_count = fixed.get("materials", 0)
        settings.last_material_fix_closest = fixed.get("closest", 0)
        settings.last_material_fix_tint = fixed.get("tint", 0)
        settings.last_material_fix_alpha = fixed.get("alpha", 0)
        settings.last_material_fix_alpha_mode = fixed.get("alpha_mode", 0)
        settings.last_error = ""
        settings.last_message = (
            f"材质修复完成：{fixed.get('materials', 0)} 个材质，"
            f"{fixed.get('closest', 0)} 个贴图切为 Closest，"
            f"{fixed.get('tint', 0)} 个材质补色，"
            f"{fixed.get('alpha', 0)} 个 Alpha 连接"
        )
        self.report({"INFO"}, settings.last_message)
        return {"FINISHED"}


_CLASSES = (MINE2BLEND_OT_fix_materials,)


def register():
    for cls in _CLASSES:
        bpy.utils.register_class(cls)


def unregister():
    for cls in reversed(_CLASSES):
        try:
            bpy.utils.unregister_class(cls)
        except Exception:
            pass
