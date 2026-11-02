"""灯笼效果独立于网格、Alpha与接触面裁切，只操作发光输入及自有灯光。"""
import json
import math
import os
from pathlib import Path
import bpy
from mathutils import Vector

with (Path(__file__).resolve().parents[1] / 'resources/converter/win-x64/assets/emissive-rules.json').open(encoding='utf-8') as _handle:
    COLORS = {name:tuple(rule['color']) for name,rule in json.load(_handle)['lanterns'].items()}
OFFSETS = ((.22, 0, 0), (-.22, 0, 0), (0, 0, .22), (0, 0, -.22))


def _number(value, low, high):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
        raise ValueError('灯笼参数或坐标无效')
    return value


def load_manifest(obj_path):
    path = os.path.splitext(obj_path)[0] + '.lanterns.json'
    if not os.path.isfile(path):
        return None
    if os.path.getsize(path) > 16 * 1024 * 1024:
        raise ValueError('灯笼清单超过16MB')
    with open(path, encoding='utf-8') as handle:
        return validate_manifest(json.load(handle))


def validate_manifest(doc):
    if not isinstance(doc, dict) or doc.get('version') != 1 or not isinstance(doc.get('lanterns'), list) or not isinstance(doc.get('materials'), dict):
        raise ValueError('灯笼清单格式无效')
    if len(doc['lanterns']) > 100000:
        raise ValueError('灯笼清单数量超过上限')
    for name, material in doc['materials'].items():
        rect = material.get('window') if isinstance(material, dict) else None
        if name not in COLORS or not isinstance(rect, list) or len(rect) != 4:
            raise ValueError('灯窗范围无效')
        for v in rect:
            _number(v, 0, 1)
        if rect[0] >= rect[2] or rect[1] >= rect[3]:
            raise ValueError('灯窗范围为空')
    for lamp in doc['lanterns']:
        if not isinstance(lamp, dict) or lamp.get('id') not in doc['materials'] or not isinstance(lamp.get('position'), list) or len(lamp['position']) != 3:
            raise ValueError('灯笼位置无效')
        for value in lamp['position']:
            _number(value, -1e8, 1e8)
    return doc


def _node(tree, kind, name):
    node = tree.nodes.get(name)
    if node is None:
        node = tree.nodes.new(kind)
        node.name = name
        node.label = name
    return node


def restore_materials(materials):
    """重跑基础材质修复后恢复用户的灯笼设置，不触碰Alpha连接。"""
    from . import material_utils
    for mat in materials:
        if not mat.get('m2b_lantern_window') or mat.node_tree is None:
            continue
        rect = list(mat['m2b_lantern_window'])
        tree = mat.node_tree
        for principled in material_utils._principled_nodes(mat):
            socket = material_utils._base_color_image_alpha_socket(principled)
            if socket is None:
                raise ValueError('灯笼缺少底色图')
            image = socket.node
            vector = image.inputs['Vector'].links[0].from_socket if image.inputs['Vector'].is_linked else _node(tree, 'ShaderNodeTexCoord', 'M2B Lantern UV').outputs['UV']
            separate = _node(tree, 'ShaderNodeSeparateXYZ', 'M2B Lantern Coordinates')
            tree.links.new(vector, separate.inputs[0])
            checks = []
            for label, axis, operation, bound in [('Left', 'X', 'GREATER_THAN', rect[0]), ('Right', 'X', 'LESS_THAN', rect[2]), ('Bottom', 'Y', 'GREATER_THAN', rect[1]), ('Top', 'Y', 'LESS_THAN', rect[3])]:
                node = _node(tree, 'ShaderNodeMath', 'M2B Lantern ' + label)
                node.operation = operation
                node.inputs[1].default_value = bound
                tree.links.new(separate.outputs[axis], node.inputs[0])
                checks.append(node.outputs[0])
            mask = checks[0]
            for i, check in enumerate(checks[1:]):
                node = _node(tree, 'ShaderNodeMath', 'M2B Lantern Mask ' + str(i))
                node.operation = 'MULTIPLY'
                tree.links.new(mask, node.inputs[0]); tree.links.new(check, node.inputs[1])
                mask = node.outputs[0]
            gain = _node(tree, 'ShaderNodeMath', 'M2B Lantern Strength')
            gain.operation = 'MULTIPLY'
            tree.links.new(mask, gain.inputs[0])
            gain.inputs[1].default_value = float(mat.get('m2b_lantern_strength', 4)) if mat.get('m2b_lantern_enabled', True) else 0
            tree.links.new(gain.outputs[0], principled.inputs['Emission Strength'])
            tree.links.new(image.outputs['Color'], principled.inputs['Emission Color'])


def remove_owned_lights(collection, references=None, keep=()):
    for obj in list(collection.all_objects):
        if obj.type == 'LIGHT' and obj.get('m2b_lantern_auxiliary') and obj not in keep and (references is None or obj.parent in references):
            data = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if data.users == 0:
                bpy.data.lights.remove(data)


def _collections(collection):
    return [collection] + [child for c in collection.children for child in _collections(c)]


def _sync_manifest(collection):
    doc = {'version': 1, 'materials': {}, 'lanterns': []}
    for obj in collection.all_objects:
        if obj.type == 'MESH' and obj.get('m2b_lantern_reference'):
            part = validate_manifest(json.loads(obj['m2b_lantern_manifest']))
            doc['materials'].update(part['materials'])
            doc['lanterns'].extend(part['lanterns'])
    collection['m2b_lantern_manifest'] = json.dumps(doc, separators=(',', ':'))


