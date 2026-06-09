import bpy

from .root_panel import PANEL_CATEGORY


class MINE2BLEND_PT_website(bpy.types.Panel):
    bl_label = "网站入口"
    bl_idname = "MINE2BLEND_PT_website"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = PANEL_CATEGORY
    bl_parent_id = "MINE2BLEND_PT_root"
    bl_options = {"DEFAULT_CLOSED"}

    def draw(self, context):
        layout = self.layout
        col = layout.column(align=True)
        col.operator("mine2blend.open_home", icon="URL", text="打开 MCBlock")
        col.operator("mine2blend.open_buildings", icon="ASSET_MANAGER", text="浏览建筑库")
        col.operator("mine2blend.open_studio", icon="TOOL_SETTINGS", text="网站在线编辑器")
        col.operator("mine2blend.open_blender_page", icon="HELP", text="下载 / 使用说明")


_CLASSES = (MINE2BLEND_PT_website,)


def register():
    for cls in _CLASSES:
        bpy.utils.register_class(cls)


def unregister():
    for cls in reversed(_CLASSES):
        try:
            bpy.utils.unregister_class(cls)
        except Exception:
            pass
