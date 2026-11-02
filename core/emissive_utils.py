"""常用方块的局部自发光；保留原表面几何、Alpha、UV与灯笼配置。"""
import json
import os
import re
import struct
from pathlib import Path
import bpy
from . import material_utils
from .lantern_utils import _node, _number
from .emissive_surface_utils import apply_state_surfaces, ATTRIBUTE

_RULES_FILE = Path(__file__).resolve().parents[1] / 'resources/converter/win-x64/assets/emissive-rules.json'
with _RULES_FILE.open(encoding='utf-8') as _handle:
    SUPPORTED = set(json.load(_handle)['rules'])


def _base(name):
    return material_utils._base_tint_material_name(re.sub(r'\.\d{3,}$', '', name.lower()))


def _validate_definition(definition):
    if not isinstance(definition, dict) or definition.get('mode', 'texture') not in ('texture', 'native'):
        raise ValueError('自发光模式无效')
    minimum = 0 if definition.get('mode') == 'native' else 1
    if not isinstance(definition.get('regions'), list) or not minimum <= len(definition['regions']) <= 128:
        raise ValueError('自发光区域格式无效')
    if 'stateful' in definition and type(definition['stateful']) is not bool:
        raise ValueError('自发光状态标记无效')
    if 'mask' in definition and definition['mask'] != 'emissive-mask.png':
        raise ValueError('自发光像素掩码文件无效')
    if 'color' in definition:
        if not isinstance(definition['color'], list) or len(definition['color']) != 3:
            raise ValueError('自发光颜色无效')
        for v in definition['color']:
            _number(v, 0, 1)
    _number(definition.get('strength'), .001, 50)
    for rect in definition['regions']:
        if not isinstance(rect, list) or len(rect) != 4:
            raise ValueError('自发光UV范围无效')
        for v in rect:
            _number(v, 0, 1)
        if rect[0] >= rect[2] or rect[1] >= rect[3]:
            raise ValueError('自发光UV范围为空')
    return definition


def load_manifest(obj_path):
    file = os.path.splitext(obj_path)[0] + '.emissives.json'
    if not os.path.isfile(file):
        return None
    if os.path.getsize(file) > 256 * 1024 * 1024:
        raise ValueError('自发光清单超过256MB')
    with open(file, encoding='utf-8') as handle:
        doc = json.load(handle)
    if not isinstance(doc, dict) or type(doc.get('version')) is not int or doc['version'] not in (1, 2) or not isinstance(doc.get('materials'), dict):
        raise ValueError('自发光清单格式无效')
    if not set(doc['materials']).issubset(SUPPORTED):
        raise ValueError('自发光清单含不支持的方块')
    for definition in doc['materials'].values():
        _validate_definition(definition)
        if doc['version'] == 2 and definition.get('stateful') is not True:
            raise ValueError('自发光v2清单缺少状态标记')
        if doc['version'] == 1 and definition.get('stateful'):
            raise ValueError('旧版自发光清单不能声明状态表面')
    if doc['version'] == 2 and (not isinstance(doc.get('blocks'), list) or len(doc['blocks']) > 1000000 or not isinstance(doc.get('surfaces'), list)):
        raise ValueError('自发光状态清单格式无效')
    return doc


def _mask_image(mat):
    node = mat.node_tree.nodes.get('M2B Emissive Pixels')
    image = node.image if node and node.type == 'TEX_IMAGE' and node.image else bpy.data.images.get(mat.get('m2b_emissive_mask_image', ''))
    if image is None:
        raise ValueError('自发光像素掩码已丢失，请重新导入投影')
    return image


def _isolate(objects, predicate):
    owned = set(objects)
    outside = [o for o in bpy.data.objects if o not in owned and o.type == 'MESH']
    outside_meshes = {o.data for o in outside}
    outside_materials = {m for o in outside for m in o.data.materials if m}
    mesh_copies, material_copies = {}, {}
    for obj in objects:
        if obj.data in outside_meshes and any(m and predicate(m) for m in obj.data.materials):
            source = obj.data
            if source not in mesh_copies:
                mesh_copies[source] = source.copy()
            obj.data = mesh_copies[source]
        for i, mat in enumerate(list(obj.data.materials)):
            if mat and predicate(mat) and mat in outside_materials:
                if mat not in material_copies:
                    material_copies[mat] = mat.copy()
                obj.data.materials[i] = material_copies[mat]
    return {m for o in objects for m in o.data.materials if m and predicate(m)}


