import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { before, after, test } from 'node:test'
import { NbtByteArray, NbtCompound, NbtFile, NbtInt, NbtShort } from 'deepslate'

const runtime = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const converter = process.env.MCBLOCK_TEST_CONVERTER ?? path.join(runtime, 'src/batch-obj-export.mjs')
const cells = [
  [0,0,0,'oak_slab[type=bottom,waterlogged=true]'],
  [2,0,0,'oak_slab[type=bottom,waterlogged=false]'],
  [4,0,0,'seagrass'], [5,0,0,'water[level=0]'],
  [7,0,0,'brain_coral'],
  [9,0,0,'water_cauldron[level=3]'], [10,0,0,'water[level=0]'],
  [0,0,2,'water[level=0]'], [0,1,2,'seagrass'],
  [2,0,2,'kelp'], [4,0,2,'kelp_plant'],
  [6,0,2,'tall_seagrass[half=lower]'],
  [8,0,2,'oak_leaves[waterlogged=true]'],
  [10,0,2,'oak_fence[waterlogged=true]'],
  [2,0,1,'cobblestone_wall[up=false,north=none,east=none,south=none,west=none,waterlogged=true]'],
  [4,0,1,'cobblestone_wall[up=false,north=none,east=none,south=none,west=none,waterlogged=false]'],
  [11,0,0,'bubble_column'],
  [1,0,0,'oak_sign[rotation=0,waterlogged=true]'],
]
let temporary, output, triangles, materialText, source
function readTriangles(filename) {
  const vertices = [], result = []
  let material = ''
  for (const line of fs.readFileSync(filename,'utf8').split(/\r?\n/)) {
    if (line.startsWith('v ')) vertices.push(line.slice(2).split(/\s+/).map(Number))
    if (line.startsWith('usemtl ')) material = line.slice(7)
    if (line.startsWith('f ')) result.push({material,points:line.slice(2).split(/\s+/).map(ref=>vertices[Number(ref.split('/')[0])-1])})
  }
  return result
}
function inside(tri,x,y,z) {
  return tri.points.every(p=>p[0]>=x-1e-5&&p[0]<=x+1+1e-5&&p[1]>=y-1e-5&&p[1]<=y+1+1e-5&&p[2]>=z-1e-5&&p[2]<=z+1+1e-5)
}
const isWater = tri => /^water(?:_|$)/.test(tri.material) && !tri.material.startsWith('water_cauldron')
const at = (x,y,z) => triangles.filter(tri=>inside(tri,x,y,z))
before(()=>{
  temporary=fs.mkdtempSync(path.join(os.tmpdir(),'m2b-contained-water-'))
  source=path.join(temporary,'water-fixture.schem')
  const palette=new NbtCompound(), data=new Array(12*2*3).fill(0)
  palette.set('minecraft:air',new NbtInt(0))
  const ids=new Map()
  for(const [x,y,z,state] of cells){
    if(!ids.has(state)){ids.set(state,ids.size+1);palette.set('minecraft:'+state,new NbtInt(ids.get(state)))}
    data[(y*3+z)*12+x]=ids.get(state)
  }
  const nbt=NbtFile.create({compression:'gzip'})
  nbt.root.set('Version',new NbtInt(2)).set('Width',new NbtShort(12)).set('Height',new NbtShort(2)).set('Length',new NbtShort(3)).set('Palette',palette).set('BlockData',new NbtByteArray(data))
  fs.writeFileSync(source,Buffer.from(nbt.write()))
  execFileSync(process.execPath,[converter,'import','--input',source,'--output',path.join(temporary,'out'),'--format','obj','--preserve-adjacent-faces','--cull-translucent-overlap','--include','blocks,block-entities'],{encoding:'utf8',cwd:runtime})
  output=path.join(temporary,'out/water-fixture')
  triangles=readTriangles(path.join(output,'water-fixture.obj'))
  materialText=fs.readFileSync(path.join(output,'water-fixture.mtl'),'utf8')
  if(process.env.MCBLOCK_TEST_KEEP)fs.cpSync(temporary,process.env.MCBLOCK_TEST_KEEP,{recursive:true})
})
after(()=>{if(temporary)fs.rmSync(temporary,{recursive:true,force:true})})

