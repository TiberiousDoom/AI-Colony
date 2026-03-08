/**
 * Runtime procedural sprite generation using PixiJS Graphics → RenderTexture.
 * All 29 placeholder sprites are generated at startup — no build pipeline needed.
 */

import { Graphics, RenderTexture, type Renderer } from 'pixi.js'

const SIZE = 16

/** All sprite names that must be generated */
export const SPRITE_NAMES = [
  // Terrain
  'terrain_grass', 'terrain_forest', 'terrain_stone', 'terrain_water', 'terrain_fertile', 'terrain_campfire',
  // Villager walk
  'villager_walk_0', 'villager_walk_1', 'villager_walk_2', 'villager_walk_3',
  // Villager work
  'villager_work_0', 'villager_work_1', 'villager_work_2', 'villager_work_3',
  // Villager rest
  'villager_rest_0', 'villager_rest_1', 'villager_rest_2', 'villager_rest_3',
  // Villager flee
  'villager_flee_0', 'villager_flee_1', 'villager_flee_2', 'villager_flee_3',
  // Structures
  'structure_shelter', 'structure_storage', 'structure_watchtower', 'structure_farm', 'structure_wall', 'structure_well',
  // Resources
  'resource_food', 'resource_wood', 'resource_stone',
  // UI
  'selection_ring', 'minimap_dot',
] as const

export type SpriteName = typeof SPRITE_NAMES[number]

function drawTerrain(g: Graphics, name: string): void {
  switch (name) {
    case 'terrain_grass':
      g.rect(0, 0, SIZE, SIZE).fill(0x55aa55)
      // Small grass detail
      g.rect(4, 6, 1, 3).fill(0x66bb66)
      g.rect(10, 8, 1, 3).fill(0x66bb66)
      break
    case 'terrain_forest':
      g.rect(0, 0, SIZE, SIZE).fill(0x2d8a2d)
      // Tree crown (lighter circle)
      g.circle(8, 5, 4).fill(0x44aa44)
      // Trunk
      g.rect(7, 9, 2, 4).fill(0x6b4226)
      break
    case 'terrain_stone':
      g.rect(0, 0, SIZE, SIZE).fill(0x888888)
      // Cracks
      g.rect(3, 4, 5, 1).fill(0x666666)
      g.rect(8, 9, 4, 1).fill(0x666666)
      break
    case 'terrain_water':
      g.rect(0, 0, SIZE, SIZE).fill(0x4488cc)
      // Wave lines
      g.rect(2, 5, 4, 1).fill(0x66aadd)
      g.rect(8, 10, 5, 1).fill(0x66aadd)
      break
    case 'terrain_fertile':
      g.rect(0, 0, SIZE, SIZE).fill(0x7a6644)
      // Soil detail
      g.rect(3, 3, 2, 2).fill(0x8b7755)
      g.rect(9, 8, 2, 2).fill(0x8b7755)
      break
    case 'terrain_campfire':
      g.rect(0, 0, SIZE, SIZE).fill(0x55aa55)
      // Fire
      g.circle(8, 8, 3).fill(0xff6600)
      g.circle(8, 7, 2).fill(0xffaa00)
      g.circle(8, 6, 1).fill(0xffdd44)
      break
  }
}

function drawVillager(g: Graphics, variant: string, frameIndex: number): void {
  // Body (8x8 centered)
  const bodyColor = variant === 'flee' ? 0xddaa88 : 0xccaa88
  const bodyX = 4
  const bodyY = 5

  // Head
  g.circle(8, 4, 2.5).fill(bodyColor)

  // Body
  g.rect(bodyX, bodyY, 8, 5).fill(bodyColor)

  // Legs — shift based on frame for walk animation
  const legOffset = variant === 'rest' ? 0 : (frameIndex % 2 === 0 ? 1 : -1)
  g.rect(5 + legOffset, 10, 2, 4).fill(0x886644)
  g.rect(9 - legOffset, 10, 2, 4).fill(0x886644)

  // Work variant: small tool
  if (variant === 'work') {
    g.rect(12, 3 + frameIndex, 2, 5).fill(0x666666)
  }

  // Flee variant: motion lines
  if (variant === 'flee') {
    g.rect(0, 5, 3, 1).fill(0xffffff)
    g.rect(0, 9, 2, 1).fill(0xffffff)
  }
}

