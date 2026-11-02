import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {lanternLightingManifest} from '../src/lantern-lighting.mjs'
const uv=JSON.parse(fs.readFileSync(new URL('../assets/mcmeta/atlas-uv.json',import.meta.url)))
test('铜灯笼八个氧化/涂蜡变体沿用灯窗和四侧辅助点光语义，落地悬挂均有位置',()=>{
 const blocks=[]
 for(const prefix of ['','exposed_','weathered_','oxidized_'])for(const wax of ['','waxed_'])for(const hanging of ['false','true'])blocks.push({blockId:'minecraft:'+wax+prefix+'copper_lantern',properties:{hanging},position:[blocks.length*2,0,0]})
 const doc=lanternLightingManifest({blocks},{atlasUvData:uv,atlasW:2048,atlasH:2048})
 assert.equal(doc.lanterns.length,16);assert.equal(Object.keys(doc.materials).length,8)
 for(const lamp of doc.lanterns){assert.ok(doc.materials[lamp.id].window);assert.equal(lamp.position[2],.5)}
 assert.equal(doc.lanterns[0].position[1],3.5/16);assert.equal(doc.lanterns[1].position[1],4.5/16)
 assert.deepEqual(lanternLightingManifest({blocks},{atlasUvData:uv,atlasW:2048,atlasH:2048},{sections:['blockEntities']}),{version:1,materials:{},lanterns:[]})
})
