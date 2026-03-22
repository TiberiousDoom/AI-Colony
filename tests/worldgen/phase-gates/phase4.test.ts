import { describe, it, expect } from 'vitest'
import { ALL_GENERATORS } from '../../../src/worldgen/generation/registry.ts'
import { createDefaultConfig } from '../../../src/worldgen/generation/generator-interface.ts'
import { createRNG } from '../../../src/shared/seed.ts'
import { analyzeTerrainMetrics } from '../../../src/worldgen/analysis/terrain-analyzer.ts'
import { analyzeBiomeStats } from '../../../src/worldgen/analysis/biome-stats.ts'
import { analyzeOreStats } from '../../../src/worldgen/analysis/ore-stats.ts'
import { analyzeNavigability } from '../../../src/worldgen/analysis/navigability.ts'

describe('Phase 4: Terrain Analysis', () => {
  const config = createDefaultConfig(42)
  const gen = ALL_GENERATORS[0] // Layered Perlin
  const result = gen.generate({ ...config, params: gen.getDefaultParams() })

  it('produces height distribution', () => {
    const metrics = analyzeTerrainMetrics(result.grid, result.heightMap, config.seaLevel)
    expect(metrics.heightDistribution.length).toBe(16)
    const totalHeight = metrics.heightDistribution.reduce((s, c) => s + c, 0)
    expect(totalHeight).toBe(config.worldWidth * config.worldDepth)
  })

  it('produces slope distribution', () => {
    const metrics = analyzeTerrainMetrics(result.grid, result.heightMap, config.seaLevel)
    expect(metrics.slopeDistribution.length).toBe(10)
    const total = metrics.slopeDistribution.reduce((s, c) => s + c, 0)
    expect(total).toBeGreaterThan(0)
  })

  it('computes surface roughness', () => {
    const metrics = analyzeTerrainMetrics(result.grid, result.heightMap, config.seaLevel)
    expect(metrics.surfaceRoughness).toBeGreaterThan(0)
  })

  it('computes water coverage', () => {
    const metrics = analyzeTerrainMetrics(result.grid, result.heightMap, config.seaLevel)
    expect(metrics.waterCoverage).toBeGreaterThanOrEqual(0)
    expect(metrics.waterCoverage).toBeLessThanOrEqual(1)
  })
})

describe('Phase 4: Biome Stats', () => {
  const config = createDefaultConfig(42)
  const gen = ALL_GENERATORS[0]
  const result = gen.generate({ ...config, params: gen.getDefaultParams() })

  it('computes biome coverage', () => {
    const stats = analyzeBiomeStats(result.biomeMap, config.worldWidth, config.worldDepth)
    const totalCoverage = Object.values(stats.coverage).reduce((s, c) => s + c, 0)
    expect(totalCoverage).toBeCloseTo(1, 1)
  })

  it('counts biome regions', () => {
    const stats = analyzeBiomeStats(result.biomeMap, config.worldWidth, config.worldDepth)
    const totalRegions = Object.values(stats.regionCount).reduce((s, c) => s + c, 0)
    expect(totalRegions).toBeGreaterThan(0)
    expect(stats.avgRegionSize).toBeGreaterThan(0)
  })
})

describe('Phase 4: Ore Stats', () => {
  const config = createDefaultConfig(42)
  const gen = ALL_GENERATORS[0]
  const result = gen.generate({ ...config, params: gen.getDefaultParams() })

  it('counts ores by type and depth', () => {
    const stats = analyzeOreStats(result.grid)
    const totalOres = Object.values(stats.totalByType).reduce((s, c) => s + c, 0)
    expect(totalOres).toBeGreaterThan(0)
  })

  it('counts accessible ores', () => {
    const stats = analyzeOreStats(result.grid)
    expect(stats.accessibleCount).toBeGreaterThanOrEqual(0)
  })
})

describe('Phase 4: Navigability Analysis', () => {
  const config = createDefaultConfig(42)

  for (const gen of ALL_GENERATORS) {
    it(`${gen.name}: returns valid navigability scores`, { timeout: 30_000 }, () => {
      const result = gen.generate({ ...config, params: gen.getDefaultParams() })
      const rng = createRNG(42)
      const nav = analyzeNavigability(result.grid, result.heightMap, rng, config.seaLevel, 15)

      expect(nav.successRate).toBeGreaterThanOrEqual(0)
      expect(nav.successRate).toBeLessThanOrEqual(1)
      expect(nav.navigabilityScore).toBeGreaterThan(0)
      expect(nav.navigabilityScore).toBeLessThanOrEqual(1)
      expect(nav.isolatedRegionCount).toBeGreaterThan(0)
      expect(nav.reachabilityMap.length).toBe(config.worldWidth * config.worldDepth)
    })
  }

  it('different seeds produce different navigability', () => {
    const gen = ALL_GENERATORS[0]
    const r1 = gen.generate({ ...createDefaultConfig(1), params: gen.getDefaultParams() })
    const r2 = gen.generate({ ...createDefaultConfig(999), params: gen.getDefaultParams() })
    const n1 = analyzeNavigability(r1.grid, r1.heightMap, createRNG(1), 32, 10)
    const n2 = analyzeNavigability(r2.grid, r2.heightMap, createRNG(999), 32, 10)
    // Scores should differ (not identical terrain)
    expect(n1.isolatedRegionCount !== n2.isolatedRegionCount || n1.successRate !== n2.successRate).toBe(true)
  })
})

describe('Phase 4: Parameter Changes Affect Output', () => {
  it('changing frequency changes terrain', () => {
    const gen = ALL_GENERATORS.find(g => g.id === 'layered-perlin')!
    const config = createDefaultConfig(42)
    const r1 = gen.generate({ ...config, params: { ...gen.getDefaultParams(), frequency: 0.01 } })
    const r2 = gen.generate({ ...config, params: { ...gen.getDefaultParams(), frequency: 0.05 } })

    let diffs = 0
    for (let i = 0; i < r1.heightMap.length; i += 100) {
      if (r1.heightMap[i] !== r2.heightMap[i]) diffs++
    }
    expect(diffs).toBeGreaterThan(0)
  })
})
