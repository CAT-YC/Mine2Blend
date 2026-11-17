import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import {
  NbtByte, NbtByteArray, NbtCompound, NbtDouble, NbtFile, NbtInt, NbtIntArray,
  NbtList, NbtLongArray, NbtString,
} from 'deepslate'
import sharp from 'sharp'

const runtime = fileURLToPath(new URL('../', import.meta.url))
const converter = path.join(runtime, 'src/batch-obj-export.mjs')
const vector = (x, y, z) => new NbtCompound()
  .set('x', new NbtInt(x)).set('y', new NbtInt(y)).set('z', new NbtInt(z))
const position = (...axes) => new NbtList(axes.map(axis => new NbtDouble(axis)))
const crystal = (id, pos, data = new NbtCompound()) => data
  .set('Id', new NbtString(id)).set('Pos', position(...pos))

function runFixture(t, extension, root, probeOnly = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm2b-crystal-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const input = path.join(dir, 'fixture.' + extension)
  const metadata = path.join(dir, 'metadata.json')
  const file = NbtFile.create({ compression: 'gzip' })
  file.root = root
  fs.writeFileSync(input, Buffer.from(file.write()))
  execFileSync(process.execPath, [converter, 'import', '--input', input, '--output', path.join(dir, '水晶缓存'),
    '--format', 'obj', '--metadata-json', metadata, ...(probeOnly ? ['--probe-only'] : [])])
  return JSON.parse(fs.readFileSync(metadata, 'utf8'))
}

function readCrystalQuads(obj) {
  const vertices = [], uvs = [], triangles = []
  let material
  for (const line of fs.readFileSync(obj, 'utf8').split('\n')) {
    const [tag, ...fields] = line.split(' ')
    if (tag === 'v') vertices.push(fields.map(Number))
    if (tag === 'vt') uvs.push(fields.map(Number))
    if (tag === 'usemtl') material = fields[0]
    if (tag === 'f' && material === 'entity_end_crystal') {
      triangles.push(fields.map(field => field.split('/').map(Number)))
    }
  }
  const quads = []
  for (let i = 0; i < triangles.length; i += 2) {
    quads.push([...triangles[i], triangles[i + 1][2]]
      .map(([v, uv]) => ({ position: vertices[v - 1], uv: uvs[uv - 1] })))
  }
  return quads
}

function assertNear(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 0.000002, `${actual} ≉ ${expected}`)
}

function assertBox(quads, [x, y, z], edgeLength, phase = x + z * 0.37) {
  assert.equal(quads.length, 6)
  const bob = Math.sin(phase) * 0.5 + 0.5
  const corners = quads.flat()
  const center = [x, y + 0.92 + 0.2 * (bob * bob + bob), z]
  for (const [axis, value] of center.entries()) {
    assertNear(corners.reduce((sum, vertex) => sum + vertex.position[axis], 0) / 24, value)
  }
  for (const quad of quads) {
    const a = quad[0].position, b = quad[1].position
    assertNear(Math.hypot(...a.map((value, axis) => value - b[axis])), edgeLength)
  }
}

