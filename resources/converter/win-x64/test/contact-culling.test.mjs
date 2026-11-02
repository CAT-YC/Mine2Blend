import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Quad, Vertex, Vector } from 'deepslate'
import { cullTranslucentContactFaces } from '../src/contact-culling.mjs'

const AXIS_TANGENTS = [
  { u: 'y', v: 'z' },
  { u: 'z', v: 'x' },
  { u: 'x', v: 'y' },
]

function makeQuad({
  normal,
  plane,
  uRange,
  vRange,
  axisIndex = 0,
  uvs,
  color = [1, 1, 1],
  metadata = {},
}) {
  const { u: uName, v: vName } = AXIS_TANGENTS[axisIndex]
  const [uMin, uMax] = uRange
  const [vMin, vMax] = vRange

  const corners2D = [
    [uMin, vMin],
    [uMax, vMin],
    [uMax, vMax],
    [uMin, vMax],
  ]

  const normalVec = new Vector(normal[0], normal[1], normal[2])
  // 计算 3D 顶点并确保 CCW / 正确法向
  const verts = corners2D.map(([u, v], i) => {
    const coords = [0, 0, 0]
    coords[axisIndex] = plane
    if (axisIndex === 0) { coords[1] = u; coords[2] = v }
    else if (axisIndex === 1) { coords[2] = u; coords[0] = v }
    else { coords[0] = u; coords[1] = v }
    const pos = new Vector(coords[0], coords[1], coords[2])
    const uv = uvs ? uvs[i] : [u - uMin, v - vMin]
    return new Vertex(pos, color, uv, undefined, normalVec, undefined)
  })

  let quad = new Quad(verts[0], verts[1], verts[2], verts[3])
  const n = quad.normal()
  const dot = n.x * normal[0] + n.y * normal[1] + n.z * normal[2]
  if (dot < 0) {
    quad = new Quad(verts[3], verts[2], verts[1], verts[0])
  }

  for (const [k, v] of Object.entries(metadata)) {
    quad[k] = v
  }
  return quad
}

test('玻璃板贴石头端面被完全覆盖时删除玻璃板内面，保留石头面', () => {
  // 玻璃板在 [0, 0, 0]，东向端面位于 x=1, y=[0, 1], z=[0.4375, 0.5625]
  const paneQuad = makeQuad({
    normal: [1, 0, 0],
    plane: 1,
    uRange: [0, 1],
    vRange: [0.4375, 0.5625],
    axisIndex: 0,
    metadata: { testId: 'pane-east-end' },
  })

  // 石头在 [1, 0, 0]，西向完整面位于 x=1, y=[0, 1], z=[0, 1]
  const stoneQuad = makeQuad({
    normal: [-1, 0, 0],
    plane: 1,
    uRange: [0, 1],
    vRange: [0, 1],
    axisIndex: 0,
    metadata: { testId: 'stone-west-full' },
  })

  const entries = [
    { quad: paneQuad, blockId: 'minecraft:glass_pane', position: [0, 0, 0], section: 'blocks' },
    { quad: stoneQuad, blockId: 'minecraft:stone', position: [1, 0, 0], section: 'blocks' },
  ]

  const culled = cullTranslucentContactFaces(entries)
  assert.equal(culled.length, 1)
  assert.equal(culled[0].blockId, 'minecraft:stone')
  assert.equal(culled[0].quad.testId, 'stone-west-full')
})

