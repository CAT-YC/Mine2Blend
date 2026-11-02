// 将最近邻贴图中完全不透明的像素映射回接触矩形；不把镂空或半透明像素当实体。
const EPS = 1e-8
const MAX_CELLS = 65536
const MAX_RECTS = 128
const MAX_CACHE = 1024

export function createOpaqueContactSampler(atlas) {
  const {width, height, data} = atlas ?? {}
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || !data || data.length !== width * height * 4) return () => []
  const cache = new Map()
  function mask(corners) {
    const uv = ['c00', 'c10', 'c11', 'c01'].map(k => corners[k].texture)
    if (uv.some(p => !p || p.length !== 2 || !p.every(Number.isFinite))) return []
    const p = uv.map(v => [v[0] * width, v[1] * height])
    // 超出安全整数的有限UV也会令n++停止推进，不能进入像素边界循环。
    if (p.some(v => v.some(n => !Number.isSafeInteger(Math.floor(n)) || !Number.isSafeInteger(Math.ceil(n))))) return []
    const a = p[0], du = p[1].map((v, k) => v - a[k]), dv = p[3].map((v, k) => v - a[k])
    // 仅接受矩形的旋转、镜像、缩放、平移或常量UV；倾斜/非线性映射保守保留。
    if (p[2].some((v, k) => Math.abs(v - a[k] - du[k] - dv[k]) > EPS)) return []
    if ([0, 1].some(k => Math.abs(du[k]) > EPS && Math.abs(dv[k]) > EPS)) return []
    const key = p.flat().join(',')
    if (cache.has(key)) return cache.get(key)
    const cuts = [[0, 1], [0, 1]]
    for (const [axis, delta] of [du, dv].entries()) for (let k = 0; k < 2; k++) {
      if (Math.abs(delta[k]) < EPS) continue
      const low = Math.min(a[k], a[k] + delta[k]), high = Math.max(a[k], a[k] + delta[k])
      if (high - low > MAX_CELLS) return []
      for (let n = Math.floor(low) + 1; n < high - EPS; n++) {
        const t = (n - a[k]) / delta[k]
        if (t > EPS && t < 1 - EPS) cuts[axis].push(t)
      }
    }
    const [us, vs] = cuts.map(values => values.sort((a, b) => a - b).filter((v, i, all) => !i || v - all[i - 1] > EPS))
    if ((us.length - 1) * (vs.length - 1) > MAX_CELLS) return []
    const opaque = (u, v) => {
      const repeat = (n, size) => ((Math.floor(n) % size) + size) % size
      const x = repeat(a[0] + du[0] * u + dv[0] * v, width)
      const y = repeat(a[1] + du[1] * u + dv[1] * v, height)
      return data[(y * width + x) * 4 + 3] === 255
    }
    // 每行合并连续不透明格，再沿相同横向区间合并，避免逐像素生成四边面。
    const rectangles = []
    let previous = new Map()
    for (let j = 0; j < vs.length - 1; j++) {
      const active = new Map()
      for (let i = 0; i < us.length - 1;) {
        if (!opaque((us[i] + us[i + 1]) / 2, (vs[j] + vs[j + 1]) / 2)) { i++; continue }
        const start = i++
        while (i < us.length - 1 && opaque((us[i] + us[i + 1]) / 2, (vs[j] + vs[j + 1]) / 2)) i++
        const span = `${start}:${i}`
        const rect = previous.get(span)
        if (rect) rect.vMax = vs[j + 1]
        else {
          if (rectangles.length >= MAX_RECTS) return []
          rectangles.push({uMin: us[start], uMax: us[i], vMin: vs[j], vMax: vs[j + 1]})
        }
        active.set(span, rect ?? rectangles[rectangles.length - 1])
      }
      previous = active
    }
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value)
    cache.set(key, rectangles)
    return rectangles
  }
  return (entry, info) => {
    // 独立合成贴图不能误用共享图集；现有旗帜不属于边界实体遮挡。
    if (entry.quad.m2bTextureFile && entry.quad.m2bTextureFile !== 'atlas.png') return []
    const {uMin, uMax, vMin, vMax} = info.rect
    return mask(info.corners).map(r => ({
      uMin: uMin + r.uMin * (uMax - uMin), uMax: uMin + r.uMax * (uMax - uMin),
      vMin: vMin + r.vMin * (vMax - vMin), vMax: vMin + r.vMax * (vMax - vMin),
    }))
  }
}
