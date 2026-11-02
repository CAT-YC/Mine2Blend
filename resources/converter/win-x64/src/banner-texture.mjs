// 布料图案在线性颜色空间合成；输出sRGB PNG仅采样一次，不增加透明面。
import{createHash}from'node:crypto'
const decode=value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4
const encode=value=>Math.round(Math.max(0,Math.min(1,value<=.0031308?value*12.92:1.055*value**(1/2.4)-.055))*255)
const tintColor=color=>color.map(v=>Math.round(Math.max(0,Math.min(1,v))*255)/255)

export function compositeBannerRGBA(base,baseColor,layers){
 const size=base.width*base.height*4
 if(base.data.length!==size)throw Error('旗帜底纹像素尺寸不符')
 const result=new Float64Array(size)
 const composite=(image,color)=>{
  if(image.width!==base.width||image.height!==base.height||image.data.length!==size)throw Error('旗帜图案尺寸不一致')
  const tint=tintColor(color)
  for(let p=0;p<size;p+=4){
   const alpha=image.data[p+3]/255
   for(let k=0;k<3;k++)result[p+k]=decode(image.data[p+k]/255)*tint[k]*alpha+result[p+k]*(1-alpha)
   result[p+3]=alpha+result[p+3]*(1-alpha)
  }
 }
 composite(base,baseColor)
 for(const layer of layers)composite(layer.image,layer.color)
 const out=new Uint8Array(size)
 for(let p=0;p<size;p+=4){
  const alpha=result[p+3]
  for(let k=0;k<3;k++)out[p+k]=alpha>0?encode(result[p+k]/alpha):0
  out[p+3]=Math.round(alpha*255)
 }
 return out
}

function extract(image,uv){
 if(!uv)throw Error('缺少旗帜布料底纹')
 const x=Math.round(uv[0]*image.width),y=Math.round(uv[1]*image.height)
 const width=Math.round((uv[2]-uv[0])*image.width),height=Math.round((uv[3]-uv[1])*image.height)
 if(width<=0||height<=0||x<0||y<0||x+width>image.width||y+height>image.height)throw Error('旗帜纹理区域越界')
 const data=new Uint8Array(width*height*4)
 for(let row=0;row<height;row++)data.set(image.data.subarray(((y+row)*image.width+x)*4,((y+row)*image.width+x+width)*4),row*width*4)
 return {width,height,data}
}

export function composeBannerTexture(image,baseUV,baseColor,layers){
 const base=extract(image,baseUV)
 const data=compositeBannerRGBA(base,baseColor,layers.filter(l=>l.uv).map(l=>({image:extract(image,l.uv),color:l.color})))
 const signature=createHash('sha256').update(`${base.width},${base.height}:`).update(data).digest('hex').slice(0,24)
 return {width:base.width,height:base.height,data,file:`banner-${signature}.png`}
}
