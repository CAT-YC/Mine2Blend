import {test,before,after} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {execFileSync} from 'node:child_process'
import {Quad,Vertex,Vector,NbtFile,NbtCompound,NbtInt,NbtShort,NbtByteArray} from 'deepslate'
import {cullTranslucentContactFaces} from '../src/contact-culling.mjs'

function face(sign){
 const points=[[0,0],[1,0],[1,1],[0,1]];if(sign<0)points.reverse()
 return new Quad(...points.map(([y,z])=>new Vertex(new Vector(1,y,z),[1,1,1],[y,z])))
}
const texture=alpha=>({width:2,height:2,data:new Uint8ClampedArray(alpha.flatMap(a=>[128,128,128,a]))})
const subject=(id,sign)=>({quad:face(sign),blockId:'minecraft:'+id,position:sign>0?[0,0,0]:[1,0,0]})
const area=out=>out.reduce((total,{quad})=>{const p=quad.vertices().map(v=>v.pos);return total+(Math.max(...p.map(v=>v.y))-Math.min(...p.map(v=>v.y)))*(Math.max(...p.map(v=>v.z))-Math.min(...p.map(v=>v.z)))},0)

test('相连栏杆端盖只按邻面Alpha255裁去，孔洞和半透明覆盖不能删整面',()=>{
 const a=subject('waxed_exposed_copper_bars',1),b=subject('waxed_exposed_copper_bars',-1)
 const result=cullTranslucentContactFaces([a,b],{textureAtlas:texture([255,0,128,255])})
 assert.equal(area(result.filter(e=>e.position[0]===0)),.5)
 assert.equal(area(result.filter(e=>e.position[0]===1)),.5)
 for(const entry of result)for(const vertex of entry.quad.vertices())assert.deepEqual(vertex.texture,[vertex.pos.y,vertex.pos.z])
})
test('铜栏不同氧化涂蜡变体和铁栏杆相接也消除内部反向重叠',()=>{
 for(const [a,b] of [['copper_bars','waxed_copper_bars'],['oxidized_copper_bars','weathered_copper_bars'],['iron_bars','copper_bars'],['copper_grate','waxed_oxidized_copper_grate']])
  assert.equal(cullTranslucentContactFaces([subject(a,1),subject(b,-1)],{textureAtlas:texture([255,255,255,255])}).length,0,a+' / '+b)
})
test('贴实心方块时移除栏杆内端盖，邻块面及外露栏杆保持',()=>{
 const bar=subject('copper_bars',1),wood=subject('spruce_planks',-1)
 const exposed={...subject('copper_bars',1),position:[0,2,0],quad:new Quad(...[[2,0],[3,0],[3,1],[2,1]].map(([y,z])=>new Vertex(new Vector(1,y,z),[1,1,1],[y-2,z])))}
 const result=cullTranslucentContactFaces([bar,wood,exposed],{textureAtlas:texture([255,255,255,255])})
 assert.deepEqual(result,[wood,exposed])
})
test('无图集保守保留栏杆，接触玻璃时不把玻璃当实心裁栏杆',()=>{
 const a=subject('copper_bars',1),b=subject('spruce_planks',-1)
 assert.deepEqual(cullTranslucentContactFaces([a,b]),[a,b])
 const glass=subject('glass',-1),result=cullTranslucentContactFaces([a,glass],{textureAtlas:texture([255,0,128,255])})
 assert.ok(result.includes(a));assert.equal(area(result.filter(e=>e.blockId==='minecraft:glass')),.5)
})

