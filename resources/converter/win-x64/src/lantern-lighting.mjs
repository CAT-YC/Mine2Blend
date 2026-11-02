// 只增加灯光语义清单，不修改方块网格、材质或接触面裁切。
import fs from 'node:fs'
const LANTERNS=JSON.parse(fs.readFileSync(new URL('../assets/emissive-rules.json',import.meta.url))).lanterns
export function lanternLightingManifest(model, resources, options={}) {
 const enabled=(options.sections??['blocks','blockEntities','entities']).includes('blocks')
 const lanterns=enabled?model.blocks.filter(b=>b.blockId.startsWith('minecraft:')&&Object.hasOwn(LANTERNS,b.blockId.slice(10))).map(b=>({
  id:b.blockId.slice(10),position:[b.position[0]+.5,b.position[1]+(String(b.properties?.hanging)==='true'?4.5:3.5)/16,b.position[2]+.5]
 })):[]
 const materials={}
 for(const id of new Set(lanterns.map(x=>x.id))){
  const rect=resources.atlasUvData['block/'+LANTERNS[id].texture]
  if(!rect||rect[2]!==16)throw new Error('不支持的灯笼纹理布局：'+id)
  const [x,y]=rect,w=resources.atlasW,h=resources.atlasH
  // 随包原版首帧中，x=1..4、y=3..7为灯窗，铁框/吊环/底盖均排除。
  materials[id]={window:[(x+1)/w,1-(y+8)/h,(x+5)/w,1-(y+3)/h]}
 }
 return {version:1,materials,lanterns}
}
