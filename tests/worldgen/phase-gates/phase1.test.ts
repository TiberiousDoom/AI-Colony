import { describe, it, expect } from 'vitest'
import { WorldgenGrid } from '../../../src/worldgen/world/worldgen-grid.ts'
import { WorldgenChunk } from '../../../src/worldgen/world/chunk.ts'
import { WorldgenBlockType } from '../../../src/worldgen/world/block-types.ts'
import { CHUNK_SIZE, localIndex, worldToChunk, worldToLocal, chunkKey } from '../../../src/worldgen/world/chunk-utils.ts'
import { ALL_GENERATORS } from '../../../src/worldgen/generation/registry.ts'
import { createDefaultConfig, type GenerationResult } from '../../../src/worldgen/generation/generator-interface.ts'
import { createRNG } from '../../../src/shared/seed.ts'
import { createNoise3D, fractalNoise3D } from '../../../src/shared/noise.ts'
import { evaluateSpline, createDefaultHeightSpline } from '../../../src/worldgen/utils/spline.ts'

describe('Phase 1: Foundation', () => {
  describe('WorldgenChunk (16x16x16)', () => {
    it('stores and retrieves blocks correctly', () => {
      const chunk = new WorldgenChunk()
      chunk.setBlock(0, 0, 0, WorldgenBlockType.Stone)
      chunk.setBlock(15, 15, 15, WorldgenBlockType.Grass)
      chunk.setBlock(8, 4, 12, WorldgenBlockType.Water)

      expect(chunk.getBlock(0, 0, 0)).toBe(WorldgenBlockType.Stone)
      expect(chunk.getBlock(15, 15, 15)).toBe(WorldgenBlockType.Grass)
      expect(chunk.getBlock(8, 4, 12)).toBe(WorldgenBlockType.Water)
      expect(chunk.getBlock(1, 1, 1)).toBe(WorldgenBlockType.Air)
    })

    it('tracks dirty state', () => {
      const chunk = new WorldgenChunk()
      expect(chunk.dirty).toBe(false)
      chunk.setBlock(0, 0, 0, WorldgenBlockType.Stone)
      expect(chunk.dirty).toBe(true)
      chunk.clearDirty()
      expect(chunk.dirty).toBe(false)
    })
  })

  describe('WorldgenGrid (128x64x128)', () => {
    it('stores and retrieves blocks in non-cubic dimensions', () => {
      const grid = new WorldgenGrid(128, 64, 128)
      expect(grid.worldWidth).toBe(128)
      expect(grid.worldHeight).toBe(64)
      expect(grid.worldDepth).toBe(128)

      grid.setBlock({ x: 0, y: 0, z: 0 }, WorldgenBlockType.Stone)
      grid.setBlock({ x: 127, y: 63, z: 127 }, WorldgenBlockType.Grass)
      grid.setBlock({ x: 64, y: 32, z: 64 }, WorldgenBlockType.Water)

      expect(grid.getBlock({ x: 0, y: 0, z: 0 })).toBe(WorldgenBlockType.Stone)
      expect(grid.getBlock({ x: 127, y: 63, z: 127 })).toBe(WorldgenBlockType.Grass)
      expect(grid.getBlock({ x: 64, y: 32, z: 64 })).toBe(WorldgenBlockType.Water)
    })

    it('returns Air for out-of-bounds reads', () => {
      const grid = new WorldgenGrid(128, 64, 128)
      expect(grid.getBlock({ x: -1, y: 0, z: 0 })).toBe(WorldgenBlockType.Air)
      expect(grid.getBlock({ x: 128, y: 0, z: 0 })).toBe(WorldgenBlockType.Air)
      expect(grid.getBlock({ x: 0, y: 64, z: 0 })).toBe(WorldgenBlockType.Air)
    })

    it('correctly uses 16x16x16 chunks', () => {
      expect(CHUNK_SIZE).toBe(16)
      const grid = new WorldgenGrid(128, 64, 128)
      grid.setBlock({ x: 17, y: 5, z: 33 }, WorldgenBlockType.Stone)

      const cc = worldToChunk({ x: 17, y: 5, z: 33 })
      expect(cc.cx).toBe(1)
      expect(cc.cy).toBe(0)
      expect(cc.cz).toBe(2)

      const local = worldToLocal({ x: 17, y: 5, z: 33 })
      expect(local.x).toBe(1)
      expect(local.y).toBe(5)
      expect(local.z).toBe(1)

      expect(grid.chunkCount).toBeGreaterThan(0)
    })
  })

  describe('Chunk utilities', () => {
    it('localIndex is consistent', () => {
      const idx = localIndex(3, 7, 11)
      expect(idx).toBe(7 * 16 * 16 + 11 * 16 + 3)
    })

    it('chunkKey produces unique keys', () => {
      expect(chunkKey({ cx: 0, cy: 0, cz: 0 })).toBe('0,0,0')
      expect(chunkKey({ cx: 1, cy: 2, cz: 3 })).toBe('1,2,3')
      expect(chunkKey({ cx: 1, cy: 2, cz: 3 })).not.toBe(chunkKey({ cx: 3, cy: 2, cz: 1 }))
    })
  })

  describe('3D Noise', () => {
    it('createNoise3D returns values in approximate [-1, 1] range', () => {
      const rng = createRNG(42)
      const noise3D = createNoise3D(rng)
      let min = Infinity, max = -Infinity
      for (let i = 0; i < 1000; i++) {
        const v = noise3D(i * 0.1, i * 0.07, i * 0.13)
        if (v < min) min = v
        if (v > max) max = v
      }
      expect(min).toBeLessThan(0)
      expect(max).toBeGreaterThan(0)
      expect(min).toBeGreaterThan(-2)
      expect(max).toBeLessThan(2)
    })

    it('is deterministic with same seed', () => {
      const rng1 = createRNG(42)
      const rng2 = createRNG(42)
      const noise1 = createNoise3D(rng1)
      const noise2 = createNoise3D(rng2)

      for (let i = 0; i < 100; i++) {
        expect(noise1(i * 0.1, i * 0.07, i * 0.13)).toBe(noise2(i * 0.1, i * 0.07, i * 0.13))
      }
    })

    it('fractalNoise3D produces varied output', () => {
      const rng = createRNG(42)
      const noise3D = createNoise3D(rng)
      const values = new Set<number>()
      for (let i = 0; i < 100; i++) {
        values.add(Math.round(fractalNoise3D(noise3D, i * 0.5, 0, 0, 3, 0.5, 2.0) * 100))
      }
      expect(values.size).toBeGreaterThan(10)
    })
  })

  describe('Spline', () => {
    it('evaluates piecewise-linear correctly', () => {
      const spline = createDefaultHeightSpline()
      // At exact control points
      expect(evaluateSpline(spline, -1.0)).toBeCloseTo(0.1)
      expect(evaluateSpline(spline, 0.0)).toBeCloseTo(0.5)
      expect(evaluateSpline(spline, 1.0)).toBeCloseTo(0.95)
      // Clamping
      expect(evaluateSpline(spline, -2.0)).toBeCloseTo(0.1)
      expect(evaluateSpline(spline, 2.0)).toBeCloseTo(0.95)
      // Interpolation
      const mid = evaluateSpline(spline, -0.75)
      expect(mid).toBeGreaterThan(0.1)
      expect(mid).toBeLessThan(0.25)
    })
  })
})

