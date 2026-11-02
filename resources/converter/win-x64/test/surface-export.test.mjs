import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {before,after,test} from 'node:test'
import {NbtFile,NbtCompound,NbtInt,NbtShort,NbtByteArray} from 'deepslate'

const runtime=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
let temp,folder,quads,surfaces
before(()=>{
 temp=fs.mkdtempSync(path.join(os.tmpdir(),'m2b-surfaces-'))
 const states=['minecraft:air','minecraft:bamboo[age=1,leaves=large,stage=0]','minecraft:bamboo_sapling',
  'minecraft:pitcher_plant[half=lower]','minecraft:pitcher_plant[half=upper]',
  'minecraft:open_eyeblossom','minecraft:water_cauldron[level=1]','minecraft:packed_ice','minecraft:blue_ice',
  'minecraft:oak_wall_hanging_sign[facing=north]','minecraft:sunflower[half=upper]','minecraft:redstone_wire','minecraft:glass',
  'minecraft:stone_slab[type=bottom]','minecraft:glass_pane[east=true]','minecraft:stone']
 const palette=new NbtCompound();states.forEach((s,i)=>palette.set(s,new NbtInt(i)))
 const data=new Array(64*3).fill(0)
 for(const [x,id] of [[0,1],[4,2],[8,3],[12,5],[16,6],[20,7],[24,8],[28,9],[32,10],[36,11]]) data[x]=id
 data[8+64]=4
 data[40]=12;data[41]=7
 data[44]=12;data[45]=13;data[48]=14;data[49]=15
 const nbt=NbtFile.create({compression:'gzip'})
 nbt.root.set('Version',new NbtInt(2)).set('Width',new NbtShort(64)).set('Height',new NbtShort(3)).set('Length',new NbtShort(1)).set('Palette',palette).set('BlockData',new NbtByteArray(data))
 const input=path.join(temp,'fixture.schem');fs.writeFileSync(input,Buffer.from(nbt.write()))
 execFileSync(process.execPath,[process.env.M2B_TEST_CONVERTER??path.join(runtime,'src/batch-obj-export.mjs'),'import','--input',input,'--output',path.join(temp,'out'),'--format','obj','--preserve-adjacent-faces','--cull-translucent-overlap'],{cwd:runtime,encoding:'utf8'})
 folder=path.join(temp,'out','fixture')
 const vertices=[],uvs=[],normals=[],triangles=[];let material=''
 for(const line of fs.readFileSync(path.join(folder,'fixture.obj'),'utf8').split('\n')){
  const [tag,...p]=line.trim().split(/\s+/)
  if(tag==='v')vertices.push(p.map(Number));else if(tag==='vt')uvs.push(p.map(Number));else if(tag==='vn')normals.push(p.map(Number));else if(tag==='usemtl')material=p[0]
  else if(tag==='f')triangles.push({material,refs:p.map(s=>s.split('/').map(Number))})
 }
 quads=[]
 for(let i=0;i<triangles.length;i+=2){const a=triangles[i],b=triangles[i+1];quads.push({material:a.material,points:[...a.refs,b.refs[2]].map(r=>vertices[r[0]-1])})}
 const file=path.join(folder,'fixture.surfaces.json');surfaces=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null
})
after(()=>{if(temp?.startsWith(os.tmpdir())&&path.basename(temp).startsWith('m2b-surfaces-'))fs.rmSync(temp,{recursive:true,force:true})})
const inCell=x=>quads.filter(q=>q.points.every(p=>p[0]>=x-1&&p[0]<x+3))
test('竹叶和竹苗各保留单份双面表面',()=>{assert.equal(inCell(0).length,8);assert.equal(inCell(4).length,2)})
test('不导出零面积三角面',()=>{
 for(const q of quads){const [a,b,c,d]=q.points;for(const [p,r] of [[b,c],[c,d]]){const u=p.map((v,i)=>v-a[i]),v=r.map((n,i)=>n-a[i]);assert.ok(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])>1e-10,q.material)}}
})
test('表面清单保留不同的正反UV和发光层',()=>{
 assert.ok(surfaces,'缺少版本化表面清单');assert.equal(surfaces.version,1)
 assert.ok(surfaces.surfaces.some(s=>s.vertices.some(v=>Math.abs(v[3]-v[5])>1e-6||Math.abs(v[4]-v[6])>1e-6)))
 assert.ok(surfaces.surfaces.some(s=>s.material.includes('open_eyeblossom')&&s.vertices.some(v=>v[11]>0)))
 assert.equal(inCell(12).length,2,'底图和发光层不再保留四套共面三角面')
})
test('炼药锅区分水和金属，浮冰蓝冰MTL不再半透明',()=>{
 assert.ok(inCell(16).some(q=>q.material.includes('__opaque')))
 assert.ok(inCell(16).some(q=>q.material.includes('__water')))
 const mtl=fs.readFileSync(path.join(folder,'fixture.mtl'),'utf8')
 for(const name of ['packed_ice','blue_ice']) assert.match(mtl,new RegExp('newmtl '+name+'\\n(?:(?!newmtl)[\\s\\S])*?d 1\\.00'))
})
test('红石同向叠层保留',()=>assert.equal(inCell(36).length,2))
test('浮冰作为实心遮挡时保浮冰面、仅剔玻璃内面',()=>{
 const contact=quads.filter(q=>q.points.every(p=>Math.abs(p[0]-41)<1e-6))
 assert.deepEqual(contact.map(q=>q.material),['packed_ice'])
})
test('局部遮挡：玻璃贴下半砖时保上半面及对应高度',()=>{
 const faces=quads.filter(q=>q.material==='glass'&&q.points.every(p=>Math.abs(p[0]-45)<1e-6))
 assert.equal(faces.length,1)
 assert.equal(Math.min(...faces[0].points.map(p=>p[1])),.5)
 assert.equal(Math.max(...faces[0].points.map(p=>p[1])),1)
})
test('局部遮挡：玻璃板贴石头只删细端面',()=>{
 const faces=quads.filter(q=>q.material==='glass_pane'&&q.points.every(p=>Math.abs(p[0]-49)<1e-6))
 assert.equal(faces.length,0)
 assert.equal(quads.filter(q=>q.material==='stone'&&q.points.every(p=>Math.abs(p[0]-49)<1e-6)).length,1)
})
