import bpy,sys,json,unittest
from pathlib import Path
import argparse
assert bpy.app.background, '此验收脚本仅用于独立 --background --factory-startup 进程'
parser=argparse.ArgumentParser()
parser.add_argument('--addon-parent',required=True)
parser.add_argument('--obj',required=True)
parser.add_argument('--report-directory',required=True)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
b=Path(args.report_directory).resolve();b.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(Path(args.addon_parent).resolve()));sys.dont_write_bytecode=True
from mcblock_mine2blend.core import blender_importer as imp,lantern_utils as lamps
fixture=Path(args.obj).resolve()
class Regression(unittest.TestCase):
 def setUp(self):
  for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
  for c in list(bpy.data.collections):bpy.data.collections.remove(c)
  for d in list(bpy.data.lights):
   if not d.users:bpy.data.lights.remove(d)
 def load(self,name,**kw):return imp.import_obj_file(str(fixture),name,lantern_auxiliary=True,**kw)
 def test_replace_manifest(self):
  old=self.load('旧投影');old['collection'].pop('m2b_lantern_manifest')
  new=self.load('临时投影');expected=new['collection']['m2b_lantern_manifest']
  imp.commit_staged_projection(new['collection'],old['collection'])
  self.assertEqual(old['collection'].get('m2b_lantern_manifest'),expected)
  self.assertEqual(lamps.configure_collection(old['collection'],True,4,True,12,32)['lights'],16)
 def test_append(self):
  first=self.load('重复投影');second=self.load('重复投影',scale_factor=.5)
  self.assertEqual(len(json.loads(first['collection']['m2b_lantern_manifest'])['lanterns']),8)
  self.assertEqual(len([o for o in first['collection'].all_objects if o.type=='LIGHT']),32)
  self.assertEqual(lamps.configure_collection(first['collection'],True,4,True,12,32)['lights'],32)
 def test_append_respects_projection_limit(self):
  first=self.load('上限投影',lantern_limit=4)
  second=self.load('上限投影',lantern_limit=4)
  self.assertEqual(len([o for o in first['collection'].all_objects if o.type=='LIGHT']),16)
  self.assertEqual(second['lighting']['skipped'],4)
 def test_section_visibility(self):
  r=self.load('分区投影',split_collections=True)
  block=next(c for c in r['collection'].children if c.name.endswith('_方块'))
  block.hide_viewport=True;bpy.context.view_layer.update()
  self.assertTrue(all(not o.visible_get() for o in r['collection'].all_objects if o.type=='LIGHT'))
 def test_linked_mesh_isolation(self):
  a=self.load('A投影');c=bpy.data.collections.new('B投影');bpy.context.scene.collection.children.link(c)
  c['m2b_lantern_manifest']=a['collection']['m2b_lantern_manifest']
  for source in a['objects']:
   copy=source.copy();c.objects.link(copy)
  original={m:m.get('m2b_lantern_enabled') for m in a['materials'] if m.get('m2b_lantern_window')}
  slots={o:tuple(o.data.materials) for o in a['objects'] if o.type=='MESH'}
  lamps.configure_collection(c,False,4,False,12,32)
  self.assertTrue(all(tuple(o.data.materials)==m for o,m in slots.items()))
  self.assertTrue(all(m.get('m2b_lantern_enabled')==value for m,value in original.items()))
result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Regression))
if not result.wasSuccessful():raise AssertionError('灯笼兼容回归失败')
(b/'regression-tests.json').write_text(json.dumps({'status':'PASS','tests':result.testsRun}));print('REGRESSION_PASS',flush=True)
