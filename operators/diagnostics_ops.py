import os
import subprocess

import bpy

from ..core import converter_bridge, diagnostics, path_utils


def _open_folder(path: str) -> None:
    if not path or not os.path.isdir(path):
        return
    if os.name == "nt":
        os.startfile(path)
        return
    subprocess.Popen(["open" if os.uname().sysname == "Darwin" else "xdg-open", path])


class MINE2BLEND_OT_check_converter(bpy.types.Operator):
    bl_idname = "mine2blend.check_converter"
    bl_label = "检查转换器"
    bl_description = "检查 Mine2Blend 转换器是否可用"

    def execute(self, context):
        settings = context.scene.mine2blend
        status = converter_bridge.get_converter_status(context)
        settings.last_error = "" if status.ready else status.message
        settings.last_message = status.message
        self.report({"INFO" if status.ready else "WARNING"}, status.message)
        return {"FINISHED"}


class MINE2BLEND_OT_copy_diagnostics(bpy.types.Operator):
    bl_idname = "mine2blend.copy_diagnostics"
    bl_label = "复制诊断信息"
    bl_description = "把 Mine2Blend 环境与最近导入信息复制到剪贴板"

    def execute(self, context):
        text = diagnostics.build_diagnostics_text(context)
        context.window_manager.clipboard = text
        context.scene.mine2blend.last_message = "诊断信息已复制"
        self.report({"INFO"}, "诊断信息已复制")
        return {"FINISHED"}


class MINE2BLEND_OT_open_cache_folder(bpy.types.Operator):
    bl_idname = "mine2blend.open_cache_folder"
    bl_label = "打开缓存目录"
    bl_description = "在系统文件管理器中打开 Mine2Blend 缓存目录"

    def execute(self, context):
        cache_root = path_utils.get_cache_root(context)
        _open_folder(cache_root)
        return {"FINISHED"}


class MINE2BLEND_OT_open_output_folder(bpy.types.Operator):
    bl_idname = "mine2blend.open_output_folder"
    bl_label = "打开最近输出目录"
    bl_description = "在系统文件管理器中打开最近一次转换输出的 OBJ / MTL 目录"

    def execute(self, context):
        settings = context.scene.mine2blend
        output_dir = settings.last_output_dir
        if not output_dir or not os.path.isdir(output_dir):
            settings.last_error_category = "输出目录不可用"
            settings.last_error = "最近输出目录不存在，请先成功导入一次"
            self.report({"WARNING"}, settings.last_error)
            return {"CANCELLED"}
        _open_folder(output_dir)
        settings.last_error = ""
        settings.last_error_category = ""
        settings.last_message = "已打开最近输出目录"
        self.report({"INFO"}, settings.last_message)
        return {"FINISHED"}


_CLASSES = (
    MINE2BLEND_OT_check_converter,
    MINE2BLEND_OT_copy_diagnostics,
    MINE2BLEND_OT_open_cache_folder,
    MINE2BLEND_OT_open_output_folder,
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
