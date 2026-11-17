import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BlockModel, TextureAtlas } from 'deepslate'
import { makeFrameUV } from '../src/atlas-frame-uv.mjs'

// 仅用于复现导出器修复前的行为；期望值另行手算，不调用待测 helper。
function originalFrameUV([x, y, width, height], atlasWidth, atlasHeight) {
  return [x / atlasWidth, y / atlasHeight,
    (x + width) / atlasWidth, (y + Math.min(height, width)) / atlasHeight]
}

function greenFrameOnWhiteAtlas() {
  const width = 16, height = 32
  const data = new Uint8ClampedArray(width * height * 4).fill(255)
  for (let y = 2; y < 6; y++) {
    for (let x = 4; x < 8; x++) {
      const offset = (y * width + x) * 4
      data[offset] = 0
      data[offset + 2] = 0
    }
  }
  return { width, height, data }
}

function pixel(image, x, y) {
  const offset = (y * image.width + x) * 4
  return [...image.data.subarray(offset, offset + 3)]
}

// 基础级采样：纹素中心在 (i + 0.5) / 尺寸；不模拟 mip 或各向异性过滤。
function closestSample(image, [u, v]) {
  return pixel(image, Math.floor(u * image.width), Math.floor(v * image.height))
}

function linearSample(image, [u, v]) {
  const x = u * image.width - 0.5, y = v * image.height - 0.5
  const left = Math.floor(x), top = Math.floor(y)
  const fx = x - left, fy = y - top
  const colors = [pixel(image, left, top), pixel(image, left + 1, top),
    pixel(image, left, top + 1), pixel(image, left + 1, top + 1)]
  const weights = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy]
  return [0, 1, 2].map(channel => colors.reduce((sum, color, i) => sum + color[channel] * weights[i], 0))
}

function gridSamples(bounds) {
  const [u0, v0, u1, v1] = bounds
  const samples = []
  for (let row = 0; row <= 8; row++) {
    for (let column = 0; column <= 8; column++) {
      samples.push([u0 + (u1 - u0) * column / 8, v0 + (v1 - v0) * row / 8])
    }
  }
  return samples
}

function contaminatedSamples(image, bounds, sampler) {
  return gridSamples(bounds).filter(uv => {
    const color = sampler(image, uv)
    return color[0] > 0 || color[2] > 0 || color[1] !== 255
  }).length
}

test('首帧四边落在边缘纹素中心，不能伸入下一帧', () => {
  // x=4..19、y=6..21；像素中心为 4.5/64、6.5/128、19.5/64、21.5/128。
  assert.deepEqual(makeFrameUV([4, 6, 16, 48], 64, 128),
    [0.0703125, 0.05078125, 0.3046875, 0.16796875])
})

test('矮于宽度的实体纹理保留完整高度，分别使用横纵 atlas 尺寸', () => {
  // 12×6 实体纹理，不能误裁成正方形，也不能使用 atlasWidth 归一化 V。
  assert.deepEqual(makeFrameUV([8, 4, 12, 6], 64, 32),
    [0.1328125, 0.140625, 0.3046875, 0.296875])
})

test('单像素维度收敛到同一像素中心，不能反转范围', () => {
  assert.deepEqual(makeFrameUV([2, 3, 1, 8], 16, 32),
    [0.15625, 0.109375, 0.15625, 0.109375])
  assert.deepEqual(makeFrameUV([2, 3, 8, 1], 16, 32),
    [0.15625, 0.109375, 0.59375, 0.109375])
  const singlePixelBounds = makeFrameUV([4, 2, 1, 8], 16, 32)
  for (const [u, v] of gridSamples(singlePixelBounds)) {
    const objU = Number(u.toFixed(6)), objV = Number((1 - v).toFixed(6))
    assert.deepEqual([Math.floor(objU * 16), Math.floor((1 - objV) * 32)], [4, 2])
  }
})

test('旧映射在绿色首帧与白色邻区的边界采样确实污染', () => {
  const image = greenFrameOnWhiteAtlas()
  const original = originalFrameUV([4, 2, 4, 12], 16, 32)
  // 9×9 网格：Closest 的最右列与最下行共 17 点越界，Linear 的周界共 32 点混白。
  assert.equal(contaminatedSamples(image, original, closestSample), 17)
  assert.equal(contaminatedSamples(image, original, linearSample), 32)
})

test('保护后的绿色首帧基础级边界采样不混入白色邻区', () => {
  const image = greenFrameOnWhiteAtlas()
  const bounds = makeFrameUV([4, 2, 4, 12], 16, 32)
  assert.equal(contaminatedSamples(image, bounds, closestSample), 0)
  assert.equal(contaminatedSamples(image, bounds, linearSample), 0)
  // 第一帧下缘外侧就是下一帧白色行，不能按整条序列的高度生成上界。
  assert.deepEqual(closestSample(image, [bounds[2], bounds[3]]), [0, 255, 0])
  assert.deepEqual(pixel(image, 7, 6), [255, 255, 255])
})

test('静态 OBJ 翻转 V 和六位小数后，Closest 仍不会跳到邻帧', () => {
  const image = greenFrameOnWhiteAtlas()
  const bounds = makeFrameUV([4, 2, 4, 12], 16, 32)
  for (const [u, v] of gridSamples(bounds)) {
    const objU = Number(u.toFixed(6)), objV = Number((1 - v).toFixed(6))
    assert.deepEqual(closestSample(image, [objU, 1 - objV]), [0, 255, 0])
  }
})

test('实际 BlockModel 四种面旋转均使用保护后的首帧范围', () => {
  const image = greenFrameOnWhiteAtlas()
  const atlas = new TextureAtlas(image, {
    'minecraft:block/test_frame': makeFrameUV([4, 2, 4, 12], 16, 32),
  })
  for (const rotation of [0, 90, 180, 270]) {
    const model = BlockModel.fromJson({
      textures: { all: 'minecraft:block/test_frame' },
      elements: [{ from: [0, 0, 0], to: [16, 16, 16],
        faces: { south: { texture: '#all', uv: [0, 0, 16, 16], rotation } } }],
    })
    const quad = model.getMesh(atlas, {}).quads[0]
    const vertexUVs = quad.vertices().map(vertex => vertex.texture)
    assert.deepEqual([...new Set(vertexUVs.map(uv => uv[0]))].sort(), [0.28125, 0.46875])
    assert.deepEqual([...new Set(vertexUVs.map(uv => uv[1]))].sort(), [0.078125, 0.171875])
    for (const uv of vertexUVs) assert.deepEqual(closestSample(image, uv), [0, 255, 0])
  }
})
