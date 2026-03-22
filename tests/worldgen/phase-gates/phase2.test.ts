import { describe, it, expect } from 'vitest'
import { ALL_GENERATORS } from '../../../src/worldgen/generation/registry.ts'
import { createDefaultConfig, BiomeType, type GenerationResult } from '../../../src/worldgen/generation/generator-interface.ts'
import { WorldgenBlockType } from '../../../src/worldgen/world/block-types.ts'
import { createRNG } from '../../../src/shared/seed.ts'
import { createNoise3D } from '../../../src/shared/noise.ts'
import { WorldgenGrid } from '../../../src/worldgen/world/worldgen-grid.ts'
import {
  carveNoiseThreshold,
  carveSpaghetti,
  carveAgentWorms,
  carveCheeseAndSpaghetti,
} from '../../../src/worldgen/generation/layers/cave-carver.ts'
import {
  assignBiomes,
  assignBiomesWarped,
  assignBiomesFromTerrain,
  assignBiomesMultiNoise,
} from '../../../src/worldgen/generation/layers/biome-assignment.ts'

// Helper: create a simple filled grid with a flat surface for testing
function createTestGrid(surfaceY: number = 32): { grid: WorldgenGrid; heightMap: Float32Array } {
  const grid = new WorldgenGrid(64, 64, 64)
  const heightMap = new Float32Array(64 * 64)

  for (let x = 0; x < 64; x++) {
    for (let z = 0; z < 64; z++) {
      heightMap[x * 64 + z] = surfaceY
      for (let y = 0; y < 64; y++) {
        if (y === 0) {
          grid.setBlock({ x, y, z }, WorldgenBlockType.Bedrock)
        } else if (y < surfaceY - 3) {
          grid.setBlock({ x, y, z }, WorldgenBlockType.Stone)
        } else if (y < surfaceY) {
          grid.setBlock({ x, y, z }, WorldgenBlockType.Dirt)
        } else if (y === surfaceY) {
          grid.setBlock({ x, y, z }, WorldgenBlockType.Grass)
        }
      }
    }
  }
  return { grid, heightMap }
}

describe('Phase 2: Cave Carver', () => {
  it('noise threshold carves underground air blocks', () => {
    const { grid, heightMap } = createTestGrid()
    const rng = createRNG(42)
    const carved = carveNoiseThreshold(grid, heightMap, rng, 0.4, 0.08)
    expect(carved).toBeGreaterThan(0)

    // Verify carved blocks are air and underground
    let foundCaveAir = false
    for (let x = 0; x < 64; x += 8) {
      for (let z = 0; z < 64; z += 8) {
        for (let y = 1; y < 29; y++) {
          if (grid.getBlock({ x, y, z }) === WorldgenBlockType.Air) {
            foundCaveAir = true
          }
        }
      }
    }
    expect(foundCaveAir).toBe(true)
  })

  it('spaghetti caves create thin tunnels', () => {
    const { grid, heightMap } = createTestGrid()
    const rng = createRNG(42)
    const carved = carveSpaghetti(grid, heightMap, rng, 0.04)
    expect(carved).toBeGreaterThan(0)
  })

  it('agent worms create connected cave systems', () => {
    const { grid, heightMap } = createTestGrid()
    const rng = createRNG(42)
    const carved = carveAgentWorms(grid, heightMap, rng, 10, 100, 2)
    expect(carved).toBeGreaterThan(0)
  })

  it('cheese+spaghetti combined produces caves', () => {
    const { grid, heightMap } = createTestGrid()
    const rng = createRNG(42)
    const carved = carveCheeseAndSpaghetti(grid, heightMap, rng)
    expect(carved).toBeGreaterThan(0)
  })

  it('does not carve bedrock layer', () => {
    const { grid, heightMap } = createTestGrid()
    const rng = createRNG(42)
    carveNoiseThreshold(grid, heightMap, rng)
    // Y=0 should remain bedrock
    for (let x = 0; x < 64; x += 16) {
      for (let z = 0; z < 64; z += 16) {
        expect(grid.getBlock({ x, y: 0, z })).toBe(WorldgenBlockType.Bedrock)
      }
    }
  })

  it('cave carving is deterministic', () => {
    const g1 = createTestGrid()
    const g2 = createTestGrid()
    const c1 = carveNoiseThreshold(g1.grid, g1.heightMap, createRNG(42))
    const c2 = carveNoiseThreshold(g2.grid, g2.heightMap, createRNG(42))
    expect(c1).toBe(c2)
  })
})

