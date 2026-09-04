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

        # 选择文件
        col = layout.column(align=True)
        col.prop(settings, "projection_path", text="")
        col.operator("mine2blend.choose_litematic", icon="FILE_FOLDER", text="选择文件")

        # 导入内容：勾选范围 + 数量预览
        layout.separator()
        header = layout.row(align=True)
        header.label(text="导入内容")
        header.operator("mine2blend.probe_projection", text="", icon="FILE_REFRESH", emboss=False)

        source_path = (settings.projection_path or "").strip()
        has_probe = bool(settings.probe_source_path) and settings.probe_source_path == source_path

        scope = layout.column(align=True)
        row = scope.row(align=True)
        row.prop(settings, "include_blocks")
        if has_probe:
            row.label(text=f"{settings.probe_blocks:,}")

        row = scope.row(align=True)
        row.prop(settings, "include_block_entities")
        if has_probe:
            row.label(text=f"{settings.probe_block_entities:,}")

        row = scope.row(align=True)
        row.prop(settings, "include_entities")
        if has_probe:
            row.label(text=f"{settings.probe_entities:,}")

        note = layout.column(align=True)
        note.scale_y = 0.8
        note.label(text="方块实体 = 箱子/床/告示牌/旗帜/头颅 等")
        note.label(text="自带实体 = 画/展示框/盔甲架/生物/船/矿车")
        if has_probe and settings.probe_entities_placeholder > 0:
            note.label(
                text=f"其中 {settings.probe_entities_placeholder} 个无内置模型，建空物体占位",
                icon="INFO",
            )

        if settings.include_entities:
            layout.prop(settings, "entity_placeholder_empties")
        layout.prop(settings, "split_collections")

        run = layout.row(align=True)
        run.scale_y = 1.5
        run.enabled = bool(
            settings.include_blocks or settings.include_block_entities or settings.include_entities
        )
        run.operator("mine2blend.import_litematic", icon="IMPORT", text="导入投影")
        if not run.enabled:
            warn = layout.row()
            warn.alert = True
            warn.label(text="至少要勾选一项导入内容", icon="ERROR")

        # 上一次导入的实体结果
        if settings.last_entity_summary or settings.last_entity_placeholder_count:
            info = layout.column(align=True)
            info.scale_y = 0.8
            if settings.last_entity_summary:
                info.label(text=f"自带实体：{settings.last_entity_summary}", icon="OUTLINER_OB_IMAGE")
            if settings.last_entity_placeholder_count:
                info.label(text=f"占位空物体：{settings.last_entity_placeholder_count} 个", icon="EMPTY_AXIS")
            if settings.last_unknown_painting_variants:
                warn = info.row()
                warn.alert = True
                warn.label(text=f"画尺寸未知：{settings.last_unknown_painting_variants}", icon="ERROR")

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

                # 分区子集合：各自带一个可见性开关，方便单独出图
                for child in blender_importer.section_collections_of(coll):
                    sub = items.row(align=True)
                    sub.separator(factor=1.6)
                    child_icon = "HIDE_ON" if child.hide_viewport else "HIDE_OFF"
                    sub.prop(child, "hide_viewport", text="", icon=child_icon, emboss=False)
                    sub.label(text=child.name.rsplit("_", 1)[-1])
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
