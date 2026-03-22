import { describe, it, expect } from 'vitest'
import { ALL_GENERATORS } from '../../../src/worldgen/generation/registry.ts'
import { createDefaultConfig, BiomeType } from '../../../src/worldgen/generation/generator-interface.ts'
import { WorldgenBlockType } from '../../../src/worldgen/world/block-types.ts'
import { BlockType } from '../../../src/voxel/world/block-types.ts'
import { createRNG } from '../../../src/shared/seed.ts'
import { exportToPathfindingGrid } from '../../../src/worldgen/utils/pathfinding-export.ts'
import { analyzeNavigability } from '../../../src/worldgen/analysis/navigability.ts'

describe('Phase 5: Cross-Sandbox Export', () => {
  const gen = ALL_GENERATORS[0]
  const config = createDefaultConfig(42)
  const result = gen.generate({ ...config, params: gen.getDefaultParams() })

  it('exports WorldgenGrid region to pathfinding VoxelGrid', () => {
    const pathGrid = exportToPathfindingGrid(result.grid)
    expect(pathGrid.worldSize).toBe(32)
  })

  it('maps block types correctly', () => {
    const pathGrid = exportToPathfindingGrid(result.grid)

    let airFound = false, solidFound = false
    for (let x = 0; x < 32; x++) {
      for (let y = 0; y < 32; y++) {
        for (let z = 0; z < 32; z++) {
          const block = pathGrid.getBlock({ x, y, z })
          if (block === BlockType.Air) airFound = true
          if (block === BlockType.Solid) solidFound = true
          // Only Air or Solid should exist
          expect(block === BlockType.Air || block === BlockType.Solid).toBe(true)
        }
      }
    }
    expect(airFound).toBe(true)
    expect(solidFound).toBe(true)
  })

  it('exports from different regions', () => {
    const pathGrid1 = exportToPathfindingGrid(result.grid, { startX: 0, startY: 0, startZ: 0, size: 32 })
    const pathGrid2 = exportToPathfindingGrid(result.grid, { startX: 64, startY: 0, startZ: 64, size: 32 })

    // Should be different terrain regions
    let diffs = 0
    for (let x = 0; x < 32; x += 4) {
      for (let z = 0; z < 32; z += 4) {
        if (pathGrid1.getBlock({ x, y: 16, z }) !== pathGrid2.getBlock({ x, y: 16, z })) diffs++
      }
    }
    expect(diffs).toBeGreaterThan(0)
  })
})

describe('Phase 5: Integration Tests (Multi-Seed)', () => {
  const seeds = [1, 7, 42, 99, 256]

  for (const gen of ALL_GENERATORS) {
    describe(gen.name, () => {
      it('produces non-degenerate terrain across seeds', { timeout: 60_000 }, () => {
        for (const seed of seeds) {
          const config = createDefaultConfig(seed)
          const result = gen.generate({ ...config, params: gen.getDefaultParams() })

          const totalVoxels = config.worldWidth * config.worldHeight * config.worldDepth
          const airCount = result.metadata.blockCounts[WorldgenBlockType.Air] ?? 0

          // Not > 95% air and not > 95% solid
          expect(airCount / totalVoxels).toBeLessThan(0.95)
          expect(airCount / totalVoxels).toBeGreaterThan(0.05)

          // At least 2 biome types
          const biomeSet = new Set<number>()
          for (let i = 0; i < result.biomeMap.length; i++) biomeSet.add(result.biomeMap[i])
          expect(biomeSet.size).toBeGreaterThanOrEqual(2)

          // Has spawn points
          expect(result.spawnPoints.length).toBeGreaterThan(0)

          // Generation time < 15s
          expect(result.timing.totalMs).toBeLessThan(15_000)
        }
      })

      it('navigability score > 0.1 across seeds', { timeout: 60_000 }, () => {
        for (const seed of seeds.slice(0, 3)) { // Test 3 seeds to save time
          const config = createDefaultConfig(seed)
          const result = gen.generate({ ...config, params: gen.getDefaultParams() })
          const nav = analyzeNavigability(result.grid, result.heightMap, createRNG(seed), config.seaLevel, 10)
          expect(nav.navigabilityScore).toBeGreaterThan(0.1)
        }
      })
    })
  }
})
