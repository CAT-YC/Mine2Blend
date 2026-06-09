import webbrowser

import bpy


def _base_url(context) -> str:
    package = __package__.split(".operators")[0]
    prefs = context.preferences.addons[package].preferences
    return (prefs.website_url or "https://mcblock.top").rstrip("/")


def _open_url(context, url: str) -> None:
    try:
        bpy.ops.wm.url_open(url=url)
    except Exception:
        webbrowser.open(url)


class _OpenWebsiteBase(bpy.types.Operator):
    bl_options = {"REGISTER"}
    path = ""

    def execute(self, context):
        _open_url(context, _base_url(context) + self.path)
        return {"FINISHED"}


class MINE2BLEND_OT_open_home(_OpenWebsiteBase):
    bl_idname = "mine2blend.open_home"
    bl_label = "打开 MCBlock"
    bl_description = "在浏览器打开 MCBlock 网站"
    path = ""


class MINE2BLEND_OT_open_buildings(_OpenWebsiteBase):
    bl_idname = "mine2blend.open_buildings"
    bl_label = "浏览建筑库"
    bl_description = "在浏览器打开 MCBlock 建筑库"
    path = "/buildings"


class MINE2BLEND_OT_open_studio(_OpenWebsiteBase):
    bl_idname = "mine2blend.open_studio"
    bl_label = "打开网站在线编辑器"
    bl_description = "在浏览器打开 MCBlock 网站在线编辑器"
    path = "/studio"


class MINE2BLEND_OT_open_blender_page(_OpenWebsiteBase):
    bl_idname = "mine2blend.open_blender_page"
    bl_label = "下载插件 / 使用说明"
    bl_description = "在浏览器打开 Mine2Blend 下载和使用说明页"
    path = "/blender"


_CLASSES = (
    MINE2BLEND_OT_open_home,
    MINE2BLEND_OT_open_buildings,
    MINE2BLEND_OT_open_studio,
    MINE2BLEND_OT_open_blender_page,
)


def register():
    for cls in _CLASSES:
        bpy.utils.register_class(cls)


def unregister():
    for cls in reversed(_CLASSES):
        try:
            bpy.utils.unregister_class(cls)
        except Exception:
            pass
