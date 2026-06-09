import bpy

from ..core import converter_bridge, diagnostics
from .root_panel import PANEL_CATEGORY


class MINE2BLEND_PT_diagnostics(bpy.types.Panel):
    bl_label = "诊断"
    bl_idname = "MINE2BLEND_PT_diagnostics"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = PANEL_CATEGORY
    bl_parent_id = "MINE2BLEND_PT_root"
    bl_options = {"DEFAULT_CLOSED"}

    def draw(self, context):
        layout = self.layout
        settings = context.scene.mine2blend
        status = converter_bridge.get_converter_status(context)

        head = layout.column(align=True)
        head.label(text=f"平台 {status.platform_key} · 转换器{'可用' if status.ready else '未就绪'}")
        if settings.last_converter_version:
            head.label(text=f"转换器版本 {settings.last_converter_version}")

        ops = layout.column(align=True)
        row = ops.row(align=True)
        row.operator("mine2blend.check_converter", icon="CHECKMARK", text="检查")
        row.operator("mine2blend.open_cache_folder", icon="FILE_FOLDER", text="缓存")
        if settings.last_output_dir:
            row.operator("mine2blend.open_output_folder", icon="FILE_FOLDER", text="输出")
        ops.operator("mine2blend.copy_diagnostics", icon="COPYDOWN", text="复制诊断信息")

        if settings.last_error_category:
            row = layout.row()
            row.alert = True
            row.label(text=f"错误：{settings.last_error_category}", icon="ERROR")

        if settings.last_block_count or settings.last_face_count:
            layout.separator()
            info = layout.column(align=True)
            info.label(text="最近导入", icon="INFO")
            info.label(
                text=f"方块 {settings.last_block_count} · 面 {settings.last_face_count} · 材质 {settings.last_material_count}"
            )
            info.label(
                text=f"尺寸 {settings.last_width}×{settings.last_height}×{settings.last_depth} · 对象 {settings.last_imported_object_count}"
            )
            info.label(
                text=(
                    f"耗时 总{diagnostics.format_seconds(settings.last_total_seconds)}"
                    f" / 转换{diagnostics.format_seconds(settings.last_conversion_seconds)}"
                    f" / 导入{diagnostics.format_seconds(settings.last_import_seconds)}"
                )
            )
            info.label(
                text=(
                    f"材质修复 Closest{settings.last_material_fix_closest}"
                    f" / 补色{settings.last_material_fix_tint}"
                    f" / Alpha{settings.last_material_fix_alpha}"
                )
            )
            if settings.last_material_issue_count:
                info.label(text=f"材质风险 {settings.last_material_issue_count} 项（见复制诊断）")


_CLASSES = (MINE2BLEND_PT_diagnostics,)


def register():
    for cls in _CLASSES:
        bpy.utils.register_class(cls)


def unregister():
    for cls in reversed(_CLASSES):
        try:
            bpy.utils.unregister_class(cls)
        except Exception:
            pass
