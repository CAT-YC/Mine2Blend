import {test} from 'node:test'
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {Quad,Vertex,Vector} from 'deepslate'
import {cullTranslucentContactFaces} from '../src/contact-culling.mjs'

function face(sign,uv=(y,z)=>[y,z],bounds=[0,1,0,1]){
 const [y0,y1,z0,z1]=bounds
 const points=[[y0,z0],[y1,z0],[y1,z1],[y0,z1]]
 if(sign<0)points.reverse()
 return new Quad(...points.map(([y,z])=>new Vertex(new Vector(1,y,z),[1,1,1],uv(y,z))))
}
const atlas=(alpha,width=2,height=2)=>({width,height,data:new Uint8ClampedArray(alpha.flatMap(a=>[255,255,255,a]))})
const entries=(uv,bounds,id='minecraft:oak_trapdoor')=>[
 {quad:face(1),blockId:'minecraft:glass',position:[0,0,0]},
 {quad:face(-1,uv,bounds),blockId:id,position:[1,0,0]},
]
const remains=(out,y,z)=>out.some(e=>e.blockId==='minecraft:glass'&&(()=>{const p=e.quad.vertices().map(v=>v.pos);return y>Math.min(...p.map(v=>v.y))+1e-8&&y<Math.max(...p.map(v=>v.y))-1e-8&&z>Math.min(...p.map(v=>v.z))+1e-8&&z<Math.max(...p.map(v=>v.z))-1e-8})())
const area=out=>out.filter(e=>e.blockId==='minecraft:glass').reduce((s,e)=>{const p=e.quad.vertices().map(v=>v.pos);return s+(Math.max(...p.map(v=>v.y))-Math.min(...p.map(v=>v.y)))*(Math.max(...p.map(v=>v.z))-Math.min(...p.map(v=>v.z)))},0)
const run=(input,textureAtlas)=>cullTranslucentContactFaces(input,{textureAtlas,isOpaqueContactBlock:()=>false})
test('实际Alpha255覆盖才裁玻璃，镂空与半透明像素保留且UV不漂移',()=>{
 const input=entries(),out=run(input,atlas([255,0,128,255]))
 assert.equal(area(out),.5)
 for(const [y,z,want] of [[.25,.25,false],[.75,.25,true],[.25,.75,true],[.75,.75,false]])assert.equal(remains(out,y,z),want)
 assert.ok(out.includes(input[1]),'邻块原面保持引用')
 for(const e of out.filter(e=>e.blockId==='minecraft:glass'))for(const v of e.quad.vertices())assert.deepEqual(v.texture,[v.pos.y,v.pos.z])
})
test('UV旋转和镜像后镂空落在对应位置',()=>{
 for(const [uv,points] of [
  [(y,z)=>[z,1-y],[[.75,.25,false],[.25,.75,true]]],
  [(y,z)=>[1-y,z],[[.75,.25,false],[.25,.75,true]]],
 ]){
  const out=run(entries(uv),atlas([255,0,0,0]));assert.equal(area(out),.75)
  for(const [y,z,want] of points)assert.equal(remains(out,y,z),want)
 }
})
test('局部实心边界只裁局部：墙柱覆盖四分之一，外露面保留',()=>{
 const out=run(entries(undefined,[.25,.75,.25,.75],'minecraft:cobblestone_wall'),atlas([255,255,255,255]))
 assert.equal(area(out),.75);assert.equal(remains(out,.1,.3),true);assert.equal(remains(out,.4,.4),false)
})
test('没有透明方块接触的普通面不因纹理采样被改写',()=>{
 const input=entries().map(e=>({...e,blockId:'minecraft:stone'}));assert.deepEqual(run(input,atlas([255,0,0,255])),input)
})
test('不同透明介质仍保留双方，即使贴图Alpha全255',()=>{
 const input=entries(undefined,undefined,'minecraft:red_stained_glass');assert.deepEqual(run(input,atlas([255,255,255,255])),input)
})
test('缺失或倾斜UV安全保留，不把包围盒当不透明面',()=>{
 for(const uv of [(y,z)=>[y+.1*z,z],()=>undefined])assert.equal(area(run(entries(uv),atlas([255,255,255,255]))),1)
})
test('重复贴图与负UV按Repeat映射，不能忽略透明格',()=>{
 const out=run(entries((y,z)=>[2*y-1,z]),atlas([255,0,255,0]))
 assert.equal(area(out),.5)
 for(const [y,want] of [[.125,false],[.375,true],[.625,false],[.875,true]])assert.equal(remains(out,y,.3),want)
})
test('高碎片纹理安全保留原面，不产生数万裁切片或阻塞转换',()=>{
 const size=256,alpha=Array.from({length:size*size},(_,i)=>(i%size+Math.floor(i/size))%2?0:255)
 const out=run(entries(),atlas(alpha,size,size))
 assert.equal(area(out),1,'超出碎片预算时应保留原面，不能误删镂空')
})
test('双面薄片邻块顺序保持，防止后续正反表面合并翻转',()=>{
 const pair=entries(),back={...pair[1],quad:face(1)}
 const input=[pair[1],back,pair[0]],out=run(input,atlas([255,255,255,255]))
 assert.deepEqual(out,[pair[1],back])
})
test('超安全整数的有限UV不应卡住像素边界枚举',()=>{
 const moduleUrl=new URL('../src/contact-opacity.mjs',import.meta.url).href
 const code=`import {createOpaqueContactSampler} from ${JSON.stringify(moduleUrl)};const a=2**53;const corners=Object.fromEntries(Object.entries({c00:[a,0],c10:[a+4,0],c11:[a+4,1],c01:[a,1]}).map(([k,texture])=>[k,{texture}]));const sample=createOpaqueContactSampler({width:1,height:1,data:new Uint8Array([0,0,0,255])});console.log(JSON.stringify(sample({quad:{}},{rect:{uMin:0,uMax:1,vMin:0,vMax:1},corners})));`
 assert.equal(execFileSync(process.execPath,['--input-type=module','-e',code],{timeout:1500,encoding:'utf8'}).trim(),'[]')
})
