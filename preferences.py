import bpy

ADDON_PACKAGE = __package__ or "mcblock_mine2blend"


class Mine2BlendPreferences(bpy.types.AddonPreferences):
    bl_idname = ADDON_PACKAGE

    website_url: bpy.props.StringProperty(
        name="网站地址",
        description="Mine2Blend 快捷入口使用的网站地址",
        default="https://mcblock.top",
    )

    cache_root_path: bpy.props.StringProperty(
        name="缓存目录（可选）",
        description="留空时使用 Blender 用户数据目录下的 Mine2Blend 缓存",
        default="",
        subtype="DIR_PATH",
    )

    converter_path: bpy.props.StringProperty(
        name="转换器路径（可选）",
        description="内测调试用；留空时使用插件 resources/converter 下的内置转换器",
        default="",
        subtype="FILE_PATH",
    )

    log_excerpt_lines: bpy.props.IntProperty(
        name="诊断日志行数",
        description="诊断面板展示最近多少行转换日志",
        default=80,
        min=20,
        max=500,
    )

    def draw(self, context):
        layout = self.layout
        layout.label(text="Mine2Blend 本机设置")
        layout.prop(self, "website_url")
        layout.separator()
        layout.label(text="导入缓存")
        layout.prop(self, "cache_root_path")
        layout.separator()
        layout.label(text="转换器")
        layout.prop(self, "converter_path")
        layout.prop(self, "log_excerpt_lines")
        box = layout.box()
        box.label(text="M2 内测已内置 Windows x64 runtime 转换器")
        box.label(text="本插件不需要网站账号，也不保存任何密钥")


def get_preferences(context=None) -> Mine2BlendPreferences:
    ctx = context or bpy.context
    return ctx.preferences.addons[ADDON_PACKAGE].preferences


def register():
    bpy.utils.register_class(Mine2BlendPreferences)


def unregister():
    bpy.utils.unregister_class(Mine2BlendPreferences)
