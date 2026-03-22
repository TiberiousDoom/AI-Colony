import { createRNG } from '../../shared/seed.ts'
import { createNoise2D, fractalNoise } from '../../shared/noise.ts'
import { WorldgenGrid } from '../world/worldgen-grid.ts'
import { WorldgenBlockType } from '../world/block-types.ts'
import {
  type IWorldGenerator, type GenerationConfig, type GenerationResult,
  type ParamDesc, createEmptyTiming, computeMetadata, BiomeType,
} from './generator-interface.ts'

export class MultiPassSculptingGenerator implements IWorldGenerator {
  readonly name = 'Multi-Pass Sculpting'
  readonly id = 'multi-pass-sculpting'

  getDefaultParams(): Record<string, number> {
    return {
      continentFreq: 0.008,
      continentAmp: 15,
      ridgeFreq: 0.03,
      ridgeAmp: 12,
      baseHeight: 30,
      octaves: 4,
    }
  }

  getParamDescriptions(): Record<string, ParamDesc> {
    return {
      continentFreq: { label: 'Continent Freq',  min: 0.002, max: 0.02, step: 0.002 },
      continentAmp:  { label: 'Continent Amp',   min: 5, max: 25, step: 1 },
      ridgeFreq:     { label: 'Ridge Freq',      min: 0.01, max: 0.08, step: 0.005 },
      ridgeAmp:      { label: 'Ridge Amp',       min: 5, max: 25, step: 1 },
      baseHeight:    { label: 'Base Height',     min: 16, max: 48, step: 1 },
      octaves:       { label: 'Octaves',         min: 1, max: 8, step: 1 },
    }
  }

  generate(config: GenerationConfig): GenerationResult {
    const timing = createEmptyTiming()
    const totalStart = performance.now()
    const params = { ...this.getDefaultParams(), ...config.params }
    const rng = createRNG(config.seed)

    const continentNoise = createNoise2D(rng)
    const ridgeNoise = createNoise2D(rng.fork())

    const grid = new WorldgenGrid(config.worldWidth, config.worldHeight, config.worldDepth)
    const heightMap = new Float32Array(config.worldWidth * config.worldDepth)

    const terrainStart = performance.now()
    const { worldWidth, worldDepth, worldHeight } = grid

    for (let x = 0; x < worldWidth; x++) {
      for (let z = 0; z < worldDepth; z++) {
        // Pass 1: Continent shape (very low frequency)
        const continentVal = fractalNoise(
          continentNoise,
          x * params.continentFreq, z * params.continentFreq,
          params.octaves, 0.5, 2.0,
        )

        // Pass 2: Ridge noise for mountains (absolute value creates ridges)
        const ridgeVal = 1.0 - Math.abs(fractalNoise(
          ridgeNoise,
          x * params.ridgeFreq, z * params.ridgeFreq,
          params.octaves, 0.5, 2.0,
        ))
        // Square the ridge value to sharpen peaks
        const ridgeHeight = ridgeVal * ridgeVal * params.ridgeAmp

        // Combine passes
        const height = Math.floor(
          params.baseHeight + continentVal * params.continentAmp + ridgeHeight,
        )
        const clampedHeight = Math.max(1, Math.min(worldHeight - 1, height))
        heightMap[x * worldDepth + z] = clampedHeight

        for (let y = 0; y < worldHeight; y++) {
          if (y === 0) {
            grid.setBlock({ x, y, z }, WorldgenBlockType.Bedrock)
          } else if (y < clampedHeight - 3) {
            grid.setBlock({ x, y, z }, WorldgenBlockType.Stone)
          } else if (y < clampedHeight) {
            grid.setBlock({ x, y, z }, WorldgenBlockType.Dirt)
          } else if (y === clampedHeight) {
            grid.setBlock({ x, y, z }, WorldgenBlockType.Grass)
          } else if (y <= config.seaLevel) {
            grid.setBlock({ x, y, z }, WorldgenBlockType.Water)
          }
        }
      }
    }
    timing.terrainMs = performance.now() - terrainStart

    const biomeMap = new Uint8Array(config.worldWidth * config.worldDepth)
    biomeMap.fill(BiomeType.Plains)

    timing.totalMs = performance.now() - totalStart
    const metadata = computeMetadata(grid, heightMap)

    return { grid, heightMap, biomeMap, timing, metadata }
  }
}
