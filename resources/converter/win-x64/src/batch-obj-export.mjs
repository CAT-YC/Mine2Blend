#!/usr/bin/env node
/**
 * 批量 Litematic → OBJ + MTL + 独立纹理 导出工具
 *
 * 用法: node scripts/batch-obj-export.mjs <输入目录> <输出目录>
 * 示例: node scripts/batch-obj-export.mjs "D:\MYM_BuildCraft\Litematic\91 QQ可爱风小屋第二期" "D:\MYM_BuildCraft\OBJ_Export"
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import {
  NbtFile,
  BlockDefinition,
  BlockModel,
  TextureAtlas,
  Identifier,
  Cull,
  Direction,
  Mesh as DsMesh,
  Quad,
  Vertex,
  Vector,
} from 'deepslate'
import { mat4 } from 'gl-matrix'

// ─── 配置 ───────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const CONVERTER_VERSION = 'spike-0.1.1'
const RESOURCE_VERSION = 'mcmeta-2026-02-26-copy'
const MCMETA_DIR = process.env.MCBLOCK_MCMETA_DIR
  ? path.resolve(process.env.MCBLOCK_MCMETA_DIR)
  : path.resolve(__dirname, '..', 'assets', 'mcmeta')

const SKIP_BLOCK_IDS = new Set([
  'minecraft:air', 'minecraft:cave_air', 'minecraft:void_air',
  'minecraft:light', 'minecraft:barrier', 'minecraft:structure_void',
])

const FLUID_BLOCKS = new Set([
  'minecraft:water', 'minecraft:lava',
  'minecraft:flowing_water', 'minecraft:flowing_lava',
])

// Minecraft 水贴图本身接近灰白，游戏里靠 tint 上色；OBJ/MTL 需要显式带默认水色。
const WATER_TINT_RGB = [0x3f / 255, 0x76 / 255, 0xe4 / 255]

const NON_OPAQUE_KEYWORDS = [
  'leaves', 'glass', 'slab', 'stair', 'fence', 'wall', 'pane',
  'door', 'trapdoor', 'gate', 'torch', 'lantern', 'chain', 'candle',
  'flower', 'allium', 'orchid', 'tulip', 'daisy', 'cornflower', 'lily',
  'poppy', 'dandelion', 'sunflower', 'lilac', 'peony', 'rose_bush',
  'petal', 'bluet', 'dead_bush', 'pitcher',
  'grass', 'fern', 'sapling', 'bamboo', 'sugar_cane', 'cactus', 'kelp', 'seagrass',
  'vine', 'hanging', 'dripleaf', 'azalea', 'spore_blossom', 'moss_carpet',
  'water', 'lava', 'ice', 'honey_block', 'slime_block',
  'fire', 'soul_fire', 'nether_portal',
  'rail', 'sign', 'banner', 'carpet', 'pressure_plate', 'button', 'lever',
  'redstone', 'repeater', 'comparator', 'tripwire',
  'mushroom', 'fungus', 'nether_sprouts', 'nether_wart', 'roots', 'propagule',
  'snow_layer', 'snow', 'sculk_vein', 'sculk_sensor', 'amethyst_cluster', 'amethyst_bud',
  'pointed_dripstone', 'lightning_rod', 'end_rod', 'iron_bars',
  'coral', 'sea_pickle', 'turtle_egg', 'frogspawn',
  'campfire', 'soul_campfire', 'brewing_stand', 'bell', 'grindstone',
  'ladder', 'scaffolding', 'web', 'cobweb',
  'head', 'skull', 'pot', 'decorated_pot', 'armor_stand',
  'crops', 'wheat', 'carrots', 'potatoes', 'beetroots', 'melon_stem', 'pumpkin_stem',
  'sweet_berry', 'cave_vines', 'glow_lichen', 'cocoa',
  'chest', 'ender_chest', 'trapped_chest', 'shulker_box',
  'enchanting_table', 'anvil', 'hopper', 'cauldron', 'composter',
  'bed', 'cake', 'tinted_glass',
]

const OPAQUE_OVERRIDES = new Set([
  'snow_block', 'packed_ice', 'blue_ice', 'redstone_block',
  'red_mushroom_block', 'brown_mushroom_block', 'mushroom_stem',
  'coral_block', 'dead_brain_coral_block', 'dead_bubble_coral_block',
  'dead_fire_coral_block', 'dead_horn_coral_block', 'dead_tube_coral_block',
  'brain_coral_block', 'bubble_coral_block', 'fire_coral_block',
  'horn_coral_block', 'tube_coral_block',
])

const BIOME_TINT_COLORS = {
  grass_block: [0.569, 0.741, 0.349],
  short_grass: [0.569, 0.741, 0.349],
  grass: [0.569, 0.741, 0.349],
  tall_grass: [0.569, 0.741, 0.349],
  fern: [0.569, 0.741, 0.349],
  large_fern: [0.569, 0.741, 0.349],
  potted_fern: [0.569, 0.741, 0.349],
  sugar_cane: [0.569, 0.741, 0.349],
  oak_leaves: [0.467, 0.671, 0.184],
  jungle_leaves: [0.467, 0.671, 0.184],
  acacia_leaves: [0.467, 0.671, 0.184],
  dark_oak_leaves: [0.467, 0.671, 0.184],
  mangrove_leaves: [0.467, 0.671, 0.184],
  vine: [0.467, 0.671, 0.184],
  spruce_leaves: [0.380, 0.600, 0.380],
  birch_leaves: [0.502, 0.655, 0.333],
  azalea_leaves: [0.467, 0.671, 0.184],
  flowering_azalea_leaves: [0.467, 0.671, 0.184],
}

const BLOCK_DEF_ALIASES = {
  'minecraft:chain': 'minecraft:iron_chain',
  'minecraft:grass_path': 'minecraft:dirt_path',
  'minecraft:grass': 'minecraft:short_grass',
  'minecraft:sign': 'minecraft:oak_sign',
  'minecraft:wall_sign': 'minecraft:oak_wall_sign',
  'minecraft:banner': 'minecraft:white_banner',
  'minecraft:wall_banner': 'minecraft:white_wall_banner',
  'minecraft:bed': 'minecraft:red_bed',
  'minecraft:skull': 'minecraft:skeleton_skull',
  'minecraft:wall_skull': 'minecraft:skeleton_wall_skull',
}

const ENTITY_BLOCK_COLORS = {
  chest: [0.6, 0.4, 0.2],
  trapped_chest: [0.6, 0.4, 0.2],
  ender_chest: [0.1, 0.2, 0.3],
  shulker_box: [0.6, 0.3, 0.6],
  bed: [0.7, 0.2, 0.2],
  banner: [0.9, 0.9, 0.9],
  head: [0.7, 0.6, 0.5],
  skull: [0.8, 0.8, 0.7],
  sign: [0.6, 0.5, 0.3],
  wall_sign: [0.6, 0.5, 0.3],
  hanging_sign: [0.6, 0.5, 0.3],
  bell: [0.8, 0.7, 0.2],
  conduit: [0.5, 0.7, 0.8],
  enchanting_table: [0.3, 0.1, 0.1],
  lectern: [0.6, 0.4, 0.2],
  brewing_stand: [0.4, 0.4, 0.4],
  decorated_pot: [0.7, 0.5, 0.3],
  campfire: [0.5, 0.3, 0.1],
  soul_campfire: [0.2, 0.4, 0.5],
  piston_head: [0.6, 0.6, 0.5],
  moving_piston: [0.6, 0.6, 0.5],
  end_portal_frame: [0.3, 0.5, 0.3],
  end_portal: [0.05, 0.05, 0.1],
  end_gateway: [0.05, 0.05, 0.1],
  spawner: [0.2, 0.2, 0.3],
  wall_banner: [0.9, 0.9, 0.9],
  flower_pot: [0.6, 0.3, 0.2],
}

const ENTITY_BLOCK_SHAPES = {
  chest: [1/16, 0, 1/16, 14/16, 14/16, 14/16],
  trapped_chest: [1/16, 0, 1/16, 14/16, 14/16, 14/16],
  ender_chest: [1/16, 0, 1/16, 14/16, 14/16, 14/16],
  shulker_box: [1/16, 0, 1/16, 14/16, 14/16, 14/16],
  bed: [0, 0, 0, 1, 9/16, 1],
  head: [4/16, 0, 4/16, 8/16, 8/16, 8/16],
  skull: [4/16, 0, 4/16, 8/16, 8/16, 8/16],
  sign: [0, 0, 7/16, 1, 1, 2/16],
  wall_sign: [0, 4.5/16, 0, 1, 8/16, 2/16],
  hanging_sign: [1/16, 0, 7/16, 14/16, 10/16, 2/16],
  bell: [5/16, 1/16, 5/16, 6/16, 9/16, 6/16],
  conduit: [5/16, 5/16, 5/16, 6/16, 6/16, 6/16],
  enchanting_table: [0, 0, 0, 1, 12/16, 1],
  lectern: [0, 0, 0, 1, 14/16, 1],
  brewing_stand: [4/16, 0, 4/16, 8/16, 14/16, 8/16],
  flower_pot: [5/16, 0, 5/16, 6/16, 6/16, 6/16],
  campfire: [0, 0, 0, 1, 7/16, 1],
  soul_campfire: [0, 0, 0, 1, 7/16, 1],
  decorated_pot: [2/16, 0, 2/16, 12/16, 12/16, 12/16],
  end_portal_frame: [0, 0, 0, 1, 13/16, 1],
}

// ─── 工具函数 ───────────────────────────────────────────

const BANNER_DYE_COLORS = {
  white: [0.9764706, 0.9764706, 0.9764706],
  orange: [0.9019608, 0.49803922, 0.1764706],
  magenta: [0.7647059, 0.3137255, 0.74509805],
  light_blue: [0.39215687, 0.6392157, 0.8117647],
  yellow: [0.8862745, 0.7647059, 0.21568628],
  lime: [0.49803922, 0.78431374, 0.15686275],
  pink: [0.9529412, 0.54509807, 0.654902],
  gray: [0.2784314, 0.30588236, 0.32941177],
  light_gray: [0.61960787, 0.627451, 0.627451],
  cyan: [0.16470589, 0.5254902, 0.59607846],
  purple: [0.5254902, 0.25882354, 0.73333335],
  blue: [0.21568628, 0.27450982, 0.7058824],
  brown: [0.49019608, 0.30588236, 0.1764706],
  green: [0.36862746, 0.5058824, 0.14901961],
  red: [0.7019608, 0.17254902, 0.1764706],
  black: [0.11372549, 0.11372549, 0.12941177],
}

const BANNER_BASE_COLOR_PROP = '__mcblock_banner_base'
const BANNER_PATTERNS_PROP = '__mcblock_banner_patterns'
const BANNER_DYE_NAMES = Object.keys(BANNER_DYE_COLORS)
const BANNER_DYE_NAME_SET = new Set(BANNER_DYE_NAMES)

const LEGACY_BANNER_PATTERN_CODES = {
  b: 'base',
  bl: 'square_bottom_left',
  br: 'square_bottom_right',
  tl: 'square_top_left',
  tr: 'square_top_right',
  bs: 'stripe_bottom',
  ts: 'stripe_top',
  ls: 'stripe_left',
  rs: 'stripe_right',
  cs: 'stripe_center',
  ms: 'stripe_middle',
  drs: 'stripe_downright',
  dls: 'stripe_downleft',
  ss: 'small_stripes',
  cr: 'straight_cross',
  sc: 'cross',
  bt: 'triangle_bottom',
  tt: 'triangle_top',
  bts: 'triangles_bottom',
  tts: 'triangles_top',
  ld: 'diagonal_left',
  rd: 'diagonal_right',
  lud: 'diagonal_up_left',
  rud: 'diagonal_up_right',
  vh: 'half_vertical',
  vhr: 'half_vertical_right',
  hh: 'half_horizontal',
  hhb: 'half_horizontal_bottom',
  bo: 'border',
  cbo: 'curly_border',
  bri: 'bricks',
  gra: 'gradient',
  gru: 'gradient_up',
  mc: 'circle',
  mr: 'rhombus',
  cre: 'creeper',
  sku: 'skull',
  flo: 'flower',
  moj: 'mojang',
  glb: 'globe',
  pig: 'piglin',
  flw: 'flow',
  gus: 'guster',
}

const KNOWN_BANNER_PATTERN_NAMES = new Set([
  'base', 'border', 'bricks', 'circle', 'creeper', 'cross', 'curly_border',
  'diagonal_left', 'diagonal_right', 'diagonal_up_left', 'diagonal_up_right',
  'flow', 'flower', 'globe', 'gradient', 'gradient_up', 'guster',
  'half_horizontal', 'half_horizontal_bottom', 'half_vertical', 'half_vertical_right',
  'mojang', 'piglin', 'rhombus', 'skull', 'small_stripes',
  'square_bottom_left', 'square_bottom_right', 'square_top_left', 'square_top_right',
  'straight_cross', 'stripe_bottom', 'stripe_center', 'stripe_downleft',
  'stripe_downright', 'stripe_left', 'stripe_middle', 'stripe_right', 'stripe_top',
  'triangle_bottom', 'triangle_top', 'triangles_bottom', 'triangles_top',
])

function isBannerBlockId(blockId) {
  const name = blockId.replace('minecraft:', '')
  return /(^|_)banner$/.test(name) || /(^|_)wall_banner$/.test(name)
}

function normalizeBannerDyeColor(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BANNER_DYE_NAMES[value]
  }
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return undefined
  const numeric = Number.parseInt(raw, 10)
  if (/^\d+$/.test(raw) && Number.isFinite(numeric)) return BANNER_DYE_NAMES[numeric]
  const normalized = raw
    .replace(/^["']|["']$/g, '')
    .replace(/^minecraft:/, '')
    .replace(/^dye_/, '')
    .replace(/_dye$/, '')
  return BANNER_DYE_NAME_SET.has(normalized) ? normalized : undefined
}

function normalizeBannerPatternName(value) {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return undefined
  const normalized = raw
    .replace(/^["']|["']$/g, '')
    .replace(/^minecraft:/, '')
    .replace(/^entity\/banner\//, '')
    .replace(/^banner\//, '')
    .replace(/^banner_/, '')
  const legacy = LEGACY_BANNER_PATTERN_CODES[normalized]
  if (legacy) return legacy === 'base' ? undefined : legacy
  if (KNOWN_BANNER_PATTERN_NAMES.has(normalized)) return normalized === 'base' ? undefined : normalized
  return undefined
}

function serializeBannerPatterns(patterns) {
  if (!patterns || patterns.length === 0) return undefined
  const entries = []
  for (const pattern of patterns) {
    const patternName = normalizeBannerPatternName(pattern.pattern)
    const color = normalizeBannerDyeColor(pattern.color)
    if (patternName && color) entries.push(`${patternName}:${color}`)
  }
  return entries.length > 0 ? entries.join('|') : undefined
}

function deserializeBannerPatterns(value) {
  if (!value) return []
  const result = []
  for (const entry of value.split('|')) {
    const [rawPattern, rawColor] = entry.split(':')
    const pattern = normalizeBannerPatternName(rawPattern)
    const color = normalizeBannerDyeColor(rawColor)
    if (pattern && color) result.push({ pattern, color })
  }
  return result
}

function normalizeBlockId(blockId) {
  const trimmed = (blockId ?? '').trim().toLowerCase()
  if (!trimmed) return 'minecraft:air'
  return trimmed.includes(':') ? trimmed : `minecraft:${trimmed}`
}

function normalizeBlockProperties(properties) {
  if (!properties) return {}
  const normalized = {}
  for (const [rawKey, rawValue] of Object.entries(properties)) {
    const key = rawKey.trim().toLowerCase()
    if (!key) continue
    let value = String(rawValue ?? '').trim().toLowerCase()
    const match = value.match(/^["'](.*)["']$/)
    if (match) value = match[1].trim().toLowerCase()
    normalized[key] = value
  }
  return normalized
}

function matchesKeywords(blockId, keywords) {
  const name = blockId.replace('minecraft:', '')
  if (OPAQUE_OVERRIDES.has(name)) return false
  return keywords.some(kw => name.includes(kw))
}

function isOpaqueFullBlock(blockId) {
  return !matchesKeywords(blockId, NON_OPAQUE_KEYWORDS)
}

function getBiomeTintColor(blockId) {
  const name = blockId.replace('minecraft:', '')
  return BIOME_TINT_COLORS[name] ?? null
}

function fillDefaultProperties(props, defaults) {
  if (!defaults) return props
  if (Object.keys(props).length > 0) {
    const result = { ...props }
    for (const [k, v] of Object.entries(defaults)) {
      if (!(k in result)) result[k] = v
    }
    return result
  }
  return { ...defaults }
}

function applyBiomeTint(mesh, tintColor) {
  for (const quad of mesh.quads) {
    const verts = quad.vertices()
    for (const v of verts) {
      const c = v.color
      if (c && (c[0] < 0.99 || c[1] < 0.99 || c[2] < 0.99)) {
        v.color = tintColor
      }
    }
  }
}

// ─── Litematic 解析（移植自 litematic-parser.ts）───────

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

function isTintedQuad(quad) {
  const color = quad.vertices()[0]?.color
  return !!color && (color[0] < 0.99 || color[1] < 0.99 || color[2] < 0.99)
}

function separateGrassBlockOverlayQuads(mesh) {
  const epsilon = 0.0015
  for (const quad of mesh.quads) {
    if (!isTintedQuad(quad)) continue
    const normal = getQuadFlatNormal(quad)
    if (!normal || Math.abs(normal.y) > 0.1) continue
    for (const v of quad.vertices()) {
      v.pos.x += normal.x * epsilon
      v.pos.y += normal.y * epsilon
      v.pos.z += normal.z * epsilon
    }
  }
}

function fluidKind(blockId) {
  if (blockId.includes('water')) return 'water'
  if (blockId.includes('lava')) return 'lava'
  return null
}

function isSameFluid(blockId, neighbor) {
  const kind = fluidKind(blockId)
  return !!kind && neighbor && fluidKind(neighbor.blockId) === kind
}

function getRenderPropertiesForBlock(block, posIndex) {
  const props = block.properties || {}
  const needsFluidFaces = FLUID_BLOCKS.has(block.blockId)
  const bannerData = isBannerBlockId(block.blockId) ? block.renderData?.banner : undefined
  if (!needsFluidFaces && !bannerData) return props

  const result = { ...props }

  if (needsFluidFaces) {
    const [x, y, z] = block.position
    const faces = {
      up: posIndex.get(`${x},${y + 1},${z}`),
      down: posIndex.get(`${x},${y - 1},${z}`),
      north: posIndex.get(`${x},${y},${z - 1}`),
      south: posIndex.get(`${x},${y},${z + 1}`),
      east: posIndex.get(`${x + 1},${y},${z}`),
      west: posIndex.get(`${x - 1},${y},${z}`),
    }
    for (const [face, neighbor] of Object.entries(faces)) {
      result[`__mcblock_fluid_face_${face}`] = isSameFluid(block.blockId, neighbor) ? 'false' : 'true'
    }
    result.__mcblock_fluid_h_nw = formatFluidHeight(getFluidCornerHeight(block, posIndex, [[0, 0], [-1, 0], [0, -1], [-1, -1]]))
    result.__mcblock_fluid_h_ne = formatFluidHeight(getFluidCornerHeight(block, posIndex, [[0, 0], [1, 0], [0, -1], [1, -1]]))
    result.__mcblock_fluid_h_se = formatFluidHeight(getFluidCornerHeight(block, posIndex, [[0, 0], [1, 0], [0, 1], [1, 1]]))
    result.__mcblock_fluid_h_sw = formatFluidHeight(getFluidCornerHeight(block, posIndex, [[0, 0], [-1, 0], [0, 1], [-1, 1]]))
  }

  if (bannerData) {
    if (bannerData.baseColor) result[BANNER_BASE_COLOR_PROP] = bannerData.baseColor
    const patterns = serializeBannerPatterns(bannerData.patterns)
    if (patterns) result[BANNER_PATTERNS_PROP] = patterns
  }

  return result
}

function getFluidHeight(properties = {}) {
  const level = Number.parseInt(properties.level ?? '0', 10)
  if (!Number.isFinite(level) || level <= 0) return 8 / 9
  if (level >= 8) return 1
  return Math.max(1 / 9, (8 - level) / 9)
}

function getFluidCornerHeight(block, posIndex, offsets) {
  const [x, y, z] = block.position
  let total = 0
  let weight = 0
  for (const [dx, dz] of offsets) {
    const sample = dx === 0 && dz === 0 ? block : posIndex.get(`${x + dx},${y},${z + dz}`)
    if (!isSameFluid(block.blockId, sample)) continue
    if (isSameFluid(block.blockId, posIndex.get(`${x + dx},${y + 1},${z + dz}`))) return 1
    const height = getFluidHeight(sample?.properties ?? {})
    const sampleWeight = height >= 0.8 ? 10 : 1
    total += height * sampleWeight
    weight += sampleWeight
  }
  return weight > 0 ? total / weight : getFluidHeight(block.properties ?? {})
}

function formatFluidHeight(height) {
  return Math.max(0, Math.min(1, height)).toFixed(4)
}

function extractBannerColor(blockId, properties = {}) {
  const override = normalizeBannerDyeColor(properties[BANNER_BASE_COLOR_PROP])
  if (override) return BANNER_DYE_COLORS[override] ?? BANNER_DYE_COLORS.white

  const name = blockId.replace('minecraft:', '')
  const match = name.match(/^([a-z_]+?)_(wall_)?banner$/)
  return match ? (BANNER_DYE_COLORS[match[1]] ?? BANNER_DYE_COLORS.white) : BANNER_DYE_COLORS.white
}

function decodeBitPackedArray(longs, bitsPerEntry, count) {
  const result = new Uint32Array(count)
  const mask = (1n << BigInt(bitsPerEntry)) - 1n
  for (let i = 0; i < count; i++) {
    const bitStart = i * bitsPerEntry
    const longIndex = Math.floor(bitStart / 64)
    const bitOffset = bitStart % 64
    if (longIndex >= longs.length) break
    const bigVal = BigInt.asUintN(64, longs[longIndex].toBigInt())
    let value = (bigVal >> BigInt(bitOffset)) & mask
    if (bitOffset + bitsPerEntry > 64 && longIndex + 1 < longs.length) {
      const bitsFromFirst = 64 - bitOffset
      const nextBigVal = BigInt.asUintN(64, longs[longIndex + 1].toBigInt())
      const remainingBits = bitsPerEntry - bitsFromFirst
      const secondMask = (1n << BigInt(remainingBits)) - 1n
      value |= (nextBigVal & secondMask) << BigInt(bitsFromFirst)
    }
    result[i] = Number(value)
  }
  return result
}

function readNbtPrimitive(compound, keys) {
  for (const key of keys) {
    const tag = compound.get(key)
    if (!tag) continue
    if (tag.isNumber()) return tag.getAsNumber()
    if (tag.isString()) return tag.getAsString()
  }
  return undefined
}

function readNbtNumber(compound, keys) {
  const value = readNbtPrimitive(compound, keys)
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function readNbtTuple(tag) {
  if (!tag?.isListOrArray()) return null
  const values = tag.getItems().map(item => item.getAsNumber())
  return values.length >= 3 ? [values[0], values[1], values[2]] : null
}

function getBlockEntityPosition(entity) {
  const fromPos = readNbtTuple(entity.get('Pos') ?? entity.get('pos'))
  if (fromPos) return fromPos
  const x = readNbtNumber(entity, ['x', 'X'])
  const y = readNbtNumber(entity, ['y', 'Y'])
  const z = readNbtNumber(entity, ['z', 'Z'])
  return x !== undefined && y !== undefined && z !== undefined ? [x, y, z] : null
}

function parseBannerRenderDataFromNbt(entity) {
  const id = readNbtPrimitive(entity, ['id', 'Id'])
  const entityId = typeof id === 'string' ? id.toLowerCase() : ''
  const hasBannerFields = entity.has('Base') || entity.has('base') || entity.has('base_color')
    || entity.has('Patterns') || entity.has('patterns')
  if (entityId && !entityId.includes('banner') && !hasBannerFields) return undefined
  if (!entityId && !hasBannerFields) return undefined

  const baseColor = normalizeBannerDyeColor(readNbtPrimitive(entity, [
    'Base', 'base', 'base_color', 'BaseColor', 'baseColor',
  ]))
  const patterns = []

  for (const listKey of ['Patterns', 'patterns']) {
    if (!entity.has(listKey)) continue
    let list
    try { list = entity.getList(listKey) } catch { continue }
    if (list.getType() !== 10) continue
    for (let i = 0; i < list.length; i++) {
      const item = list.get(i)
      if (!item?.isCompound()) continue
      const pattern = normalizeBannerPatternName(readNbtPrimitive(item, [
        'Pattern', 'pattern', 'pattern_id', 'PatternId',
      ]))
      const color = normalizeBannerDyeColor(readNbtPrimitive(item, [
        'Color', 'color', 'dye_color', 'DyeColor',
      ]))
      if (pattern && color) patterns.push({ pattern, color })
    }
    break
  }

  if (!baseColor && patterns.length === 0) return undefined
  return {
    ...(baseColor ? { baseColor } : {}),
    ...(patterns.length > 0 ? { patterns } : {}),
  }
}

function collectLitematicBannerRenderData(region, origin) {
  const result = new Map()
  for (const listKey of ['TileEntities', 'BlockEntities', 'tile_entities', 'block_entities']) {
    if (!region.has(listKey)) continue
    let entities
    try { entities = region.getList(listKey, 10) } catch { continue }
    for (let i = 0; i < entities.length; i++) {
      const entity = entities.getCompound(i)
      const renderData = parseBannerRenderDataFromNbt(entity)
      const pos = getBlockEntityPosition(entity)
      if (!renderData || !pos) continue
      const [x, y, z] = pos
      result.set(`${x},${y},${z}`, renderData)
      result.set(`${x + origin[0]},${y + origin[1]},${z + origin[2]}`, renderData)
    }
  }
  return result
}

function parseLitematic(buffer, fileName) {
  const uint8 = new Uint8Array(buffer)
  const nbtFile = NbtFile.read(uint8)
  const root = nbtFile.root

  const metadata = root.getCompound('Metadata')
  const name = metadata.has('Name') ? metadata.getString('Name') : fileName
  const author = metadata.has('Author') ? metadata.getString('Author') : undefined

  const regionsTag = root.getCompound('Regions')
  const regionNames = Array.from(regionsTag.keys())
  if (regionNames.length === 0) throw new Error('No regions found')

  const allBlocks = []
  let gMinX = Infinity, gMinY = Infinity, gMinZ = Infinity
  let gMaxX = -Infinity, gMaxY = -Infinity, gMaxZ = -Infinity

  for (const regionName of regionNames) {
    const region = regionsTag.getCompound(regionName)
    const sizeTag = region.getCompound('Size')
    const rawSX = sizeTag.getNumber('x'), rawSY = sizeTag.getNumber('y'), rawSZ = sizeTag.getNumber('z')
    const sX = Math.abs(rawSX), sY = Math.abs(rawSY), sZ = Math.abs(rawSZ)

    const posTag = region.getCompound('Position')
    const pX = posTag.getNumber('x'), pY = posTag.getNumber('y'), pZ = posTag.getNumber('z')
    const oX = rawSX < 0 ? pX + rawSX + 1 : pX
    const oY = rawSY < 0 ? pY + rawSY + 1 : pY
    const oZ = rawSZ < 0 ? pZ + rawSZ + 1 : pZ
    const bannerRenderDataByWorldPos = collectLitematicBannerRenderData(region, [oX, oY, oZ])

    const paletteList = region.getList('BlockStatePalette', 10)
    const palette = []
    for (let i = 0; i < paletteList.length; i++) {
      const entry = paletteList.getCompound(i)
      const blockId = normalizeBlockId(entry.getString('Name'))
      const properties = {}
      if (entry.has('Properties')) {
        const propsTag = entry.getCompound('Properties')
        propsTag.forEach((key, value) => { properties[key] = value.getAsString() })
      }
      palette.push({ blockId, properties: normalizeBlockProperties(properties) })
    }

    const blockStatesTag = region.getLongArray('BlockStates')
    const longValues = blockStatesTag.getItems()
    const totalVolume = sX * sY * sZ
    const bitsPerEntry = Math.max(2, Math.ceil(Math.log2(palette.length)))
    const blockIndices = decodeBitPackedArray(longValues, bitsPerEntry, totalVolume)

    for (let i = 0; i < totalVolume; i++) {
      const pi = blockIndices[i]
      if (pi >= palette.length) continue
      const { blockId, properties } = palette[pi]
      if (SKIP_BLOCK_IDS.has(blockId)) continue

      const y = Math.floor(i / (sZ * sX))
      const z = Math.floor((i % (sZ * sX)) / sX)
      const x = i % sX
      const wX = x + oX, wY = y + oY, wZ = z + oZ

      const renderData = isBannerBlockId(blockId)
        ? bannerRenderDataByWorldPos.get(`${wX},${wY},${wZ}`)
        : undefined

      allBlocks.push({
        blockId,
        properties,
        position: [wX, wY, wZ],
        ...(renderData ? { renderData: { banner: renderData } } : {}),
      })
      gMinX = Math.min(gMinX, wX); gMinY = Math.min(gMinY, wY); gMinZ = Math.min(gMinZ, wZ)
      gMaxX = Math.max(gMaxX, wX); gMaxY = Math.max(gMaxY, wY); gMaxZ = Math.max(gMaxZ, wZ)
    }
  }

  if (allBlocks.length > 0) {
    for (const b of allBlocks) {
      b.position[0] -= gMinX; b.position[1] -= gMinY; b.position[2] -= gMinZ
    }
  }

  return {
    name, author,
    size: allBlocks.length > 0
      ? [gMaxX - gMinX + 1, gMaxY - gMinY + 1, gMaxZ - gMinZ + 1]
      : [0, 0, 0],
    blocks: allBlocks,
    totalBlockCount: allBlocks.length,
  }
}

// ─── Sponge Schematic 解析（.schem · v2 / v3）──────────

function parseBlockStateString(stateStr) {
  // "minecraft:oak_stairs[facing=east,half=bottom]" → { blockId, properties }
  const bracket = stateStr.indexOf('[')
  if (bracket === -1) {
    return { blockId: normalizeBlockId(stateStr), properties: normalizeBlockProperties({}) }
  }
  const name = stateStr.slice(0, bracket)
  const end = stateStr.endsWith(']') ? stateStr.length - 1 : stateStr.length
  const propsStr = stateStr.slice(bracket + 1, end)
  const properties = {}
  for (const pair of propsStr.split(',')) {
    if (!pair) continue
    const eq = pair.indexOf('=')
    if (eq === -1) continue
    properties[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim()
  }
  return { blockId: normalizeBlockId(name), properties: normalizeBlockProperties(properties) }
}

function decodeVarintArray(bytes) {
  // Sponge BlockData：连续 LEB128 varint，每个对应一个方块（YZX 顺序）
  const out = []
  const n = bytes.length
  let i = 0
  while (i < n) {
    let value = 0
    let shift = 0
    let byte = 0
    do {
      if (i >= n) break
      byte = bytes[i++] & 0xff
      value |= (byte & 0x7f) << shift
      shift += 7
    } while (byte & 0x80)
    out.push(value >>> 0)
  }
  return out
}

function parseSchem(buffer, fileName) {
  const uint8 = new Uint8Array(buffer)
  const nbtFile = NbtFile.read(uint8)
  let root = nbtFile.root
  if (root.has('Schematic')) {
    // v3 把内容包在 Schematic 复合标签里
    root = root.getCompound('Schematic')
  }

  const width = Math.abs(root.getNumber('Width'))
  const height = Math.abs(root.getNumber('Height'))
  const length = Math.abs(root.getNumber('Length'))
  if (!width || !height || !length) throw new Error('Schematic 缺少 Width/Height/Length')

  let name = fileName
  let author
  if (root.has('Metadata')) {
    const md = root.getCompound('Metadata')
    if (md.has('Name')) name = md.getString('Name')
    if (md.has('Author')) author = md.getString('Author')
  }

  // v2：顶层 Palette + BlockData；v3：Blocks.Palette + Blocks.Data
  // 注意：deepslate 的 NbtByteArray.getItems() 返回的是 NbtByte 对象数组，必须逐个 getAsNumber() 取裸字节
  let paletteTag
  let dataItems
  if (root.has('Blocks')) {
    const blocks = root.getCompound('Blocks')
    paletteTag = blocks.getCompound('Palette')
    dataItems = blocks.getByteArray('Data').getItems().map((b) => b.getAsNumber())
  } else {
    paletteTag = root.getCompound('Palette')
    dataItems = root.getByteArray('BlockData').getItems().map((b) => b.getAsNumber())
  }

  const indexToState = []
  paletteTag.forEach((key, value) => {
    indexToState[value.getAsNumber()] = parseBlockStateString(key)
  })

  const indices = decodeVarintArray(dataItems)
  const allBlocks = []
  const total = width * height * length
  let gMinX = Infinity, gMinY = Infinity, gMinZ = Infinity
  let gMaxX = -Infinity, gMaxY = -Infinity, gMaxZ = -Infinity
  for (let i = 0; i < total && i < indices.length; i++) {
    const state = indexToState[indices[i]]
    if (!state) continue
    // __reserved__ 是部分导出器（如 Axiom）的空格子占位符，等同 air，需跳过
    if (state.blockId === 'minecraft:__reserved__' || state.blockId === '__reserved__') continue
    if (SKIP_BLOCK_IDS.has(state.blockId)) continue
    const x = i % width
    const z = Math.floor(i / width) % length
    const y = Math.floor(i / (width * length))
    allBlocks.push({
      blockId: state.blockId,
      properties: state.properties,
      position: [x, y, z],
    })
    gMinX = Math.min(gMinX, x); gMinY = Math.min(gMinY, y); gMinZ = Math.min(gMinZ, z)
    gMaxX = Math.max(gMaxX, x); gMaxY = Math.max(gMaxY, y); gMaxZ = Math.max(gMaxZ, z)
  }

  // 归一化到紧致包围盒（与 litematic 一致，保证 Blender 居中/贴地正确）
  if (allBlocks.length > 0) {
    for (const b of allBlocks) {
      b.position[0] -= gMinX; b.position[1] -= gMinY; b.position[2] -= gMinZ
    }
  }

  return {
    name,
    author,
    size: allBlocks.length > 0
      ? [gMaxX - gMinX + 1, gMaxY - gMinY + 1, gMaxZ - gMinZ + 1]
      : [0, 0, 0],
    blocks: allBlocks,
    totalBlockCount: allBlocks.length,
  }
}

function parseProjectionBuffer(buffer, fileName, ext) {
  if (ext === '.schem') return parseSchem(buffer, fileName)
  return parseLitematic(buffer, fileName)
}

// ─── MC 资源加载（Node.js 版）──────────────────────────

async function loadMcResources() {
  const readJson = (name) => JSON.parse(fs.readFileSync(path.join(MCMETA_DIR, name), 'utf8'))
  const blockDefData = readJson('block-definitions.json')
  const blockModelData = readJson('block-models.json')
  const atlasUvData = readJson('atlas-uv.json')
  const blockDefaultPropsData = readJson('block-default-properties.json')

  // 方块定义
  const blockDefinitionMap = new Map()
  for (const [key, value] of Object.entries(blockDefData)) {
    const fullKey = key.startsWith('minecraft:') ? key : `minecraft:${key}`
    try { blockDefinitionMap.set(fullKey, BlockDefinition.fromJson(value)) } catch {}
  }
  for (const [alias, target] of Object.entries(BLOCK_DEF_ALIASES)) {
    if (!blockDefinitionMap.has(alias) && blockDefinitionMap.has(target)) {
      blockDefinitionMap.set(alias, blockDefinitionMap.get(target))
    }
  }

  // 默认属性
  const defaultBlockProperties = new Map()
  for (const [key, value] of Object.entries(blockDefaultPropsData)) {
    const fullKey = key.startsWith('minecraft:') ? key : `minecraft:${key}`
    defaultBlockProperties.set(fullKey, value)
  }

  // 方块模型
  const blockModelMap = new Map()
  for (const [key, value] of Object.entries(blockModelData)) {
    const fullKey = key.startsWith('minecraft:') ? key : `minecraft:${key}`
    try { blockModelMap.set(fullKey, BlockModel.fromJson(value)) } catch {}
  }
  const blockModelProvider = {
    getBlockModel(id) { return blockModelMap.get(id.toString()) ?? null },
  }
  for (const model of blockModelMap.values()) {
    try { model.flatten(blockModelProvider) } catch {}
  }

  // Atlas 纹理 — 用 sharp 读取原始像素数据
  const atlasPath = path.join(MCMETA_DIR, 'atlas.png')
  const atlasImage = sharp(atlasPath)
  const atlasMeta = await atlasImage.metadata()
  const rawW = atlasMeta.width, rawH = atlasMeta.height
  const nextPow2 = (n) => { let v = 1; while (v < n) v <<= 1; return v }
  const atlasW = nextPow2(rawW), atlasH = nextPow2(rawH)

  // 读取 RGBA 原始数据，确保是 4 通道
  const rawPixels = await sharp(atlasPath)
    .ensureAlpha()
    .raw()
    .toBuffer()

  // 如果需要填充到 2 的幂，创建更大的 buffer
  let pixelData
  if (atlasW === rawW && atlasH === rawH) {
    pixelData = new Uint8ClampedArray(rawPixels)
  } else {
    pixelData = new Uint8ClampedArray(atlasW * atlasH * 4)
    for (let y = 0; y < rawH; y++) {
      const srcOffset = y * rawW * 4
      const dstOffset = y * atlasW * 4
      pixelData.set(rawPixels.subarray(srcOffset, srcOffset + rawW * 4), dstOffset)
    }
  }

  const imageData = { width: atlasW, height: atlasH, data: pixelData }

  // UV 映射
  const uvMap = {}
  for (const [texId, uvRect] of Object.entries(atlasUvData)) {
    const rect = uvRect
    const frameW = rect[2]
    const frameH = Math.min(rect[3], rect[2])
    const uv = [
      rect[0] / atlasW,
      rect[1] / atlasH,
      (rect[0] + frameW) / atlasW,
      (rect[1] + frameH) / atlasH,
    ]
    const fullId = texId.includes(':') ? texId : `minecraft:${texId}`
    uvMap[fullId] = uv
  }

  const atlas = new TextureAtlas(imageData, uvMap)

  const blockDefinitionProvider = {
    getBlockDefinition(id) { return blockDefinitionMap.get(id.toString()) ?? null },
  }

  return {
    blockDefinitions: blockDefinitionProvider,
    blockModels: blockModelProvider,
    atlas,
    defaultBlockProperties,
    atlasUvData,
    atlasW,
    atlasH,
    rawW,
    rawH,
  }
}

// ─── 几何体生成 ─────────────────────────────────────────

const DIR_OFFSETS = {
  up:    [0, 1, 0],
  down:  [0, -1, 0],
  north: [0, 0, -1],
  south: [0, 0, 1],
  east:  [1, 0, 0],
  west:  [-1, 0, 0],
}

function createFallbackMesh() {
  const quads = []
  const magenta = [1, 0, 1]
  const faces = [
    { verts: [[0,1,0], [0,1,1], [1,1,1], [1,1,0]], normal: [0,1,0] },
    { verts: [[0,0,1], [0,0,0], [1,0,0], [1,0,1]], normal: [0,-1,0] },
    { verts: [[1,1,0], [1,0,0], [0,0,0], [0,1,0]], normal: [0,0,-1] },
    { verts: [[0,1,1], [0,0,1], [1,0,1], [1,1,1]], normal: [0,0,1] },
    { verts: [[1,1,1], [1,0,1], [1,0,0], [1,1,0]], normal: [1,0,0] },
    { verts: [[0,1,0], [0,0,0], [0,0,1], [0,1,1]], normal: [-1,0,0] },
  ]
  for (const face of faces) {
    const vertices = face.verts.map(([fx, fy, fz]) => {
      return new Vertex(new Vector(fx, fy, fz), magenta, undefined, undefined,
        new Vector(face.normal[0], face.normal[1], face.normal[2]), undefined)
    })
    quads.push(new Quad(vertices[0], vertices[1], vertices[2], vertices[3]))
  }
  return new DsMesh(quads)
}

function createFluidMesh(blockId, properties = {}, resources = null) {
  const quads = []
  const isWater = blockId.includes('water')
  const color = isWater ? WATER_TINT_RGB : [0.9, 0.5, 0.1]
  const h = getFluidHeight(properties)
  const hNW = readFluidCornerHeight(properties, '__mcblock_fluid_h_nw', h)
  const hNE = readFluidCornerHeight(properties, '__mcblock_fluid_h_ne', h)
  const hSE = readFluidCornerHeight(properties, '__mcblock_fluid_h_se', h)
  const hSW = readFluidCornerHeight(properties, '__mcblock_fluid_h_sw', h)
  const topUV = getAtlasTextureUV(resources, isWater ? 'minecraft:block/water_still' : 'minecraft:block/lava_still')
  const sideUV = getAtlasTextureUV(resources, isWater ? 'minecraft:block/water_flow' : 'minecraft:block/lava_flow') ?? topUV
  const faces = [
    { face: 'up', verts: [[0,hNW,0], [0,hSW,1], [1,hSE,1], [1,hNE,0]], normal: [0,1,0], uv: topUV },
    { face: 'down', verts: [[0,0,1], [0,0,0], [1,0,0], [1,0,1]], normal: [0,-1,0], uv: topUV },
    { face: 'north', verts: [[1,hNE,0], [1,0,0], [0,0,0], [0,hNW,0]], normal: [0,0,-1], uv: sideUV },
    { face: 'south', verts: [[0,hSW,1], [0,0,1], [1,0,1], [1,hSE,1]], normal: [0,0,1], uv: sideUV },
    { face: 'east', verts: [[1,hSE,1], [1,0,1], [1,0,0], [1,hNE,0]], normal: [1,0,0], uv: sideUV },
    { face: 'west', verts: [[0,hNW,0], [0,0,0], [0,0,1], [0,hSW,1]], normal: [-1,0,0], uv: sideUV },
  ]
  for (const face of faces) {
    if (properties[`__mcblock_fluid_face_${face.face}`] === 'false') continue
    const tex = textureCorners(face.uv)
    const vertices = face.verts.map(([fx, fy, fz], i) => {
      return new Vertex(new Vector(fx, fy, fz), color, tex[i], undefined,
        new Vector(face.normal[0], face.normal[1], face.normal[2]), undefined)
    })
    quads.push(new Quad(vertices[0], vertices[1], vertices[2], vertices[3]))
  }
  return new DsMesh(quads)
}

function readFluidCornerHeight(properties, key, fallback) {
  const value = Number.parseFloat(properties[key] ?? '')
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback
}

function getAtlasTextureUV(resources, textureId) {
  if (!resources?.atlas) return null
  try {
    const uv = resources.atlas.getTextureUV(Identifier.parse(textureId))
    return uv && uv.length === 4 ? [uv[0], uv[1], uv[2], uv[3]] : null
  } catch {
    return null
  }
}

const BANNER_FRONT_FACE_UV = [5.5, 0.25, 10.5, 10.25]
const BANNER_BACK_FACE_UV = [0.25, 0.25, 5.25, 10.25]

function getAtlasTextureSubUV(resources, textureId, faceUv) {
  const textureUV = getAtlasTextureUV(resources, textureId)
  if (!textureUV) return null
  const [u0, v0, u1, v1] = textureUV
  const du = (u1 - u0) / 16
  const dv = (v1 - v0) / 16
  return [
    u0 + faceUv[0] * du,
    v0 + faceUv[1] * dv,
    u0 + faceUv[2] * du,
    v0 + faceUv[3] * dv,
  ]
}

function textureCorners(uv, flipX = false) {
  if (!uv) return [undefined, undefined, undefined, undefined]
  const [u0, v0, u1, v1] = uv
  if (flipX) return [[u1, v0], [u1, v1], [u0, v1], [u0, v0]]
  return [[u0, v0], [u0, v1], [u1, v1], [u1, v0]]
}

function createSizedBoxMesh(color, ox, oy, oz, w, h, d) {
  const quads = []
  const x0 = ox, x1 = ox + w, y0 = oy, y1 = oy + h, z0 = oz, z1 = oz + d
  const faces = [
    { verts: [[x0,y1,z0], [x0,y1,z1], [x1,y1,z1], [x1,y1,z0]], normal: [0,1,0] },
    { verts: [[x0,y0,z1], [x0,y0,z0], [x1,y0,z0], [x1,y0,z1]], normal: [0,-1,0] },
    { verts: [[x1,y1,z0], [x1,y0,z0], [x0,y0,z0], [x0,y1,z0]], normal: [0,0,-1] },
    { verts: [[x0,y1,z1], [x0,y0,z1], [x1,y0,z1], [x1,y1,z1]], normal: [0,0,1] },
    { verts: [[x1,y1,z1], [x1,y0,z1], [x1,y0,z0], [x1,y1,z0]], normal: [1,0,0] },
    { verts: [[x0,y1,z0], [x0,y0,z0], [x0,y0,z1], [x0,y1,z1]], normal: [-1,0,0] },
  ]
  for (const face of faces) {
    const vertices = face.verts.map(([fx, fy, fz]) => {
      return new Vertex(new Vector(fx, fy, fz), color, undefined, undefined,
        new Vector(face.normal[0], face.normal[1], face.normal[2]), undefined)
    })
    quads.push(new Quad(vertices[0], vertices[1], vertices[2], vertices[3]))
  }
  return new DsMesh(quads)
}

function createBannerMesh(blockId, properties = {}, atlas = null) {
  const name = blockId.replace('minecraft:', '')
  const isWall = name.includes('wall_banner')
  const clothColor = extractBannerColor(blockId, properties)
  const woodColor = [0.45, 0.30, 0.20]
  const uv = getAtlasTextureUV({ atlas }, 'minecraft:block/white_stained_glass')
    ?? getAtlasTextureUV({ atlas }, 'minecraft:block/oak_planks')
  const quads = []
  const fx0 = 1 / 12
  const fx1 = 11 / 12
  const fy0 = isWall ? -0.8 : 1 / 6
  const fy1 = isWall ? 13 / 15 : 11 / 6
  const fz0 = isWall ? 5 / 48 : 5 / 12
  const fz1 = isWall ? 7 / 48 : 11 / 24
  const bar = isWall
    ? [1 / 12, 47 / 60, 1 / 48, 11 / 12, 13 / 15, 5 / 48]
    : [1 / 12, 7 / 4, 11 / 24, 11 / 12, 11 / 6, 13 / 24]

  addFace(quads, [[fx0, fy1, fz1], [fx0, fy0, fz1], [fx1, fy0, fz1], [fx1, fy1, fz1]], [0, 0, 1], clothColor, uv)
  addFace(quads, [[fx1, fy1, fz0], [fx1, fy0, fz0], [fx0, fy0, fz0], [fx0, fy1, fz0]], [0, 0, -1], clothColor, uv, true)
  addFace(quads, [[fx0, fy1, fz0], [fx0, fy1, fz1], [fx1, fy1, fz1], [fx1, fy1, fz0]], [0, 1, 0], clothColor, uv)
  addFace(quads, [[fx0, fy0, fz1], [fx0, fy0, fz0], [fx1, fy0, fz0], [fx1, fy0, fz1]], [0, -1, 0], clothColor, uv)
  addFace(quads, [[fx0, fy1, fz0], [fx0, fy0, fz0], [fx0, fy0, fz1], [fx0, fy1, fz1]], [-1, 0, 0], clothColor, uv)
  addFace(quads, [[fx1, fy1, fz1], [fx1, fy0, fz1], [fx1, fy0, fz0], [fx1, fy1, fz0]], [1, 0, 0], clothColor, uv)

  const patterns = deserializeBannerPatterns(properties[BANNER_PATTERNS_PROP])
  for (let i = 0; i < patterns.length; i++) {
    const pattern = patterns[i]
    const patternColor = BANNER_DYE_COLORS[pattern.color] ?? BANNER_DYE_COLORS.white
    const textureId = `minecraft:entity/banner/${pattern.pattern}`
    const frontPatternUV = getAtlasTextureSubUV({ atlas }, textureId, BANNER_FRONT_FACE_UV)
    const backPatternUV = getAtlasTextureSubUV({ atlas }, textureId, BANNER_BACK_FACE_UV)
    if (!frontPatternUV && !backPatternUV) continue
    const epsilon = (i + 1) * 0.0008
    if (frontPatternUV) {
      addFace(quads, [[fx0, fy1, fz1 + epsilon], [fx0, fy0, fz1 + epsilon], [fx1, fy0, fz1 + epsilon], [fx1, fy1, fz1 + epsilon]], [0, 0, 1], patternColor, frontPatternUV)
    }
    if (backPatternUV) {
      addFace(quads, [[fx1, fy1, fz0 - epsilon], [fx1, fy0, fz0 - epsilon], [fx0, fy0, fz0 - epsilon], [fx0, fy1, fz0 - epsilon]], [0, 0, -1], patternColor, backPatternUV, true)
    }
  }

  pushTexturedBox(quads, bar[0], bar[1], bar[2], bar[3], bar[4], bar[5], woodColor, uv)
  if (!isWall) pushTexturedBox(quads, 11 / 24, 0, 11 / 24, 13 / 24, 7 / 4, 13 / 24, woodColor, uv)

  const mesh = new DsMesh(quads)
  const rotationDeg = computeBannerRotationDeg(isWall, properties)
  if (rotationDeg !== 0) {
    const m = mat4.create()
    const pivotY = isWall ? 0.5 : 1.5
    mat4.translate(m, m, [0.5, pivotY, 0.5])
    mat4.rotateY(m, m, rotationDeg * Math.PI / 180)
    mat4.translate(m, m, [-0.5, -pivotY, -0.5])
    mesh.transform(m)
  }
  return mesh
}

function computeBannerRotationDeg(isWall, properties) {
  if (isWall) {
    switch (properties.facing ?? 'south') {
      case 'south': return 0
      case 'east': return 90
      case 'north': return 180
      case 'west': return 270
      default: return 0
    }
  }
  const rot = Number.parseInt(properties.rotation ?? '0', 10)
  return Number.isFinite(rot) ? rot * 22.5 : 0
}

function addFace(quads, verts, normal, color, uv, flipX = false) {
  const tex = textureCorners(uv, flipX)
  const vertices = verts.map(([x, y, z], i) => new Vertex(
    new Vector(x, y, z),
    color,
    tex[i],
    undefined,
    new Vector(normal[0], normal[1], normal[2]),
    undefined,
  ))
  quads.push(new Quad(vertices[0], vertices[1], vertices[2], vertices[3]))
}

function pushTexturedBox(quads, x0, y0, z0, x1, y1, z1, color, uv) {
  const faces = [
    { verts: [[x0,y1,z0], [x0,y1,z1], [x1,y1,z1], [x1,y1,z0]], normal: [0,1,0] },
    { verts: [[x0,y0,z1], [x0,y0,z0], [x1,y0,z0], [x1,y0,z1]], normal: [0,-1,0] },
    { verts: [[x1,y1,z0], [x1,y0,z0], [x0,y0,z0], [x0,y1,z0]], normal: [0,0,-1] },
    { verts: [[x0,y1,z1], [x0,y0,z1], [x1,y0,z1], [x1,y1,z1]], normal: [0,0,1] },
    { verts: [[x1,y1,z1], [x1,y0,z1], [x1,y0,z0], [x1,y1,z0]], normal: [1,0,0] },
    { verts: [[x0,y1,z0], [x0,y0,z0], [x0,y0,z1], [x0,y1,z1]], normal: [-1,0,0] },
  ]
  for (const face of faces) addFace(quads, face.verts, face.normal, color, uv)
}

function createEntityFallbackMesh(blockId, properties = {}, atlas = null) {
  const name = blockId.replace('minecraft:', '')
  if (/(^|_)banner$/.test(name) || /(^|_)wall_banner$/.test(name)) {
    return createBannerMesh(blockId, properties, atlas)
  }
  for (const [keyword, color] of Object.entries(ENTITY_BLOCK_COLORS)) {
    if (name.includes(keyword)) {
      const shape = ENTITY_BLOCK_SHAPES[keyword]
      if (shape) return createSizedBoxMesh(color, shape[0], shape[1], shape[2], shape[3], shape[4], shape[5])
      return createSizedBoxMesh(color, 0, 0, 0, 1, 1, 1)
    }
  }
  return null
}

function buildGeometry(model, resources, options = {}) {
  const { blockDefinitions, blockModels, atlas, defaultBlockProperties } = resources
  const preserveAdjacentFaces = Boolean(options.preserveAdjacentFaces)

  const posIndex = new Map()
  for (const block of model.blocks) {
    posIndex.set(`${block.position[0]},${block.position[1]},${block.position[2]}`, block)
  }

  const useOcclusion = !preserveAdjacentFaces && model.totalBlockCount > 5000
  const occluded = new Set()
  if (useOcclusion) {
    for (const block of model.blocks) {
      if (!isOpaqueFullBlock(block.blockId)) continue
      const [x, y, z] = block.position
      let surrounded = true
      for (const [dx, dy, dz] of Object.values(DIR_OFFSETS)) {
        const neighbor = posIndex.get(`${x + dx},${y + dy},${z + dz}`)
        if (!neighbor || !isOpaqueFullBlock(neighbor.blockId)) { surrounded = false; break }
      }
      if (surrounded) occluded.add(`${x},${y},${z}`)
    }
  }

  // 收集所有 quads（不按 blockId 分组，后面按纹理分组）
  const allQuads = []

  for (const block of model.blocks) {
    const posKey = `${block.position[0]},${block.position[1]},${block.position[2]}`
    if (useOcclusion && occluded.has(posKey)) continue

    const [x, y, z] = block.position
    const blockId = block.blockId
    const rawProps = getRenderPropertiesForBlock(block, posIndex)
    const props = fillDefaultProperties(rawProps, defaultBlockProperties.get(blockId))

    let mesh

    if (FLUID_BLOCKS.has(blockId)) {
      mesh = createFluidMesh(blockId, props, resources)
    } else {
      const defId = Identifier.parse(blockId)
      const blockDef = blockDefinitions.getBlockDefinition(defId)
      const bareName = blockId.replace('minecraft:', '')
      const isBanner = /(^|_)banner$/.test(bareName) || /(^|_)wall_banner$/.test(bareName)

      if (isBanner) {
        mesh = createEntityFallbackMesh(blockId, props, atlas) ?? createFallbackMesh()
      } else if (blockDef) {
        const cull = {}
        if (!preserveAdjacentFaces && isOpaqueFullBlock(blockId)) {
          for (const dir of Direction.ALL) {
            const [dx, dy, dz] = DIR_OFFSETS[dir]
            const neighborKey = `${x + dx},${y + dy},${z + dz}`
            const neighbor = posIndex.get(neighborKey)
            if (neighbor && isOpaqueFullBlock(neighbor.blockId)) cull[dir] = true
          }
        }
        try { mesh = blockDef.getMesh(defId, props, atlas, blockModels, cull) }
        catch { mesh = createFallbackMesh() }
      } else {
        mesh = createFallbackMesh()
      }
    }

    if (mesh.quads.length === 0) {
      const entityMesh = createEntityFallbackMesh(blockId, props, atlas)
      if (entityMesh) mesh = entityMesh
      else continue
    }

    const biomeTint = getBiomeTintColor(blockId)
    if (biomeTint) applyBiomeTint(mesh, biomeTint)
    if (blockId === 'minecraft:grass_block') separateGrassBlockOverlayQuads(mesh)

    const translation = mat4.create()
    mat4.translate(translation, translation, [x, y, z])
    mesh.transform(translation)
    mesh.computeNormals()

    for (const quad of mesh.quads) {
      allQuads.push({ quad, blockId })
    }
  }

  return allQuads
}

// ─── Atlas 纹理准备 ─────────────────────────────────────

let cachedAtlasPath = null

async function prepareAtlas(outputDir, resources) {
  const sharedAtlas = path.join(outputDir, 'atlas.png')
  if (cachedAtlasPath && fs.existsSync(sharedAtlas)) {
    return sharedAtlas
  }
  const srcAtlas = path.join(MCMETA_DIR, 'atlas.png')
  const { atlasW, atlasH, rawW, rawH } = resources

  if (atlasW === rawW && atlasH === rawH) {
    fs.copyFileSync(srcAtlas, sharedAtlas)
  } else {
    await sharp(srcAtlas)
      .extend({
        bottom: atlasH - rawH,
        right: atlasW - rawW,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .toFile(sharedAtlas)
  }
  cachedAtlasPath = sharedAtlas
  return sharedAtlas
}

// ─── OBJ/MTL 序列化 ────────────────────────────────────

function serializeObjMtl(blockIdQuadMap, mtlFileName) {
  const objLines = [`# MCBlock Batch OBJ Export`, `mtllib ${mtlFileName}`, '']
  const mtlLines = [`# MCBlock Materials`]

  const normalMap = new Map()
  const getNormalIndex = (nx, ny, nz) => {
    const key = `${nx.toFixed(4)},${ny.toFixed(4)},${nz.toFixed(4)}`
    if (normalMap.has(key)) return normalMap.get(key)
    const idx = normalMap.size + 1
    normalMap.set(key, idx)
    return idx
  }
  const getQuadDiffuse = (quads) => {
    const first = quads[0]?.vertices?.()[0]?.color
    return first ? first.map(v => Math.max(0, Math.min(1, v))) : [1, 1, 1]
  }
  const getQuadColorKey = (quad) => {
    const color = quad.vertices()[0]?.color ?? [1, 1, 1]
    return color.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('')
  }
  const getMaterialAlpha = (blockId) => {
    const name = blockId.replace('minecraft:', '')
    if (/tinted_glass/.test(name)) return 0.32
    if (/(stained_glass|glass_pane|glass)/.test(name)) return 0.38
    if (/water/.test(name)) return 0.45
    if (/ice/.test(name)) return 0.48
    if (/(honey_block|slime_block)/.test(name)) return 0.58
    return 1
  }
  const getQuadDedupeKey = (quad) => {
    const parts = quad.vertices().map((v) => {
      const pos = [v.pos.x, v.pos.y, v.pos.z].map(n => Number(n).toFixed(6)).join(',')
      const uv = v.texture
        ? [v.texture[0], v.texture[1]].map(n => Number(n).toFixed(6)).join(',')
        : '0.000000,0.000000'
      return `${pos}|${uv}`
    })
    return parts.sort().join(';')
  }

  const allVertices = []
  const allUVs = []
  const faceGroups = []

  for (const [blockId, quads] of blockIdQuadMap.entries()) {
    const baseMatName = blockId.replace('minecraft:', '').replace(/[^a-zA-Z0-9_-]/g, '_')
    const buckets = new Map()
    for (const quad of quads) {
      const colorKey = getQuadColorKey(quad)
      if (!buckets.has(colorKey)) buckets.set(colorKey, [])
      buckets.get(colorKey).push(quad)
    }

    for (const [colorKey, bucketQuads] of buckets.entries()) {
      const matName = buckets.size > 1 ? `${baseMatName}_c_${colorKey}` : baseMatName
      const faces = []
      const seenQuadKeys = new Set()

      for (const quad of bucketQuads) {
        const dedupeKey = getQuadDedupeKey(quad)
        if (seenQuadKeys.has(dedupeKey)) continue
        seenQuadKeys.add(dedupeKey)

        const verts = quad.vertices()
        const quadVerts = []

        for (const v of verts) {
          allVertices.push([v.pos.x, v.pos.y, v.pos.z])
          const vi = allVertices.length

          let u = 0, vv = 0
          if (v.texture) {
            u = v.texture[0]
            vv = 1 - v.texture[1]  // deepslate V=0 在顶部 → OBJ V=0 在底部
          }
          allUVs.push([u, vv])
          const vti = allUVs.length

          const nx = v.normal ? v.normal.x : 0
          const ny = v.normal ? v.normal.y : 1
          const nz = v.normal ? v.normal.z : 0
          const vni = getNormalIndex(nx, ny, nz)

          quadVerts.push({ vi, vti, vni })
        }

        faces.push([quadVerts[0], quadVerts[1], quadVerts[2]])
        faces.push([quadVerts[0], quadVerts[2], quadVerts[3]])
      }

      faceGroups.push({ matName, faces, diffuse: getQuadDiffuse(bucketQuads), alpha: getMaterialAlpha(blockId) })
    }
  }

  for (const [x, y, z] of allVertices) {
    objLines.push(`v ${x.toFixed(6)} ${y.toFixed(6)} ${z.toFixed(6)}`)
  }
  objLines.push('')

  for (const [u, v] of allUVs) {
    objLines.push(`vt ${u.toFixed(6)} ${v.toFixed(6)}`)
  }
  objLines.push('')

  const normalEntries = [...normalMap.entries()].sort((a, b) => a[1] - b[1])
  for (const [key] of normalEntries) {
    const [nx, ny, nz] = key.split(',')
    objLines.push(`vn ${nx} ${ny} ${nz}`)
  }
  objLines.push('')

  for (const { matName, faces, diffuse, alpha } of faceGroups) {
    objLines.push(`usemtl ${matName}`)
    objLines.push(`g ${matName}`)
    for (const tri of faces) {
      const faceStr = tri.map(v => `${v.vi}/${v.vti}/${v.vni}`).join(' ')
      objLines.push(`f ${faceStr}`)
    }
    objLines.push('')

    mtlLines.push('')
    mtlLines.push(`newmtl ${matName}`)
    mtlLines.push(`Ka 0.2 0.2 0.2`)
    mtlLines.push(`Kd ${diffuse[0].toFixed(4)} ${diffuse[1].toFixed(4)} ${diffuse[2].toFixed(4)}`)
    mtlLines.push(`Ks 0.0 0.0 0.0`)
    mtlLines.push(`d ${alpha.toFixed(2)}`)
    mtlLines.push(`illum 1`)
    mtlLines.push(`map_Kd atlas.png`)
  }

  return { obj: objLines.join('\n'), mtl: mtlLines.join('\n') }
}

// ─── 主处理流程 ──────────────────────────────────────────

async function processLitematic(litematicPath, outputDir, resources, sharedAtlasPath, options = {}) {
  const ext = path.extname(litematicPath).toLowerCase()
  const sourceFormat = ext === '.schem' ? 'schem' : 'litematic'
  const fileName = path.basename(litematicPath, path.extname(litematicPath))
  const buffer = fs.readFileSync(litematicPath)

  let model
  try {
    model = parseProjectionBuffer(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), fileName, ext)
  } catch (err) {
    console.error(`  ✗ 解析失败: ${err.message}`)
    return false
  }

  if (model.blocks.length === 0) {
    console.log(`  ⊘ 空模型，跳过`)
    return false
  }

  console.log(`  方块数: ${model.totalBlockCount}, 尺寸: ${model.size.join('×')}`)

  const allQuads = buildGeometry(model, resources, options)
  if (allQuads.length === 0) {
    console.log(`  ⊘ 无几何体生成，跳过`)
    return false
  }

  // 按 blockId 分组
  const blockIdQuadMap = new Map()
  for (const { quad, blockId } of allQuads) {
    if (!blockIdQuadMap.has(blockId)) blockIdQuadMap.set(blockId, [])
    blockIdQuadMap.get(blockId).push(quad)
  }

  const buildingDir = path.join(outputDir, fileName)
  fs.mkdirSync(buildingDir, { recursive: true })

  // 复制 atlas 到建筑目录
  const localAtlas = path.join(buildingDir, 'atlas.png')
  if (!fs.existsSync(localAtlas)) {
    fs.copyFileSync(sharedAtlasPath, localAtlas)
  }

  // 复制投影文件（保留原始扩展名）
  const localSource = path.join(buildingDir, `${fileName}${ext}`)
  if (!fs.existsSync(localSource)) {
    fs.copyFileSync(litematicPath, localSource)
  }

  const mtlName = `${fileName}.mtl`
  const { obj, mtl } = serializeObjMtl(blockIdQuadMap, mtlName)

  const objPath = path.join(buildingDir, `${fileName}.obj`)
  const mtlPath = path.join(buildingDir, mtlName)
  fs.writeFileSync(objPath, obj, 'utf8')
  fs.writeFileSync(mtlPath, mtl, 'utf8')

  const matCount = blockIdQuadMap.size
  console.log(`  ✓ 导出完成: ${allQuads.length} 个面, ${matCount} 个材质`)
  return {
    input: litematicPath,
    name: fileName,
    sourceFormat,
    outputDir: buildingDir,
    obj: objPath,
    mtl: mtlPath,
    atlas: localAtlas,
    source: localSource,
    litematic: localSource,
    blockCount: model.totalBlockCount,
    size: model.size,
    faceCount: allQuads.length,
    materialCount: matCount,
    preserveAdjacentFaces: Boolean(options.preserveAdjacentFaces),
  }
}

// ─── 递归查找 litematic 文件 ─────────────────────────────

function isProjectionFileName(name) {
  const lower = name.toLowerCase()
  return lower.endsWith('.litematic') || lower.endsWith('.schem')
}

function findLitematicFiles(dir, maxDepth = 3, depth = 0) {
  if (depth > maxDepth) return []
  if (depth === 0) {
    try {
      const stat = fs.statSync(dir)
      if (stat.isFile()) {
        return isProjectionFileName(dir) ? [dir] : []
      }
    } catch {
      return []
    }
  }
  const results = []
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return [] }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isFile() && isProjectionFileName(entry.name)) {
      results.push(fullPath)
    } else if (entry.isDirectory()) {
      results.push(...findLitematicFiles(fullPath, maxDepth, depth + 1))
    }
  }
  return results
}

// ─── 入口 ───────────────────────────────────────────────

function normalizeCliArgs(args) {
  if (args[0] !== 'import') return args

  const parsed = {}
  for (let i = 1; i < args.length; i++) {
    const arg = args[i]
    if (!arg.startsWith('--')) continue
    const key = arg.slice(2)
    const value = args[i + 1]
    if (value && !value.startsWith('--')) {
      parsed[key] = value
      i++
    } else {
      parsed[key] = true
    }
  }

  if (parsed.format && parsed.format !== 'obj') {
    throw new Error(`Unsupported format: ${parsed.format}`)
  }
  if (!parsed.input || !parsed.output) {
    throw new Error('Usage: node src/batch-obj-export.mjs import --input <file.litematic|dir> --output <dir> [--metadata-json <file>]')
  }

  return [
    parsed.input,
    parsed.output,
    parsed['metadata-json'],
    { preserveAdjacentFaces: Boolean(parsed['preserve-adjacent-faces']) },
  ]
}

function writeRunMetadata(metadataJson, data) {
  const metadataDir = path.dirname(metadataJson)
  fs.mkdirSync(metadataDir, { recursive: true })
  fs.writeFileSync(metadataJson, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

async function main() {
  const args = normalizeCliArgs(process.argv.slice(2))
  if (args.length < 2) {
    console.log('用法: node scripts/batch-obj-export.mjs <输入目录> <输出目录>')
    console.log('示例: node scripts/batch-obj-export.mjs "D:\\MYM_BuildCraft\\Litematic\\91 QQ可爱风小屋第二期" "D:\\MYM_BuildCraft\\OBJ_Export"')
    process.exit(1)
  }

  const inputDir = path.resolve(args[0])
  const outputDir = path.resolve(args[1])
  const metadataJson = args[2]
    ? path.resolve(args[2])
    : path.join(outputDir, 'metadata.json')
  const converterOptions = args[3] && typeof args[3] === 'object'
    ? args[3]
    : { preserveAdjacentFaces: false }

  if (!fs.existsSync(inputDir)) {
    console.error(`输入目录不存在: ${inputDir}`)
    process.exit(1)
  }

  console.log('═══════════════════════════════════════════')
  console.log('  MCBlock 批量 Litematic → OBJ 导出工具')
  console.log('═══════════════════════════════════════════')
  console.log(`输入: ${inputDir}`)
  console.log(`输出: ${outputDir}`)
  console.log()

  console.log('正在加载 Minecraft 资源...')
  const resources = await loadMcResources()
  console.log('✓ 资源加载完成')

  fs.mkdirSync(outputDir, { recursive: true })

  console.log('正在准备 atlas 纹理...')
  const sharedAtlasPath = await prepareAtlas(outputDir, resources)
  console.log('✓ Atlas 准备完成')
  console.log()

  const files = findLitematicFiles(inputDir)
  console.log(`找到 ${files.length} 个 litematic 文件`)
  console.log()

  let success = 0, fail = 0, skip = 0
  const outputs = []
  const startTime = Date.now()

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i]
    const relative = fs.statSync(inputDir).isFile()
      ? path.basename(filePath)
      : path.relative(inputDir, filePath)
    console.log(`[${i + 1}/${files.length}] ${relative}`)

    try {
      const result = await processLitematic(filePath, outputDir, resources, sharedAtlasPath, converterOptions)
      if (result) {
        success++
        outputs.push(result)
      }
      else skip++
    } catch (err) {
      console.error(`  ✗ 失败: ${err.message}`)
      fail++
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  writeRunMetadata(metadataJson, {
    converterVersion: CONVERTER_VERSION,
    resourceVersion: RESOURCE_VERSION,
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    input: inputDir,
    output: outputDir,
    mcmetaDir: MCMETA_DIR,
    metadataJson,
    options: converterOptions,
    elapsedSeconds: Number(elapsed),
    success,
    skip,
    fail,
    outputs,
  })
  console.log()
  console.log('═══════════════════════════════════════════')
  console.log(`完成! 耗时 ${elapsed}s`)
  console.log(`  成功: ${success}  跳过: ${skip}  失败: ${fail}`)
  console.log(`  输出目录: ${outputDir}`)
  console.log('═══════════════════════════════════════════')
}

main().catch(err => {
  console.error('致命错误:', err)
  process.exit(1)
})