const runtime=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const ids=['copper_bars','exposed_copper_bars','weathered_copper_bars','oxidized_copper_bars','waxed_copper_bars','waxed_exposed_copper_bars','waxed_weathered_copper_bars','waxed_oxidized_copper_bars','iron_bars']
const dirs=[['east','west',[1,0,0]],['west','east',[-1,0,0]],['south','north',[0,0,1]],['north','south',[0,0,-1]]]
const cases=[];let temp,raw,clipped
function write(filename){
 const states=['minecraft:air','minecraft:bedrock'],blocks=[{p:[0,0,0],state:'minecraft:bedrock'}]
 for(const [i,id] of ids.entries())for(const [d,[direction,opposite,offset]] of dirs.entries()){
  const center=[i*5+2,1,d*5+2],next=center.map((n,k)=>n+offset[k]);const kind=direction=>`minecraft:${id}[east=${direction==='east'},west=${direction==='west'},north=${direction==='north'},south=${direction==='south'}]`
  blocks.push({p:center,state:kind(direction)},{p:next,state:kind(opposite)})
  const axis=offset.findIndex(n=>n);cases.push({id,center,next,axis,plane:center[axis]+(offset[axis]>0?1:0)})
 }
 for(const {state} of blocks)if(!states.includes(state))states.push(state)
 const palette=new NbtCompound();states.forEach((s,i)=>palette.set(s,new NbtInt(i)))
 const size=[ids.length*5+2,3,22],data=new Array(size[0]*size[1]*size[2]).fill(0)
 for(const {p:[x,y,z],state} of blocks)data[x+size[0]*(z+size[2]*y)]=states.indexOf(state)
 const nbt=NbtFile.create({compression:'gzip'});nbt.root.set('Version',new NbtInt(2)).set('Width',new NbtShort(size[0])).set('Height',new NbtShort(size[1])).set('Length',new NbtShort(size[2])).set('Palette',palette).set('BlockData',new NbtByteArray(data))
 fs.writeFileSync(filename,Buffer.from(nbt.write()))
}
function read(file){
 const vertices=[],uvs=[],normals=[],faces=[];let material=''
 for(const line of fs.readFileSync(file,'utf8').split('\n')){
  const [tag,...data]=line.trim().split(/\s+/)
  if(tag==='v')vertices.push(data.map(Number));else if(tag==='vt')uvs.push(data.map(Number));else if(tag==='vn')normals.push(data.map(Number));else if(tag==='usemtl')material=data[0]
  else if(tag==='f')faces.push({material,corners:data.map(s=>{const [v,t,n]=s.split('/').map(Number);return {p:vertices[v-1],uv:uvs[t-1],normal:normals[n-1]}})})
 }
 return faces
}
const touches=(face,c)=>face.material.startsWith(c.id)&&face.corners.every(({p})=>Math.abs(p[c.axis]-c.plane)<1e-6&&p.every((n,k)=>n>=Math.min(c.center[k],c.next[k])-1e-6&&n<=Math.max(c.center[k],c.next[k])+1+1e-6))
before(()=>{
 temp=fs.mkdtempSync(path.join(os.tmpdir(),'m2b-bar-caps-'));write(path.join(temp,'fixture.schem'))
 for(const [mode,extra] of [['raw',[]],['clipped',['--cull-translucent-overlap']]]){
  execFileSync(process.execPath,[path.join(runtime,'src/batch-obj-export.mjs'),'import','--input',path.join(temp,'fixture.schem'),'--output',path.join(temp,mode),'--preserve-adjacent-faces',...extra],{cwd:runtime,timeout:30000,stdio:'pipe'})
  const faces=read(path.join(temp,mode,'fixture/fixture.obj'));if(mode==='raw')raw=faces;else clipped=faces
 }
})
after(()=>{if(temp&&path.dirname(temp)===os.tmpdir()&&path.basename(temp).startsWith('m2b-bar-caps-'))fs.rmSync(temp,{recursive:true,force:true})})
for(const id of ids)test(`正式插件路径${id}四向内部端盖消除且外露面几何UV保持`,()=>{
 for(const c of cases.filter(c=>c.id===id)){
  assert.equal(raw.filter(f=>touches(f,c)).length,4,'原模型应确有两张反向重叠端盖')
  assert.equal(clipped.filter(f=>touches(f,c)).length,0,`${id}残留会自遮挡的内部端盖`)
 }
 const outside=faces=>faces.filter(f=>f.material.startsWith(id)&&!cases.some(c=>touches(f,c)))
 assert.deepEqual(outside(clipped),outside(raw),'外露栏杆、孔洞边缘及正反UV不得改变')
})
