import bpy,sys,json,inspect,hashlib,unittest
from pathlib import Path
import argparse
assert bpy.app.background, '仅在独立 --background --factory-startup 进程运行此测试'
parser=argparse.ArgumentParser()
parser.add_argument('--addon-parent',required=True)
parser.add_argument('--obj',required=True)
parser.add_argument('--report-directory',required=True)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
b=Path(args.report_directory).resolve();b.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(Path(args.addon_parent).resolve()));sys.dont_write_bytecode=True
import mcblock_mine2blend as addon
from mcblock_mine2blend.core import blender_importer as imp,material_utils
assert 'emissive_enabled' in inspect.signature(imp.import_obj_file).parameters,'缺少常用方块自发光控制'
from mcblock_mine2blend.core import emissive_utils as em
fixture=Path(args.obj).resolve()
def fingerprint(objects):
 data=[]
 for o in objects:
  if o.type=='MESH':data.append(([tuple(v.co) for v in o.data.vertices],[tuple(p.vertices) for p in o.data.polygons],[[tuple(v.uv) for v in l.data] for l in o.data.uv_layers]))
 return hashlib.sha256(repr(data).encode()).hexdigest()
def alpha(mats):
 return {m.name: [(p.name,p.inputs['Alpha'].links[0].from_node.name if p.inputs['Alpha'].is_linked else p.inputs['Alpha'].default_value) for p in material_utils._principled_nodes(m)] for m in mats}
class EmissionTests(unittest.TestCase):
 def setUp(self):
  for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
  for c in list(bpy.data.collections):bpy.data.collections.remove(c)
 def load(self,name='投影',**kw):return imp.import_obj_file(str(fixture),name,**kw)
 def test_controls_preserve_mesh_alpha_and_lantern(self):
  r=self.load(lantern_auxiliary=True);c=r['collection'];f=fingerprint(r['objects']);a=alpha(r['materials']);lights=set(o for o in c.all_objects if o.type=='LIGHT')
  self.assertEqual(len(lights),4)
  mats=[m for m in r['materials'] if m.get('m2b_emissive_definition')];self.assertEqual(len(mats),15)
  sizes={m:len(m.node_tree.nodes) for m in mats}
  for value in [False,True,False,True]:
   result=em.configure_collection(c,value,1.5)
   self.assertEqual(result['materials'],15);self.assertEqual(fingerprint(r['objects']),f);self.assertEqual(alpha(r['materials']),a)
   self.assertEqual(set(o for o in c.all_objects if o.type=='LIGHT'),lights)
   for m in mats:self.assertEqual(len(m.node_tree.nodes),sizes[m])
  material_utils.fix_materials(r['materials'])
  self.assertEqual(alpha(r['materials']),a)
  for m in mats:
   p=next(iter(material_utils._principled_nodes(m)))
   self.assertEqual(p.inputs['Emission Strength'].links[0].from_node.name,'M2B Emissive Strength')
   definition=json.loads(m['m2b_emissive_definition'])
   self.assertAlmostEqual(m.node_tree.nodes['M2B Emissive Strength'].inputs[1].default_value,definition['strength']*1.5)
  self.assertTrue(all(not m.get('m2b_emissive_definition') for m in r['materials'] if m.name.split('.')[0] in ['glass','oak_trapdoor','lantern','chest']))
 def test_linked_material_isolation(self):
  a=self.load();c=bpy.data.collections.new('链接副本');bpy.context.scene.collection.children.link(c)
  for o in a['objects']:c.objects.link(o.copy())
  original={o:tuple(o.data.materials) for o in a['objects'] if o.type=='MESH'}
  em.configure_collection(c,False,2)
  self.assertTrue(all(tuple(o.data.materials)==m for o,m in original.items()))
  self.assertTrue(all(m.get('m2b_emissive_enabled') for m in a['materials'] if m.get('m2b_emissive_definition')))
 def test_malformed_sidecar_preserves_old_projection(self):
  r=self.load(lantern_auxiliary=True);old=set(bpy.data.objects);marker=r['collection']['m2b_lantern_manifest']
  p=fixture.with_suffix('.emissives.json');raw=p.read_bytes()
  try:
   p.write_text('{"version":1,"materials":{"glass":{"regions":[[0,0,1,1]],"strength":4}}}')
   with self.assertRaises(imp.ImporterError):self.load()
   self.assertEqual(set(bpy.data.objects),old);self.assertEqual(r['collection']['m2b_lantern_manifest'],marker)
  finally:p.write_bytes(raw)
 def test_native_operator(self):
  addon.register();r=self.load();s=bpy.context.scene.mine2blend
  s.last_collection_name=r['collection'].name;s.emissive_enabled=False;s.emissive_multiplier=2
  self.assertEqual(bpy.ops.mine2blend.update_emissives(),{'FINISHED'})
  self.assertTrue(all(not m.get('m2b_emissive_enabled') for m in r['materials'] if m.get('m2b_emissive_definition')))
  addon.unregister()
result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(EmissionTests))
if not result.wasSuccessful():raise AssertionError('常用发光方块验收失败')
(b/'blender-tests.json').write_text(json.dumps({'status':'PASS','tests':result.testsRun,'blender':bpy.app.version_string}));print('EMISSION_TESTS_PASS',flush=True)
