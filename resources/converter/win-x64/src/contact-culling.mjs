import { Quad, Vertex, Vector } from 'deepslate'
import { createOpaqueContactSampler } from './contact-opacity.mjs'

const AXES = ['x', 'y', 'z']
const AXIS_TANGENTS = [
  { u: 1, v: 2 }, // x -> u: y, v: z
  { u: 2, v: 0 }, // y -> u: z, v: x
  { u: 0, v: 1 }, // z -> u: x, v: y
]

const DEFAULT_TRANSLUCENT_KEYWORDS = ['glass', 'water', 'ice', 'honey_block', 'slime_block']
const DEFAULT_NON_OPAQUE_KEYWORDS = [
  'leaves', 'glass', 'water', 'ice', 'honey_block', 'slime_block',
  'air', 'cave_air', 'void_air', 'barrier', 'light', 'structure_void',
]

function defaultIsTranslucentBlock(blockId) {
  if (!blockId || typeof blockId !== 'string') return false
  const name = blockId.replace('minecraft:', '').split('[')[0]
  return DEFAULT_TRANSLUCENT_KEYWORDS.some(kw => name.includes(kw))
}

function defaultIsCutoutContactBlock(blockId) {
  if (!blockId || typeof blockId !== 'string') return false
  const name = blockId.replace('minecraft:', '').split('[')[0]
  return name === 'iron_bars' || /(^|_)copper_(bars|grate)$/.test(name)
}

function defaultIsOpaqueContactBlock(blockId) {
  if (!blockId || typeof blockId !== 'string') return false
  const name = blockId.replace('minecraft:', '').split('[')[0]
  if (DEFAULT_NON_OPAQUE_KEYWORDS.some(kw => name.includes(kw))) return false
  return true
}

function getQuadFlatNormal(quad) {
  const verts = quad.vertices()
  if (verts.length < 3) return null
  const a = verts[0].pos
  const b = verts[1].pos
  const c = verts[2].pos
  const ux = b.x - a.x
  const uy = b.y - a.y
  const uz = b.z - a.z
  const vx = c.x - a.x
  const vy = c.y - a.y
  const vz = c.z - a.z
  const nx = uy * vz - uz * vy
  const ny = uz * vx - ux * vz
  const nz = ux * vy - uy * vx
  const len = Math.hypot(nx, ny, nz)
  if (len <= 1e-8) return null
  return { x: nx / len, y: ny / len, z: nz / len }
}

