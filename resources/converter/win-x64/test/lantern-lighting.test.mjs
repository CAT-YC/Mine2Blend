import assert from 'node:assert/strict'
import {test,before} from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {execFileSync} from 'node:child_process'
import {NbtFile,NbtCompound,NbtInt,NbtShort,NbtByteArray} from 'deepslate'
const runtime=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
let output,input,temp
before(()=>{
 temp=fs.mkdtempSync(path.join(os.tmpdir(),'m2b-lantern-test-'))
 const states=['minecraft:air','minecraft:lantern[hanging=false,waterlogged=false]','minecraft:lantern[hanging=true,waterlogged=false]',
  'minecraft:soul_lantern[hanging=false,waterlogged=false]','minecraft:soul_lantern[hanging=true,waterlogged=true]','minecraft:glass','minecraft:sea_lantern','minecraft:oak_trapdoor[half=bottom,open=false,facing=north,waterlogged=false,powered=false]','minecraft:chest']
 const palette=new NbtCompound();states.forEach((s,i)=>palette.set(s,new NbtInt(i)))
 const n=NbtFile.create({compression:'gzip'});n.root.set('Version',new NbtInt(2)).set('Width',new NbtShort(8)).set('Height',new NbtShort(1)).set('Length',new NbtShort(1)).set('Palette',palette).set('BlockData',new NbtByteArray([1,2,3,4,5,6,7,8]))
 input=path.join(temp,'fixture.schem');fs.writeFileSync(input,Buffer.from(n.write()))
 execFileSync(process.execPath,[path.join(runtime,'src/batch-obj-export.mjs'),'import','--input',input,'--output',path.join(temp,'out'),'--preserve-adjacent-faces','--cull-translucent-overlap'],{cwd:runtime})
 output=path.join(temp,'out/fixture')
})
test('导出普通与灵魂灯笼的独立灯光清单，悬挂高度跟随真实模型',()=>{
 const file=path.join(output,'fixture.lanterns.json');assert.ok(fs.existsSync(file),'缺少灯笼清单')
 const m=JSON.parse(fs.readFileSync(file));assert.equal(m.version,1);assert.equal(m.lanterns.length,4)
 assert.deepEqual(m.lanterns.map(x=>x.position),[[.5,3.5/16,.5],[1.5,4.5/16,.5],[2.5,3.5/16,.5],[3.5,4.5/16,.5]])
 assert.deepEqual(m.lanterns.map(x=>x.id),['lantern','lantern','soul_lantern','soul_lantern'])
 for(const id of ['lantern','soul_lantern']){assert.equal(m.materials[id].window.length,4);assert.ok(m.materials[id].window.every(x=>x>=0&&x<=1))}
})
test('只导入方块实体时不为未导入的灯笼创建灯光',()=>{
 execFileSync(process.execPath,[path.join(runtime,'src/batch-obj-export.mjs'),'import','--input',input,'--output',path.join(temp,'entities'),'--include','blockEntities'],{cwd:runtime})
 const f=path.join(temp,'entities/fixture/fixture.lanterns.json');assert.ok(fs.existsSync(f),'缺少分区灯光清单');assert.equal(JSON.parse(fs.readFileSync(f)).lanterns.length,0)
})
test('灯光导出保持0.5.6的OBJ/MTL/表面清单逐字节一致',()=>{
 const baseline=process.env.M2B_BASELINE_CONVERTER;if(!baseline)return
 execFileSync(process.execPath,[baseline,'import','--input',input,'--output',path.join(temp,'baseline'),'--preserve-adjacent-faces','--cull-translucent-overlap'],{cwd:runtime})
 for(const ext of ['obj','mtl','surfaces.json'])assert.deepEqual(fs.readFileSync(path.join(output,'fixture.'+ext)),fs.readFileSync(path.join(temp,'baseline/fixture/fixture.'+ext)),ext)
})
