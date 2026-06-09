import bpy

from .root_panel import PANEL_CATEGORY


class MINE2BLEND_PT_settings(bpy.types.Panel):
    bl_label = "导入设置"
    bl_idname = "MINE2BLEND_PT_settings"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = PANEL_CATEGORY
    bl_parent_id = "MINE2BLEND_PT_root"
    bl_options = {"DEFAULT_CLOSED"}

    def draw(self, context):
        layout = self.layout
        settings = context.scene.mine2blend

        col = layout.column(align=True)
        col.prop(settings, "scale_factor")
        col.prop(settings, "center_model")
        col.prop(settings, "place_on_ground")
        col.separator()
        col.prop(settings, "clear_before_import")
        col.prop(settings, "auto_arrange")
        col.separator()
        col.prop(settings, "collection_prefix")


_CLASSES = (MINE2BLEND_PT_settings,)


def register():
    for cls in _CLASSES:
        bpy.utils.register_class(cls)


def unregister():
    for cls in reversed(_CLASSES):
        try:
            bpy.utils.unregister_class(cls)
        except Exception:
            pass
