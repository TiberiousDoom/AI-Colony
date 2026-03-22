import { createRNG } from '../../shared/seed.ts'
import { createNoise2D } from '../../shared/noise.ts'
import { WorldgenGrid } from '../world/worldgen-grid.ts'
import { generateTerrainShape } from './layers/terrain-shape.ts'
import {
  type IWorldGenerator, type GenerationConfig, type GenerationResult,
  type ParamDesc, createEmptyTiming, computeMetadata, BiomeType,
} from './generator-interface.ts'

export class LayeredPerlinGenerator implements IWorldGenerator {
  readonly name = 'Layered Perlin'
  readonly id = 'layered-perlin'

  getDefaultParams(): Record<string, number> {
    return {
      octaves: 4,
      frequency: 0.02,
      amplitude: 20,
      baseHeight: 32,
    }
  }

  getParamDescriptions(): Record<string, ParamDesc> {
    return {
      octaves:    { label: 'Octaves',    min: 1, max: 8,    step: 1 },
      frequency:  { label: 'Frequency',  min: 0.005, max: 0.1, step: 0.005 },
      amplitude:  { label: 'Amplitude',  min: 5, max: 30,   step: 1 },
      baseHeight: { label: 'Base Height', min: 16, max: 48,  step: 1 },
    }
  }

  generate(config: GenerationConfig): GenerationResult {
    const timing = createEmptyTiming()
    const totalStart = performance.now()
    const params = { ...this.getDefaultParams(), ...config.params }
    const rng = createRNG(config.seed)
    const noise2D = createNoise2D(rng)
    const grid = new WorldgenGrid(config.worldWidth, config.worldHeight, config.worldDepth)

    const terrainStart = performance.now()
    const heightMap = generateTerrainShape(grid, noise2D, {
      octaves: params.octaves,
      frequency: params.frequency,
      amplitude: params.amplitude,
      baseHeight: params.baseHeight,
      seaLevel: config.seaLevel,
    })
    timing.terrainMs = performance.now() - terrainStart

    // Placeholder biome map (all Plains for Phase 1)
    const biomeMap = new Uint8Array(config.worldWidth * config.worldDepth)
    biomeMap.fill(BiomeType.Plains)
    timing.biomesMs = 0

    timing.totalMs = performance.now() - totalStart
    const metadata = computeMetadata(grid, heightMap)

    return { grid, heightMap, biomeMap, timing, metadata }
  }
}
