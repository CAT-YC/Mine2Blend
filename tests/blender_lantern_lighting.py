import bpy,sys,inspect,json,hashlib
from pathlib import Path
from mathutils import Vector
import argparse
assert bpy.app.background, '此验收脚本仅用于独立 --background --factory-startup 进程'
parser=argparse.ArgumentParser()
parser.add_argument('--addon-parent',required=True)
parser.add_argument('--obj',required=True)
parser.add_argument('--report-directory',required=True)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
b=Path(args.report_directory).resolve();b.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(Path(args.addon_parent).resolve()));sys.dont_write_bytecode=True
import mcblock_mine2blend as addon
from mcblock_mine2blend.core import blender_importer,material_utils
assert 'lantern_auxiliary' in inspect.signature(blender_importer.import_obj_file).parameters,'缺少可控灯笼自发光与辅助点光导入功能'
from mcblock_mine2blend.core import lantern_utils
addon.register()
fixture=Path(args.obj).resolve()
for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
for light in list(bpy.data.lights):
 if light.users==0:bpy.data.lights.remove(light)
def geometry(objects):
 data=[]
 for o in objects:
  if o.type!='MESH':continue
  data.append(([tuple(v.co) for v in o.data.vertices],[tuple(p.vertices) for p in o.data.polygons],[[tuple(v.uv) for v in u.data] for u in o.data.uv_layers]))
 return hashlib.sha256(repr(data).encode()).hexdigest()
r=blender_importer.import_obj_file(str(fixture),'测试灯笼',scale_factor=.25,lantern_auxiliary=True)
coll=r['collection'];meshes=r['objects'];fingerprint=geometry(meshes)
lights=[o for o in coll.all_objects if o.type=='LIGHT'];assert len(lights)==16
reference=next(o for o in meshes if o.get('m2b_lantern_reference'))
assert all(o.parent==reference and o.data.use_shadow for o in lights)
assert all(max(abs(v-1) for v in o.matrix_world.to_scale())<1e-5 for o in lights),'辅助灯对象应保持单位缩放，半径由数据按导入比例换算'
assert abs(sum(o.data.energy for o in lights)-4*12*.25**2)<1e-5
positions=json.loads(coll['m2b_lantern_manifest'])['lanterns']
for lamp in positions:
 center=Vector(lamp['position']);candidates=[o for o in lights if o.get('m2b_lantern_index')==positions.index(lamp)]
 assert len(candidates)==4
 for o in candidates:assert abs((o.location-center).length-.22)<1e-5
before={o.name:tuple(o.matrix_world.translation) for o in lights}
reference.location.x+=4;bpy.context.view_layer.update()
assert all(abs(o.matrix_world.translation.x-before[o.name][0]-4)<1e-5 for o in lights)
assert geometry(meshes)==fingerprint
alpha={m.name:repr([(n.name,n.bl_idname) for n in m.node_tree.nodes if 'Alpha' in n.name]) for m in r['materials']}
node_counts={m.name:len(m.node_tree.nodes) for m in r['materials']}
for _ in range(3):lantern_utils.configure_collection(coll,True,4,True,12,32)
assert len([o for o in coll.all_objects if o.type=='LIGHT'])==16
assert len(bpy.data.lights)==16
assert {m.name:len(m.node_tree.nodes) for m in r['materials']}==node_counts
material_utils.fix_materials(r['materials'])
for m in r['materials']:
 if m.get('m2b_lantern_window'):
  p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
  assert p.inputs['Emission Strength'].links[0].from_node.name=='M2B Lantern Strength'
 assert repr([(n.name,n.bl_idname) for n in m.node_tree.nodes if 'Alpha' in n.name])==alpha[m.name]
lantern_utils.configure_collection(coll,True,4,True,12,2)
assert len([o for o in coll.all_objects if o.type=='LIGHT'])==8
lantern_utils.configure_collection(coll,False,4,False,12,32)
assert not [o for o in coll.all_objects if o.type=='LIGHT'] and len(bpy.data.lights)==0
assert geometry(meshes)==fingerprint
bad=fixture.with_suffix('.lanterns.json');original=bad.read_bytes();old=set(bpy.data.objects)
try:
 bad.write_text('{"version":1,"lanterns":[{"id":"lantern","position":[0,0,1e99]}],"materials":{}}')
 try:blender_importer.import_obj_file(str(fixture),'损坏灯笼清单',lantern_auxiliary=True)
 except blender_importer.ImporterError:pass
 else:raise AssertionError('损坏清单未拒绝')
 assert set(bpy.data.objects)==old and len(bpy.data.lights)==0
finally:bad.write_bytes(original)
lantern_utils.configure_collection(coll,True,4,True,12,32)
settings=bpy.context.scene.mine2blend
settings.last_collection_name=coll.name;settings.lantern_auxiliary=True
assert bpy.ops.mine2blend.update_lanterns()=={'FINISHED'}
assert len([o for o in coll.all_objects if o.type=='LIGHT'])==16
blender_importer.delete_projection_collection(coll.name)
assert len(bpy.data.lights)==0,'删除投影遗留点光数据'
addon.unregister();addon.register();addon.unregister()
report={'status':'PASS','blender':bpy.app.version_string,'geometryPreserved':True,'alphaPreserved':True,'transforms':True,'idempotent':True,'limit':True,'failureRollback':True,'delete':True}
(b/'blender-tests.json').write_text(json.dumps(report,indent=2));print('LANTERN_TEST_PASS',json.dumps(report),flush=True)
