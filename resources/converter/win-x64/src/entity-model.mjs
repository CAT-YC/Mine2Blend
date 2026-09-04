/**
 * 生物实体模型加载器（转换器侧）
 *
 * 从网站 `lib/renderer/entity-model/entity-model-loader.ts` 移植而来，
 * 几何算法逐行对齐，只把输出从 THREE.BufferGeometry 换成 deepslate Mesh，
 * 把 THREE.Matrix4 换成 gl-matrix。**改动几何逻辑时两边要一起改。**
 *
 * 模型数据 vendored 自 SizableShrimp/EntityModelJson（MIT，1.19.x），
 * 见 assets/entity-models/NOTICE.md。
 */
import fs from 'node:fs'
import path from 'node:path'
import { mat4, vec3 } from 'gl-matrix'
import { Identifier, Mesh as DsMesh, Quad, Vertex, Vector } from 'deepslate'

const PX = 1 / 16

let modelDir = null
let catalog = null
const modelCache = new Map()

/** 初始化：指定 assets/entity-models 目录 */
export function initEntityModels(dir) {
  modelDir = dir
  const catalogPath = path.join(dir, 'entity-catalog.json')
  try {
    catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
  } catch {
    catalog = {}
  }
  return Object.keys(catalog).length
}

export function hasEntityModel(entityId) {
  return Boolean(catalog && catalog[entityId])
}

export function listEntityModelIds() {
  return catalog ? Object.keys(catalog) : []
}

function loadModelJson(fileName) {
  if (modelCache.has(fileName)) return modelCache.get(fileName)
  let data = null
  try {
    data = JSON.parse(fs.readFileSync(path.join(modelDir, fileName), 'utf8'))
  } catch {
    data = null
  }
  modelCache.set(fileName, data)
  return data
}

/**
 * 幼体腿：上游马科模型（horse / donkey / mule / skeleton_horse / zombie_horse）在同一份
 * JSON 里同时放了成人腿和幼体腿，靠运行时状态切换。静态导入永远是成年形态，
 * 保留会让两套腿重叠。
 *
 * 🔴 而且这些幼体腿的 `grow` 是对象 `{growY: 5.5}` 而不是数字，
 * 按数字用会算出 NaN 让整个模型报废 —— 马科五类曾因此全部生成空几何。
 */
function isBabyLegBone(boneName) {
  return boneName.endsWith('_baby_leg')
}

/** grow 只接受数字；上游存在 `{growY: n}` 这种轴向写法，静态导入一律按 0 处理 */
function normalizeGrow(grow) {
  return typeof grow === 'number' && Number.isFinite(grow) ? grow : 0
}

/**
 * box-UV 展开：cube(w,h,d) 在皮肤 texCoord(U,V) → 6 面在皮肤像素空间的 rect [左,上,右,下]
 * MC Cuboid 标准布局（侧排 西d 北w 东d 南w · 顶排 down(w) up(w)）
 */
function boxFaces(U, V, w, h, d) {
  const u0 = U
  const u1 = U + d
  const u2 = U + d + w
  const u3 = U + d + 2 * w
  const u4 = U + 2 * d + w
  const u5 = U + 2 * d + 2 * w
  const v0 = V
  const v1 = V + d
  const v2 = V + d + h
  return {
    down: [u1, v0, u2, v1],
    up: [u2, v1, u3, v0],
    west: [u0, v1, u1, v2],
    north: [u1, v1, u2, v2],
    east: [u2, v1, u4, v2],
    south: [u4, v1, u5, v2],
  }
}

/**
 * 计算模型在 MC 模型空间（+Y 向下）的最大 Y —— 也就是「脚底」。
 * overlay（羊毛 / 地毯 / 外层）必须复用本体的值，否则两层各自落地会错位。
 */
