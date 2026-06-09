import os
import platform
from typing import Iterable

import bpy

from . import converter_bridge, path_utils

LARGE_BLOCK_WARNING_THRESHOLD = 50000
MEDIUM_BLOCK_WARNING_THRESHOLD = 10000
LARGE_FACE_WARNING_THRESHOLD = 250000


def _tail_lines(text: str, limit: int) -> str:
    if not text:
        return ""
    lines = text.replace("\r", "\n").split("\n")
    return "\n".join(lines[-max(limit, 1):])


def read_log_excerpt(log_path: str, line_limit: int = 80) -> str:
    if not log_path or not os.path.isfile(log_path):
        return ""
    try:
        with open(log_path, "r", encoding="utf-8", errors="replace") as handle:
            return _tail_lines(handle.read(), line_limit)
    except OSError:
        return ""


def format_seconds(seconds: float) -> str:
    try:
        value = max(float(seconds or 0.0), 0.0)
    except (TypeError, ValueError):
        value = 0.0
    if value < 60:
        return f"{value:.1f}s"
    minutes = int(value // 60)
    remain = value - minutes * 60
    return f"{minutes}m {remain:.0f}s"


def performance_warning(block_count: int, face_count: int = 0) -> str:
    block_count = max(int(block_count or 0), 0)
    face_count = max(int(face_count or 0), 0)
    if block_count >= LARGE_BLOCK_WARNING_THRESHOLD:
        return (
            f"大型投影：{block_count} 方块。Blender 可能卡顿，建议先关闭高开销视图效果，"
            "导入后按集合管理对象。"
        )
    if face_count >= LARGE_FACE_WARNING_THRESHOLD:
        return (
            f"高面数模型：{face_count} 面。编辑时可能卡顿，建议优先在对象模式查看，"
            "需要编辑时再局部处理。"
        )
    if block_count >= MEDIUM_BLOCK_WARNING_THRESHOLD:
        return f"中型投影：{block_count} 方块。若机器较弱，导入后视口可能短暂卡顿。"
    return ""


def build_diagnostics_text(context=None) -> str:
    ctx = context or bpy.context
    settings = ctx.scene.mine2blend
    status = converter_bridge.get_converter_status(ctx)
    cache_root = path_utils.get_cache_root(ctx)

    lines = [
        "Mine2Blend 诊断信息",
        f"Blender 版本: {bpy.app.version_string}",
        f"系统: {platform.platform()}",
        f"平台键: {status.platform_key}",
        f"转换器状态: {'可用' if status.ready else '未就绪'}",
        f"转换器路径: {path_utils.display_path(status.executable_path)}",
        f"资源目录: {path_utils.display_path(status.resource_dir)}",
        f"缓存目录: {path_utils.display_path(cache_root)}",
        f"投影文件: {path_utils.display_path(settings.projection_path)}",
        f"最近结果: {settings.last_message or '（无）'}",
        f"最近错误: {settings.last_error or '（无）'}",
        f"错误类型: {settings.last_error_category or '（无）'}",
        f"最近集合: {settings.last_collection_name or '（无）'}",
        f"最近输出: {path_utils.display_path(settings.last_output_dir)}",
        f"当前步骤: {settings.last_progress_step or '（无）'}",
        f"转换耗时: {format_seconds(settings.last_conversion_seconds)}",
        f"Blender 导入耗时: {format_seconds(settings.last_import_seconds)}",
        f"总耗时: {format_seconds(settings.last_total_seconds)}",
        f"清理旧对象: {settings.last_cleared_object_count}",
        f"导入对象: {settings.last_imported_object_count}",
        f"性能提示: {settings.last_performance_warning or '（无）'}",
        f"方块数: {settings.last_block_count}",
        f"尺寸: {settings.last_width} x {settings.last_height} x {settings.last_depth}",
        f"材质数: {settings.last_material_count}",
        (
            "材质修复: "
            f"Closest {settings.last_material_fix_closest}, "
            f"补色 {settings.last_material_fix_tint}, "
            f"Alpha {settings.last_material_fix_alpha}, "
            f"透明模式 {settings.last_material_fix_alpha_mode}"
        ),
        f"材质审计: {settings.last_material_audit or '（无）'}",
        f"材质风险数: {settings.last_material_issue_count}",
        f"面数: {settings.last_face_count}",
        f"转换器版本: {settings.last_converter_version or '（未知）'}",
        f"资源版本: {settings.last_resource_version or '（未知）'}",
    ]
    if settings.last_log_excerpt:
        lines.extend(["", "最近日志:", settings.last_log_excerpt])
    return "\n".join(lines)


def metadata_int(metadata: dict, key: str) -> int:
    try:
        return int(metadata.get(key) or 0)
    except (TypeError, ValueError):
        return 0


def metadata_size(metadata: dict):
    size = metadata.get("size")
    if isinstance(size, dict):
        return (
            metadata_int(size, "width"),
            metadata_int(size, "height"),
            metadata_int(size, "depth"),
        )
    if isinstance(size, (list, tuple)) and len(size) >= 3:
        try:
            return (int(size[0] or 0), int(size[1] or 0), int(size[2] or 0))
        except (TypeError, ValueError):
            return (0, 0, 0)
    return (0, 0, 0)


def count_faces(objects: Iterable) -> int:
    total = 0
    for obj in objects:
        data = getattr(obj, "data", None)
        polygons = getattr(data, "polygons", None)
        if polygons is not None:
            total += len(polygons)
    return total


def register():
    pass


def unregister():
    pass
