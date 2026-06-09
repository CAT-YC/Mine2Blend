import os
import re
import tempfile
from typing import Optional

import bpy


_UNSAFE_FILENAME_RE = re.compile(r'[<>:"/\\|?*\x00-\x1f]+')
_SPACES_RE = re.compile(r"\s+")


def normalize_slashes(path: str) -> str:
    if not path:
        return ""
    return path.replace("\\", "/")


def safe_stem_from_path(path: str, fallback: str = "projection") -> str:
    stem = os.path.splitext(os.path.basename(path or ""))[0].strip()
    if not stem:
        stem = fallback
    stem = _UNSAFE_FILENAME_RE.sub("_", stem)
    stem = _SPACES_RE.sub("_", stem)
    stem = stem.strip("._ ")
    return stem or fallback


def addon_root_dir() -> str:
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def default_cache_root() -> str:
    try:
        base = bpy.utils.user_resource(
            "DATAFILES",
            path=os.path.join("MCBlock", "Mine2Blend", "cache"),
            create=True,
        )
        if base:
            return base
    except Exception:
        pass
    return os.path.join(tempfile.gettempdir(), "Mine2Blend", "cache")


def get_cache_root(context=None) -> str:
    from ..preferences import get_preferences

    prefs = get_preferences(context)
    configured = (prefs.cache_root_path or "").strip()
    root = configured if configured else default_cache_root()
    os.makedirs(root, exist_ok=True)
    return os.path.abspath(root)


def build_output_dir(litematic_path: str, context=None) -> str:
    root = get_cache_root(context)
    stem = safe_stem_from_path(litematic_path)
    return os.path.join(root, stem)


def is_inside_dir(path: str, root: str) -> bool:
    if not path or not root:
        return False
    try:
        abs_path = os.path.abspath(path)
        abs_root = os.path.abspath(root)
        common = os.path.commonpath([abs_path, abs_root])
    except (OSError, ValueError):
        return False
    if os.name == "nt":
        return common.lower() == abs_root.lower()
    return common == abs_root


def collection_name_for_source(prefix: str, source_path: str) -> str:
    clean_prefix = safe_stem_from_path(prefix or "Mine2Blend", "Mine2Blend")
    return f"{clean_prefix}_{safe_stem_from_path(source_path)}"


def display_path(path: Optional[str]) -> str:
    if not path:
        return "（未设置）"
    return normalize_slashes(path)
