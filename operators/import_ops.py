import os
import time

import bpy
from bpy_extras.io_utils import ImportHelper

from ..core import blender_importer, converter_bridge, diagnostics, material_audit, path_utils


def _set_progress(context, step: str, value: int) -> None:
    settings = context.scene.mine2blend
    settings.last_progress_step = step
    try:
        context.window_manager.progress_update(value)
    except Exception:
        pass


def _fail(settings, category: str, message: str) -> None:
    settings.last_error_category = category
    settings.last_error = message


class MINE2BLEND_OT_choose_litematic(bpy.types.Operator, ImportHelper):
    bl_idname = "mine2blend.choose_litematic"
    bl_label = "选择投影文件"
    bl_description = "选择一个 .litematic 或 .schem 投影文件"

    filename_ext = ".litematic"
    filter_glob: bpy.props.StringProperty(default="*.litematic;*.schem", options={"HIDDEN"})

    def execute(self, context):
        settings = context.scene.mine2blend
        settings.projection_path = self.filepath
        settings.last_error = ""
        settings.last_error_category = ""
        settings.last_message = f"已选择：{os.path.basename(self.filepath)}"
        self.report({"INFO"}, settings.last_message)
        return {"FINISHED"}


class MINE2BLEND_OT_import_litematic(bpy.types.Operator):
    bl_idname = "mine2blend.import_litematic"
    bl_label = "导入投影"
    bl_description = "把选中的 .litematic / .schem 转换为 OBJ 并导入当前 Blender 场景"

    def execute(self, context):
        settings = context.scene.mine2blend
        source_path = (settings.projection_path or "").strip()
        total_start = time.perf_counter()

        settings.last_error = ""
        settings.last_error_category = ""
        settings.last_progress_step = "准备导入"
        settings.last_conversion_seconds = 0.0
        settings.last_import_seconds = 0.0
        settings.last_total_seconds = 0.0
        settings.last_cleared_object_count = 0
        settings.last_imported_object_count = 0
        settings.last_performance_warning = ""
        if not source_path:
            _fail(settings, "文件校验失败", "请先选择 .litematic / .schem 文件")
            self.report({"ERROR"}, settings.last_error)
            return {"CANCELLED"}
        if not os.path.isfile(source_path):
            _fail(settings, "文件校验失败", "投影文件不存在，请重新选择")
            self.report({"ERROR"}, settings.last_error)
            return {"CANCELLED"}
        if not source_path.lower().endswith((".litematic", ".schem")):
            _fail(settings, "文件校验失败", "只支持 .litematic / .schem 文件")
            self.report({"ERROR"}, settings.last_error)
            return {"CANCELLED"}

        try:
            context.window_manager.progress_begin(0, 100)
        except Exception:
            pass

        try:
            _set_progress(context, "转换 Litematic", 15)
            conversion_start = time.perf_counter()
            converter_result = converter_bridge.run_litematic_converter(source_path, context)
            settings.last_conversion_seconds = time.perf_counter() - conversion_start
        except converter_bridge.ConverterError as exc:
            _fail(settings, "转换失败", str(exc))
            settings.last_log_excerpt = ""
            settings.last_progress_step = "转换失败"
            settings.last_total_seconds = time.perf_counter() - total_start
            try:
                context.window_manager.progress_end()
            except Exception:
                pass
            self.report({"ERROR"}, settings.last_error)
            return {"CANCELLED"}

        collection_name = path_utils.collection_name_for_source(settings.collection_prefix, source_path)
        if settings.clear_before_import:
            _set_progress(context, "替换同名旧对象", 45)
            settings.last_cleared_object_count = blender_importer.clear_collection_by_name(collection_name)

        try:
            _set_progress(context, "导入 OBJ 到 Blender", 60)
            import_start = time.perf_counter()
            import_result = blender_importer.import_obj_file(
                converter_result.obj_path,
                collection_name=collection_name,
                scale_factor=settings.scale_factor,
                center_model=settings.center_model,
                place_on_ground=settings.place_on_ground,
                parent_name=settings.collection_prefix,
            )
            settings.last_import_seconds = time.perf_counter() - import_start
        except blender_importer.ImporterError as exc:
            _fail(settings, "Blender 导入失败", f"Blender 导入失败：{exc}")
            settings.last_progress_step = "Blender 导入失败"
            settings.last_total_seconds = time.perf_counter() - total_start
            try:
                context.window_manager.progress_end()
            except Exception:
                pass
            self.report({"ERROR"}, settings.last_error)
            return {"CANCELLED"}

        if settings.auto_arrange:
            existing_objects = blender_importer.mine2blend_objects_excluding(
                settings.collection_prefix, collection_name
            )
            blender_importer.arrange_beside_existing(
                import_result.get("objects", []), existing_objects
            )

        _set_progress(context, "整理诊断信息", 85)
        metadata = converter_result.metadata
        imported_objects = import_result.get("objects", [])
        width, height, depth = diagnostics.metadata_size(metadata)
        settings.last_source_name = os.path.basename(source_path)
        settings.last_output_dir = converter_result.output_dir
        settings.last_collection_name = collection_name
        settings.last_imported_object_count = len(imported_objects)
        settings.last_block_count = diagnostics.metadata_int(metadata, "blockCount")
        settings.last_width = width
        settings.last_height = height
        settings.last_depth = depth
        settings.last_material_count = diagnostics.metadata_int(metadata, "materialCount")
        settings.last_face_count = diagnostics.metadata_int(metadata, "faceCount") or diagnostics.count_faces(
            imported_objects
        )
        settings.last_performance_warning = diagnostics.performance_warning(
            settings.last_block_count,
            settings.last_face_count,
        )
        settings.last_converter_version = str(metadata.get("converterVersion") or "")
        settings.last_resource_version = str(metadata.get("resourceVersion") or "")
        settings.last_log_excerpt = diagnostics.read_log_excerpt(
            converter_result.log_path,
            context.preferences.addons[__package__.split(".operators")[0]].preferences.log_excerpt_lines,
        )
        fixed = import_result.get("fixed", {})
        settings.last_material_fix_closest = fixed.get("closest", 0)
        settings.last_material_fix_tint = fixed.get("tint", 0)
        settings.last_material_fix_alpha = fixed.get("alpha", 0)
        settings.last_material_fix_alpha_mode = fixed.get("alpha_mode", 0)
        audit = material_audit.audit_mtl(converter_result.mtl_path)
        settings.last_material_issue_count = len(audit.get("issues") or [])
        settings.last_material_audit = material_audit.format_audit_summary(audit)
        settings.last_total_seconds = time.perf_counter() - total_start
        settings.last_error_category = ""
        settings.last_progress_step = "完成"
        settings.last_message = (
            f"导入完成：{settings.last_imported_object_count} 个对象，"
            f"{fixed.get('materials', 0)} 个材质，"
            f"耗时 {diagnostics.format_seconds(settings.last_total_seconds)}"
        )
        _set_progress(context, "完成", 100)
        try:
            context.window_manager.progress_end()
        except Exception:
            pass
        if settings.last_performance_warning:
            self.report({"WARNING"}, settings.last_performance_warning)
        self.report({"INFO"}, settings.last_message)
        return {"FINISHED"}


