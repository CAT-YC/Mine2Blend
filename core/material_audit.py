from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

from . import material_utils


@dataclass
class MtlMaterial:
    name: str
    diffuse: Optional[Tuple[float, float, float]] = None
    alpha: Optional[float] = None
    texture: str = ""


def _parse_float(value: str) -> Optional[float]:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _parse_rgb(parts: List[str]) -> Optional[Tuple[float, float, float]]:
    if len(parts) < 4:
        return None
    values = [_parse_float(parts[1]), _parse_float(parts[2]), _parse_float(parts[3])]
    if any(value is None for value in values):
        return None
    return (float(values[0]), float(values[1]), float(values[2]))


def parse_mtl(path: str) -> List[MtlMaterial]:
    materials: List[MtlMaterial] = []
    current: Optional[MtlMaterial] = None
    if not path:
        return materials

    try:
        with open(path, "r", encoding="utf-8") as handle:
            for raw_line in handle:
                line = raw_line.strip()
                if not line or line.startswith("#"):
                    continue
                parts = line.split()
                keyword = parts[0]
                if keyword == "newmtl" and len(parts) >= 2:
                    current = MtlMaterial(name=" ".join(parts[1:]))
                    materials.append(current)
                elif current is not None and keyword == "Kd":
                    current.diffuse = _parse_rgb(parts)
                elif current is not None and keyword == "d" and len(parts) >= 2:
                    current.alpha = _parse_float(parts[1])
                elif current is not None and keyword == "Tr" and len(parts) >= 2:
                    tr_value = _parse_float(parts[1])
                    if tr_value is not None and current.alpha is None:
                        current.alpha = 1.0 - tr_value
                elif current is not None and keyword == "map_Kd" and len(parts) >= 2:
                    current.texture = " ".join(parts[1:])
    except OSError:
        return []
    return materials


def _is_neutral_or_white(rgb: Optional[Tuple[float, float, float]]) -> bool:
    if rgb is None:
        return True
    spread = max(rgb) - min(rgb)
    average = sum(rgb) / 3.0
    return spread < 0.04 and average > 0.70


def _is_too_dark(rgb: Optional[Tuple[float, float, float]]) -> bool:
    if rgb is None:
        return False
    return sum(rgb) / 3.0 < 0.035


def _has_explicit_neutral_tint(name: str) -> bool:
    marker = "_c_"
    if marker not in name:
        return False
    hex_part = name.rsplit(marker, 1)[-1][:6]
    if len(hex_part) != 6:
        return False
    try:
        rgb = (
            int(hex_part[0:2], 16) / 255,
            int(hex_part[2:4], 16) / 255,
            int(hex_part[4:6], 16) / 255,
        )
    except ValueError:
        return False
    return _is_neutral_or_white(rgb)


def audit_materials(materials: List[MtlMaterial]) -> Dict[str, object]:
    issues: List[str] = []
    textured = 0
    translucent = 0
    cutout = 0
    tint_candidates = 0
    default_tint_needed = 0

    for material in materials:
        name = material.name.lower()
        category = material_utils.material_category_from_name(name)
        if material.texture:
            textured += 1
        else:
            issues.append(f"{material.name}: 缺少 map_Kd 贴图")

        if category == "translucent":
            translucent += 1
        elif category == "cutout":
            cutout += 1
            if _is_too_dark(material.diffuse):
                issues.append(f"{material.name}: 裁切材质 diffuse 过黑，可能出现黑面")

        if material_utils.is_diffuse_tint_name(name):
            tint_candidates += 1
            tint = material_utils.tint_rgba_from_name_and_color(name, material.diffuse)
            if tint is None:
                if not _has_explicit_neutral_tint(name):
                    issues.append(f"{material.name}: 应染色但未能推导 tint")
            elif material_utils.default_tint_for_name(name) and _is_neutral_or_white(material.diffuse):
                default_tint_needed += 1

        if "water" in name:
            if _is_neutral_or_white(material.diffuse):
                issues.append(f"{material.name}: 水材质缺少蓝色 tint")
            if material.alpha is None or material.alpha > 0.80:
                issues.append(f"{material.name}: 水材质 alpha 不够透明")

        if "glass" in name:
            if material.alpha is None or material.alpha > 0.85:
                issues.append(f"{material.name}: 玻璃材质 alpha 不够透明")

    return {
        "materials": len(materials),
        "textured": textured,
        "translucent": translucent,
        "cutout": cutout,
        "tint_candidates": tint_candidates,
        "default_tint_needed": default_tint_needed,
        "issues": issues,
    }


def audit_mtl(path: str) -> Dict[str, object]:
    return audit_materials(parse_mtl(path))


def format_audit_summary(audit: Dict[str, object]) -> str:
    issue_count = len(audit.get("issues") or [])
    base = (
        f"材质审计：{audit.get('materials', 0)} 个材质，"
        f"{audit.get('textured', 0)} 个贴图，"
        f"{audit.get('translucent', 0)} 个半透明，"
        f"{audit.get('cutout', 0)} 个裁切，"
        f"{audit.get('tint_candidates', 0)} 个染色候选"
    )
    if audit.get("default_tint_needed", 0):
        base += f"，{audit.get('default_tint_needed')} 个使用默认 tint 兜底"
    if issue_count:
        return f"{base}，发现 {issue_count} 项风险"
    return f"{base}，未发现 MTL 风险"


def register():
    pass


def unregister():
    pass
