import assert from 'node:assert/strict'
import {test,before} from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {execFileSync} from 'node:child_process'
import {NbtFile,NbtCompound,NbtInt,NbtShort,NbtByteArray} from 'deepslate'
const runtime=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
let temp,folder,input
before(()=>{
 temp=fs.mkdtempSync(path.join(os.tmpdir(),'m2b-emissive-test-'))
 const states=['minecraft:air','minecraft:torch','minecraft:wall_torch[facing=east]','minecraft:soul_torch','minecraft:soul_wall_torch[facing=north]',
 'minecraft:redstone_torch[lit=true]','minecraft:redstone_torch[lit=false]','minecraft:redstone_wall_torch[lit=true,facing=west]','minecraft:redstone_wall_torch[lit=false,facing=south]',
 'minecraft:glowstone','minecraft:sea_lantern','minecraft:redstone_lamp[lit=true]','minecraft:redstone_lamp[lit=false]','minecraft:shroomlight',
 'minecraft:ochre_froglight[axis=x]','minecraft:verdant_froglight[axis=y]','minecraft:pearlescent_froglight[axis=z]','minecraft:end_rod[facing=east]',
 'minecraft:lava[level=0]','minecraft:chest','minecraft:glass','minecraft:oak_trapdoor[half=bottom,open=false,facing=north]','minecraft:lantern[hanging=false]']
 const p=new NbtCompound();states.forEach((s,i)=>p.set(s,new NbtInt(i)))
 const n=NbtFile.create({compression:'gzip'});n.root.set('Version',new NbtInt(2)).set('Width',new NbtShort(states.length-1)).set('Height',new NbtShort(1)).set('Length',new NbtShort(1)).set('Palette',p).set('BlockData',new NbtByteArray(states.slice(1).map((_,i)=>i+1)))
 input=path.join(temp,'fixture.schem');fs.writeFileSync(input,Buffer.from(n.write()))
 execFileSync(process.execPath,[path.join(runtime,'src/batch-obj-export.mjs'),'import','--input',input,'--output',path.join(temp,'out'),'--preserve-adjacent-faces','--cull-translucent-overlap'],{cwd:runtime})
 folder=path.join(temp,'out/fixture')
})
const manifest=()=>{const f=path.join(folder,'fixture.emissives.json');assert.ok(fs.existsSync(f),'缺少常用发光清单');return JSON.parse(fs.readFileSync(f))}
test('导出常用光源并保留亮灭状态的贴图掩码',()=>{
 const m=manifest();assert.equal(m.version,2)
 for(const id of ['torch','wall_torch','soul_torch','soul_wall_torch','redstone_torch','redstone_wall_torch','glowstone','sea_lantern','redstone_lamp','shroomlight','ochre_froglight','verdant_froglight','pearlescent_froglight','end_rod','lava']){
  assert.ok(m.materials[id],id);assert.ok(m.materials[id].regions.length);assert.ok(m.materials[id].strength>0)
 }
 for(const id of ['glass','chest','oak_trapdoor','lantern'])assert.equal(m.materials[id],undefined)
})
test('独立语义清单不改变原几何、透明面或灯笼位置',{skip:!process.env.M2B_BASELINE_CONVERTER},()=>{
 const baseline=process.env.M2B_BASELINE_CONVERTER;assert.ok(baseline,'此回归必须指定0.5.7基线')
 execFileSync(process.execPath,[baseline,'import','--input',input,'--output',path.join(temp,'baseline'),'--preserve-adjacent-faces','--cull-translucent-overlap'],{cwd:runtime})
 for(const ext of ['obj','mtl','surfaces.json','lanterns.json'])assert.deepEqual(fs.readFileSync(path.join(folder,'fixture.'+ext)),fs.readFileSync(path.join(temp,'baseline/fixture/fixture.'+ext)),ext)
})
test('排除普通方块分区时不携带未导入光源',()=>{
 execFileSync(process.execPath,[path.join(runtime,'src/batch-obj-export.mjs'),'import','--input',input,'--output',path.join(temp,'entities'),'--include','blockEntities'],{cwd:runtime})
 const f=path.join(temp,'entities/fixture/fixture.emissives.json');assert.ok(fs.existsSync(f),'缺少分区发光清单');assert.deepEqual(JSON.parse(fs.readFileSync(f)).materials,{})
})