test('玻璃贴下半砖时差集裁切，只保留玻璃上半面并插值UV与顶点色', () => {
  // 玻璃在 [0, 0, 0]，东面 x=1, y=[0, 1], z=[0, 1]
  const glassQuad = makeQuad({
    normal: [1, 0, 0],
    plane: 1,
    uRange: [0, 1],
    vRange: [0, 1],
    axisIndex: 0,
    uvs: [[0, 0], [0, 1], [1, 1], [1, 0]],
    color: [0.8, 0.8, 0.8],
    metadata: { m2bLightEmission: 14 },
  })

  // 下半砖在 [1, 0, 0]，西面 x=1, y=[0, 0.5], z=[0, 1]
  const slabQuad = makeQuad({
    normal: [-1, 0, 0],
    plane: 1,
    uRange: [0, 0.5],
    vRange: [0, 1],
    axisIndex: 0,
    metadata: { testId: 'slab-face' },
  })

  const entries = [
    { quad: glassQuad, blockId: 'minecraft:glass', position: [0, 0, 0], section: 'blocks' },
    { quad: slabQuad, blockId: 'minecraft:stone_slab', position: [1, 0, 0], section: 'blocks' },
  ]

  const culled = cullTranslucentContactFaces(entries)
  assert.equal(culled.length, 2)

  const glassEntry = culled.find(e => e.blockId === 'minecraft:glass')
  assert.ok(glassEntry, '玻璃侧保留差集结果')
  assert.equal(glassEntry.quad.m2bLightEmission, 14, '保留自定义标记 m2bLightEmission')

  const verts = glassEntry.quad.vertices()
  const yVals = verts.map(v => v.pos.y)
  const zVals = verts.map(v => v.pos.z)
  assert.equal(Math.min(...yVals), 0.5, '玻璃面底部裁掉，从 y=0.5 开始')
  assert.equal(Math.max(...yVals), 1.0, '玻璃面上部到 y=1.0 保持')
  assert.equal(Math.min(...zVals), 0.0)
  assert.equal(Math.max(...zVals), 1.0)

  // 验证法线方向保持为 +X
  const n = glassEntry.quad.normal()
  assert.ok(n.x > 0.99 && Math.abs(n.y) < 0.01 && Math.abs(n.z) < 0.01, '法线方向严格保持')

  // 验证 UV 在 y=0.5 处双线性/线性插值
  for (const v of verts) {
    if (Math.abs(v.pos.y - 0.5) < 1e-4) {
      assert.ok(v.texture[1] >= 0.49 && v.texture[1] <= 0.51, 'y=0.5 处 UV 线性插值正确')
    }
    assert.deepEqual(v.color, [0.8, 0.8, 0.8], '顶点色保持')
  }
})

test('同种透明方块相邻接触删除双方接触面，外侧悬空透明面保留', () => {
  const glassA_contact = makeQuad({ normal: [1, 0, 0], plane: 1, uRange: [0, 1], vRange: [0, 1], axisIndex: 0 })
  const glassB_contact = makeQuad({ normal: [-1, 0, 0], plane: 1, uRange: [0, 1], vRange: [0, 1], axisIndex: 0 })
  const glassA_outer = makeQuad({ normal: [-1, 0, 0], plane: 0, uRange: [0, 1], vRange: [0, 1], axisIndex: 0, metadata: { outer: true } })

  const entries = [
    { quad: glassA_contact, blockId: 'minecraft:glass', position: [0, 0, 0] },
    { quad: glassB_contact, blockId: 'minecraft:glass', position: [1, 0, 0] },
    { quad: glassA_outer, blockId: 'minecraft:glass', position: [0, 0, 0] },
  ]

  const culled = cullTranslucentContactFaces(entries)
  assert.equal(culled.length, 1)
  assert.equal(culled[0].quad.outer, true, '外侧悬空面必须保留')
})

test('不同 blockId 透明介质相邻必须保留双方接触面', () => {
  const redGlass = makeQuad({ normal: [1, 0, 0], plane: 1, uRange: [0, 1], vRange: [0, 1], axisIndex: 0 })
  const blueGlass = makeQuad({ normal: [-1, 0, 0], plane: 1, uRange: [0, 1], vRange: [0, 1], axisIndex: 0 })

  const entries = [
    { quad: redGlass, blockId: 'minecraft:red_stained_glass', position: [0, 0, 0] },
    { quad: blueGlass, blockId: 'minecraft:blue_stained_glass', position: [1, 0, 0] },
  ]

  const culled = cullTranslucentContactFaces(entries)
  assert.equal(culled.length, 2, '异色玻璃交界必须保留双方')
})

test('玻璃与水相邻必须保留双方接触面', () => {
  const glass = makeQuad({ normal: [1, 0, 0], plane: 1, uRange: [0, 1], vRange: [0, 1], axisIndex: 0 })
  const water = makeQuad({ normal: [-1, 0, 0], plane: 1, uRange: [0, 1], vRange: [0, 1], axisIndex: 0 })

  const entries = [
    { quad: glass, blockId: 'minecraft:glass', position: [0, 0, 0] },
    { quad: water, blockId: 'minecraft:water', position: [1, 0, 0] },
  ]

  const culled = cullTranslucentContactFaces(entries)
  assert.equal(culled.length, 2, '玻璃与水交界必须保留双方')
})

