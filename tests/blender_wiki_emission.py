import bpy,sys,json,unittest,hashlib,shutil,struct,zlib
from pathlib import Path
import argparse
assert bpy.app.background, '此验收仅用于独立后台Blender进程'
parser=argparse.ArgumentParser()
parser.add_argument('--addon-parent',required=True)
parser.add_argument('--obj',required=True)
parser.add_argument('--v1-obj',required=True)
parser.add_argument('--lantern-obj',required=True)
parser.add_argument('--report-directory',required=True)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
b=Path(args.report_directory).resolve();b.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(Path(args.addon_parent).resolve()));sys.dont_write_bytecode=True
import mcblock_mine2blend as addon
from mcblock_mine2blend.core import blender_importer as imp,material_utils,emissive_utils as em
fixture=Path(args.obj).resolve()
doc=json.loads(fixture.with_suffix('.emissives.json').read_text())
def signature(objects):
 return hashlib.sha256(repr([([tuple(v.co) for v in o.data.vertices],[tuple(p.vertices) for p in o.data.polygons],[[tuple(v.uv) for v in uv.data] for uv in o.data.uv_layers]) for o in objects if o.type=='MESH']).encode()).hexdigest()
def alphas(mats):
 return {m.name:[(p.name,[(l.from_node.name,l.from_socket.name) for l in p.inputs['Alpha'].links]) for p in material_utils._principled_nodes(m)] for m in mats}
