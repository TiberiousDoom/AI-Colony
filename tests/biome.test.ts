/**
 * Tests for biome system and biome-aware world generation.
 */
import { describe, it, expect } from 'vitest'
import { BIOME_PRESETS, getBiomeParams } from '../src/simulation/biomes.ts'
import { World, TileType } from '../src/simulation/world.ts'

describe('Biome presets', () => {
  it('has 5 biome presets', () => {
    const keys = Object.keys(BIOME_PRESETS)
    expect(keys).toHaveLength(5)
    expect(keys).toContain('temperate')
    expect(keys).toContain('desert')
    expect(keys).toContain('tundra')
    expect(keys).toContain('island')
    expect(keys).toContain('lush')
  })

  it('getBiomeParams returns correct biome', () => {
    const desert = getBiomeParams('desert')
    expect(desert.name).toBe('Desert')
    expect(desert.hasCoolingNeed).toBe(true)
  })

  it('desert has cooling need enabled', () => {
    const desert = BIOME_PRESETS.desert
    expect(desert.hasCoolingNeed).toBe(true)
    expect(desert.permanentWinter).toBe(false)
  })

  it('tundra has permanent winter and short growing season', () => {
    const tundra = BIOME_PRESETS.tundra
    expect(tundra.permanentWinter).toBe(true)
    expect(tundra.shortGrowingSeason).toBe(true)
  })
})

describe('Biome world generation', () => {
  it('each biome produces a valid world', () => {
    for (const biome of ['temperate', 'desert', 'tundra', 'island', 'lush'] as const) {
      const world = new World({ width: 32, height: 32, seed: 42, biome })
      expect(world.width).toBe(32)
      expect(world.height).toBe(32)
      expect(world.biome).toBe(biome)

      // Should have at least some non-water tiles
      let landTiles = 0
      for (let y = 0; y < world.height; y++) {
        for (let x = 0; x < world.width; x++) {
          if (world.getTile(x, y).type !== TileType.Water) landTiles++
        }
      }
      expect(landTiles).toBeGreaterThan(0)
    }
  })

  it('desert has less water than island', () => {
    const desertWorld = new World({ width: 48, height: 48, seed: 42, biome: 'desert' })
    const islandWorld = new World({ width: 48, height: 48, seed: 42, biome: 'island' })

    let desertWater = 0, islandWater = 0
    for (let y = 0; y < 48; y++) {
      for (let x = 0; x < 48; x++) {
        if (desertWorld.getTile(x, y).type === TileType.Water) desertWater++
        if (islandWorld.getTile(x, y).type === TileType.Water) islandWater++
      }
    }
    expect(desertWater).toBeLessThan(islandWater)
  })

  it('isResourceExhausted works correctly', () => {
    const world = new World({ width: 8, height: 8, seed: 42 })
    // Initially, resources should not be exhausted (there should be some forest or stone)
    const hasForest = !world.isResourceExhausted(TileType.Forest)
    const hasStone = !world.isResourceExhausted(TileType.Stone)
    // At least one should have resources on an 8x8 map
    expect(hasForest || hasStone).toBe(true)
  })
})
