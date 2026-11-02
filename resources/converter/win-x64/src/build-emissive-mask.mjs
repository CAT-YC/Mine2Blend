// 开发期生成随包像素掩码；运行时只读取PNG，不推断玩家材质或修改几何。
import fs from 'node:fs'
import {fileURLToPath} from 'node:url'
import sharp from 'sharp'
const base=new URL('../assets/',import.meta.url)
const {rules}=JSON.parse(fs.readFileSync(new URL('emissive-rules.json',base)))
const uv=JSON.parse(fs.readFileSync(new URL('mcmeta/atlas-uv.json',base)))
const {data,info}=await sharp(fs.readFileSync(new URL('mcmeta/atlas.png',base))).ensureAlpha().raw().toBuffer({resolveWithObject:true})
const width=2**Math.ceil(Math.log2(info.width)),height=2**Math.ceil(Math.log2(info.height)),mask=Buffer.alloc(width*height)
function selected(kind,r,g,b){
 switch(kind){
  case 'berry':return r>100&&r>g*1.05&&g>b*1.3
  case 'warm':return r>90&&r>g*1.12&&g>b*1.15
  case 'gold':return r>110&&g>90&&g>b*1.2&&r>g*.9
  case 'red':return r>80&&r>g*1.3&&r>b*1.3
  case 'cyan':return g>75&&b>65&&g>r*1.25&&b>r*1.25
  case 'purple':return r>12&&b>16&&r>g*1.3&&b>g*1.3
  case 'green':return g>40&&g>r*1.15&&g>b*.95
  case 'pale_green':return r>125&&g>155&&b>95
  case 'cream':return r>140&&g>125&&b>80&&r<g*1.35
  case 'anchor':return (b>35&&b>g*1.4&&r>g*1.2)||(r>170&&g>145&&g>b*1.1)
  case 'sensor':return (g>45&&b>45&&g>r*1.2&&b>r*1.2)||(r>75&&b>r*1.1&&b>g*1.2)
  case 'trial':return (r>110&&r>g*1.1&&g>b*1.15)||(g>85&&b>80&&g>r*1.25&&b>r*1.25)
  default:return true
 }
}
for(const rule of Object.values(rules))if(rule.mask)for(const [texture,rects] of Object.entries(rule.textures)){
 const [x,y,w]=uv[texture.includes('/')?texture:'block/'+texture]
 for(const [u0,v0,u1,v1] of rects)for(let yy=Math.floor(v0*w/16);yy<Math.ceil(v1*w/16);yy++)for(let xx=Math.floor(u0*w/16);xx<Math.ceil(u1*w/16);xx++){
  if(x+xx>=info.width||y+yy>=info.height)continue
  const i=((y+yy)*info.width+x+xx)*4
  if(data[i+3]&&selected(rule.selectors?.[texture],data[i],data[i+1],data[i+2]))mask[(y+yy)*width+x+xx]=255
 }
}
await sharp(mask,{raw:{width,height,channels:1}}).png().toFile(fileURLToPath(new URL('emissive-mask.png',base)))
console.log(JSON.stringify({width,height,emittingPixels:mask.reduce((n,v)=>n+(v>0),0)}))