function computeModelAnchorMaxY(model) {
  let maxY = -Infinity
  const walk = (bone, parent) => {
    const pp = bone.partPose
    const local = mat4.create()
    mat4.translate(local, local, [pp?.x || 0, pp?.y || 0, pp?.z || 0])
    if (pp?.zRot) mat4.rotateZ(local, local, pp.zRot)
    if (pp?.yRot) mat4.rotateY(local, local, pp.yRot)
    if (pp?.xRot) mat4.rotateX(local, local, pp.xRot)
    const world = mat4.create()
    mat4.multiply(world, parent, local)

    if (bone.cubes) {
      for (const cube of bone.cubes) {
        const g = normalizeGrow(cube.grow)
        const [ox, oy, oz] = cube.origin
        const [dx, dy, dz] = cube.dimensions
        for (const x of [ox - g, ox + dx + g]) {
          for (const y of [oy - g, oy + dy + g]) {
            for (const z of [oz - g, oz + dz + g]) {
              const out = vec3.create()
              vec3.transformMat4(out, [x, y, z], world)
              if (out[1] > maxY) maxY = out[1]
            }
          }
        }
      }
    }
    if (bone.children) {
      for (const [name, child] of Object.entries(bone.children)) {
        if (isBabyLegBone(name)) continue
        walk(child, world)
      }
    }
  }
  walk(model.mesh.root, mat4.create())
  return maxY === -Infinity ? 0 : maxY
}

function getAtlasRect(atlas, textureId) {
  try {
    const uv = atlas.getTextureUV(Identifier.parse(textureId))
    if (uv && uv.length === 4) return [uv[0], uv[1], uv[2], uv[3]]
  } catch { /* 贴图不在 atlas 里 */ }
  return null
}

/**
 * 构建单个实体模型的 deepslate Mesh（已烘焙骨骼变换 + MC Y-down→Y-up + 像素→方块）。
 * 返回 null 表示模型或贴图缺失。
 */
function buildEntityModelMesh(model, textureId, atlas, anchorMaxY) {
  const texW = model.material?.xTexSize || 64
  const texH = model.material?.yTexSize || 64

  const rect = getAtlasRect(atlas, textureId)
  if (!rect) return null
  let [au0, av0, au1, av1] = rect

  // atlas-uv 里部分非方形实体皮肤（如 cow 64x32）放在 64x64 占位格左上角，
  // 按 material 的逻辑宽高比裁掉格内透明 padding。
  const atlasImage = atlas.getTextureAtlas()
  if (atlasImage && atlasImage.width && atlasImage.height) {
    const rectPixelW = (au1 - au0) * atlasImage.width
    const rectPixelH = (av1 - av0) * atlasImage.height
    const logicalAspect = texW / texH
    const rectAspect = rectPixelW / rectPixelH
    if (Number.isFinite(rectAspect) && rectAspect > logicalAspect + 1e-6) {
      au1 = au0 + (rectPixelH * logicalAspect) / atlasImage.width
    } else if (Number.isFinite(rectAspect) && rectAspect < logicalAspect - 1e-6) {
      av1 = av0 + (rectPixelW / logicalAspect) / atlasImage.height
    }
  }

  const mapU = (sx) => au0 + (sx / texW) * (au1 - au0)
  const mapV = (sy) => av0 + (sy / texH) * (av1 - av0)

  // 先攒模型空间（像素），最后统一翻转到世界
  const faces = []
  let maxY = anchorMaxY ?? model.anchorMaxY ?? -Infinity

  function emitFace(corners, r, mirror) {
    const vertices = [
      { corner: corners[0], uv: [r[2], r[1]] },
      { corner: corners[1], uv: [r[0], r[1]] },
      { corner: corners[2], uv: [r[0], r[3]] },
      { corner: corners[3], uv: [r[2], r[3]] },
    ]
    if (mirror) vertices.reverse()
    for (const v of vertices) {
      if (v.corner[1] > maxY) maxY = v.corner[1]
    }
    faces.push(vertices.map(v => ({ pos: v.corner, uv: [mapU(v.uv[0]), mapV(v.uv[1])] })))
  }

  function emitCube(cube, m) {
    const g = normalizeGrow(cube.grow)
    const [ox, oy, oz] = cube.origin
    const [dx, dy, dz] = cube.dimensions
    let x0 = ox - g
    let x1 = ox + dx + g
    const y0 = oy - g, y1 = oy + dy + g
    const z0 = oz - g, z1 = oz + dz + g
    if (cube.mirror) {
      const swap = x0
      x0 = x1
      x1 = swap
    }
    const p = (x, y, z) => {
      const out = vec3.create()
      vec3.transformMat4(out, [x, y, z], m)
      return [out[0], out[1], out[2]]
    }
    const c000 = p(x0, y0, z0), c100 = p(x1, y0, z0), c110 = p(x1, y1, z0), c010 = p(x0, y1, z0)
    const c001 = p(x0, y0, z1), c101 = p(x1, y0, z1), c111 = p(x1, y1, z1), c011 = p(x0, y1, z1)
    const f = boxFaces(cube.texCoord.u, cube.texCoord.v, dx, dy, dz)
    const mi = cube.mirror
    // 顶点顺序与 Mojang 1.19.2 ModelPart.Cube 一致
    emitFace([c101, c001, c000, c100], f.down, mi)
    emitFace([c110, c010, c011, c111], f.up, mi)
    emitFace([c000, c001, c011, c010], f.west, mi)
    emitFace([c100, c000, c010, c110], f.north, mi)
    emitFace([c101, c100, c110, c111], f.east, mi)
    emitFace([c001, c101, c111, c011], f.south, mi)
  }

  // 骨骼递归：matrix = parent * T(pose) * Rz * Ry * Rx（匹配 MC ModelPart.rotate 顺序）
  function walk(bone, parent) {
    const pp = bone.partPose
    const local = mat4.create()
    mat4.translate(local, local, [pp?.x || 0, pp?.y || 0, pp?.z || 0])
    if (pp?.zRot) mat4.rotateZ(local, local, pp.zRot)
    if (pp?.yRot) mat4.rotateY(local, local, pp.yRot)
    if (pp?.xRot) mat4.rotateX(local, local, pp.xRot)
    const world = mat4.create()
    mat4.multiply(world, parent, local)
    if (bone.cubes) for (const cube of bone.cubes) emitCube(cube, world)
    if (bone.children) {
      for (const [name, child] of Object.entries(bone.children)) {
        if (isBabyLegBone(name)) continue
        walk(child, world)
      }
    }
  }

  walk(model.mesh.root, mat4.create())
  if (faces.length === 0) return null

  // 模型空间 → 世界：MC scale(-1,-1,1) 翻 X/Y + 1/16 + 脚底落 0
  const quads = []
  for (const face of faces) {
    const verts = face.map(v => new Vertex(
      new Vector(-v.pos[0] * PX, (maxY - v.pos[1]) * PX, v.pos[2] * PX),
      [1, 1, 1],
      v.uv,
      undefined,
      undefined,
      undefined,
    ))
    quads.push(new Quad(verts[0], verts[1], verts[2], verts[3]))
  }
  return new DsMesh(quads)
}