function getContactFaceInfo(entry) {
  const { quad, position } = entry
  if (!position || !Array.isArray(position) || position.length !== 3) return null
  const verts = quad.vertices()
  if (verts.length !== 4) return null
  const normal = getQuadFlatNormal(quad)
  if (!normal) return null

  // 必须严格是主轴方向法线
  const axisIndex = AXES.findIndex(axis => Math.abs(normal[axis]) > 0.9999)
  if (axisIndex < 0) return null
  const coord = AXES[axisIndex]
  const nSign = normal[coord] > 0 ? 1 : -1

  // 4 个顶点必须同平面
  const plane = verts[0].pos[coord]
  for (let i = 1; i < 4; i++) {
    if (Math.abs(verts[i].pos[coord] - plane) > 1e-5) return null
  }

  // 必须严格在相邻格边界上且法线向外：
  // 若法线向正方向 (+1)，边界为 position[axisIndex] + 1
  // 若法线向负方向 (-1)，边界为 position[axisIndex]
  const expectedPlane = nSign > 0 ? position[axisIndex] + 1 : position[axisIndex]
  if (Math.abs(plane - expectedPlane) > 1e-5) return null

  const { u: uAxis, v: vAxis } = AXIS_TANGENTS[axisIndex]
  const uCoord = AXES[uAxis]
  const vCoord = AXES[vAxis]

  const uVals = verts.map(v => v.pos[uCoord])
  const vVals = verts.map(v => v.pos[vCoord])

  const uMin = Math.min(...uVals)
  const uMax = Math.max(...uVals)
  const vMin = Math.min(...vVals)
  const vMax = Math.max(...vVals)

  // 必须是非零面积矩形
  if (uMax - uMin < 1e-5 || vMax - vMin < 1e-5) return null

  // 必须在本格 1x1 边界范围内
  if (uMin < position[uAxis] - 1e-5 || uMax > position[uAxis] + 1 + 1e-5) return null
  if (vMin < position[vAxis] - 1e-5 || vMax > position[vAxis] + 1 + 1e-5) return null

  // 边必须轴对齐，不能为倾斜多边形
  for (let i = 0; i < 4; i++) {
    const next = (i + 1) % 4
    const du = Math.abs(uVals[next] - uVals[i])
    const dv = Math.abs(vVals[next] - vVals[i])
    const isUEdge = du > 1e-5 && dv < 1e-5
    const isVEdge = dv > 1e-5 && du < 1e-5
    if (!isUEdge && !isVEdge) return null
  }

  // 计算 2D 顶点环绕方向（有向面积）
  let area2D = 0
  for (let i = 0; i < 4; i++) {
    const next = (i + 1) % 4
    area2D += (uVals[i] * vVals[next] - uVals[next] * vVals[i])
  }
  area2D *= 0.5

  // 映射 4 个几何角点，便于双线性插值
  const corners = { c00: null, c10: null, c11: null, c01: null }
  for (let i = 0; i < 4; i++) {
    const isUMin = Math.abs(uVals[i] - uMin) < 1e-5
    const isVMin = Math.abs(vVals[i] - vMin) < 1e-5
    if (isUMin && isVMin) corners.c00 = verts[i]
    else if (!isUMin && isVMin) corners.c10 = verts[i]
    else if (!isUMin && !isVMin) corners.c11 = verts[i]
    else if (isUMin && !isVMin) corners.c01 = verts[i]
  }
  if (!corners.c00 || !corners.c10 || !corners.c11 || !corners.c01) return null

  // 统一边界桶索引：
  // 两个相邻格共享同一法向轴、整数平面 P 和负侧基准格坐标
  const P = Math.round(plane)
  const basePos = [position[0], position[1], position[2]]
  if (nSign < 0) {
    basePos[axisIndex] = P - 1
  }
  const bucketKey = `${axisIndex}_${P}_${Math.round(basePos[uAxis])}_${Math.round(basePos[vAxis])}`

  return {
    axisIndex,
    coord,
    nSign,
    plane,
    uAxis,
    vAxis,
    uCoord,
    vCoord,
    rect: { uMin, uMax, vMin, vMax },
    normal,
    area2D,
    corners,
    bucketKey,
    side: nSign, // +1: cellA (负侧格子向正), -1: cellB (正侧格子向负)
  }
}

function interpolateVertexData(corners, u, v, uMin, uMax, vMin, vMax) {
  const s = Math.max(0, Math.min(1, (u - uMin) / (uMax - uMin)))
  const t = Math.max(0, Math.min(1, (v - vMin) / (vMax - vMin)))

  const w00 = (1 - s) * (1 - t)
  const w10 = s * (1 - t)
  const w11 = s * t
  const w01 = (1 - s) * t

  let texture = undefined
  if (corners.c00.texture && corners.c10.texture && corners.c11.texture && corners.c01.texture) {
    const tu = w00 * corners.c00.texture[0] + w10 * corners.c10.texture[0] + w11 * corners.c11.texture[0] + w01 * corners.c01.texture[0]
    const tv = w00 * corners.c00.texture[1] + w10 * corners.c10.texture[1] + w11 * corners.c11.texture[1] + w01 * corners.c01.texture[1]
    texture = [tu, tv]
  }

  let color = undefined
  if (corners.c00.color && corners.c10.color && corners.c11.color && corners.c01.color) {
    const r = w00 * corners.c00.color[0] + w10 * corners.c10.color[0] + w11 * corners.c11.color[0] + w01 * corners.c01.color[0]
    const g = w00 * corners.c00.color[1] + w10 * corners.c10.color[1] + w11 * corners.c11.color[1] + w01 * corners.c01.color[1]
    const b = w00 * corners.c00.color[2] + w10 * corners.c10.color[2] + w11 * corners.c11.color[2] + w01 * corners.c01.color[2]
    color = [r, g, b]
  }

  return { texture, color }
}

function subtractRect(s, c) {
  const i_uMin = Math.max(s.uMin, c.uMin)
  const i_uMax = Math.min(s.uMax, c.uMax)
  const i_vMin = Math.max(s.vMin, c.vMin)
  const i_vMax = Math.min(s.vMax, c.vMax)

  if (i_uMax <= i_uMin + 1e-5 || i_vMax <= i_vMin + 1e-5) {
    return [s]
  }

  const pieces = []
  if (s.vMax > i_vMax + 1e-5) {
    pieces.push({ uMin: s.uMin, uMax: s.uMax, vMin: i_vMax, vMax: s.vMax })
  }
  if (i_vMin > s.vMin + 1e-5) {
    pieces.push({ uMin: s.uMin, uMax: s.uMax, vMin: s.vMin, vMax: i_vMin })
  }
  if (i_uMin > s.uMin + 1e-5) {
    pieces.push({ uMin: s.uMin, uMax: i_uMin, vMin: i_vMin, vMax: i_vMax })
  }
  if (s.uMax > i_uMax + 1e-5) {
    pieces.push({ uMin: i_uMax, uMax: s.uMax, vMin: i_vMin, vMax: i_vMax })
  }
  return pieces
}