test('玻璃贴树叶时保留双方接触面（树叶镂空不删）', () => {
  const glass = makeQuad({ normal: [1, 0, 0], plane: 1, uRange: [0, 1], vRange: [0, 1], axisIndex: 0 })
  const leaves = makeQuad({ normal: [-1, 0, 0], plane: 1, uRange: [0, 1], vRange: [0, 1], axisIndex: 0 })

  const entries = [
    { quad: glass, blockId: 'minecraft:glass', position: [0, 0, 0] },
    { quad: leaves, blockId: 'minecraft:oak_leaves', position: [1, 0, 0] },
  ]

  const culled = cullTranslucentContactFaces(entries)
  assert.equal(culled.length, 2, '玻璃贴树叶镂空双方保留')
})

test('普通石头与石头接触面保留可编辑语义', () => {
  const stoneA = makeQuad({ normal: [1, 0, 0], plane: 1, uRange: [0, 1], vRange: [0, 1], axisIndex: 0 })
  const stoneB = makeQuad({ normal: [-1, 0, 0], plane: 1, uRange: [0, 1], vRange: [0, 1], axisIndex: 0 })

  const entries = [
    { quad: stoneA, blockId: 'minecraft:stone', position: [0, 0, 0] },
    { quad: stoneB, blockId: 'minecraft:stone', position: [1, 0, 0] },
  ]

  const culled = cullTranslucentContactFaces(entries)
  assert.equal(culled.length, 2, '石头接触面保留')
})

test('四方向（东/西/南/北）及上下方向（Up/Down）均能正确判定与裁切', () => {
  // 测试上下方向：玻璃在 [0, 0, 0]，Top 面 y=1, 法线 +Y
  // 石头在 [0, 1, 0]，Bottom 面 y=1, 法线 -Y
  const glassUp = makeQuad({
    normal: [0, 1, 0],
    plane: 1,
    uRange: [0, 1], // z
    vRange: [0, 1], // x
    axisIndex: 1,
    metadata: { id: 'up' },
  })
  const stoneDown = makeQuad({
    normal: [0, -1, 0],
    plane: 1,
    uRange: [0, 1],
    vRange: [0, 1],
    axisIndex: 1,
    metadata: { id: 'down' },
  })

  // 测试南北方向：玻璃在 [0, 0, 0]，South 面 z=1, 法线 +Z
  // 半砖在 [0, 0, 1]，North 面 z=1, 法线 -Z, x in [0, 0.5], y in [0, 1]
  const glassSouth = makeQuad({
    normal: [0, 0, 1],
    plane: 1,
    uRange: [0, 1], // x
    vRange: [0, 1], // y
    axisIndex: 2,
    metadata: { id: 'south' },
  })
  const slabNorth = makeQuad({
    normal: [0, 0, -1],
    plane: 1,
    uRange: [0, 0.5],
    vRange: [0, 1],
    axisIndex: 2,
    metadata: { id: 'north' },
  })

  const entries = [
    { quad: glassUp, blockId: 'minecraft:glass', position: [0, 0, 0] },
    { quad: stoneDown, blockId: 'minecraft:stone', position: [0, 1, 0] },
    { quad: glassSouth, blockId: 'minecraft:glass', position: [0, 0, 0] },
    { quad: slabNorth, blockId: 'minecraft:stone_slab', position: [0, 0, 1] },
  ]

  const culled = cullTranslucentContactFaces(entries)
  // glassUp 被整面覆盖删除，stoneDown 保留；glassSouth 被半砖部分覆盖裁切为半面，slabNorth 保留
  assert.equal(culled.length, 3)
  assert.ok(culled.some(e => e.quad.id === 'down'))
  assert.ok(culled.some(e => e.quad.id === 'north'))
  const remainingGlassSouth = culled.find(e => e.blockId === 'minecraft:glass')
  assert.ok(remainingGlassSouth)
  const xVals = remainingGlassSouth.quad.vertices().map(v => v.pos.x)
  assert.equal(Math.min(...xVals), 0.5, '南北方向差集正确，x 从 0.5 开始')
})