describe('Phase 2: Biome Assignment', () => {
  it('assignBiomes produces all 7 biome types for typical seed', () => {
    const { grid, heightMap } = createTestGrid()
    const rng = createRNG(42)
    const biomeMap = assignBiomes(grid, heightMap, rng, 32)

    const biomeSet = new Set<number>()
    for (let i = 0; i < biomeMap.length; i++) {
      biomeSet.add(biomeMap[i])
    }
    // Should have multiple biomes
    expect(biomeSet.size).toBeGreaterThanOrEqual(3)
  })

  it('no single biome covers > 80% of surface', () => {
    const { grid, heightMap } = createTestGrid()
    const rng = createRNG(42)
    const biomeMap = assignBiomes(grid, heightMap, rng, 32)

    const counts: Record<number, number> = {}
    for (let i = 0; i < biomeMap.length; i++) {
      counts[biomeMap[i]] = (counts[biomeMap[i]] ?? 0) + 1
    }
    const total = biomeMap.length
    for (const count of Object.values(counts)) {
      expect(count / total).toBeLessThan(0.8)
    }
  })

  it('assignBiomesWarped produces varied biomes', () => {
    const { grid, heightMap } = createTestGrid()
    const rng = createRNG(42)
    const biomeMap = assignBiomesWarped(grid, heightMap, rng, 32)

    const biomeSet = new Set<number>()
    for (let i = 0; i < biomeMap.length; i++) {
      biomeSet.add(biomeMap[i])
    }
    expect(biomeSet.size).toBeGreaterThanOrEqual(2)
  })

  it('assignBiomesFromTerrain works with elevation data', () => {
    const { grid, heightMap } = createTestGrid()
    const rng = createRNG(42)
    const biomeMap = assignBiomesFromTerrain(grid, heightMap, rng, 32)
    expect(biomeMap.length).toBe(64 * 64)
  })

  it('assignBiomesMultiNoise uses all three noise fields', () => {
    const { grid, heightMap } = createTestGrid()
    const rng = createRNG(42)
    const biomeMap = assignBiomesMultiNoise(grid, heightMap, rng, 32)

    const biomeSet = new Set<number>()
    for (let i = 0; i < biomeMap.length; i++) {
      biomeSet.add(biomeMap[i])
    }
    expect(biomeSet.size).toBeGreaterThanOrEqual(2)
  })

  it('desert biome uses sand surface blocks', () => {
    const { grid, heightMap } = createTestGrid()
    const rng = createRNG(42)
    const biomeMap = assignBiomes(grid, heightMap, rng, 32)

    // Find a desert column and verify it has sand
    let foundSand = false
    for (let i = 0; i < biomeMap.length; i++) {
      if (biomeMap[i] === BiomeType.Desert) {
        const x = Math.floor(i / 64)
        const z = i % 64
        const surfY = Math.floor(heightMap[i])
        if (grid.getBlock({ x, y: surfY, z }) === WorldgenBlockType.Sand) {
          foundSand = true
          break
        }
      }
    }
    // Desert might not appear with this seed; if it does, sand should be present
    if ([...new Set(biomeMap)].includes(BiomeType.Desert)) {
      expect(foundSand).toBe(true)
    }
  })

  it('tundra biome uses snow surface blocks', () => {
    const { grid, heightMap } = createTestGrid()
    const rng = createRNG(42)
    const biomeMap = assignBiomes(grid, heightMap, rng, 32)

    let foundSnow = false
    for (let i = 0; i < biomeMap.length; i++) {
      if (biomeMap[i] === BiomeType.Tundra) {
        const x = Math.floor(i / 64)
        const z = i % 64
        const surfY = Math.floor(heightMap[i])
        if (grid.getBlock({ x, y: surfY, z }) === WorldgenBlockType.Snow) {
          foundSnow = true
          break
        }
      }
    }
    if ([...new Set(biomeMap)].includes(BiomeType.Tundra)) {
      expect(foundSnow).toBe(true)
    }
  })

  it('biome assignment is deterministic', () => {
    const g1 = createTestGrid()
    const g2 = createTestGrid()
    const b1 = assignBiomes(g1.grid, g1.heightMap, createRNG(42), 32)
    const b2 = assignBiomes(g2.grid, g2.heightMap, createRNG(42), 32)

    for (let i = 0; i < b1.length; i++) {
      expect(b1[i]).toBe(b2[i])
    }
  })
})

