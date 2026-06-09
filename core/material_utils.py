import re
from typing import Iterable, List


_TRANSLUCENT_KEYWORDS = (
    "glass",
    "water",
    "ice",
    "honey_block",
    "slime_block",
)

_CUTOUT_KEYWORDS = (
    "leaves",
    "azalea",
    "mangrove_roots",
    "short_grass",
    "tall_grass",
    "fern",
    "sapling",
    "bamboo",
    "sugar_cane",
    "kelp",
    "seagrass",
    "vine",
    "vines",
    "dripleaf",
    "flower",
    "allium",
    "orchid",
    "tulip",
    "daisy",
    "cornflower",
    "lily",
    "poppy",
    "dandelion",
    "sunflower",
    "lilac",
    "peony",
    "rose_bush",
    "petal",
    "pitcher",
    "mushroom",
    "fungus",
    "roots",
    "nether_sprouts",
    "crops",
    "wheat",
    "carrots",
    "potatoes",
    "beetroots",
    "melon_stem",
    "pumpkin_stem",
    "sweet_berry",
    "cocoa",
    "torch",
    "lantern",
    "chain",
    "rail",
    "sign",
    "banner",
    "carpet",
    "pressure_plate",
    "button",
    "lever",
    "redstone",
    "repeater",
    "comparator",
    "tripwire",
    "web",
    "cobweb",
    "iron_bars",
    "pane",
    "door",
    "trapdoor",
    "fence",
    "wall",
)

_ALPHA_NODE_LABEL = "Mine2Blend Alpha Multiply"
_DIFFUSE_TINT_NODE_LABEL = "Mine2Blend Diffuse Tint"
_LEGACY_WATER_TINT_NODE_LABEL = "MCBlock Water Tint"
_WATER_TINT_RGBA = (0x3F / 255, 0x76 / 255, 0xE4 / 255, 1.0)
_GRASS_TINT_RGBA = (0x91 / 255, 0xBD / 255, 0x59 / 255, 1.0)
_FOLIAGE_TINT_RGBA = (0x77 / 255, 0xAB / 255, 0x2F / 255, 1.0)
_BLENDER_DUPLICATE_SUFFIX_RE = re.compile(r"\.\d{3}$")

_DIFFUSE_TINT_EXACT_NAMES = {
    "water",
    "flowing_water",
    "short_grass",
    "tall_grass",
    "fern",
    "large_fern",
    "potted_fern",
    "sugar_cane",
    "oak_leaves",
    "jungle_leaves",
    "acacia_leaves",
    "dark_oak_leaves",
    "mangrove_leaves",
    "spruce_leaves",
    "birch_leaves",
    "azalea_leaves",
    "flowering_azalea_leaves",
    "vine",
    "lily_pad",
}

_DEFAULT_DIFFUSE_TINTS = {
    "water": _WATER_TINT_RGBA,
    "flowing_water": _WATER_TINT_RGBA,
    "short_grass": _GRASS_TINT_RGBA,
    "tall_grass": _GRASS_TINT_RGBA,
    "fern": _GRASS_TINT_RGBA,
    "large_fern": _GRASS_TINT_RGBA,
    "potted_fern": _GRASS_TINT_RGBA,
    "sugar_cane": _GRASS_TINT_RGBA,
    "oak_leaves": _FOLIAGE_TINT_RGBA,
    "jungle_leaves": _FOLIAGE_TINT_RGBA,
    "acacia_leaves": _FOLIAGE_TINT_RGBA,
    "dark_oak_leaves": _FOLIAGE_TINT_RGBA,
    "mangrove_leaves": _FOLIAGE_TINT_RGBA,
    "spruce_leaves": _FOLIAGE_TINT_RGBA,
    "birch_leaves": _FOLIAGE_TINT_RGBA,
    "azalea_leaves": _FOLIAGE_TINT_RGBA,
    "flowering_azalea_leaves": _FOLIAGE_TINT_RGBA,
    "vine": _FOLIAGE_TINT_RGBA,
    "lily_pad": _FOLIAGE_TINT_RGBA,
}


def _material_name(material) -> str:
    return str(getattr(material, "name", "") or "").lower()


def _strip_blender_duplicate_suffix(name: str) -> str:
    return _BLENDER_DUPLICATE_SUFFIX_RE.sub("", name)


def _base_tint_material_name(name: str) -> str:
    return _strip_blender_duplicate_suffix(name.split("_c_", 1)[0])


def material_category_from_name(name: str) -> str:
    clean_name = str(name or "").lower()
    if any(keyword in clean_name for keyword in _TRANSLUCENT_KEYWORDS):
        return "translucent"
    if any(keyword in clean_name for keyword in _CUTOUT_KEYWORDS):
        return "cutout"
    return "opaque"


def is_diffuse_tint_name(name: str) -> bool:
    clean_name = str(name or "").lower()
    if "_c_" in clean_name:
        return True
    return _base_tint_material_name(clean_name) in _DIFFUSE_TINT_EXACT_NAMES


def default_tint_for_name(name: str):
    base_name = _base_tint_material_name(str(name or "").lower())
    return _DEFAULT_DIFFUSE_TINTS.get(base_name)