function drawStructure(g: Graphics, name: string): void {
  switch (name) {
    case 'structure_shelter':
      // Triangular roof
      g.poly([8, 1, 1, 8, 15, 8]).fill(0x8b4513)
      // Wall
      g.rect(3, 8, 10, 6).fill(0xa0522d)
      // Door
      g.rect(6, 10, 4, 4).fill(0x4a2a0a)
      break
    case 'structure_storage':
      // Storage box
      g.rect(2, 4, 12, 10).fill(0x6b3a1f)
      // Lid
      g.rect(1, 3, 14, 2).fill(0x7a4a2a)
      // Band
      g.rect(2, 8, 12, 1).fill(0x555555)
      break
    case 'structure_watchtower':
      // Tall tower with platform
      g.rect(6, 2, 4, 12).fill(0x8b6914)
      // Platform
      g.rect(2, 1, 12, 3).fill(0xa07828)
      // Cross beams
      g.rect(4, 7, 8, 1).fill(0x6b4a10)
      break
    case 'structure_farm':
      // Crop rows
      g.rect(0, 0, SIZE, SIZE).fill(0x7a6644)
      g.rect(2, 3, 12, 1).fill(0x44aa44)
      g.rect(2, 7, 12, 1).fill(0x44aa44)
      g.rect(2, 11, 12, 1).fill(0x44aa44)
      break
    case 'structure_wall':
      // Thick gray wall segment
      g.rect(1, 4, 14, 8).fill(0x888888)
      g.rect(2, 3, 12, 1).fill(0x999999)
      // Bricks
      g.rect(1, 8, 7, 1).fill(0x777777)
      g.rect(8, 6, 7, 1).fill(0x777777)
      break
    case 'structure_well':
      // Stone ring with blue center
      g.circle(8, 8, 5).fill(0x888888)
      g.circle(8, 8, 3).fill(0x4488cc)
      // Rim
      g.circle(8, 8, 5).stroke({ width: 1.5, color: 0x666666 })
      break
  }
}

function drawResource(g: Graphics, name: string): void {
  const color = name === 'resource_food' ? 0x44aa44 : name === 'resource_wood' ? 0x8b4513 : 0x888888
  // Small pile
  g.circle(5, 10, 3).fill(color)
  g.circle(10, 9, 3).fill(color)
  g.circle(8, 7, 2.5).fill(color)
}

function drawUI(g: Graphics, name: string): void {
  if (name === 'selection_ring') {
    g.circle(8, 8, 7).stroke({ width: 1.5, color: 0xffffff })
  } else {
    // minimap_dot
    g.circle(8, 8, 3).fill(0xffffff)
  }
}

/** Generate all procedural textures. Call once during SpriteManager init. */
export function generateAllTextures(renderer: Renderer): Map<string, RenderTexture> {
  const textures = new Map<string, RenderTexture>()

  for (const name of SPRITE_NAMES) {
    const g = new Graphics()

    if (name.startsWith('terrain_')) {
      drawTerrain(g, name)
    } else if (name.startsWith('villager_')) {
      const parts = name.split('_')
      const variant = parts[1] // walk, work, rest, flee
      const frameIndex = parseInt(parts[2], 10)
      drawVillager(g, variant, frameIndex)
    } else if (name.startsWith('structure_')) {
      drawStructure(g, name)
    } else if (name.startsWith('resource_')) {
      drawResource(g, name)
    } else {
      drawUI(g, name)
    }

    const rt = RenderTexture.create({ width: SIZE, height: SIZE })
    renderer.render({ container: g, target: rt })
    g.destroy()
    textures.set(name, rt)
  }

  return textures
}
