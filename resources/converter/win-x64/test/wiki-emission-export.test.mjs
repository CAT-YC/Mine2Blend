import test,{before} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {execFileSync} from 'node:child_process'
import {NbtFile,NbtCompound,NbtInt,NbtShort,NbtByteArray} from 'deepslate'
import {EMISSIVE_RULES} from '../src/emissive-blocks.mjs'
const runtime=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
let temp,input,folder
before(()=>{
 temp=fs.mkdtempSync(path.join(os.tmpdir(),'m2b-wiki-emissive-'))
 const samples=[]
 for(const [id,rule] of Object.entries(EMISSIVE_RULES)){
  if(id==='flowing_lava')continue
  const properties={...(rule.when??{})}
  if(rule.levelProperty)properties[rule.levelProperty]=Object.entries(rule.levels).reduce((best,p)=>p[1]>best[1]?p:best)[0]
  if(id==='glow_lichen')properties.north='true'
  samples.push('minecraft:'+id+(Object.keys(properties).length?'['+Object.entries(properties).map(p=>p.join('=')).join(',')+']':''))
 }
 samples.push('minecraft:redstone_ore[lit=false]','minecraft:deepslate_redstone_ore[lit=false]','minecraft:respawn_anchor[charges=0]','minecraft:respawn_anchor[charges=1]','minecraft:cave_vines[berries=false]','minecraft:glass','minecraft:oak_trapdoor[half=bottom,open=false,facing=north]','minecraft:lantern')
 const palette=['minecraft:air',...samples],p=new NbtCompound();palette.forEach((s,i)=>p.set(s,new NbtInt(i)))
 const bytes=[];for(let x=0;x<samples.length*2;x++){let n=x%2?0:x/2+1;do{const rest=n>>>7;bytes.push((n&127)|(rest?128:0));n=rest}while(n)}
 const file=NbtFile.create({compression:'gzip'});file.root.set('Version',new NbtInt(2)).set('Width',new NbtShort(samples.length*2)).set('Height',new NbtShort(1)).set('Length',new NbtShort(1)).set('Palette',p).set('BlockData',new NbtByteArray(bytes))
 input=path.join(temp,'wiki.schem');fs.writeFileSync(input,Buffer.from(file.write()))
 execFileSync(process.execPath,[path.join(runtime,'src/batch-obj-export.mjs'),'import','--input',input,'--output',path.join(temp,'out'),'--preserve-adjacent-faces','--cull-translucent-overlap'],{cwd:runtime})
 folder=path.join(temp,'out/wiki')
})
const manifest=()=>JSON.parse(fs.readFileSync(path.join(folder,'wiki.emissives.json')))
test('全部随包规则真实转换并输出状态面清单与像素掩码',()=>{
 const doc=manifest();assert.equal(doc.version,2);assert.ok(doc.surfaces.length>500,'缺少实际面状态关联')
 assert.ok(fs.existsSync(path.join(folder,'emissive-mask.png')))
 assert.deepEqual(fs.readFileSync(path.join(folder,'emissive-mask.png')),fs.readFileSync(path.join(runtime,'assets/emissive-mask.png')))
 for(const [id] of Object.entries(EMISSIVE_RULES))if(id!=='flowing_lava'){
  assert.ok(doc.materials[id],id);assert.ok(doc.surfaces.some(s=>s.material===id||s.material.startsWith(id+'_c_')),id+'无实际几何')
 }
 for(const id of ['redstone_ore','deepslate_redstone_ore','respawn_anchor']){
  const weights=doc.surfaces.filter(s=>s.material===id).map(s=>s.weight);assert.ok(weights.includes(0),id+'丢失灭状态');assert.ok(weights.includes(1),id+'丢失亮状态')
 }
})
test('百科扩展保持旧OBJ/MTL/薄片表面清单/原灯笼数据逐字节一致',{skip:!process.env.M2B_BASELINE_CONVERTER},()=>{
 execFileSync(process.execPath,[process.env.M2B_BASELINE_CONVERTER,'import','--input',input,'--output',path.join(temp,'baseline'),'--preserve-adjacent-faces','--cull-translucent-overlap'],{cwd:runtime})
 for(const ext of ['obj','mtl','surfaces.json','lanterns.json'])assert.deepEqual(fs.readFileSync(path.join(folder,'wiki.'+ext)),fs.readFileSync(path.join(temp,'baseline/wiki/wiki.'+ext)),ext)
})
