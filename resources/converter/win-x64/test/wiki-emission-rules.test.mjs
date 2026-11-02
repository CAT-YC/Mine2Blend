import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {emissiveManifest} from '../src/emissive-blocks.mjs'
const json=name=>JSON.parse(fs.readFileSync(new URL('../assets/mcmeta/'+name,import.meta.url)))
const uv=json('atlas-uv.json'),defaults=json('block-default-properties.json')
const resources={atlasUvData:uv,atlasW:2048,atlasH:2048,defaultBlockProperties:new Map(Object.entries(defaults))}
const block=(id,properties={},position=[0,0,0])=>({blockId:'minecraft:'+id,properties,position})
const read=(blocks,options={})=>emissiveManifest({blocks},resources,options)

test('洞穴藤蔓头部和藤身只在berries=true登记，使用含浆果贴图',()=>{
 for(const id of ['cave_vines','cave_vines_plant']){
  assert.ok(read([block(id,{berries:'true'})]).materials[id],id+'缺少浆果发光')
  assert.deepEqual(read([block(id),block(id,{berries:'false'})]).materials,{})
 }
})
test('17色蜡烛及蜡烛蛋糕按lit判定，数量只记录游戏亮度，避免数量平方放大',()=>{
 for(const color of ['',...['white','orange','magenta','light_blue','yellow','lime','pink','gray','light_gray','cyan','purple','blue','brown','green','red','black'].map(s=>s+'_')]){
  const id=color+'candle',a=read([block(id,{lit:'true',candles:'1'})]),b=read([block(id,{lit:'true',candles:'4'})])
  assert.ok(a.materials[id],id);assert.equal(a.materials[id].strength,b.materials[id].strength)
  assert.equal(a.blocks[0].level,3);assert.equal(b.blocks[0].level,12)
  assert.deepEqual(read([block(id),block(id,{lit:'true',waterlogged:'true'})]).materials,{})
  assert.ok(read([block(color+'candle_cake',{lit:'true'})]).materials[color+'candle_cake'])
 }
})
test('海泡菜仅含水发光，1至4个的游戏等级为6/9/12/15',()=>{
 assert.deepEqual(read([block('sea_pickle',{waterlogged:'false'})]).materials,{})
 for(let n=1;n<=4;n++){
  const d=read([block('sea_pickle',{pickles:String(n),waterlogged:'true'})]);assert.ok(d.materials.sea_pickle);assert.equal(d.blocks[0].level,3+3*n)
 }
})
test('八种铜灯按lit开关和氧化等级发光，powered不代替lit',()=>{
 for(const [prefix,level] of [['',15],['exposed_',12],['weathered_',8],['oxidized_',4]])for(const wax of ['', 'waxed_']){
  const id=wax+prefix+'copper_bulb',d=read([block(id,{lit:'true',powered:'false'})]);assert.ok(d.materials[id],id);assert.equal(d.blocks[0].level,level)
  assert.deepEqual(read([block(id,{lit:'false',powered:'true'})]).materials,{})
 }
 for(const id of ['copper_torch','copper_wall_torch'])assert.ok(read([block(id)]).materials[id])
})
test('红石矿共用同贴图仍分别记录亮灭，重生锚充能0至4区分权重',()=>{
 for(const id of ['redstone_ore','deepslate_redstone_ore']){
  const d=read([block(id,{lit:'false'},[0,0,0]),block(id,{lit:'true'},[2,0,0])]);assert.ok(d.materials[id]);assert.deepEqual(d.blocks.map(b=>b.level),[0,9])
 }
 const d=read(Array.from({length:5},(_,i)=>block('respawn_anchor',{charges:String(i)},[2*i,0,0])))
 assert.ok(d.materials.respawn_anchor);assert.deepEqual(d.blocks.map(b=>b.level),[0,3,7,11,15]);assert.equal(d.blocks[0].weight,0)
})
test('熔炉族属于方块实体分区，点燃默认与熄灭状态均核对',()=>{
 for(const id of ['furnace','blast_furnace','smoker']){
  const on=block(id,{lit:'true'});assert.ok(read([on],{sections:['blockEntities']}).materials[id])
  assert.deepEqual(read([on],{sections:['blocks']}).materials,{})
  assert.deepEqual(read([block(id)]).materials,{})
 }
 for(const id of ['campfire','soul_campfire']){
  assert.ok(read([block(id)]).materials[id]);assert.deepEqual(read([block(id,{lit:'false'})]).materials,{})
 }
})
test('萤火虫灌木和睁眼眼眸花复用独立发光层，闭眼花不登记',()=>{
 for(const id of ['firefly_bush','open_eyeblossom'])assert.equal(read([block(id)]).materials[id]?.mode,'native')
 assert.deepEqual(read([block('closed_eyeblossom')]).materials,{})
})
test('低亮度/静态光源完整登记；感测体两种阶段亮度相同，潮涌核心不依赖含水状态',()=>{
 for(const id of ['jack_o_lantern','lava_cauldron','fire','soul_fire','nether_portal','crying_obsidian','magma_block','brown_mushroom','dragon_egg','brewing_stand','enchanting_table','ender_chest','beacon','conduit','amethyst_cluster','large_amethyst_bud','medium_amethyst_bud','small_amethyst_bud','sculk_catalyst','glow_lichen','end_portal_frame'])assert.ok(read([block(id)]).materials[id],id)
 for(const id of ['sculk_sensor','calibrated_sculk_sensor'])for(const phase of ['active','inactive','cooldown'])assert.equal(read([block(id,{sculk_sensor_phase:phase})]).blocks[0].level,1)
 for(const waterlogged of ['true','false'])assert.equal(read([block('conduit',{waterlogged})]).blocks[0].level,15)
})