def tint_rgba_from_name_and_color(name: str, diffuse_color=None):
    clean_name = str(name or "").lower()
    marker = "_c_"
    if marker in clean_name:
        hex_part = clean_name.rsplit(marker, 1)[-1][:6]
        if len(hex_part) == 6:
            try:
                rgba = (
                    int(hex_part[0:2], 16) / 255,
                    int(hex_part[2:4], 16) / 255,
                    int(hex_part[4:6], 16) / 255,
                    1.0,
                )
                if not all(abs(v - 1.0) < 0.025 for v in rgba[:3]):
                    return rgba
            except ValueError:
                pass

    if diffuse_color and len(diffuse_color) >= 3:
        rgb = tuple(float(diffuse_color[i]) for i in range(3))
        is_default_gray = all(abs(v - 0.8) < 0.025 for v in rgb)
        is_white = all(abs(v - 1.0) < 0.025 for v in rgb)
        if not is_default_gray and not is_white:
            return (rgb[0], rgb[1], rgb[2], 1.0)

    if "water" in clean_name:
        return _WATER_TINT_RGBA
    return default_tint_for_name(clean_name)


def _is_translucent_material(material) -> bool:
    return material_category_from_name(_material_name(material)) == "translucent"


def _is_cutout_material(material) -> bool:
    return material_category_from_name(_material_name(material)) == "cutout"


def _is_water_material(material) -> bool:
    return "water" in _material_name(material)


def _is_diffuse_tint_candidate(material) -> bool:
    return is_diffuse_tint_name(_material_name(material))


def _translucent_alpha(material) -> float:
    name = _material_name(material)
    if "tinted_glass" in name:
        return 0.32
    if "glass" in name:
        return 0.38
    if "water" in name:
        return 0.45
    if "ice" in name:
        return 0.48
    if "honey_block" in name or "slime_block" in name:
        return 0.58
    return 0.5


def _try_set(obj, attr_name: str, value) -> bool:
    try:
        setattr(obj, attr_name, value)
        return True
    except (AttributeError, TypeError, ValueError):
        return False