class WikiEmissionTests(unittest.TestCase):
 def setUp(self):
  for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
  for c in list(bpy.data.collections):bpy.data.collections.remove(c)
 def load(self,**kwargs):
  try:return imp.import_obj_file(str(fixture),'百科光源',center_model=False,place_on_ground=False,**kwargs)
  except imp.ImporterError as e:self.fail('尚未支持百科v2发光清单：'+str(e))
 def test_all_materials_and_corner_state(self):
  r=self.load();mats=[m for m in r['materials'] if m.get('m2b_emissive_definition')]
  self.assertEqual(len(mats),len(doc['materials']))
  for o in r['objects']:
   if o.type!='MESH':continue
   if any(m and m.get('m2b_emissive_definition') for m in o.data.materials):self.assertIsNotNone(o.data.attributes.get('M2B_BlockEmission'))
  for id in ['redstone_ore','deepslate_redstone_ore','respawn_anchor']:
   values=[]
   for o in r['objects']:
    if o.type!='MESH':continue
    attr=o.data.attributes.get('M2B_BlockEmission')
    if not attr:continue
    for p in o.data.polygons:
     if em._base(o.data.materials[p.material_index].name)==id:values.extend(round(attr.data[i].value,5) for i in p.loop_indices)
   self.assertIn(0,values,id);self.assertIn(1,values,id)
 def test_controls_repair_native_layers_and_alpha(self):
  r=self.load(lantern_auxiliary=True);before=signature(r['objects']);alpha=alphas(r['materials']);lights={o for o in bpy.data.objects if o.type=='LIGHT'}
  sizes={m:len(m.node_tree.nodes) for m in r['materials'] if m.get('m2b_emissive_definition')}
  for enabled in [False,True,False,True]:
   em.configure_collection(r['collection'],enabled,1.5)
   self.assertEqual(signature(r['objects']),before);self.assertEqual(alphas(r['materials']),alpha)
   self.assertEqual({o for o in bpy.data.objects if o.type=='LIGHT'},lights)
   for mat,n in sizes.items():self.assertEqual(len(mat.node_tree.nodes),n,mat.name)
  material_utils.fix_materials(r['materials']);self.assertEqual(alphas(r['materials']),alpha)
  for mat in sizes:
   definition=json.loads(mat['m2b_emissive_definition']);p=material_utils._principled_nodes(mat)[0]
   self.assertEqual(p.inputs['Emission Strength'].links[0].from_node.name,'M2B Emissive Strength')
   self.assertAlmostEqual(mat.node_tree.nodes['M2B Emissive Strength'].inputs[1].default_value,definition['strength']*1.5)
   if definition['mode']=='native':
    self.assertEqual(p.inputs['Emission Color'].links[0].from_node.name,'M2B Emission Color')
    self.assertIsNotNone(mat.node_tree.nodes.get('M2B Emission Side Strength'))
   if definition.get('mask'):
    node=mat.node_tree.nodes.get('M2B Emissive Pixels');self.assertIsNotNone(node)
    self.assertTrue(node.image.packed_file);self.assertEqual(node.image.colorspace_settings.name,'Non-Color')
 def test_linked_data_isolation(self):
  r=self.load();copy=bpy.data.collections.new('共享副本');bpy.context.scene.collection.children.link(copy)
  for o in r['objects']:copy.objects.link(o.copy())
  before={o:tuple(o.data.materials) for o in r['objects'] if o.type=='MESH'}
  em.configure_collection(copy,False,2)
  for o,mats in before.items():self.assertEqual(tuple(o.data.materials),mats)
  self.assertTrue(all(m.get('m2b_emissive_enabled') for m in r['materials'] if m.get('m2b_emissive_definition')))
 def test_bad_surface_and_mask_roll_back(self):
  r=self.load(lantern_auxiliary=True);old=set(bpy.data.objects);old_mats=set(bpy.data.materials);old_images=set(bpy.data.images)
  side=fixture.with_suffix('.emissives.json');raw=side.read_bytes();mask=fixture.parent/'emissive-mask.png';original_mask=mask.read_bytes()
  try:
   bad=json.loads(raw);bad['surfaces'][0]['weight']=99;side.write_text(json.dumps(bad))
   with self.assertRaises(imp.ImporterError):imp.import_obj_file(str(fixture),'坏清单')
   self.assertEqual(set(bpy.data.objects),old);self.assertEqual(set(bpy.data.materials),old_mats);self.assertEqual(set(bpy.data.images),old_images)
   side.write_bytes(raw);mask.rename(mask.with_suffix('.held'))
   try:
    with self.assertRaises(imp.ImporterError):imp.import_obj_file(str(fixture),'缺掩码')
    self.assertEqual(set(bpy.data.objects),old);self.assertEqual(set(bpy.data.materials),old_mats);self.assertEqual(set(bpy.data.images),old_images)
   finally:mask.with_suffix('.held').rename(mask)
   def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
   mask.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',8,8,8,0,0,0,0))+chunk(b'IDAT',zlib.compress((b'\0'+b'\xff'*8)*8))+chunk(b'IEND',b''))
   with self.assertRaises(imp.ImporterError):imp.import_obj_file(str(fixture),'掩码尺寸不符')
   self.assertEqual(set(bpy.data.objects),old);self.assertEqual(set(bpy.data.images),old_images)
  finally:side.write_bytes(raw);mask.write_bytes(original_mask)
 def test_copper_lantern_budget_append_and_transform(self):
  from mcblock_mine2blend.core import lantern_utils as lamps
  path=Path(args.lantern_obj).resolve()
  r=imp.import_obj_file(str(path),'铜灯笼',scale_factor=.5,lantern_auxiliary=True,lantern_limit=3)
  self.assertEqual(r['lighting']['lanterns'],10);self.assertEqual(r['lighting']['lights'],12);self.assertEqual(r['lighting']['skipped'],7)
  lights={o for o in r['collection'].all_objects if o.type=='LIGHT'};self.assertEqual(len(lights),12)
  self.assertEqual(sum(bool(m.get('m2b_lantern_window')) for m in r['materials']),10)
  for o in r['collection'].all_objects:
   if o.type=='MESH':o.location.x+=2;o.rotation_euler.z+=.2
  result=lamps.configure_collection(r['collection'],True,4,True,12,3);self.assertEqual(result['lights'],12)
  for light in r['collection'].all_objects:
   if light.type=='LIGHT':self.assertIsNotNone(light.parent);self.assertTrue(light.data.use_shadow)
  lamps.configure_collection(r['collection'],True,4,True,12,10)
  for light in r['collection'].all_objects:
   if light.type=='LIGHT' and light['m2b_lantern_index']>=2:
    # 随包Java铜灯笼各氧化贴图灯窗都偏绿，辅助光不能套用基岩实验版的暖色值。
    self.assertGreater(light.data.color.g,light.data.color.r)
    self.assertGreater(light.data.color.g,light.data.color.b)
  lamps.configure_collection(r['collection'],True,4,True,12,3)
  old_lights={o for o in r['collection'].all_objects if o.type=='LIGHT'}
  second=imp.import_obj_file(str(path),'铜灯笼',lantern_auxiliary=True,lantern_limit=3)
  self.assertEqual(second['lighting']['lights'],0);self.assertEqual(second['lighting']['skipped'],10)
  self.assertEqual({o for o in r['collection'].all_objects if o.type=='LIGHT'},old_lights)
  lamps.configure_collection(r['collection'],True,4,False,12,3)
  self.assertFalse(any(o.type=='LIGHT' for o in r['collection'].all_objects))
 def test_v1_projection_stays_compatible(self):
  old=Path(args.v1_obj).resolve()
  r=imp.import_obj_file(str(old),'旧版清单');self.assertEqual(sum(bool(m.get('m2b_emissive_definition')) for m in r['materials']),15)
  em.configure_collection(r['collection'],False,2)
  self.assertTrue(all(not m.get('m2b_emissive_enabled') for m in r['materials'] if m.get('m2b_emissive_definition')))
 def test_native_operator(self):
  addon.register();r=self.load();s=bpy.context.scene.mine2blend;s.last_collection_name=r['collection'].name;s.emissive_enabled=False;s.emissive_multiplier=2
  self.assertEqual(bpy.ops.mine2blend.update_emissives(),{'FINISHED'});addon.unregister()
result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(WikiEmissionTests))
if not result.wasSuccessful():raise AssertionError('百科光源Blender验收失败')
(b/'blender-wiki.json').write_text(json.dumps({'status':'PASS','tests':result.testsRun,'materials':len(doc['materials']),'blender':bpy.app.version_string}));print('WIKI_BLENDER_PASS',flush=True)
