import {test} from 'node:test'
import assert from 'node:assert/strict'
import {Quad,Vector} from 'deepslate'
import {cleanSurfaces} from '../src/surface-geometry.mjs'
test('单侧发光保留方向，不能把背面发光施加到正面',()=>{
 const points=[[0,0,0],[1,0,0],[1,1,0],[0,1,0]]
 const front=Quad.fromPoints(...points.map(p=>new Vector(...p))).setColor([1,1,1]).setTexture([0,0,1,0,1,1,0,1],[0,0,1,1])
 const back=Quad.fromPoints(...[...points].reverse().map(p=>new Vector(...p))).setColor([1,1,1]).setTexture([.2,.2,.4,.2,.4,.4,.2,.4],[.2,.2,.4,.4])
 back.m2bLightEmission=15
 const entries=[front,back].map(quad=>({quad,blockId:'minecraft:test_surface',section:'blocks',position:[0,0,0]}))
 const result=cleanSurfaces(entries)
 assert.equal(result.length,1)
 assert.equal(result[0].quad.m2bSurface.strengthFront,0)
 assert.equal(result[0].quad.m2bSurface.strengthBack,1)
})