function mergeRectangles(rects) {
  if (rects.length <= 1) return rects
  const merged = [...rects]
  let changed = true
  while (changed) {
    changed = false
    outer: for (let i = 0; i < merged.length - 1; i++) {
      for (let j = i + 1; j < merged.length; j++) {
        const a = merged[i]
        const b = merged[j]
        // 相同 u 范围，v 连续相邻
        if (Math.abs(a.uMin - b.uMin) < 1e-5 && Math.abs(a.uMax - b.uMax) < 1e-5) {
          if (Math.abs(a.vMax - b.vMin) < 1e-5) {
            merged[i] = { uMin: a.uMin, uMax: a.uMax, vMin: a.vMin, vMax: b.vMax }
            merged.splice(j, 1)
            changed = true
            break outer
          }
          if (Math.abs(b.vMax - a.vMin) < 1e-5) {
            merged[i] = { uMin: a.uMin, uMax: a.uMax, vMin: b.vMin, vMax: a.vMax }
            merged.splice(j, 1)
            changed = true
            break outer
          }
        }
        // 相同 v 范围，u 连续相邻
        if (Math.abs(a.vMin - b.vMin) < 1e-5 && Math.abs(a.vMax - b.vMax) < 1e-5) {
          if (Math.abs(a.uMax - b.uMin) < 1e-5) {
            merged[i] = { uMin: a.uMin, uMax: b.uMax, vMin: a.vMin, vMax: a.vMax }
            merged.splice(j, 1)
            changed = true
            break outer
          }
          if (Math.abs(b.uMax - a.uMin) < 1e-5) {
            merged[i] = { uMin: b.uMin, uMax: a.uMax, vMin: a.vMin, vMax: a.vMax }
            merged.splice(j, 1)
            changed = true
            break outer
          }
        }
      }
    }
  }
  return merged
}

function subtractRectangles(subject, clippers) {
  let remaining = [subject]
  for (const clipper of clippers) {
    const nextRemaining = []
    for (const r of remaining) {
      const pieces = subtractRect(r, clipper)
      nextRemaining.push(...pieces)
    }
    remaining = nextRemaining
    if (remaining.length === 0) break
  }
  return mergeRectangles(remaining)
}

function createSubdividedQuad(faceInfo, subRect, originalQuad) {
  const { axisIndex, plane, uAxis, vAxis, rect, area2D, corners, normal } = faceInfo
  const { uMin: r_uMin, uMax: r_uMax, vMin: r_vMin, vMax: r_vMax } = subRect

  const p0 = [r_uMin, r_vMin]
  const p1 = [r_uMax, r_vMin]
  const p2 = [r_uMax, r_vMax]
  const p3 = [r_uMin, r_vMax]

  // 保持原有拓扑的环绕方向（CCW / CW）
  const orderedPoints = area2D >= 0 ? [p0, p1, p2, p3] : [p0, p3, p2, p1]

  const origVert = corners.c00
  const vertices = orderedPoints.map(([u, v]) => {
    const posCoords = [0, 0, 0]
    posCoords[axisIndex] = plane
    posCoords[uAxis] = u
    posCoords[vAxis] = v
    const pos = new Vector(posCoords[0], posCoords[1], posCoords[2])

    const { texture, color } = interpolateVertexData(
      corners,
      u, v,
      rect.uMin, rect.uMax,
      rect.vMin, rect.vMax
    )

    const vertNormal = origVert.normal
      ? new Vector(origVert.normal.x, origVert.normal.y, origVert.normal.z)
      : new Vector(normal.x, normal.y, normal.z)

    return new Vertex(
      pos,
      color,
      texture,
      origVert.textureLimit,
      vertNormal,
      origVert.blockPos
    )
  })

  let quad = new Quad(vertices[0], vertices[1], vertices[2], vertices[3])

  // 双重校验法线方向，确保与原 Quad 法线同向
  const flatNorm = getQuadFlatNormal(quad)
  if (flatNorm) {
    const dot = flatNorm.x * normal.x + flatNorm.y * normal.y + flatNorm.z * normal.z
    if (dot < 0) {
      quad = new Quad(vertices[3], vertices[2], vertices[1], vertices[0])
    }
  }

  // 保持 Quad 实例属性（包括 m2bLightEmission 等自定义标记）
  for (const key of Object.keys(originalQuad)) {
    if (key !== 'v1' && key !== 'v2' && key !== 'v3' && key !== 'v4') {
      quad[key] = originalQuad[key]
    }
  }

  return quad
}