def _principled_nodes(material):
    node_tree = getattr(material, "node_tree", None)
    if node_tree is None:
        return []
    return [n for n in node_tree.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled"]


def _base_color_image_alpha_socket(principled):
    base_color = principled.inputs.get("Base Color")
    if base_color is None or not base_color.is_linked:
        return None
    source_node = base_color.links[0].from_socket.node
    if getattr(source_node, "label", "") in {
        _DIFFUSE_TINT_NODE_LABEL,
        _LEGACY_WATER_TINT_NODE_LABEL,
    }:
        tint_color_input = source_node.inputs[1] if len(source_node.inputs) > 1 else None
        if tint_color_input is None or not tint_color_input.is_linked:
            return None
        source_node = tint_color_input.links[0].from_socket.node
    if source_node.bl_idname != "ShaderNodeTexImage":
        return None
    return source_node.outputs.get("Alpha")


def _find_existing_diffuse_tint(base_color_input):
    if base_color_input is None or not base_color_input.is_linked:
        return None
    node = base_color_input.links[0].from_socket.node
    if getattr(node, "label", "") in {
        _DIFFUSE_TINT_NODE_LABEL,
        _LEGACY_WATER_TINT_NODE_LABEL,
    }:
        return node
    return None


def _set_mixrgb_diffuse_tint(node, tint_rgba) -> None:
    try:
        node.blend_type = "MULTIPLY"
    except (AttributeError, TypeError, ValueError):
        pass
    try:
        node.inputs[0].default_value = 1.0
    except Exception:
        pass
    try:
        node.inputs[2].default_value = tint_rgba
    except Exception:
        pass


def _rgba_from_material_color(material):
    name = _material_name(material)
    diffuse = getattr(material, "diffuse_color", None)
    return tint_rgba_from_name_and_color(name, diffuse)


def _remove_alpha_links(node_tree, alpha_input):
    for link in list(alpha_input.links):
        try:
            node_tree.links.remove(link)
        except Exception:
            pass


def _find_existing_alpha_multiply(alpha_input):
    if not alpha_input.is_linked:
        return None
    node = alpha_input.links[0].from_socket.node
    if node.bl_idname == "ShaderNodeMath" and getattr(node, "label", "") == _ALPHA_NODE_LABEL:
        return node
    return None


def set_image_textures_to_closest(materials: Iterable) -> int:
    count = 0
    for material in materials:
        if material is None:
            continue
        node_tree = getattr(material, "node_tree", None)
        if node_tree is None:
            continue
        for node in node_tree.nodes:
            if node.bl_idname != "ShaderNodeTexImage":
                continue
            try:
                node.interpolation = "Closest"
            except (AttributeError, TypeError):
                pass
            try:
                if node.image is not None:
                    node.image.colorspace_settings.name = "sRGB"
            except (AttributeError, TypeError):
                pass
            count += 1
    return count


def apply_color_tints(materials: Iterable) -> int:
    count = 0
    for material in materials:
        if material is None:
            continue
        if not _is_diffuse_tint_candidate(material):
            continue
        tint_rgba = _rgba_from_material_color(material)
        if tint_rgba is None:
            continue
        node_tree = getattr(material, "node_tree", None)
        if node_tree is None:
            continue

        for principled in _principled_nodes(material):
            base_color = principled.inputs.get("Base Color")
            if base_color is None:
                continue

            existing = _find_existing_diffuse_tint(base_color)
            if existing is not None:
                existing.label = _DIFFUSE_TINT_NODE_LABEL
                _set_mixrgb_diffuse_tint(existing, tint_rgba)
                count += 1
                continue

            if not base_color.is_linked:
                try:
                    base_color.default_value = tint_rgba
                    count += 1
                except Exception:
                    pass
                continue

            source_socket = base_color.links[0].from_socket
            try:
                node_tree.links.remove(base_color.links[0])
                tint_node = node_tree.nodes.new("ShaderNodeMixRGB")
                tint_node.label = _DIFFUSE_TINT_NODE_LABEL
                tint_node.name = _DIFFUSE_TINT_NODE_LABEL
                _set_mixrgb_diffuse_tint(tint_node, tint_rgba)
                node_tree.links.new(source_socket, tint_node.inputs[1])
                node_tree.links.new(tint_node.outputs[0], base_color)
                count += 1
            except Exception:
                try:
                    base_color.default_value = tint_rgba
                    count += 1
                except Exception:
                    pass
    return count


def connect_image_alpha_to_principled(materials: Iterable) -> int:
    count = 0
    for material in materials:
        if material is None:
            continue
        node_tree = getattr(material, "node_tree", None)
        if node_tree is None:
            continue
        is_translucent = _is_translucent_material(material)
        for principled in _principled_nodes(material):
            alpha_input = principled.inputs.get("Alpha")
            if alpha_input is None:
                continue
            alpha_socket = _base_color_image_alpha_socket(principled)
            if alpha_socket is None:
                continue

            if is_translucent:
                multiplier = _find_existing_alpha_multiply(alpha_input)
                if multiplier is None:
                    _remove_alpha_links(node_tree, alpha_input)
                    multiplier = node_tree.nodes.new("ShaderNodeMath")
                    multiplier.operation = "MULTIPLY"
                    multiplier.label = _ALPHA_NODE_LABEL
                    multiplier.use_clamp = True
                    node_tree.links.new(multiplier.outputs[0], alpha_input)
                    count += 1
                multiplier.inputs[0].default_value = _translucent_alpha(material)
                if not any(link.to_socket == multiplier.inputs[1] for link in alpha_socket.links):
                    node_tree.links.new(alpha_socket, multiplier.inputs[1])
                    count += 1
                continue

            if not alpha_input.is_linked:
                try:
                    node_tree.links.new(alpha_socket, alpha_input)
                    count += 1
                except Exception:
                    pass
    return count


def apply_alpha_modes(materials: Iterable) -> int:
    count = 0
    for material in materials:
        if material is None:
            continue
        if _is_translucent_material(material):
            changed = False
            changed |= _try_set(material, "blend_method", "BLEND")
            changed |= _try_set(material, "surface_render_method", "BLENDED")
            changed |= _try_set(material, "show_transparent_back", False)
            changed |= _try_set(material, "use_screen_refraction", True)
            changed |= _try_set(material, "alpha_threshold", 0.01)
            changed |= _try_set(material, "shadow_method", "HASHED")
            for principled in _principled_nodes(material):
                roughness = principled.inputs.get("Roughness")
                if roughness is not None:
                    roughness.default_value = min(float(roughness.default_value), 0.35)
            if changed:
                count += 1
        elif _is_cutout_material(material):
            changed = False
            changed |= _try_set(material, "blend_method", "CLIP")
            changed |= _try_set(material, "surface_render_method", "DITHERED")
            changed |= _try_set(material, "show_transparent_back", False)
            changed |= _try_set(material, "use_screen_refraction", False)
            changed |= _try_set(material, "alpha_threshold", 0.45)
            changed |= _try_set(material, "shadow_method", "CLIP")
            if changed:
                count += 1
        else:
            changed = False
            changed |= _try_set(material, "blend_method", "OPAQUE")
            changed |= _try_set(material, "surface_render_method", "DITHERED")
            changed |= _try_set(material, "show_transparent_back", False)
            if changed:
                count += 1
    return count


def fix_materials(materials: Iterable) -> dict:
    material_list = list(materials)
    return {
        "materials": len(material_list),
        "closest": set_image_textures_to_closest(material_list),
        "tint": apply_color_tints(material_list),
        "alpha": connect_image_alpha_to_principled(material_list),
        "alpha_mode": apply_alpha_modes(material_list),
    }


def iter_object_materials(objs: Iterable) -> List:
    seen = set()
    out: List = []
    for obj in objs:
        if obj is None or not hasattr(obj, "data") or obj.data is None:
            continue
        materials = getattr(obj.data, "materials", None)
        if materials is None:
            continue
        for mat in materials:
            if mat is None or mat.name in seen:
                continue
            seen.add(mat.name)
            out.append(mat)
    return out


def register():
    pass


def unregister():
    pass
