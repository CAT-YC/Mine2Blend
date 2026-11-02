import assert from'node:assert/strict'
import{test}from'node:test'
import{compositeBannerRGBA}from'../src/banner-texture.mjs'
const image=rgba=>({width:1,height:1,data:Uint8Array.from(rgba)})
test('旗帜图案按输入顺序覆盖，透明像素保底色',()=>{
 const red=image([255,0,0,255]),blue=image([0,0,255,255]),clear=image([0,0,0,0])
 assert.deepEqual([...compositeBannerRGBA(red,[1,1,1],[{image:clear,color:[1,1,1]}])],[255,0,0,255])
 assert.deepEqual([...compositeBannerRGBA(red,[1,1,1],[{image:blue,color:[1,1,1]},{image:red,color:[1,1,1]}])],[255,0,0,255])
 assert.deepEqual([...compositeBannerRGBA(red,[1,1,1],[{image:red,color:[1,1,1]},{image:blue,color:[1,1,1]}])],[0,0,255,255])
})
test('半透明图案在线性空间合成，染色不重复应用',()=>{
 const result=compositeBannerRGBA(image([0,0,0,255]),[1,1,1],[{image:image([255,255,255,128]),color:[1,1,1]}])
 assert.ok(result[0]>=187&&result[0]<=189,'50%白叠黑的sRGB结果应约188，不能直接混为128')
 const tinted=compositeBannerRGBA(image([255,255,255,255]),[.5,0,0],[])
 assert.ok(tinted[0]>=187&&tinted[0]<=189);assert.equal(tinted[1],0);assert.equal(tinted[3],255)
})