export function cullTranslucentContactFaces(entries, options = {}) {
  const isTranslucent = options.isTranslucentBlock ?? defaultIsTranslucentBlock
  const isCutout = options.isCutoutContactBlock ?? defaultIsCutoutContactBlock
  const isOpaque = options.isOpaqueContactBlock ?? defaultIsOpaqueContactBlock
  const sampleOpaque = options.textureAtlas ? createOpaqueContactSampler(options.textureAtlas) : null

  // 空间桶分组：按边界平面和相邻格子进行 O(N) 空间划分
  const buckets = new Map()
  const candidateIndices = new Set()
  const faceInfos = new Map()

  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]
    const info = getContactFaceInfo(entry)
    if (!info) continue

    faceInfos.set(index, info)
    candidateIndices.add(index)

    if (!buckets.has(info.bucketKey)) {
      buckets.set(info.bucketKey, { sideA: [], sideB: [] })
    }
    const bucket = buckets.get(info.bucketKey)
    if (info.side > 0) {
      bucket.sideA.push({ index, entry, info })
    } else {
      bucket.sideB.push({ index, entry, info })
    }
  }

  const replacements = new Map()
  const processedCandidates = new Set()

  for (const bucket of buckets.values()) {
    // 只有当相邻格边界两侧均有反向面时才需要做接触面裁切判定
    if (bucket.sideA.length === 0 || bucket.sideB.length === 0) continue

    const processSide = (myItems, otherItems) => {
      for (const item of myItems) {
        processedCandidates.add(item.index)
        const resultEntries = []
        replacements.set(item.index, resultEntries)
        const myTranslucent = isTranslucent(item.entry.blockId)
        // 镂空接触面必须有实际图集才裁切，不能靠名称删除整面。
        const myCutout = sampleOpaque && isCutout(item.entry.blockId)

        // 普通不透明方块（如石头）的面保留可编辑语义，不在此做几何裁切。
        // 栏杆/铜格栅的内部接触面与玻璃一样会形成共面自遮挡，需要按实际覆盖裁去。
        if (!myTranslucent && !myCutout) {
          resultEntries.push(item.entry)
          continue
        }

        // 收集所有有效遮挡片（clippers）：
        // 1. 同种透明方块相邻接触：双方均删除重叠区域
        // 2. 透明或镂空方块相邻实面：按Alpha255删除主体被覆盖区域
        // 3. 不同种透明介质之间：保留双方（不加入 clipper）
        // 4. 镂空邻面仅其Alpha255区域成为遮挡片；孔洞和半透明区域保留。
        const clippers = []
        for (const other of otherItems) {
          const otherTranslucent = isTranslucent(other.entry.blockId)
          if (otherTranslucent) {
            if (myTranslucent && other.entry.blockId === item.entry.blockId) {
              clippers.push(other.info.rect)
            }
          } else {
            if (sampleOpaque) {
              // 模型形状和贴图决定实际遮挡，不能沿用整块名称的粗分类。
              other.opaqueRects ??= sampleOpaque(other.entry, other.info)
              clippers.push(...other.opaqueRects)
            } else if (isOpaque(other.entry.blockId)) {
              clippers.push(other.info.rect)
            }
          }
        }

        if (clippers.length === 0) {
          resultEntries.push(item.entry)
          continue
        }

        // 对接触面的轴对齐矩形依次做差集
        const remainingRects = subtractRectangles(item.info.rect, clippers)
        for (const subRect of remainingRects) {
          const subQuad = createSubdividedQuad(item.info, subRect, item.entry.quad)
          resultEntries.push({
            ...item.entry,
            quad: subQuad,
          })
        }
      }
    }

    processSide(bucket.sideA, bucket.sideB)
    processSide(bucket.sideB, bucket.sideA)
  }

  // 将所有未参与裁切判定的 entry（非边界面、单侧悬空面、植物、实体等）原样保序保留
  const finalEntries = []
  for (let index = 0; index < entries.length; index++) {
    if (!processedCandidates.has(index)) {
      finalEntries.push(entries[index])
    } else {
      finalEntries.push(...replacements.get(index))
    }
  }

  return finalEntries
}
