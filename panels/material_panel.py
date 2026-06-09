import bpy

from .root_panel import PANEL_CATEGORY


class MINE2BLEND_PT_material(bpy.types.Panel):
    bl_label = "材质修复"
    bl_idname = "MINE2BLEND_PT_material"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = PANEL_CATEGORY
    bl_parent_id = "MINE2BLEND_PT_root"
    bl_options = {"DEFAULT_CLOSED"}

    def draw(self, context):
        layout = self.layout
        settings = context.scene.mine2blend

        col = layout.column(align=True)
        col.prop(settings, "fix_selected_only")
        run = col.row(align=True)
        run.scale_y = 1.3
        run.operator("mine2blend.fix_materials", icon="NODE_MATERIAL", text="重跑材质修复")


_CLASSES = (MINE2BLEND_PT_material,)


def register():
    for cls in _CLASSES:
        bpy.utils.register_class(cls)


def unregister():
    for cls in reversed(_CLASSES):
        try:
            bpy.utils.unregister_class(cls)
        except Exception:
            pass
