// 与网站共享渲染保持同一流体语义，不向投影原件插入重复坐标的水方块。
const PURE_WATER = new Set(['minecraft:water','minecraft:flowing_water','minecraft:bubble_column'])
const WATER_PLANTS = new Set(['minecraft:seagrass','minecraft:tall_seagrass','minecraft:kelp','minecraft:kelp_plant'])
const PURE_LAVA = new Set(['minecraft:lava','minecraft:flowing_lava'])
export function isEmptyWallState(blockId, properties) {
  return blockId.startsWith('minecraft:') && blockId.endsWith('_wall') && properties.up === 'false'
    && ['north','south','east','west'].every(side => properties[side] === 'none')
}
export function getBlockFluidKind(blockId, properties = {}) {
  if (PURE_LAVA.has(blockId)) return 'lava'
  if (PURE_WATER.has(blockId) || WATER_PLANTS.has(blockId) || properties.waterlogged === 'true') return 'water'
  return null
}
function fluidHeight(properties = {}) {
  const level = Number.parseInt(properties.level ?? '0',10)
  if (!Number.isFinite(level) || level <= 0) return 8/9
  return level >= 8 ? 1 : Math.max(1/9,(8-level)/9)
}
export function getFluidRenderProperties(block, posIndex, resolve = b => b.properties ?? {}, prefix = '__mcblock') {
  const props = resolve(block), kind = getBlockFluidKind(block.blockId,props)
  if (!kind) return props
  const [x,y,z] = block.position
  const at = (dx,dy,dz) => posIndex.get(`${x+dx},${y+dy},${z+dz}`)
  const same = b => b && getBlockFluidKind(b.blockId,resolve(b)) === kind
  const result = {...props}
  for (const [face,offset] of Object.entries({up:[0,1,0],down:[0,-1,0],north:[0,0,-1],south:[0,0,1],east:[1,0,0],west:[-1,0,0]})) {
    result[`${prefix}_fluid_face_${face}`] = same(at(...offset)) ? 'false' : 'true'
  }
  const corners = {nw:[[0,0],[-1,0],[0,-1],[-1,-1]],ne:[[0,0],[1,0],[0,-1],[1,-1]],se:[[0,0],[1,0],[0,1],[1,1]],sw:[[0,0],[-1,0],[0,1],[-1,1]]}
  for (const [corner,offsets] of Object.entries(corners)) {
    let total=0,weight=0,height
    for (const [dx,dz] of offsets) {
      const sample = dx===0 && dz===0 ? block : at(dx,0,dz)
      if (!same(sample)) continue
      if (same(at(dx,1,dz))) { height=1; break }
      // 含水方块自己的 level（如堆肥桶）不是流体 level。
      const h=fluidHeight(PURE_WATER.has(sample.blockId)||PURE_LAVA.has(sample.blockId)?resolve(sample):{})
      const w=h>=0.8?10:1
      total+=h*w;weight+=w
    }
    result[`${prefix}_fluid_h_${corner}`]=(height ?? (weight ? total/weight : fluidHeight(props))).toFixed(4)
  }
  return result
}
