import assert from 'node:assert/strict'
import{execFileSync}from'node:child_process'
import fs from'node:fs'
import os from'node:os'
import path from'node:path'
import{fileURLToPath}from'node:url'
import{after,before,test}from'node:test'
import{NbtFile,NbtCompound,NbtInt,NbtString,NbtList,NbtLongArray}from'deepslate'
import sharp from'sharp'
const runtime=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
let temp,folder
before(()=>{
 temp=fs.mkdtempSync(path.join(os.tmpdir(),'m2b-banner-'))
 const vec=(x,y,z)=>new NbtCompound().set('x',new NbtInt(x)).set('y',new NbtInt(y)).set('z',new NbtInt(z))
 const palette=new NbtList([new NbtCompound().set('Name',new NbtString('minecraft:air')),new NbtCompound().set('Name',new NbtString('minecraft:red_wall_banner')).set('Properties',new NbtCompound().set('facing',new NbtString('south')))])
 const counts=[1,6,6,6],width=12,indices=new Array(width).fill(0),entities=[]
 counts.forEach((count,i)=>{indices[i*3]=1;entities.push(new NbtCompound().set('id',new NbtString('minecraft:banner')).set('x',new NbtInt(i*3)).set('y',new NbtInt(0)).set('z',new NbtInt(0)).set(i===3?'Patterns':'patterns',new NbtList(Array.from({length:count},()=>i===3?new NbtCompound().set('Pattern',new NbtString('cs')).set('Color',new NbtInt(0)):new NbtCompound().set('pattern',new NbtString('minecraft:stripe_center')).set('color',new NbtString('white'))))))})
 let bits=0n;indices.forEach((v,i)=>bits|=BigInt(v)<<BigInt(i*2))
 const region=new NbtCompound().set('Position',vec(0,0,0)).set('Size',vec(width,1,1)).set('BlockStatePalette',palette).set('BlockStates',new NbtLongArray([bits])).set('TileEntities',new NbtList(entities))
 const file=NbtFile.create({compression:'gzip'});file.root.set('Version',new NbtInt(6)).set('Regions',new NbtCompound().set('Banners',region))
 const input=path.join(temp,'fixture.litematic');fs.writeFileSync(input,Buffer.from(file.write()))
 execFileSync(process.execPath,[process.env.M2B_TEST_CONVERTER??path.join(runtime,'src/batch-obj-export.mjs'),'import','--input',input,'--output',path.join(temp,'out'),'--format','obj','--preserve-adjacent-faces'],{encoding:'utf8'})
 folder=path.join(temp,'out','fixture')
})
after(()=>{if(temp?.startsWith(os.tmpdir())&&path.basename(temp).startsWith('m2b-banner-'))fs.rmSync(temp,{recursive:true,force:true})})
test('图案层数不再增加透明几何，挂墙旗帜每块只保布料与横杆',()=>{
 const obj=fs.readFileSync(path.join(folder,'fixture.obj'),'utf8');const faces=obj.split('\n').filter(s=>s.startsWith('f '))
 assert.equal(faces.length,4*12*2,'每旗帜6布料面+6横杆面，不应保留每层透明面')
})
test('相同图案顺序去重，半透明边缘重复覆盖保留差别，MTL引用独立贴图',async()=>{
 const files=fs.readdirSync(folder).filter(n=>/^banner-[0-9a-f]+\.png$/.test(n));assert.equal(files.length,2,'原图案有191的Alpha边缘，1层与6层应不同，两面相同6层旗帜应复用')
 const mtl=fs.readFileSync(path.join(folder,'fixture.mtl'),'utf8');assert.ok(mtl.includes('map_Kd '+files[0]));assert.ok(mtl.includes('map_Kd atlas.png'),'横杆保留原贴图')
 const image=await sharp(path.join(folder,files[0])).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(image.info.width,64);assert.equal(image.info.height,64)
 for(let y=1;y<41;y++)for(let x=22;x<42;x++)assert.equal(image.data[(y*64+x)*4+3],255,'正面布料必须不透明')
})