test('UV 翻转与旋转时双线性插值依然保持准确贴图映射', () => {
  // 构造 90 度旋转并翻转的 UV 映射
  // (uMin, vMin) -> [0, 1]
  // (uMax, vMin) -> [1, 1]
  // (uMax, vMax) -> [1, 0]
  // (uMin, vMax) -> [0, 0]
  const glassRotatedUV = makeQuad({
    normal: [1, 0, 0],
    plane: 1,
    uRange: [0, 1],
    vRange: [0, 1],
    axisIndex: 0,
    uvs: [[0, 1], [1, 1], [1, 0], [0, 0]],
  })

  const slabQuad = makeQuad({
    normal: [-1, 0, 0],
    plane: 1,
    uRange: [0, 0.5],
    vRange: [0, 1],
    axisIndex: 0,
  })

  const entries = [
    { quad: glassRotatedUV, blockId: 'minecraft:glass', position: [0, 0, 0] },
    { quad: slabQuad, blockId: 'minecraft:stone_slab', position: [1, 0, 0] },
  ]

  const culled = cullTranslucentContactFaces(entries)
  const glass = culled.find(e => e.blockId === 'minecraft:glass')
  assert.ok(glass)

  const verts = glass.quad.vertices()
  // 在 u (y) 从 0.5 到 1 的边界上，原 u=0 对应 U=0, u=1 对应 U=1
  // 因此 u=0.5 时 U 应插值为 0.5
  for (const v of verts) {
    if (Math.abs(v.pos.y - 0.5) < 1e-4) {
      assert.ok(Math.abs(v.texture[0] - 0.5) < 1e-4, `插值 U 应为 0.5, 实际为 ${v.texture[0]}`)
    }
  }
})

test('多个遮挡片依次差集：两个角片遮挡下半部，保留上半部', () => {
  const glassQuad = makeQuad({
    normal: [1, 0, 0],
    plane: 1,
    uRange: [0, 1], // y
    vRange: [0, 1], // z
    axisIndex: 0,
  })

  // 遮挡片 1: y in [0, 0.5], z in [0, 0.5]
  const patch1 = makeQuad({
    normal: [-1, 0, 0],
    plane: 1,
    uRange: [0, 0.5],
    vRange: [0, 0.5],
    axisIndex: 0,
  })

  // 遮挡片 2: y in [0, 0.5], z in [0.5, 1.0]
  const patch2 = makeQuad({
    normal: [-1, 0, 0],
    plane: 1,
    uRange: [0, 0.5],
    vRange: [0.5, 1.0],
    axisIndex: 0,
  })

  const entries = [
    { quad: glassQuad, blockId: 'minecraft:glass', position: [0, 0, 0] },
    { quad: patch1, blockId: 'minecraft:stone_slab', position: [1, 0, 0] },
    { quad: patch2, blockId: 'minecraft:stone_slab', position: [1, 0, 0] },
  ]

  const culled = cullTranslucentContactFaces(entries)
  const glassPieces = culled.filter(e => e.blockId === 'minecraft:glass')
  assert.equal(glassPieces.length, 1)

  const verts = glassPieces[0].quad.vertices()
  const yVals = verts.map(v => v.pos.y)
  assert.equal(Math.min(...yVals), 0.5)
  assert.equal(Math.max(...yVals), 1.0)
})

test('不共面与斜面保持不变，不被误删或猜面', () => {
  // 斜面四边形（法线不是主轴对齐）
  const v0 = new Vertex(new Vector(0, 0, 0), [1, 1, 1], [0, 0])
  const v1 = new Vertex(new Vector(1, 1, 0), [1, 1, 1], [1, 0])
  const v2 = new Vertex(new Vector(1, 1, 1), [1, 1, 1], [1, 1])
  const v3 = new Vertex(new Vector(0, 0, 1), [1, 1, 1], [0, 1])
  const slantedQuad = new Quad(v0, v1, v2, v3)

  // 格子内部面（x=0.5，不在边界上）
  const internalQuad = makeQuad({
    normal: [1, 0, 0],
    plane: 0.5,
    uRange: [0, 1],
    vRange: [0, 1],
    axisIndex: 0,
  })

  // 实体四边形（position 为 undefined）
  const entityQuad = makeQuad({
    normal: [1, 0, 0],
    plane: 1,
    uRange: [0, 1],
    vRange: [0, 1],
    axisIndex: 0,
  })

  const entries = [
    { quad: slantedQuad, blockId: 'minecraft:glass', position: [0, 0, 0] },
    { quad: internalQuad, blockId: 'minecraft:glass', position: [0, 0, 0] },
    { quad: entityQuad, blockId: 'entity:pig', position: undefined },
  ]

  const culled = cullTranslucentContactFaces(entries)
  assert.equal(culled.length, 3, '非边界、倾斜和实体四边形全部原样保留')
})