test('含水半砖保留原主体，另有独立水面；干半砖没有水',()=>{
  assert.ok(at(0,0,0).some(t=>t.material.startsWith('oak_slab')))
  assert.ok(at(0,0,0).some(t=>isWater(t)&&t.points.every(p=>Math.abs(p[1]-8/9)<0.0001)),'含水半砖缺水面')
  assert.equal(at(2,0,0).filter(isWater).length,0)
  assert.match(materialText,/newmtl water[\s\S]*?Kd 0\.2471 0\.4627 0\.8941[\s\S]*?d 0\.45/)
})
test('海草、海带与上下海草保留植物并补同格水',()=>{
  for(const [x,y,z,name] of [[4,0,0,'seagrass'],[2,0,2,'kelp'],[4,0,2,'kelp_plant'],[6,0,2,'tall_seagrass']]){
    assert.ok(at(x,y,z).some(t=>t.material.startsWith(name)),name+'主体丢失')
    assert.ok(at(x,y,z).some(isWater),name+'缺同格水')
  }
})
test('缺省含水珊瑚、树叶及栅栏按资源默认值补水',()=>{
  for(const x of [7,8,10])assert.ok(at(x,0,x===7?0:2).some(isWater),'含水方块缺水：'+x)
})
test('纯水和植物统一邻接，炼药锅内部水不与邻格纯水连通',()=>{
  assert.equal(triangles.filter(t=>isWater(t)&&t.points.every(p=>Math.abs(p[0]-5)<1e-5&&p[2]<=1)).length,0,'海草/纯水间残留内部水面')
  assert.ok(triangles.some(t=>isWater(t)&&t.points.every(p=>Math.abs(p[0]-10)<1e-5&&p[2]<=1)),'炼药锅误当外部连通水')
  assert.equal(at(0,0,2).filter(t=>isWater(t)&&t.points.every(p=>Math.abs(p[1]-1)<1e-5)).length,0,'水生植物下方残留内部顶面')
})
test('补水不增加源方块计数或改写投影',()=>{
  const stats=JSON.parse(fs.readFileSync(path.join(temporary,'out/metadata.json'),'utf8')).outputs[0]
  assert.equal(stats.blockCount,cells.length)
  assert.deepEqual(fs.readFileSync(path.join(output,'water-fixture.schem')),fs.readFileSync(source))
})
test('实际导出的海草UV限制在首帧纹素中心，不越入下一帧',()=>{
  const image=fs.readFileSync(path.join(output,'atlas.png'))
  const width=image.readUInt32BE(16),height=image.readUInt32BE(20)
  const rectangles=JSON.parse(fs.readFileSync(path.join(runtime,'assets/mcmeta/atlas-uv.json'),'utf8'))
  const rect=rectangles['block/seagrass']??rectangles['minecraft:block/seagrass']
  const uvs=[]
  for(const line of fs.readFileSync(path.join(output,'water-fixture.obj'),'utf8').split(/\r?\n/))if(line.startsWith('vt '))uvs.push(line.slice(3).split(/\s+/).map(Number))
  let material='',count=0
  for(const line of fs.readFileSync(path.join(output,'water-fixture.obj'),'utf8').split(/\r?\n/)){
    if(line.startsWith('usemtl '))material=line.slice(7)
    if(!line.startsWith('f ')||!material.startsWith('seagrass'))continue
    for(const ref of line.slice(2).split(/\s+/)){
      const [u,v]=uvs[Number(ref.split('/')[1])-1],px=u*width,py=(1-v)*height
      assert.ok(px>=rect[0]+.5-.01&&px<=rect[0]+rect[2]-.5+.01,'U越过首帧保护边界')
      assert.ok(py>=rect[1]+.5-.01&&py<=rect[1]+rect[2]-.5+.01,'V越过首帧保护边界')
      count++
    }
  }
  assert.ok(count>0,'未采到真实海草面')
})
test('合法零主体空墙仍保含水，干空墙不生成假主体或水面',()=>{
  assert.ok(at(2,0,1).some(t=>isWater(t)&&t.points.every(p=>Math.abs(p[1]-8/9)<.0001)),'湿空墙缺水面')
  assert.equal(at(4,0,1).filter(t=>t.material.startsWith('cobblestone_wall')).length,0)
  assert.equal(at(4,0,1).filter(t=>isWater(t)&&t.points.every(p=>Math.abs(p[1]-8/9)<.0001)).length,0)
})
test('气泡柱复用水材质透明度，源记录仍是一格气泡柱',()=>{
  assert.ok(at(11,0,0).some(isWater),'气泡柱未使用水材质')
  assert.doesNotMatch(materialText,/newmtl bubble_column/)
})
test('分区排除含水邻格后重新生成暴露水面，原件仍保全',()=>{
  for(const include of ['blocks','block-entities']){
    const folder=path.join(temporary,include)
    execFileSync(process.execPath,[converter,'import','--input',source,'--output',folder,'--preserve-adjacent-faces','--include',include],{encoding:'utf8',cwd:runtime})
    const part=readTriangles(path.join(folder,'water-fixture/water-fixture.obj'))
    const x=include==='blocks'?.9999:1.0001
    assert.ok(part.some(t=>isWater(t)&&t.points.every(p=>Math.abs(p[0]-x)<.00001&&p[2]<=1)),'被排除分区仍遮住暴露水边：'+include)
  }
})