def configure_collection(collection, emission=True, strength=4.0, auxiliary=False, power=12.0, limit=32, _references=None, _objects=None):
    _number(strength, 0, 50); _number(power, 0, 200); _number(limit, 1, 256)
    if int(limit) != limit:
        raise ValueError('辅助灯笼上限必须为整数')
    if not collection.get('m2b_lantern_manifest'):
        return {'lanterns': 0, 'lights': 0, 'skipped': 0, 'legacy': True}
    doc = validate_manifest(json.loads(collection['m2b_lantern_manifest']))
    objects = [o for o in (_objects if _objects is not None else collection.all_objects) if o.type == 'MESH']
    references = _references if _references is not None else [o for o in objects if o.get('m2b_lantern_reference')]
    if doc['lanterns'] and not references:
        raise ValueError('灯笼参考对象已丢失，请重新导入')
    jobs = [(ref, lamp) for ref in references for lamp in validate_manifest(json.loads(ref['m2b_lantern_manifest']))['lanterns']]
    owned = set(objects)
    outside = {m for o in bpy.data.objects if o not in owned and o.type == 'MESH' for m in o.data.materials if m}
    outside_meshes = {o.data for o in bpy.data.objects if o not in owned and o.type == 'MESH'}
    mesh_copies = {}
    for obj in objects:
        if obj.data in outside_meshes and any(m and m.get('m2b_lantern_window') for m in obj.data.materials):
            original = obj.data
            if original not in mesh_copies:
                mesh_copies[original] = original.copy()
            obj.data = mesh_copies[original]
    copies = {}
    for obj in objects:
        for i, mat in enumerate(list(obj.data.materials)):
            if mat and mat.get('m2b_lantern_window') and mat in outside:
                if mat not in copies:
                    copies[mat] = mat.copy()
                obj.data.materials[i] = copies[mat]
    materials = {m for o in objects for m in o.data.materials if m and m.get('m2b_lantern_window')}
    for mat in materials:
        mat['m2b_lantern_enabled'] = bool(emission)
        mat['m2b_lantern_strength'] = float(strength)
    restore_materials(materials)
    count = min(int(limit), len(jobs)) if auxiliary else 0
    created = []
    try:
        for index, (reference, lamp) in enumerate(jobs[:count]):
            owner = next(c for c in reference.users_collection if c in _collections(collection))
            child = next((c for c in owner.children if c.get('m2b_lantern_lights')), None)
            if child is None:
                child = bpy.data.collections.new('Mine2Blend 灯笼辅助光')
                child['m2b_lantern_lights'] = True
                owner.children.link(child)
            scale = max(abs(v) for v in reference.matrix_world.to_scale())
            for side, offset in enumerate(OFFSETS):
                data = bpy.data.lights.new('M2B 灯笼辅助点光', 'POINT')
                data.energy = float(power) * scale * scale / 4
                data.color = COLORS[lamp['id']]
                data.shadow_soft_size = .02 * scale
                data.use_shadow = True
                obj = bpy.data.objects.new('M2B 灯笼点光 %d-%d' % (index, side), data)
                created.append(obj)
                obj['m2b_lantern_auxiliary'] = True
                obj['m2b_lantern_index'] = index
                child.objects.link(obj)
                obj.parent = reference
                obj.location = Vector(lamp['position']) + Vector(offset)
                obj.scale = (1 / scale,) * 3
    except Exception:
        for obj in created:
            data = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if not data.users:
                bpy.data.lights.remove(data)
        raise
    remove_owned_lights(collection, references, created)
    bpy.context.view_layer.update()
    return {'lanterns': len(jobs), 'lights': count * 4, 'skipped': len(jobs) - count if auxiliary else 0, 'legacy': False}


def prepare_collection(collection, objects, obj_path, **settings):
    doc = load_manifest(obj_path)
    if doc is None:
        return {'lanterns': 0, 'lights': 0, 'skipped': 0, 'legacy': True}
    materials = {m for o in objects if o.type == 'MESH' for m in o.data.materials if m}
    for mat in materials:
        name = mat.name.split('.')[0].split('_c_')[0]
        if name in doc['materials']:
            mat['m2b_lantern_window'] = doc['materials'][name]['window']
            for node in mat.node_tree.nodes:
                if node.type == 'TEX_IMAGE' and node.image and not node.image.packed_file:
                    node.image.pack()
    previous = collection.get('m2b_lantern_manifest')
    collection['m2b_lantern_manifest'] = json.dumps(doc, separators=(',', ':'))
    references = []
    if doc['lanterns']:
        ref = next(o for o in objects if o.type == 'MESH' and any(m and m.name.split('.')[0].split('_c_')[0] in doc['materials'] for m in o.data.materials))
        ref['m2b_lantern_reference'] = True
        ref['m2b_lantern_manifest'] = json.dumps(doc, separators=(',', ':'))
        references.append(ref)
    try:
        requested_auxiliary = settings.get('auxiliary', False)
        if requested_auxiliary:
            maximum = _number(settings.get('limit', 32), 1, 256)
            existing = math.ceil(sum(1 for o in collection.all_objects if o.type == 'LIGHT' and o.get('m2b_lantern_auxiliary')) / 4)
            remaining = max(0, int(maximum) - existing)
            settings['auxiliary'] = remaining > 0
            if remaining:
                settings['limit'] = remaining
        result = configure_collection(collection, _references=references, _objects=objects, **settings)
        if requested_auxiliary:
            result['skipped'] = len(doc['lanterns']) - result['lights'] // 4
        _sync_manifest(collection)
        return result
    except Exception:
        if previous is None:
            collection.pop('m2b_lantern_manifest', None)
        else:
            collection['m2b_lantern_manifest'] = previous
        raise


def register():
    pass


def unregister():
    pass
