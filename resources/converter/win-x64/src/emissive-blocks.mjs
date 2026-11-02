// 发光语义与几何分离；游戏状态、可见贴图和Cycles视觉强度分别记录。
import fs from 'node:fs'
export const EMISSIVE_RULES=JSON.parse(fs.readFileSync(new URL('../assets/emissive-rules.json',import.meta.url))).rules
const sectionEnabled=(rule,options)=>(options.sections??['blocks','blockEntities','entities']).includes(rule.section)
export const emissiveBlockKey=(id,position)=>id+'|'+position?.join(',')
function stateFor(block,resources,rule){
 const defaults=resources.defaultBlockProperties?.get(block.blockId)??{},props={...defaults,...block.properties}
 const fallback={lit:block.blockId.includes('redstone_torch')||block.blockId.includes('redstone_wall_torch')||block.blockId.endsWith('campfire')?'true':'false',berries:'false',waterlogged:block.blockId.endsWith('sea_pickle')?'true':'false',candles:'1',pickles:'1',charges:'0',trial_spawner_state:'inactive',vault_state:'inactive'}
 let enabled=Object.entries(rule.when??{}).every(([key,value])=>String(props[key]??fallback[key])===value)
 const level=enabled?(rule.levelProperty?rule.levels[String(props[rule.levelProperty]??fallback[rule.levelProperty])]??0:rule.level):0
 enabled=enabled&&(level>0||rule.visualOnly===true)
 return {level,weight:enabled?(rule.referenceLevel?level/rule.referenceLevel:1):0}
}
export function emissiveManifest(model,resources,options={}){
 const materials={},blocks=[]
 for(const block of model.blocks){
  const name=block.blockId.replace(/^minecraft:/,''),rule=EMISSIVE_RULES[name]
  if(!rule||!sectionEnabled(rule,options))continue
  const state=stateFor(block,resources,rule)
  blocks.push({id:name,position:block.position??[0,0,0],...state})
  if(!state.weight||materials[name])continue
  const regions=[]
  for(const [texture,rectangles] of Object.entries(rule.textures)){
   const sprite=resources.atlasUvData[texture.includes('/')?texture:'block/'+texture]
   if(!sprite)throw new Error('缺少发光贴图：'+texture)
   const [x,y,w]=sprite
   for(const [u0,v0,u1,v1] of rectangles)regions.push([(x+u0*w/16)/resources.atlasW,1-(y+v1*w/16)/resources.atlasH,(x+u1*w/16)/resources.atlasW,1-(y+v0*w/16)/resources.atlasH])
  }
  materials[name]={regions,strength:rule.strength,mode:rule.mode??'texture',stateful:true,...(rule.mask?{mask:'emissive-mask.png'}:{}),...(rule.color?{color:rule.color}:{})}
 }
 return {version:2,materials,blocks,surfaces:[]}
}
