// 保留模型正反及发光语义，将同一方块中的薄片表达为单份几何。
const position = v => [v.pos.x,v.pos.y,v.pos.z]
const key = p => p.map(n=>Math.round(n*1e6)).join(',')
const uv = v => v.texture ? [...v.texture] : [0,0]
const dot = (a,b) => a.reduce((s,v,i)=>s+v*b[i],0)
const colorKey = q => (q.vertices()[0]?.color??[1,1,1]).map(n=>Math.round(n*1e6)).join(',')
function normal(q) {
 const [a,b,c]=q.vertices().map(position),u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i])
 const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...n)
 return length>1e-10?n.map(v=>v/length):null
}

export function decorateBlockModel(model) {
 const original=model.getElementMesh
 model.getElementMesh=function(element,atlas,cull,getTint) {
  const mesh=original.call(this,element,atlas,cull,getTint)
  const faces=['up','down','south','north','east','west'].map(name=>element.faces?.[name])
    .filter(face=>face?.texture&&(!face.cullface||!cull[face.cullface]))
  mesh.quads.forEach((quad,i)=>{
   quad.m2bLightEmission=Math.max(0,Math.min(15,Number(element.light_emission)||0))
   quad.m2bTextureId=faces[i]?this.getTexture(faces[i].texture):''
  })
  return mesh
 }
 return model
}

function mappedUV(target,source) {
 if(!source) return target.vertices().map(uv)
 const points=new Map(source.vertices().map(v=>[key(position(v)),uv(v)]))
 return target.vertices().map(v=>points.get(key(position(v)))??uv(v))
}

export function cleanSurfaces(entries) {
 const valid=entries.filter(entry=>normal(entry.quad))
 const groups=new Map()
 valid.forEach((entry,index)=>{
  if(!entry.position)return
  const geometry=entry.quad.vertices().map(v=>key(position(v))).sort().join(';')
  const groupKey=[entry.section,entry.blockId,entry.position.join(','),geometry].join('|')
  if(!groups.has(groupKey))groups.set(groupKey,[])
  groups.get(groupKey).push({entry,index,n:normal(entry.quad)})
 })
 const removed=new Set()
 for(const group of groups.values()) {
  const first=group.find(x=>!x.entry.quad.m2bLightEmission)??group[0]
  const front=group.filter(x=>dot(first.n,x.n)>.99999)
  const back=group.filter(x=>dot(first.n,x.n)<-.99999)
  if(front.length+back.length!==group.length)continue
  const frontBase=front.filter(x=>!x.entry.quad.m2bLightEmission)
  const backBase=back.filter(x=>!x.entry.quad.m2bLightEmission)
  const frontEmit=front.filter(x=>x.entry.quad.m2bLightEmission>0)
  const backEmit=back.filter(x=>x.entry.quad.m2bLightEmission>0)
  // 同向普通叠层（红石等）有独立材质语义，不作坐标去重。
  if(frontBase.length>1||backBase.length>1||frontEmit.length>1||backEmit.length>1)continue
  const primary=frontBase[0]??frontEmit[0]
  const reverse=backBase[0]??backEmit[0]
  if(!primary)continue
  if(reverse&&colorKey(primary.entry.quad)!==colorKey(reverse.entry.quad))continue
  const emission=frontEmit[0]?.entry.quad,backEmission=backEmit[0]?.entry.quad??(backBase.length?null:emission)
  if(group.length===1&&!emission)continue
  const quad=primary.entry.quad
  quad.m2bSurface={backUV:mappedUV(quad,reverse?.entry.quad),
    emissionFrontUV:mappedUV(quad,emission),emissionBackUV:mappedUV(quad,backEmission),
    strengthFront:(emission?.m2bLightEmission??0)/15,strengthBack:(backEmission?.m2bLightEmission??0)/15}
  for(const item of group)if(item!==primary)removed.add(item.index)
 }
 return valid.filter((_,i)=>!removed.has(i))
}
