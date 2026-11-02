import {before,after,test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {execFileSync} from 'node:child_process'
import {NbtFile,NbtCompound,NbtInt,NbtShort,NbtByteArray} from 'deepslate'
const runtime=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const cases=[['sea_lantern',0],['bamboo_block',0],['bamboo_planks',0],['nether_wart_block',0],['stripped_bamboo_block',0],['bamboo_mosaic',0],['stone_slab[type=bottom]',.5],['oak_trapdoor[facing=north,half=bottom,open=false]',13/16],['oak_fence',15/16,'up'],['cobblestone_wall',.75,'up'],['snow[layers=1]',0,'up']]
let temp,faces
before(()=>{
 temp=fs.mkdtempSync(path.join(os.tmpdir(),'m2b-contact-'))
 const palette=new NbtCompound().set('minecraft:air',new NbtInt(0)).set('minecraft:glass',new NbtInt(1))
 cases.forEach(([state],i)=>palette.set('minecraft:'+state,new NbtInt(i+2)))
 const width=cases.length*4,data=new Array(width*3).fill(0)
 cases.forEach(([, ,direction],i)=>{data[i*4]=1;data[i*4+(direction==='up'?width:1)]=i+2})
 const nbt=NbtFile.create({compression:'gzip'});nbt.root.set('Version',new NbtInt(2)).set('Width',new NbtShort(width)).set('Height',new NbtShort(3)).set('Length',new NbtShort(1)).set('Palette',palette).set('BlockData',new NbtByteArray(data))
 const input=path.join(temp,'fixture.schem');fs.writeFileSync(input,Buffer.from(nbt.write()))
 execFileSync(process.execPath,[process.env.M2B_TEST_CONVERTER??path.join(runtime,'src/batch-obj-export.mjs'),'import','--input',input,'--output',temp,'--format','obj','--preserve-adjacent-faces','--cull-translucent-overlap'],{cwd:runtime})
 const verts=[];let material='';faces=[]
 for(const line of fs.readFileSync(path.join(temp,'fixture/fixture.obj'),'utf8').split('\n')){
  const [tag,...p]=line.trim().split(/\s+/)
  if(tag==='v')verts.push(p.map(Number));else if(tag==='usemtl')material=p[0];else if(tag==='f')faces.push({material,p:p.map(r=>verts[Number(r.split('/')[0])-1])})
 }
})
after(()=>{if(temp&&path.dirname(temp)===os.tmpdir()&&path.basename(temp).startsWith('m2b-contact-'))fs.rmSync(temp,{recursive:true,force:true})})
cases.forEach(([state,want,direction],i)=>test(`正式CLI玻璃贴${state}仅保留外露面积${want}`,()=>{
 const axis=direction==='up'?1:0,plane=direction==='up'?1:i*4+1
 const selected=faces.filter(f=>f.material==='glass'&&f.p.every(p=>Math.abs(p[axis]-plane)<1e-6&&p[0]>=i*4&&p[0]<=i*4+1))
 const area=selected.reduce((s,{p:[a,b,c]})=>{const u=b.map((v,k)=>v-a[k]),v=c.map((n,k)=>n-a[k]);return s+Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])/2},0)
 assert.ok(Math.abs(area-want)<1e-6,`${area} != ${want}`)
}))
