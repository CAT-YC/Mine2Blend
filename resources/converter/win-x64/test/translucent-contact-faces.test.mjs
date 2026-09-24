import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, test } from 'node:test'
import { NbtByteArray, NbtCompound, NbtFile, NbtInt, NbtShort } from 'deepslate'

const converterDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const converter = path.join(converterDir, 'src', 'batch-obj-export.mjs')
const positions = new Map([
  [0, 'minecraft:black_stained_glass'],
  [1, 'minecraft:black_stained_glass'],
  [4, 'minecraft:black_stained_glass'],
  [5, 'minecraft:quartz_block'],
  [8, 'minecraft:stone'],
  [9, 'minecraft:stone'],
  [12, 'minecraft:black_stained_glass'],
  [13, 'minecraft:oak_leaves'],
  [16, 'minecraft:redstone_wire'],
  [20, 'minecraft:black_stained_glass'],
  [21, 'minecraft:grass_block'],
])

let temporaryDir
let baseline
let optimized

function writeFixture(filename) {
  const palette = new NbtCompound()
  const ids = new Map([['minecraft:air', 0]])
  palette.set('minecraft:air', new NbtInt(0))
  for (const blockId of positions.values()) {
    if (ids.has(blockId)) continue
    ids.set(blockId, ids.size)
    palette.set(blockId, new NbtInt(ids.get(blockId)))
  }
  const blockData = Array.from({ length: 22 }, (_, x) => ids.get(positions.get(x) ?? 'minecraft:air'))
  const file = NbtFile.create({ compression: 'gzip' })
  file.root
    .set('Version', new NbtInt(2))
    .set('Width', new NbtShort(22))
    .set('Height', new NbtShort(1))
    .set('Length', new NbtShort(1))
    .set('Palette', palette)
    .set('BlockData', new NbtByteArray(blockData))
  fs.writeFileSync(filename, Buffer.from(file.write()))
}

function readQuads(filename) {
  const vertices = []
  const normals = []
  const quads = []
  let material = ''
  let firstFace = null
  for (const line of fs.readFileSync(filename, 'utf8').split('\n')) {
    if (line.startsWith('v ')) vertices.push(line.slice(2).trim().split(/\s+/).map(Number))
    else if (line.startsWith('vn ')) normals.push(line.slice(3).trim().split(/\s+/).map(Number))
    else if (line.startsWith('usemtl ')) material = line.slice(7).trim()
    else if (line.startsWith('f ')) {
      const face = line.slice(2).trim().split(/\s+/).map(ref => ref.split('/').map(Number))
      if (!firstFace) { firstFace = face; continue }
      const refs = [...firstFace, ...face]
      const points = [...new Set(refs.map(ref => ref[0]))].map(index => vertices[index - 1])
      quads.push({ material, points, normal: normals[face[0][2] - 1] })
      firstFace = null
    }
  }
  assert.equal(firstFace, null, 'OBJ 三角面必须成对形成四边面')
  return quads
}

function interfaceFaces(quads, x) {
  return quads.filter(quad => quad.points.length === 4 &&
    quad.points.every(point => Math.abs(point[0] - x) < 1e-6) &&
    Math.abs(quad.normal[0]) > 0.99)
}

before(() => {
  temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mine2blend-contact-faces-'))
  const input = path.join(temporaryDir, 'fixture.schem')
  writeFixture(input)
  for (const [name, extra] of [['baseline', []], ['optimized', ['--cull-translucent-overlap']]]) {
    const output = path.join(temporaryDir, name)
    execFileSync(process.execPath, [converter, 'import', '--input', input, '--output', output,
      '--format', 'obj', '--preserve-adjacent-faces', '--include', 'blocks', ...extra],
    { cwd: converterDir, encoding: 'utf8' })
    const quads = readQuads(path.join(output, 'fixture', 'fixture.obj'))
    if (name === 'baseline') baseline = quads
    else optimized = quads
  }
})

after(() => {
  const tempRoot = path.resolve(os.tmpdir()) + path.sep
  if (temporaryDir?.startsWith(tempRoot) && path.basename(temporaryDir).startsWith('mine2blend-contact-faces-')) {
    fs.rmSync(temporaryDir, { recursive: true, force: true })
  }
})

test('相邻玻璃的内部接触面不进入渲染 OBJ', () => {
  assert.equal(interfaceFaces(baseline, 1).length, 2)
  assert.equal(interfaceFaces(optimized, 1).length, 0)
  assert.equal(interfaceFaces(optimized, 0).length, 1, '外侧玻璃面必须保留')
})

test('玻璃贴实心方块时只删除玻璃侧内面', () => {
  assert.equal(interfaceFaces(baseline, 5).length, 2)
  assert.deepEqual(interfaceFaces(optimized, 5).map(face => face.material), ['quartz_block'])
})

test('普通方块和透明裁切方块仍保留可编辑的接触面', () => {
  assert.equal(interfaceFaces(optimized, 9).length, 2, '石头内部面保持现有编辑语义')
  assert.deepEqual(interfaceFaces(optimized, 13).map(face => face.material).sort(),
    ['black_stained_glass', 'oak_leaves'])
})

test('红石线的同向材质叠层不受透明内面剔除影响', () => {
  const count = quads => quads.filter(quad => quad.material.startsWith('redstone_wire')).length
  assert.ok(count(baseline) > 0, '合成投影必须实际产生红石线面')
  assert.equal(count(optimized), count(baseline))
})

test('玻璃贴草方块时移除玻璃侧内面', () => {
  assert.equal(interfaceFaces(baseline, 21).filter(face => face.material === 'black_stained_glass').length, 1)
  assert.equal(interfaceFaces(optimized, 21).filter(face => face.material === 'black_stained_glass').length, 0)
})