class MINE2BLEND_OT_clear_imports(bpy.types.Operator):
    bl_idname = "mine2blend.clear_imports"
    bl_label = "清空全部投影"
    bl_description = "删除全部 Mine2Blend 投影合集及其对象"

    def execute(self, context):
        settings = context.scene.mine2blend
        removed = blender_importer.clear_collections_by_prefix(settings.collection_prefix)
        if removed:
            settings.last_message = f"已清空 {removed} 个对象"
        else:
            settings.last_message = "当前没有可清空的对象"
        settings.last_error = ""
        self.report({"INFO"}, settings.last_message)
        return {"FINISHED"}


class MINE2BLEND_OT_delete_projection(bpy.types.Operator):
    bl_idname = "mine2blend.delete_projection"
    bl_label = "删除该投影"
    bl_description = "从场景中删除这个投影合集及其所有对象"

    collection_name: bpy.props.StringProperty(default="")

    def execute(self, context):
        settings = context.scene.mine2blend
        if not self.collection_name:
            self.report({"WARNING"}, "未指定要删除的投影")
            return {"CANCELLED"}
        removed = blender_importer.delete_projection_collection(
            self.collection_name, settings.collection_prefix
        )
        if settings.last_collection_name == self.collection_name:
            settings.last_collection_name = ""
        settings.last_message = f"已删除投影 {self.collection_name}（{removed} 个对象）"
        settings.last_error = ""
        self.report({"INFO"}, settings.last_message)
        return {"FINISHED"}


_CLASSES = (
    MINE2BLEND_OT_choose_litematic,
    MINE2BLEND_OT_import_litematic,
    MINE2BLEND_OT_clear_imports,
    MINE2BLEND_OT_delete_projection,
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
