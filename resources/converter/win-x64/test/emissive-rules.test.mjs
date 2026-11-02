import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {emissiveManifest} from '../src/emissive-blocks.mjs'
const runtime=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const uv=JSON.parse(fs.readFileSync(path.join(runtime,'assets/mcmeta/atlas-uv.json')))
const resources={atlasUvData:uv,atlasW:2048,atlasH:2048}
const block=(id,properties={})=>({blockId:'minecraft:'+id,properties})
const read=(...blocks)=>emissiveManifest({blocks},resources).materials
const contains=(regions,texture,x,y)=>{
 const [u,v,w]=uv['block/'+texture],p=[(u+x*w/16)/2048,1-(v+y*w/16)/2048]
 return regions.some(r=>p[0]>r[0]&&p[0]<r[2]&&p[1]>r[1]&&p[1]<r[3])
}
test('仅熄灭红石方块和默认熄灭红石灯不登记发光',()=>{
 assert.deepEqual(read(block('redstone_lamp'),block('redstone_lamp',{lit:'false'}),block('redstone_torch',{lit:'false'}),block('redstone_wall_torch',{lit:'false'})),{})
})
test('火把只覆盖亮头，排除木柄',()=>{
 for(const [id,texture] of [['torch','torch'],['wall_torch','torch'],['soul_torch','soul_torch'],['soul_wall_torch','soul_torch'],['redstone_torch','redstone_torch']]){
  const def=read(block(id))[id];assert.ok(contains(def.regions,texture,8,7));assert.equal(contains(def.regions,texture,8,12),false)
 }
})
test('红石亮灭共用材质时仅on图集区域发光',()=>{
 const m=read(block('redstone_lamp',{lit:'false'}),block('redstone_lamp',{lit:'true'}),block('redstone_torch',{lit:'false'}),block('redstone_torch',{lit:'true'}))
 assert.ok(contains(m.redstone_lamp.regions,'redstone_lamp_on',8,8));assert.equal(contains(m.redstone_lamp.regions,'redstone_lamp',8,8),false)
 assert.ok(contains(m.redstone_torch.regions,'redstone_torch',8,7));assert.equal(contains(m.redstone_torch.regions,'redstone_torch_off',8,7),false)
})
test('末地烛杆身和端头发光，底座不发光',()=>{
 const m=read(block('end_rod')).end_rod
 assert.ok(contains(m.regions,'end_rod',1,8));assert.ok(contains(m.regions,'end_rod',3,1));assert.equal(contains(m.regions,'end_rod',4,4),false)
})
test('三色蛙明灯同时覆盖侧面和端面贴图',()=>{
 for(const id of ['ochre_froglight','verdant_froglight','pearlescent_froglight']){
  const m=read(block(id))[id];assert.ok(contains(m.regions,id+'_side',8,8));assert.ok(contains(m.regions,id+'_top',8,8))
 }
})
test('熔岩各液位使用同样的静态首帧区域，不处理水与未知命名空间',()=>{
 const a=read(block('lava',{level:'0'})).lava,b=read(block('lava',{level:'15'})).lava
 assert.deepEqual(a,b);assert.ok(contains(a.regions,'lava_still',8,8));assert.ok(contains(a.regions,'lava_flow',8,8))
 assert.deepEqual(read(block('water'),{blockId:'example:torch',properties:{}}),{})
})