test('Litematic 的双层外壳、晶核及可选底座复用原版 UV', async t => {
  const region = new NbtCompound()
    .set('Position', vector(7, 2, 11)).set('Size', vector(-2, 1, 1))
    .set('BlockStatePalette', new NbtList([new NbtCompound().set('Name', new NbtString('minecraft:stone'))]))
    .set('BlockStates', new NbtLongArray([0n]))
    .set('Entities', new NbtList([
      crystal('EnderCrystal', [0.25, 1.75, 0.5], new NbtCompound()
        .set('ShowBottom', new NbtByte(0)).set('BeamTarget', vector(10, 20, 30))),
      crystal('minecraft:ender_crystal', [3.5, 2.25, 4.125]),
    ]))
  const root = new NbtCompound().set('Version', new NbtInt(6))
    .set('Regions', new NbtCompound().set('crystals', region))
  const { outputs: [out] } = runFixture(t, 'litematic', root)
  assert.deepEqual(out.entityCounts, { end_crystal: 2 })
  assert.deepEqual(out.entityPlaceholders, [])
  const quads = readCrystalQuads(out.obj)
  assert.equal(quads.length, 42)
  for (const [offset, pos] of [[0, [1.25, 1.75, 0.5]], [24, [4.5, 2.25, 4.125]]]) {
    assertBox(quads.slice(offset, offset + 6), pos, 1)
    assertBox(quads.slice(offset + 6, offset + 12), pos, 0.875)
    assertBox(quads.slice(offset + 12, offset + 18), pos, 0.875 * 0.765625)
  }
  const base = quads.slice(18, 24).flat().map(vertex => vertex.position)
  assertNear(Math.min(...base.map(p => p[1])), 2.25)
  assertNear(Math.max(...base.map(p => p[1])), 2.75)
  const { width, height } = await sharp(out.atlas).metadata()
  const uvMap = JSON.parse(fs.readFileSync(path.join(runtime, 'assets/mcmeta/atlas-uv.json'), 'utf8'))
  const [left, top, skinWidth, skinHeight] = uvMap['entity/end_crystal/end_crystal']
  const firstCornerUVs = quads.map(([{ uv }]) => [
    Math.round((uv[0] * width - left) * 64 / skinWidth),
    Math.round(((1 - uv[1]) * height - top) * 32 / skinHeight),
  ])
  const glass = [[16, 0], [24, 8], [8, 8], [16, 8], [24, 8], [32, 8]]
  const core = glass.map(([u, v]) => [u + 32, v])
  const bottom = [[24, 16], [36, 28], [12, 28], [24, 28], [36, 28], [48, 28]]
  assert.deepEqual(firstCornerUVs, [...glass, ...glass, ...core, ...bottom, ...glass, ...glass, ...core])
  assert.match(fs.readFileSync(out.mtl, 'utf8'), /newmtl entity_end_crystal[\s\S]+?d 1\.00[\s\S]+?map_Kd atlas\.png/)
})

for (const version of [2, 3]) {
  test(`Sponge v${version} 保留水晶位置及属性`, t => {
    const data = new NbtCompound().set('show_bottom', new NbtString('false'))
    const entity = version === 3
      ? crystal('minecraft:end_crystal', [1.75, 2, 0.5]).set('Data',
        data.set('Pos', position(120, 180, -130)).set('id', new NbtString('minecraft:armor_stand')))
      : crystal('minecraft:end_crystal', [101.75, 2, 0.5], data)
    const root = new NbtCompound().set('Version', new NbtInt(version))
      .set('Width', new NbtInt(2)).set('Height', new NbtInt(1)).set('Length', new NbtInt(1))
      .set('Offset', new NbtIntArray([100, 0, 0])).set('Entities', new NbtList([entity]))
    const palette = new NbtCompound().set('minecraft:air', new NbtInt(0))
      .set('minecraft:stone', new NbtInt(1))
    const blocks = new NbtByteArray(version === 3 ? [0, 0] : [0, 1])
    const input = version === 3
      ? new NbtCompound().set('Schematic', root.set('Blocks', new NbtCompound().set('Palette', palette).set('Data', blocks)))
      : root.set('Palette', palette).set('BlockData', blocks)
    const { probes: [probe] } = runFixture(t, 'schem', input, true)
    assert.equal(probe.counts.entitiesModelled, 1)
    const { outputs: [out] } = runFixture(t, 'schem', input)
    assert.deepEqual(out.entityCounts, { end_crystal: 1 })
    const quads = readCrystalQuads(out.obj)
    assert.equal(quads.length, 18)
    const modelPos = version === 3 ? [1.75, 2, 0.5] : [0.75, 2, 0.5]
    assertBox(quads.slice(0, 6), modelPos, 1, 1.75 + 0.5 * 0.37)
  })
}
