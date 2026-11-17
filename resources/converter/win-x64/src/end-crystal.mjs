import { Mesh } from 'deepslate'
import { mat4 } from 'gl-matrix'
import { buildSingleModelMesh } from './entity-model.mjs'

export const END_CRYSTAL_ID = 'minecraft:end_crystal'
const TEXTURE = 'minecraft:entity/end_crystal/end_crystal'
const TILT_AXIS = [1, 0, 1]
const TILT_ANGLE = Math.PI / 3

function cubeModel(u, v, origin, dimensions, anchorMaxY) {
  return {
    mesh: { root: { cubes: [{ texCoord: { u, v }, origin, dimensions }] } },
    material: { xTexSize: 64, yTexSize: 32 },
    anchorMaxY,
    anchorFixed: true,
  }
}

const GLASS = cubeModel(0, 0, [-4, -4, -4], [8, 8, 8], 0)
const CORE = cubeModel(32, 0, [-4, -4, -4], [8, 8, 8], 0)
const BASE = cubeModel(0, 16, [-6, 0, -6], [12, 4, 12], 4)

// 与网站 EndCrystalModel 的组变换一致，OBJ 烘焙时间零点的姿态。
export function createEndCrystalMesh(entity, atlas) {
  if (!Object.hasOwn(atlas.idMap, TEXTURE)) return null
  const [x, y, z] = entity.pos
  const phase = entity.crystalPhase ?? x + z * 0.37
  const bob = Math.sin(phase) * 0.5 + 0.5
  const mesh = new Mesh()

  if (entity.showBottom !== false) {
    const base = mat4.fromTranslation(mat4.create(), entity.pos)
    mat4.scale(base, base, [2, 2, 2])
    mesh.merge(buildSingleModelMesh(BASE, TEXTURE, atlas).transform(base))
  }

  const outer = mat4.fromTranslation(mat4.create(), [x, y + 0.92 + 0.2 * (bob * bob + bob), z])
  mat4.rotateY(outer, outer, phase)
  mat4.rotate(outer, outer, TILT_ANGLE, TILT_AXIS)
  mat4.scale(outer, outer, [2, 2, 2])
  mesh.merge(buildSingleModelMesh(GLASS, TEXTURE, atlas).transform(outer))

  const inner = mat4.clone(outer)
  mat4.rotate(inner, inner, TILT_ANGLE, TILT_AXIS)
  mat4.rotateY(inner, inner, phase)
  mat4.scale(inner, inner, [0.875, 0.875, 0.875])
  mesh.merge(buildSingleModelMesh(GLASS, TEXTURE, atlas).transform(inner))

  const core = mat4.clone(inner)
  mat4.rotate(core, core, TILT_ANGLE, TILT_AXIS)
  mat4.rotateY(core, core, phase)
  mat4.scale(core, core, [0.765625, 0.765625, 0.765625])
  mesh.merge(buildSingleModelMesh(CORE, TEXTURE, atlas).transform(core))

  return { mesh, materialId: 'end_crystal' }
}
