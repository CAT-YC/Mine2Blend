import assert from 'node:assert/strict'
import {test,before,after} from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {execFileSync} from 'node:child_process'
import {NbtFile,NbtCompound,NbtInt,NbtShort,NbtByteArray} from 'deepslate'

const runtime=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const copper=['copper_bars','exposed_copper_bars','weathered_copper_bars','oxidized_copper_bars',
 'waxed_copper_bars','waxed_exposed_copper_bars','waxed_weathered_copper_bars','waxed_oxidized_copper_bars',
 'copper_grate','exposed_copper_grate','weathered_copper_grate','oxidized_copper_grate',
 'waxed_copper_grate','waxed_exposed_copper_grate','waxed_weathered_copper_grate','waxed_oxidized_copper_grate','iron_bars']
const directions=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]
const cases=copper.flatMap(id=>directions.map((dir,d)=>({id,dir,d})))
let temp,faces

function schem(filename,blocks,size){
 const states=['minecraft:air',...new Set(blocks.map(b=>b.state))],ids=new Map(states.map((s,i)=>[s,i]))
 const palette=new NbtCompound();states.forEach((s,i)=>palette.set(s,new NbtInt(i)))
 const data=new Array(size[0]*size[1]*size[2]).fill(0)
 for(const {p:[x,y,z],state} of blocks)data[x+size[0]*(z+size[2]*y)]=ids.get(state)
 const encoded=[];for(let value of data){do{let byte=value&127;value>>>=7;if(value)byte|=128;encoded.push(byte)}while(value)}
 const nbt=NbtFile.create({compression:'gzip'})
 nbt.root.set('Version',new NbtInt(2)).set('Width',new NbtShort(size[0])).set('Height',new NbtShort(size[1])).set('Length',new NbtShort(size[2])).set('Palette',palette).set('BlockData',new NbtByteArray(encoded))
 fs.writeFileSync(filename,Buffer.from(nbt.write()))
}
function read(filename){
 const vertices=[],faces=[];let material=''
 for(const line of fs.readFileSync(filename,'utf8').split('\n')){
  const [tag,...values]=line.trim().split(/\s+/)
  if(tag==='v')vertices.push(values.map(Number));else if(tag==='usemtl')material=values[0]
  else if(tag==='f')faces.push({material,p:values.map(ref=>vertices[Number(ref.split('/')[0])-1])})
 }
 return faces
}
function convert(name,extra=[]){
 execFileSync(process.execPath,[process.env.M2B_TEST_CONVERTER??path.join(runtime,'src/batch-obj-export.mjs'),'import','--input',path.join(temp,name+'.schem'),'--output',path.join(temp,name+'-out'),'--format','obj','--cull-translucent-overlap',...extra],{cwd:runtime,timeout:30000,stdio:'pipe'})
 return read(path.join(temp,name+'-out',name,name+'.obj'))
}
before(()=>{
 temp=fs.mkdtempSync(path.join(os.tmpdir(),'m2b-copper-occlusion-'))
 const blocks=[{p:[0,0,0],state:'minecraft:bedrock'}]
 cases.forEach((c,i)=>{
  c.center=[i*4+1,1,1]
  blocks.push({p:c.center,state:'minecraft:stone'},{p:c.center.map((n,k)=>n+c.dir[k]),state:'minecraft:'+c.id+(c.id.endsWith('_bars')?'[east=true,west=true,north=true,south=true]':'')})
 })
 schem(path.join(temp,'contacts.schem'),blocks,[cases.length*4,3,3]);faces=convert('contacts')
})
after(()=>{if(temp&&path.dirname(temp)===os.tmpdir()&&path.basename(temp).startsWith('m2b-copper-occlusion-'))fs.rmSync(temp,{recursive:true,force:true})})

// 若镂空邻块被当作实心，石头朝该方向的整面会消失，透过孔洞就看见内部黑洞。
for(const id of copper)test(`${id}六方向均保留孔洞后可见的邻块表面`,()=>{
 for(const c of cases.filter(c=>c.id===id)){
  const axis=c.dir.findIndex(n=>n),plane=c.center[axis]+(c.dir[axis]>0?1:0)
  const contact=faces.filter(f=>f.material==='stone'&&f.p.every(p=>Math.abs(p[axis]-plane)<1e-6&&p.every((n,k)=>n>=c.center[k]-1e-6&&n<=c.center[k]+1+1e-6)))
  assert.equal(contact.length,2,`${id}方向${c.dir}的石头面被误删`)
 }
})
test('超过5000块的整块遮挡优化不能穿过铜栅栏删除中央实心块',()=>{
 const blocks=[],center=[1,1,1]
 blocks.push({p:center,state:'minecraft:diamond_block'})
 for(const dir of directions)blocks.push({p:center.map((n,k)=>n+dir[k]),state:'minecraft:waxed_exposed_copper_bars[east=true,west=true,north=true,south=true]'})
 for(let x=5;x<5000;x++)blocks.push({p:[x,0,0],state:'minecraft:stone'})
 schem(path.join(temp,'volume.schem'),blocks,[5000,3,3])
 const output=convert('volume')
 assert.equal(output.filter(f=>f.material==='diamond_block').length,12,'中央方块应可透过六侧铜栅栏孔洞看见')
})
