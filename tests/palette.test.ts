import { describe, it, expect } from 'vitest'
import { SEASONAL_TINTS, getTileTint } from '../src/rendering/palette.ts'
import { TileType } from '../src/simulation/world.ts'
import type { Season } from '../src/simulation/villager.ts'

describe('Palette', () => {
  const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter']

  it('all four seasons have tint definitions', () => {
    for (const season of SEASONS) {
      expect(SEASONAL_TINTS[season]).toBeDefined()
    }
  })

  it('grass and forest have seasonal tints', () => {
    for (const season of SEASONS) {
      expect(SEASONAL_TINTS[season][TileType.Grass]).toBeDefined()
      expect(SEASONAL_TINTS[season][TileType.Forest]).toBeDefined()
    }
  })

  it('tint values are valid hex numbers', () => {
    for (const season of SEASONS) {
      for (const [, tint] of Object.entries(SEASONAL_TINTS[season])) {
        expect(typeof tint).toBe('number')
        expect(tint).toBeGreaterThanOrEqual(0)
        expect(tint).toBeLessThanOrEqual(0xffffff)
      }
    }
  })

  it('water has no seasonal tint (stays consistent)', () => {
    for (const season of SEASONS) {
      expect(SEASONAL_TINTS[season][TileType.Water]).toBeUndefined()
    }
  })

  it('getTileTint returns correct values', () => {
    expect(getTileTint(TileType.Grass, 'spring')).toBe(0x66cc66)
    expect(getTileTint(TileType.Water, 'summer')).toBe(0x4488cc) // Base tint
    expect(getTileTint(TileType.Stone, 'winter')).toBe(0x888888) // Base tint
  })
})
