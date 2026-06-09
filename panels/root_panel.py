import bpy

from ..core import converter_bridge

PANEL_CATEGORY = "MCBlock"


class MINE2BLEND_PT_root(bpy.types.Panel):
    bl_label = "Mine2Blend"
    bl_idname = "MINE2BLEND_PT_root"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = PANEL_CATEGORY

    def draw(self, context):
        layout = self.layout
        status = converter_bridge.get_converter_status(context)
        settings = context.scene.mine2blend

        col = layout.column(align=True)
        icon = "CHECKMARK" if status.ready else "ERROR"
        col.label(text="转换器就绪" if status.ready else status.message, icon=icon)
        if settings.last_message:
            col.label(text=settings.last_message)
        if settings.last_error:
            row = col.row()
            row.alert = True
            row.label(text=settings.last_error, icon="ERROR")


_CLASSES = (MINE2BLEND_PT_root,)


def register():
    for cls in _CLASSES:
        bpy.utils.register_class(cls)


def unregister():
    for cls in reversed(_CLASSES):
        try:
            bpy.utils.unregister_class(cls)
        except Exception:
            pass