test('16种底色、落地16朝向和挂墙4朝向保留正反UV及法线',()=>{
 const dyes=['white','orange','magenta','light_blue','yellow','lime','pink','gray','light_gray','cyan','purple','blue','brown','green','red','black']
 const cases=[...dyes.map(color=>({id:`${color}_wall_banner`,props:{facing:'south'},angle:0})),
  ...Array.from({length:16},(_,rotation)=>({id:'white_banner',props:{rotation:String(rotation)},angle:-rotation*Math.PI/8})),
  ...[['south',0],['east',Math.PI/2],['north',Math.PI],['west',Math.PI*1.5]].map(([facing,angle])=>({id:'red_wall_banner',props:{facing},angle}))]
 const vec=(x,y,z)=>new NbtCompound().set('x',new NbtInt(x)).set('y',new NbtInt(y)).set('z',new NbtInt(z))
 const states=[new NbtCompound().set('Name',new NbtString('minecraft:air')),...cases.map(c=>new NbtCompound().set('Name',new NbtString('minecraft:'+c.id)).set('Properties',new NbtCompound(new Map(Object.entries(c.props).map(([k,v])=>[k,new NbtString(v)])))))]
 const width=cases.length*3,bits=Math.ceil(Math.log2(states.length)),longs=new Array(Math.ceil(width*bits/64)).fill(0n),mask=(1n<<64n)-1n
 cases.forEach((c,i)=>{const bit=i*3*bits,k=Math.floor(bit/64),offset=bit%64,value=BigInt(i+1);longs[k]|=(value<<BigInt(offset))&mask;if(offset+bits>64)longs[k+1]|=value>>BigInt(64-offset)})
 const entities=cases.map((c,i)=>new NbtCompound().set('id',new NbtString('minecraft:banner')).set('x',new NbtInt(i*3)).set('y',new NbtInt(0)).set('z',new NbtInt(0)).set('patterns',new NbtList([
  new NbtCompound().set('pattern',new NbtString('minecraft:stripe_left')).set('color',new NbtString('white')),
  new NbtCompound().set('pattern',new NbtString('minecraft:stripe_bottom')).set('color',new NbtString('black'))])))
 const region=new NbtCompound().set('Position',vec(0,0,0)).set('Size',vec(width,1,1)).set('BlockStatePalette',new NbtList(states)).set('BlockStates',new NbtLongArray(longs)).set('TileEntities',new NbtList(entities))
 const file=NbtFile.create({compression:'gzip'});file.root.set('Version',new NbtInt(6)).set('Regions',new NbtCompound().set('Banners',region))
 const input=path.join(temp,'matrix.litematic');fs.writeFileSync(input,Buffer.from(file.write()))
 execFileSync(process.execPath,[path.join(runtime,'src/batch-obj-export.mjs'),'import','--input',input,'--output',path.join(temp,'matrix-out'),'--format','obj','--preserve-adjacent-faces'],{encoding:'utf8'})
 const dir=path.join(temp,'matrix-out/matrix'),vertices=[],uvs=[],normals=[],faces=[];let material=''
 for(const line of fs.readFileSync(path.join(dir,'matrix.obj'),'utf8').split('\n')){
  const [tag,...p]=line.trim().split(/\s+/)
  if(tag==='v')vertices.push(p.map(Number));else if(tag==='vt')uvs.push(p.map(Number));else if(tag==='vn')normals.push(p.map(Number));else if(tag==='usemtl')material=p[0];else if(tag==='f')faces.push({material,refs:p.map(s=>s.split('/').map(Number))})
 }
 const byCase=cases.map(()=>[])
 for(let i=0;i<faces.length;i+=2){const refs=[...faces[i].refs,faces[i+1].refs[2]],points=refs.map(r=>vertices[r[0]-1]),x=points.reduce((s,p)=>s+p[0]/4,0),index=Math.round((x-.5)/3);byCase[index].push({material:faces[i].material,uv:refs.map(r=>uvs[r[1]-1]),normal:normals[refs[0][2]-1]})}
 const near=(a,b)=>Math.abs(a-b)<2e-6
 cases.forEach((c,i)=>{
  const cloth=byCase[i].filter(q=>q.material.includes('__b_'))
  assert.equal(cloth.length,6,c.id)
  const front=cloth.find(q=>near(Math.min(...q.uv.map(v=>v[0])),5.5/16)&&near(Math.max(...q.uv.map(v=>v[0])),10.5/16))
  const back=cloth.find(q=>near(Math.min(...q.uv.map(v=>v[0])),.25/16)&&near(Math.max(...q.uv.map(v=>v[0])),5.25/16)&&near(Math.min(...q.uv.map(v=>v[1])),1-10.25/16))
  assert.ok(front&&back,c.id+'缺正反布料面')
  assert.ok(Math.abs(front.normal[0]-Math.sin(c.angle))<=.000051&&Math.abs(front.normal[2]-Math.cos(c.angle))<=.000051,c.id+JSON.stringify({props:c.props,normal:front.normal,expected:[Math.sin(c.angle),0,Math.cos(c.angle)]}))
  assert.ok(near(back.uv[0][0],5.25/16)&&near(back.uv[0][1],1-.25/16),'背面维持原有镜像映射')
 })
 assert.equal(fs.readdirSync(dir).filter(n=>n.startsWith('banner-')).length,16,'不同底色不能误用同张贴图')
})
