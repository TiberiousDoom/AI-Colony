import { describe, it, expect } from 'vitest'
import { SPRITE_NAMES } from '../src/rendering/sprite-generator.ts'

describe('SpriteManager / Sprite Inventory', () => {
  it('has exactly 33 sprite names', () => {
    expect(SPRITE_NAMES).toHaveLength(33)
  })

  it('includes all terrain sprites', () => {
    const terrain = SPRITE_NAMES.filter(n => n.startsWith('terrain_'))
    expect(terrain).toHaveLength(6)
    expect(terrain).toContain('terrain_grass')
    expect(terrain).toContain('terrain_forest')
    expect(terrain).toContain('terrain_stone')
    expect(terrain).toContain('terrain_water')
    expect(terrain).toContain('terrain_fertile')
    expect(terrain).toContain('terrain_campfire')
  })

  it('includes all villager animation frames', () => {
    const villager = SPRITE_NAMES.filter(n => n.startsWith('villager_'))
    expect(villager).toHaveLength(16) // 4 variants x 4 frames
  })

  it('includes structure sprites', () => {
    expect(SPRITE_NAMES).toContain('structure_shelter')
    expect(SPRITE_NAMES).toContain('structure_storage')
  })

  it('includes resource sprites', () => {
    expect(SPRITE_NAMES).toContain('resource_food')
    expect(SPRITE_NAMES).toContain('resource_wood')
    expect(SPRITE_NAMES).toContain('resource_stone')
  })

  it('includes UI sprites', () => {
    expect(SPRITE_NAMES).toContain('selection_ring')
    expect(SPRITE_NAMES).toContain('minimap_dot')
  })

  it('all names follow naming convention', () => {
    for (const name of SPRITE_NAMES) {
      expect(name).toMatch(/^[a-z]+_[a-z0-9_]+$/)
    }
  })
})