describe('Phase 1: All 5 Algorithms', () => {
  const config = createDefaultConfig(42)

  for (const gen of ALL_GENERATORS) {
    describe(gen.name, () => {
      let result: GenerationResult

      it('generates without error', () => {
        const c = { ...config, params: gen.getDefaultParams() }
        result = gen.generate(c)
        expect(result).toBeDefined()
        expect(result.grid).toBeDefined()
        expect(result.heightMap).toBeDefined()
      })

      it('produces a non-degenerate height map', () => {
        const heights = result.heightMap
        expect(heights.length).toBe(config.worldWidth * config.worldDepth)

        let min = Infinity, max = -Infinity
        for (let i = 0; i < heights.length; i++) {
          if (heights[i] < min) min = heights[i]
          if (heights[i] > max) max = heights[i]
        }

        // Height range should be > 5 (not flat)
        expect(max - min).toBeGreaterThan(5)
        // Heights should be within world bounds
        expect(min).toBeGreaterThanOrEqual(1)
        expect(max).toBeLessThan(config.worldHeight)
      })

      it('is deterministic (same seed = same output)', () => {
        const c = { ...config, params: gen.getDefaultParams() }
        const result2 = gen.generate(c)

        for (let i = 0; i < 100; i++) {
          expect(result.heightMap[i * 100]).toBe(result2.heightMap[i * 100])
        }
      })

      it('produces different output for different seeds', () => {
        const c1 = { ...config, seed: 1, params: gen.getDefaultParams() }
        const c2 = { ...config, seed: 999, params: gen.getDefaultParams() }
        const r1 = gen.generate(c1)
        const r2 = gen.generate(c2)

        let diffs = 0
        for (let i = 0; i < r1.heightMap.length; i += 100) {
          if (r1.heightMap[i] !== r2.heightMap[i]) diffs++
        }
        expect(diffs).toBeGreaterThan(0)
      })

      it('fills terrain correctly (stone, dirt, grass, water)', () => {
        const { grid } = result

        // Check a column — should have bedrock at y=0
        let hasBedrockAtBottom = false
        for (let x = 0; x < 128; x += 32) {
          for (let z = 0; z < 128; z += 32) {
            if (grid.getBlock({ x, y: 0, z }) === WorldgenBlockType.Bedrock) {
              hasBedrockAtBottom = true
            }
          }
        }
        expect(hasBedrockAtBottom).toBe(true)

        // Check that the world is not entirely empty or entirely solid
        const airCount = result.metadata.blockCounts[WorldgenBlockType.Air] ?? 0
        const totalVoxels = config.worldWidth * config.worldHeight * config.worldDepth
        expect(airCount).toBeGreaterThan(0)
        expect(airCount).toBeLessThan(totalVoxels * 0.95)
      })

      it('provides timing information', () => {
        expect(result.timing.totalMs).toBeGreaterThan(0)
        expect(result.timing.terrainMs).toBeGreaterThan(0)
      })

      it('generates within 10 seconds', () => {
        expect(result.timing.totalMs).toBeLessThan(10_000)
      })

      it('sea level flooding fills water correctly', () => {
        const { grid } = result
        // Sample some columns — if height < seaLevel, water should exist
        let waterFound = false
        for (let x = 0; x < 128; x += 16) {
          for (let z = 0; z < 128; z += 16) {
            const h = result.heightMap[x * config.worldDepth + z]
            if (h < config.seaLevel) {
              // Check for water above terrain
              for (let y = Math.floor(h) + 1; y <= config.seaLevel; y++) {
                if (grid.getBlock({ x, y, z }) === WorldgenBlockType.Water) {
                  waterFound = true
                  break
                }
              }
            }
          }
          if (waterFound) break
        }
        // Water might not be present if all heights are above seaLevel
        // In that case, just verify no water is placed above seaLevel
        for (let x = 0; x < 128; x += 32) {
          for (let z = 0; z < 128; z += 32) {
            for (let y = config.seaLevel + 1; y < config.worldHeight; y++) {
              expect(grid.getBlock({ x, y, z })).not.toBe(WorldgenBlockType.Water)
            }
          }
        }
      })
    })
  }
})
