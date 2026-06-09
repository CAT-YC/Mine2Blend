import json
import os
import platform
import shutil
import subprocess
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from . import path_utils


class ConverterError(Exception):
    """转换器层错误，消息可直接展示给用户。"""


@dataclass
class ConverterStatus:
    ready: bool
    platform_key: str
    executable_path: str = ""
    resource_dir: str = ""
    message: str = ""


@dataclass
class ConverterResult:
    output_dir: str
    obj_path: str
    mtl_path: str = ""
    atlas_path: str = ""
    metadata_path: str = ""
    log_path: str = ""
    metadata: Dict[str, object] = field(default_factory=dict)
    stdout: str = ""
    stderr: str = ""


def current_platform_key() -> str:
    system = platform.system().lower()
    machine = platform.machine().lower()
    is_arm = "arm" in machine or "aarch64" in machine
    if system == "windows":
        return "win-arm64" if is_arm else "win-x64"
    if system == "darwin":
        return "darwin-arm64" if is_arm else "darwin-x64"
    if system == "linux":
        return "linux-arm64" if is_arm else "linux-x64"
    return f"{system}-{machine or 'unknown'}"


def converter_executable_name(platform_key: Optional[str] = None) -> str:
    key = platform_key or current_platform_key()
    if key.startswith("win-"):
        return "mcblock-litematic-converter.cmd"
    return "mcblock-litematic-converter"


def converter_executable_candidates(platform_key: Optional[str] = None) -> List[str]:
    key = platform_key or current_platform_key()
    if key.startswith("win-"):
        return [
            "mcblock-litematic-converter.cmd",
            "mcblock-litematic-converter.exe",
        ]
    return ["mcblock-litematic-converter"]


def bundled_converter_dir(platform_key: Optional[str] = None) -> str:
    key = platform_key or current_platform_key()
    return os.path.join(path_utils.addon_root_dir(), "resources", "converter", key)


def bundled_converter_path(platform_key: Optional[str] = None) -> str:
    key = platform_key or current_platform_key()
    return os.path.join(bundled_converter_dir(key), converter_executable_name(key))


def find_bundled_converter(platform_key: Optional[str] = None) -> str:
    key = platform_key or current_platform_key()
    base_dir = bundled_converter_dir(key)
    for name in converter_executable_candidates(key):
        candidate = os.path.join(base_dir, name)
        if os.path.isfile(candidate):
            return candidate
    return os.path.join(base_dir, converter_executable_name(key))


def get_converter_status(context=None) -> ConverterStatus:
    from ..preferences import get_preferences

    key = current_platform_key()
    prefs = get_preferences(context)
    custom = (prefs.converter_path or "").strip()

    if custom:
        custom_abs = os.path.abspath(custom)
        if os.path.isfile(custom_abs):
            return ConverterStatus(
                ready=True,
                platform_key=key,
                executable_path=custom_abs,
                resource_dir=os.path.dirname(custom_abs),
                message="已使用自定义转换器",
            )
        return ConverterStatus(
            ready=False,
            platform_key=key,
            executable_path=custom_abs,
            resource_dir=os.path.dirname(custom_abs),
            message="自定义转换器路径不存在，请重新选择",
        )

    exe = find_bundled_converter(key)
    resource_dir = bundled_converter_dir(key)
    if os.path.isfile(exe):
        return ConverterStatus(
            ready=True,
            platform_key=key,
            executable_path=exe,
            resource_dir=resource_dir,
            message="已找到内置转换器",
        )

    return ConverterStatus(
        ready=False,
        platform_key=key,
        executable_path=exe,
        resource_dir=resource_dir,
        message="未找到内置转换器，请重新安装 Mine2Blend 或下载转换器修复包",
    )


