"""将转换器表面清单关联到OBJ本地角点；不依赖导入后的面序。"""
import json
import math
import os
import re
from array import array
from collections import defaultdict
import bpy

UV_NAMES = ('M2B_FrontUV', 'M2B_BackUV', 'M2B_EmissionFrontUV', 'M2B_EmissionBackUV')
_SUFFIX = re.compile(r'\.\d{3,}$')

def _base_name(name):
    return _SUFFIX.sub('', name)

def _cell(position):
    return tuple(math.floor(value * 1000) for value in position)

def apply_surface_manifest(objects, obj_path):
    path = os.path.splitext(obj_path)[0] + '.surfaces.json'
    if not os.path.isfile(path):
        return {'surfaces': 0, 'corners': 0, 'legacy': True}
    if os.path.getsize(path) > 256 * 1024 * 1024:
        raise ValueError('表面清单超过256MB，停止导入以保护场景')
    with open(path, 'r', encoding='utf-8') as handle:
        document = json.load(handle)
    if not isinstance(document, dict) or document.get('version') != 1 or not isinstance(document.get('surfaces'), list):
        raise ValueError('不支持或损坏的表面清单')
    surfaces = document['surfaces']
    if not surfaces:
        return {'surfaces': 0, 'corners': 0, 'legacy': False}
    buckets = defaultdict(list)
    count = 0
    materials = set()
    for surface in surfaces:
        if not isinstance(surface, dict) or not isinstance(surface.get('material'), str):
            raise ValueError('表面清单材质无效')
        normal = surface.get('normal')
        vertices = surface.get('vertices')
        if not isinstance(normal, list) or len(normal) != 3 or not all(isinstance(n, (int,float)) and math.isfinite(n) for n in normal):
            raise ValueError('表面清单法线无效')
        if abs(sum(n*n for n in normal)-1) > .001 or not isinstance(vertices, list) or len(vertices) != 4:
            raise ValueError('表面清单几何无效')
        for vertex in vertices:
            if not isinstance(vertex, list) or len(vertex) != 13 or not all(isinstance(v, (int,float)) and math.isfinite(v) for v in vertex):
                raise ValueError('表面清单角点无效')
            if max(abs(v) for v in vertex[:3]) > 1e8 or any(v < -.00001 or v > 1.00001 for v in vertex[3:]):
                raise ValueError('表面清单坐标超出有效范围')
            buckets[(surface['material'], *_cell(vertex[:3]))].append((count, vertex, normal, vertices))
            materials.add(surface['material'])
            count += 1
    matched = set()
    plans = []
    affected_materials = set()
    for obj in objects:
        if obj.type != 'MESH' or not obj.data.uv_layers:
            continue
        mesh = obj.data
        original_uv = mesh.uv_layers.active
        assignments = []
        for polygon in mesh.polygons:
            if polygon.material_index >= len(mesh.materials):
                continue
            material = mesh.materials[polygon.material_index]
            if material is None:
                continue
            name = _base_name(material.name)
            if name not in materials:
                continue
            for loop_index in polygon.loop_indices:
                position = mesh.vertices[mesh.loops[loop_index].vertex_index].co
                tex = original_uv.data[loop_index].uv
                cell = _cell(position)
                candidates = []
                for dx in (-1,0,1):
                    for dy in (-1,0,1):
                        for dz in (-1,0,1):
                            for item in buckets.get((name,cell[0]+dx,cell[1]+dy,cell[2]+dz), ()):
                                _, values, normal, surface_vertices = item
                                if (max(abs(position[i]-values[i]) for i in range(3)) <= .00003
                                    and max(abs(tex[i]-values[i+3]) for i in range(2)) <= .000002
                                    and sum(normal[i]*polygon.normal[i] for i in range(3)) > .999):
                                    # 共享角点可能属于多个端盖；以整张三角面确认所属表面。
                                    belongs = all(any(
                                        max(abs(mesh.vertices[mesh.loops[corner].vertex_index].co[k]-record[k]) for k in range(3)) <= .00003
                                        and max(abs(original_uv.data[corner].uv[k]-record[k+3]) for k in range(2)) <= .000002
                                        for record in surface_vertices) for corner in polygon.loop_indices)
                                    if belongs:
                                        candidates.append(item)
                if not candidates:
                    continue
                reference = candidates[0][1]
                if any(max(abs(a-b) for a,b in zip(item[1][5:],reference[5:])) > .000002 for item in candidates):
                    raise ValueError('表面清单角点存在歧义：%s %s %s' % (name, tuple(position), [item[0] for item in candidates]))
                matched.update(item[0] for item in candidates)
                assignments.append((loop_index,reference))
                affected_materials.add(material)
        if assignments:
            plans.append((obj, assignments))
    if len(matched) != count:
        raise ValueError('表面清单与OBJ不匹配：%d/%d角点' % (len(matched),count))

    # 先完整核对再改数据；共享于旧场景的材质仅为本次新对象复制。
    object_ids = {obj.as_pointer() for obj in objects}
    outside_materials = {mat for obj in bpy.data.objects if obj.as_pointer() not in object_ids and obj.type == 'MESH'
                         for mat in obj.data.materials if mat in affected_materials}
    copies = {mat:mat.copy() for mat in outside_materials}
    for obj in objects:
        if obj.type == 'MESH':
            for i,mat in enumerate(list(obj.data.materials)):
                if mat in copies:
                    obj.data.materials[i] = copies[mat]
    for mat in affected_materials:
        copies.get(mat,mat)['m2b_surface_shader'] = 1
    for obj, assignments in plans:
        mesh = obj.data
        values = array('f', [0.0]) * (len(mesh.loops)*2)
        mesh.uv_layers.active.data.foreach_get('uv',values)
        layers = []
        for name in UV_NAMES:
            layer = mesh.uv_layers.get(name) or mesh.uv_layers.new(name=name)
            layer.data.foreach_set('uv',values)
            layers.append(layer)
        emission = mesh.attributes.get('M2B_Emission') or mesh.attributes.new(name='M2B_Emission',type='FLOAT',domain='CORNER')
        emission_back = mesh.attributes.get('M2B_EmissionBack') or mesh.attributes.new(name='M2B_EmissionBack',type='FLOAT',domain='CORNER')
        for index, data in assignments:
            for layer,offset in zip(layers,(3,5,7,9)):
                layer.data[index].uv = data[offset:offset+2]
            emission.data[index].value = data[11]
            emission_back.data[index].value = data[12]
        mesh.update()
    return {'surfaces':len(surfaces),'corners':count,'objects':len(plans),'legacy':False}

def register():
    pass

def unregister():
    pass