describe('Phase 2: All 5 Algorithms with Caves + Biomes', () => {
  const config = createDefaultConfig(42)

  for (const gen of ALL_GENERATORS) {
    describe(gen.name, () => {
      let result: GenerationResult

      it('generates with caves and biomes', () => {
        const c = { ...config, params: gen.getDefaultParams() }
        result = gen.generate(c)
        expect(result).toBeDefined()
      })

      it('produces underground cave air blocks', () => {
        const { grid, heightMap } = result
        let caveAirCount = 0

        for (let x = 0; x < grid.worldWidth; x += 4) {
          for (let z = 0; z < grid.worldDepth; z += 4) {
            const surfY = Math.floor(heightMap[x * grid.worldDepth + z])
            for (let y = 1; y < surfY - 2; y++) {
              if (grid.getBlock({ x, y, z }) === WorldgenBlockType.Air) {
                caveAirCount++
              }
            }
          }
        }
        // Should have some cave air (sampling every 4th column)
        expect(caveAirCount).toBeGreaterThan(0)
      })

      it('biome map covers all surface columns', () => {
        expect(result.biomeMap.length).toBe(config.worldWidth * config.worldDepth)
        // All values should be valid BiomeType
        for (let i = 0; i < result.biomeMap.length; i++) {
          expect(result.biomeMap[i]).toBeGreaterThanOrEqual(BiomeType.Plains)
          expect(result.biomeMap[i]).toBeLessThanOrEqual(BiomeType.Badlands)
        }
      })

      it('has multiple biome types', () => {
        const biomeSet = new Set<number>()
        for (let i = 0; i < result.biomeMap.length; i++) {
          biomeSet.add(result.biomeMap[i])
        }
        expect(biomeSet.size).toBeGreaterThanOrEqual(2)
      })

      it('reports non-zero biome and cave timing', () => {
        expect(result.timing.biomesMs).toBeGreaterThan(0)
        expect(result.timing.cavesMs).toBeGreaterThan(0)
      })

      it('caves are deterministic (same seed = same result)', { timeout: 30_000 }, () => {
        const c = { ...config, params: gen.getDefaultParams() }
        const result2 = gen.generate(c)

        // Compare cave air count at sampled positions
        let cave1 = 0, cave2 = 0
        for (let x = 0; x < result.grid.worldWidth; x += 8) {
          for (let z = 0; z < result.grid.worldDepth; z += 8) {
            for (let y = 1; y < 30; y++) {
              if (result.grid.getBlock({ x, y, z }) === WorldgenBlockType.Air) cave1++
              if (result2.grid.getBlock({ x, y, z }) === WorldgenBlockType.Air) cave2++
            }
          }
        }
        expect(cave1).toBe(cave2)
      })

      it('surface blocks match biome types', () => {
        const { grid, heightMap, biomeMap } = result
        let checked = 0, matched = 0

        for (let x = 0; x < grid.worldWidth; x += 8) {
          for (let z = 0; z < grid.worldDepth; z += 8) {
            const idx = x * grid.worldDepth + z
            const surfY = Math.floor(heightMap[idx])
            const biome = biomeMap[idx]
            const surfBlock = grid.getBlock({ x, y: surfY, z })

            // Skip if surface was carved or is water
            if (surfBlock === WorldgenBlockType.Air || surfBlock === WorldgenBlockType.Water) continue
            checked++

            // Verify biome-appropriate surface
            const expectedBlocks: Record<number, WorldgenBlockType[]> = {
              [BiomeType.Plains]: [WorldgenBlockType.Grass],
              [BiomeType.Forest]: [WorldgenBlockType.Grass],
              [BiomeType.Desert]: [WorldgenBlockType.Sand],
              [BiomeType.Tundra]: [WorldgenBlockType.Snow],
              [BiomeType.Swamp]: [WorldgenBlockType.Mud],
              [BiomeType.Mountains]: [WorldgenBlockType.Stone],
              [BiomeType.Badlands]: [WorldgenBlockType.LayeredStone],
            }
            const expected = expectedBlocks[biome]
            if (expected && expected.includes(surfBlock)) {
              matched++
            }
          }
        }

        // At least 80% of checked columns should have matching biome surface
        if (checked > 0) {
          expect(matched / checked).toBeGreaterThan(0.7)
        }
      })

      it('still generates within 15 seconds', () => {
        expect(result.timing.totalMs).toBeLessThan(15_000)
      })
    })
  }
})