def _load_metadata(path: str) -> Dict[str, object]:
    if not os.path.isfile(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _first_output_metadata(metadata: Dict[str, object]) -> Dict[str, object]:
    outputs = metadata.get("outputs")
    if isinstance(outputs, list) and outputs and isinstance(outputs[0], dict):
        merged = dict(metadata)
        for key, value in outputs[0].items():
            merged.setdefault(key, value)
        return merged
    return metadata


def _first_obj_in_dir(output_dir: str) -> str:
    for root, _dirs, files in os.walk(output_dir):
        for name in files:
            if name.lower().endswith(".obj"):
                return os.path.join(root, name)
    return ""


def _safe_reset_output_dir(output_dir: str, cache_root: str) -> None:
    if not path_utils.is_inside_dir(output_dir, cache_root):
        raise ConverterError("输出目录不在 Mine2Blend 缓存目录内，已停止清理")
    if os.path.isdir(output_dir):
        shutil.rmtree(output_dir)
    os.makedirs(output_dir, exist_ok=True)


def run_litematic_converter(litematic_path: str, context=None, timeout: int = 900) -> ConverterResult:
    if not litematic_path or not os.path.isfile(litematic_path):
        raise ConverterError("投影文件不存在，请重新选择 .litematic / .schem 文件")
    if not litematic_path.lower().endswith((".litematic", ".schem")):
        raise ConverterError("只支持 .litematic / .schem 文件")

    status = get_converter_status(context)
    if not status.ready:
        raise ConverterError(status.message)

    cache_root = path_utils.get_cache_root(context)
    output_dir = path_utils.build_output_dir(litematic_path, context)
    _safe_reset_output_dir(output_dir, cache_root)
    metadata_path = os.path.join(output_dir, "metadata.json")

    cmd: List[str] = [
        status.executable_path,
        "import",
        "--input",
        os.path.abspath(litematic_path),
        "--output",
        output_dir,
        "--format",
        "obj",
        "--metadata-json",
        metadata_path,
        "--preserve-adjacent-faces",
    ]

    try:
        completed = subprocess.run(
            cmd,
            capture_output=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            cwd=status.resource_dir or None,
        )
    except subprocess.TimeoutExpired as exc:
        raise ConverterError(f"转换器超时（{timeout} 秒）：{exc}")
    except OSError as exc:
        raise ConverterError(f"无法启动转换器：{exc}")

    stdout = completed.stdout or ""
    stderr = completed.stderr or ""
    log_path = os.path.join(output_dir, "converter.log")
    try:
        with open(log_path, "w", encoding="utf-8") as handle:
            handle.write(stdout)
            if stderr:
                handle.write("\n[stderr]\n")
                handle.write(stderr)
    except OSError:
        log_path = ""

    if completed.returncode != 0:
        tail = (stderr or stdout)[-1000:] or "无日志输出"
        raise ConverterError(f"转换器退出码 {completed.returncode}：\n{tail}")

    metadata = _first_output_metadata(_load_metadata(metadata_path))
    stem = path_utils.safe_stem_from_path(litematic_path)
    obj_path = str(metadata.get("obj") or os.path.join(output_dir, f"{stem}.obj"))
    mtl_path = str(metadata.get("mtl") or os.path.join(output_dir, f"{stem}.mtl"))
    atlas_path = str(metadata.get("atlas") or os.path.join(output_dir, "atlas.png"))

    if not os.path.isfile(obj_path):
        obj_path = _first_obj_in_dir(output_dir)
    if not obj_path or not os.path.isfile(obj_path):
        raise ConverterError("转换器没有生成 OBJ 文件，请查看诊断日志")

    return ConverterResult(
        output_dir=str(metadata.get("outputDir") or os.path.dirname(obj_path) or output_dir),
        obj_path=obj_path,
        mtl_path=mtl_path if os.path.isfile(mtl_path) else "",
        atlas_path=atlas_path if os.path.isfile(atlas_path) else "",
        metadata_path=metadata_path if os.path.isfile(metadata_path) else "",
        log_path=log_path,
        metadata=metadata,
        stdout=stdout,
        stderr=stderr,
    )


def register():
    pass


def unregister():
    pass
