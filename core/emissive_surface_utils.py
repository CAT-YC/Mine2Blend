"""按完整三角面的本地坐标、UV和法线关联状态权重，完整核对后才写角点属性。"""
import math
import re
from collections import defaultdict

ATTRIBUTE = 'M2B_BlockEmission'
_SUFFIX = re.compile(r'\.\d{3,}$')

def _cell(position):
    return tuple(math.floor(v * 1000) for v in position)

def apply_state_surfaces(objects, surfaces, materials, base_name):
    if not isinstance(surfaces, list) or len(surfaces) > 2000000:
        raise ValueError('发光状态表面数量无效')
    buckets = defaultdict(list)
    count = 0
    for surface in surfaces:
        if not isinstance(surface, dict) or not isinstance(surface.get('material'), str) or base_name(surface['material']) not in materials:
            raise ValueError('发光状态表面材质无效')
        normal, vertices, weight = surface.get('normal'), surface.get('vertices'), surface.get('weight')
        finite = lambda n: type(n) in (int, float) and math.isfinite(n)
        if not finite(weight) or not 0 <= weight <= 1:
            raise ValueError('发光状态权重无效')
        if not isinstance(normal, list) or len(normal) != 3 or not all(finite(n) for n in normal) or abs(sum(n*n for n in normal)-1) > .001:
            raise ValueError('发光状态表面法线无效')
        if not isinstance(vertices, list) or len(vertices) != 4:
            raise ValueError('发光状态表面几何无效')
        for vertex in vertices:
            if not isinstance(vertex, list) or len(vertex) != 5 or not all(finite(n) for n in vertex):
                raise ValueError('发光状态表面角点无效')
            if max(abs(v) for v in vertex[:3]) > 1e8 or any(v < -.00001 or v > 1.00001 for v in vertex[3:]):
                raise ValueError('发光状态表面坐标无效')
            buckets[(surface['material'], *_cell(vertex[:3]))].append((count, vertex, normal, vertices, weight))
            count += 1
    matched, plans = set(), []
    for obj in objects:
        mesh = obj.data
        if not mesh.uv_layers:
            if any(mat and base_name(mat.name) in materials for mat in mesh.materials):
                raise ValueError('发光状态模型缺少UV')
            continue
        uv = mesh.uv_layers.active
        assignments = []
        for polygon in mesh.polygons:
            if polygon.material_index >= len(mesh.materials):
                continue
            mat = mesh.materials[polygon.material_index]
            if not mat or base_name(mat.name) not in materials:
                continue
            name = _SUFFIX.sub('', mat.name)
            for index in polygon.loop_indices:
                p = mesh.vertices[mesh.loops[index].vertex_index].co
                tex, cell = uv.data[index].uv, _cell(p)
                candidates = []
                for dx in (-1,0,1):
                    for dy in (-1,0,1):
                        for dz in (-1,0,1):
                            for item in buckets.get((name,cell[0]+dx,cell[1]+dy,cell[2]+dz), ()):
                                _, point, normal, vertices, _ = item
                                if (max(abs(p[i]-point[i]) for i in range(3)) <= .00003
                                    and max(abs(tex[i]-point[i+3]) for i in range(2)) <= .000002
                                    and sum(normal[i]*polygon.normal[i] for i in range(3)) > .999):
                                    if all(any(max(abs(mesh.vertices[mesh.loops[corner].vertex_index].co[k]-v[k]) for k in range(3)) <= .00003
                                               and max(abs(uv.data[corner].uv[k]-v[k+3]) for k in range(2)) <= .000002
                                               for v in vertices) for corner in polygon.loop_indices):
                                        candidates.append(item)
                if not candidates:
                    raise ValueError('发光状态表面与OBJ不匹配：'+name)
                weight = candidates[0][4]
                if any(abs(item[4]-weight) > .000002 for item in candidates):
                    raise ValueError('发光状态表面存在权重歧义：'+name)
                matched.update(item[0] for item in candidates)
                assignments.append((index, weight))
        if assignments:
            attr = mesh.attributes.get(ATTRIBUTE)
            if attr and (attr.data_type != 'FLOAT' or attr.domain != 'CORNER'):
                raise ValueError('发光状态角点属性类型不兼容')
            plans.append((mesh, assignments))
    if len(matched) != count:
        raise ValueError('发光状态表面与OBJ不匹配：%d/%d角点' % (len(matched), count))
    for mesh, assignments in plans:
        attr = mesh.attributes.get(ATTRIBUTE) or mesh.attributes.new(name=ATTRIBUTE, type='FLOAT', domain='CORNER')
        for index, value in assignments:
            attr.data[index].value = value
        mesh.update()
    return {'surfaces':len(surfaces), 'corners':count, 'meshes':len(plans)}

def register():
    pass

def unregister():
    pass