def restore_materials(materials):
    for mat in materials:
        raw = mat.get('m2b_emissive_definition')
        if not raw or mat.node_tree is None:
            continue
        definition = _validate_definition(json.loads(raw))
        multiplier = _number(mat.get('m2b_emissive_multiplier', 1.0), 0, 10)
        tree = mat.node_tree
        for principled in material_utils._principled_nodes(mat):
            if definition.get('mode') == 'native':
                color = tree.nodes.get('M2B Emission Color')
                strength = tree.nodes.get('M2B Emission Side Strength')
                if color is None or strength is None:
                    raise ValueError('原生自发光材质缺少独立发光层')
                coverage_socket = strength.outputs[0]
                tree.links.new(color.outputs[0], principled.inputs['Emission Color'])
            else:
                coverage_socket = _texture_coverage(mat, principled, definition)
            if definition.get('stateful'):
                attribute = _node(tree, 'ShaderNodeAttribute', 'M2B Emissive Block State');attribute.attribute_name = ATTRIBUTE
                state = _node(tree, 'ShaderNodeMath', 'M2B Emissive State Coverage');state.operation = 'MULTIPLY'
                tree.links.new(coverage_socket, state.inputs[0]);tree.links.new(attribute.outputs['Fac'], state.inputs[1])
                coverage_socket = state.outputs[0]
            gain = _node(tree, 'ShaderNodeMath', 'M2B Emissive Strength');gain.operation = 'MULTIPLY'
            tree.links.new(coverage_socket, gain.inputs[0])
            gain.inputs[1].default_value = definition['strength'] * multiplier if mat.get('m2b_emissive_enabled', True) else 0
            tree.links.new(gain.outputs[0], principled.inputs['Emission Strength'])


def _texture_coverage(mat, principled, definition):
    tree = mat.node_tree
    alpha = material_utils._base_color_image_alpha_socket(principled)
    if alpha is None:
        raise ValueError('自发光材质缺少底色图')
    image = alpha.node
    vector = image.inputs['Vector'].links[0].from_socket if image.inputs['Vector'].is_linked else _node(tree, 'ShaderNodeTexCoord', 'M2B Emissive UV').outputs['UV']
    xyz = _node(tree, 'ShaderNodeSeparateXYZ', 'M2B Emissive Coordinates')
    tree.links.new(vector, xyz.inputs[0])
    union = None
    for i, rect in enumerate(definition['regions']):
        checks = []
        for k, axis, op, bound in [(0,'X','GREATER_THAN',rect[0]),(1,'Y','GREATER_THAN',rect[1]),(2,'X','LESS_THAN',rect[2]),(3,'Y','LESS_THAN',rect[3])]:
            node = _node(tree, 'ShaderNodeMath', 'M2B Emissive Check %d-%d' % (i,k));node.operation = op
            tree.links.new(xyz.outputs[axis], node.inputs[0]);node.inputs[1].default_value = bound
            checks.append(node.outputs[0])
        mask = checks[0]
        for k, check in enumerate(checks[1:]):
            node = _node(tree, 'ShaderNodeMath', 'M2B Emissive Rect %d-%d' % (i,k));node.operation = 'MULTIPLY'
            tree.links.new(mask, node.inputs[0]);tree.links.new(check, node.inputs[1]);mask = node.outputs[0]
        if union is None:
            union = mask
        else:
            node = _node(tree, 'ShaderNodeMath', 'M2B Emissive Union %d' % i);node.operation = 'MAXIMUM'
            tree.links.new(union, node.inputs[0]);tree.links.new(mask, node.inputs[1]);union = node.outputs[0]
    coverage = _node(tree, 'ShaderNodeMath', 'M2B Emissive Coverage');coverage.operation = 'MULTIPLY'
    tree.links.new(union, coverage.inputs[0]);tree.links.new(alpha, coverage.inputs[1])
    socket = coverage.outputs[0]
    if definition.get('mask'):
        pixels = _node(tree, 'ShaderNodeTexImage', 'M2B Emissive Pixels');pixels.image = _mask_image(mat)
        pixels.image.colorspace_settings.name = 'Non-Color'
        pixels.interpolation = 'Closest';pixels.extension = 'CLIP'
        tree.links.new(vector, pixels.inputs['Vector'])
        masked = _node(tree, 'ShaderNodeMath', 'M2B Emissive Pixel Coverage');masked.operation = 'MULTIPLY'
        tree.links.new(socket, masked.inputs[0]);tree.links.new(pixels.outputs['Color'], masked.inputs[1]);socket = masked.outputs[0]
    if 'color' in definition:
        color = _node(tree, 'ShaderNodeRGB', 'M2B Emissive Wick Color');color.outputs[0].default_value = (*definition['color'], 1)
        tree.links.new(color.outputs[0], principled.inputs['Emission Color'])
    else:
        tree.links.new(image.outputs['Color'], principled.inputs['Emission Color'])
    return socket