/**
 * 单个模型 → Mesh，不含 overlay。
 * 导出给 `_tests/compare-entity-loader.mjs` 拿去和网站 TS loader 逐点比对 ——
 * 两边几何算法必须一致，这是移植正确性的判据。
 */
export function buildSingleModelMesh(model, textureId, atlas) {
  return buildEntityModelMesh(model, textureId, atlas, undefined)
}

/**
 * 按实体 id 生成完整外观（本体 + 无条件 overlay）。
 * 返回 { mesh, materialId } 或 null。
 */
export function createEntityModelMesh(entityId, atlas) {
  if (!catalog) return null
  const entry = catalog[entityId]
  if (!entry) return null

  const baseModel = loadModelJson(entry.model)
  if (!baseModel) return null

  const baseMesh = buildEntityModelMesh(baseModel, entry.texture, atlas, undefined)
  if (!baseMesh) return null

  // overlay 必须复用本体的脚底原点，否则两层各按自己最低点落地会错位
  // （羊毛层腿只有 6 像素、羊本体腿 12 像素，各自落地羊背就会穿出来）
  const anchor = computeModelAnchorMaxY(baseModel)
  for (const overlay of entry.overlays ?? []) {
    const overlayModel = loadModelJson(overlay.model)
    if (!overlayModel) continue
    const overlayMesh = buildEntityModelMesh(overlayModel, overlay.texture, atlas, anchor)
    if (overlayMesh) baseMesh.merge(overlayMesh)
  }

  return { mesh: baseMesh, materialId: entityId.replace('minecraft:', '') }
}
