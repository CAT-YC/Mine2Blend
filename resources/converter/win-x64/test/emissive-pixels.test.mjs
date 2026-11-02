import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import sharp from 'sharp'
const mask=new URL('../assets/emissive-mask.png',import.meta.url)
const uv=JSON.parse(fs.readFileSync(new URL('../assets/mcmeta/atlas-uv.json',import.meta.url)))
test('像素掩码让浆果亮、叶片不亮，烛芯亮、蜡身不亮，海泡菜亮头不亮身',async()=>{
 assert.ok(fs.existsSync(mask),'缺少局部发光像素掩码')
 const {data,info}=await sharp(fs.readFileSync(mask)).removeAlpha().greyscale().raw().toBuffer({resolveWithObject:true})
 const pixel=(name,x,y)=>{const [u,v,w]=uv['block/'+name];return data[(v+Math.floor(y*w/16))*info.width+u+Math.floor(x*w/16)]}
 assert.equal(pixel('cave_vines_lit',4,3),255);assert.equal(pixel('cave_vines_lit',6,1),0)
 assert.equal(pixel('candle_lit',0,5),255);assert.equal(pixel('candle_lit',0,12),0)
 // (1,1)为原贴图透明像素；亮头取可见的(1,0)，不能要求镂空位置发光。
 assert.equal(pixel('sea_pickle',1,0),255);assert.equal(pixel('sea_pickle',8,7),0)
 assert.equal(pixel('furnace_front_on',6,12),255);assert.equal(pixel('furnace_front_on',3,3),0)
})