def configure_collection(collection, enabled=True, multiplier=1.0):
    _number(multiplier, 0, 10)
    objects = [o for o in collection.all_objects if o.type == 'MESH']
    materials = _isolate(objects, lambda m: bool(m.get('m2b_emissive_definition')))
    for mat in materials:
        definition = _validate_definition(json.loads(mat['m2b_emissive_definition']))
        if definition.get('mask'):
            _mask_image(mat)
    for mat in materials:
        mat['m2b_emissive_enabled'] = bool(enabled);mat['m2b_emissive_multiplier'] = float(multiplier)
    restore_materials(materials)
    return {'materials':len(materials),'legacy':not any(o.get('m2b_emissive_source') for o in objects)}


def prepare_objects(objects, obj_path, enabled=True, multiplier=1.0):
    _number(multiplier, 0, 10)
    doc = load_manifest(obj_path)
    if doc is None:
        return {'materials':0,'legacy':True}
    meshes = [o for o in objects if o.type == 'MESH']
    materials = _isolate(meshes, lambda m: _base(m.name) in doc['materials'])
    surfaces = apply_state_surfaces(meshes, doc['surfaces'], doc['materials'], _base) if doc['version'] == 2 else {}
    mask_image = None
    if any(doc['materials'][_base(mat.name)].get('mask') for mat in materials):
        path = os.path.join(os.path.dirname(obj_path), 'emissive-mask.png')
        if not os.path.isfile(path) or os.path.getsize(path) > 16 * 1024 * 1024:
            raise ValueError('缺少自发光像素掩码或文件超过16MB')
        with open(path, 'rb') as handle:
            header = handle.read(24)
        if len(header) != 24 or header[:8] != b'\x89PNG\r\n\x1a\n':
            raise ValueError('自发光像素掩码不是有效PNG')
        width, height = struct.unpack('>II', header[16:24])
        if not 1 <= width <= 8192 or not 1 <= height <= 8192 or width * height > 16777216:
            raise ValueError('自发光像素掩码尺寸超出上限')
        for mat in materials:
            if not doc['materials'][_base(mat.name)].get('mask'):
                continue
            for principled in material_utils._principled_nodes(mat):
                alpha = material_utils._base_color_image_alpha_socket(principled)
                if alpha is None or alpha.node.image is None or tuple(alpha.node.image.size) != (width, height):
                    raise ValueError('自发光像素掩码与底色图尺寸不符')
        mask_image = bpy.data.images.load(path, check_existing=False)
        mask_image.colorspace_settings.name = 'Non-Color';mask_image.pack()
    for mat in materials:
        mat['m2b_emissive_definition'] = json.dumps(doc['materials'][_base(mat.name)], separators=(',', ':'))
        mat['m2b_emissive_enabled'] = bool(enabled);mat['m2b_emissive_multiplier'] = float(multiplier)
        if mask_image and doc['materials'][_base(mat.name)].get('mask'):
            mat['m2b_emissive_mask_image'] = mask_image.name
        for node in mat.node_tree.nodes:
            if node.type == 'TEX_IMAGE' and node.image and not node.image.packed_file:
                node.image.pack()
    restore_materials(materials)
    for obj in meshes:
        obj['m2b_emissive_source'] = True
    return {'materials':len(materials),'legacy':False,**surfaces}


def register():
    pass


def unregister():
    pass
