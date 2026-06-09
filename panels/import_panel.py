import bpy

from ..core import blender_importer, converter_bridge
from .root_panel import PANEL_CATEGORY


class MINE2BLEND_PT_import(bpy.types.Panel):
    bl_label = "导入投影"
    bl_idname = "MINE2BLEND_PT_import"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = PANEL_CATEGORY
    bl_parent_id = "MINE2BLEND_PT_root"
    bl_options = set()

    def draw(self, context):
        layout = self.layout
        settings = context.scene.mine2blend
        status = converter_bridge.get_converter_status(context)

        # 选择文件 + 导入按钮
        col = layout.column(align=True)
        col.prop(settings, "projection_path", text="")
        col.operator("mine2blend.choose_litematic", icon="FILE_FOLDER", text="选择文件")
        run = col.row(align=True)
        run.scale_y = 1.5
        run.operator("mine2blend.import_litematic", icon="IMPORT", text="导入投影")

        # 反馈（只在有内容时占位，平时不占空间）
        if settings.last_error:
            row = layout.row()
            row.alert = True
            row.label(text=settings.last_error, icon="ERROR")
        elif settings.last_performance_warning:
            row = layout.row()
            row.alert = True
            row.label(text=settings.last_performance_warning[:90], icon="INFO")

        # 投影管理列表
        prefix = settings.collection_prefix or "Mine2Blend"
        projections = blender_importer.list_projection_collections(prefix)
        if projections:
            layout.separator()
            layout.label(text=f"已导入投影 · {len(projections)}", icon="OUTLINER_COLLECTION")
            items = layout.column(align=True)
            for coll in projections:
                row = items.row(align=True)
                eye_icon = "HIDE_ON" if coll.hide_viewport else "HIDE_OFF"
                row.prop(coll, "hide_viewport", text="", icon=eye_icon, emboss=False)
                if coll.name.startswith(prefix + "_"):
                    display = coll.name[len(prefix) + 1:]
                else:
                    display = coll.name
                row.label(text=display)
                op = row.operator("mine2blend.delete_projection", text="", icon="TRASH", emboss=False)
                op.collection_name = coll.name
            clear = layout.row()
            clear.operator("mine2blend.clear_imports", text="清空全部", icon="X")

        if not status.ready:
            warn = layout.column(align=True)
            warn.alert = True
            warn.label(text="转换器尚未就绪", icon="ERROR")
            warn.label(text=status.message)


_CLASSES = (MINE2BLEND_PT_import,)


def register():
    for cls in _CLASSES:
        bpy.utils.register_class(cls)


def unregister():
    for cls in reversed(_CLASSES):
        try:
            bpy.utils.unregister_class(cls)
        except Exception:
            pass
