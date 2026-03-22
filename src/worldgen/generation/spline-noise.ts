import { createRNG } from '../../shared/seed.ts'
import { createNoise2D, fractalNoise } from '../../shared/noise.ts'
import { WorldgenGrid } from '../world/worldgen-grid.ts'
import { WorldgenBlockType } from '../world/block-types.ts'
import { evaluateSpline, createDefaultHeightSpline } from '../utils/spline.ts'
import { carveCheeseAndSpaghetti } from './layers/cave-carver.ts'
import { assignBiomesMultiNoise } from './layers/biome-assignment.ts'
import {
  type IWorldGenerator, type GenerationConfig, type GenerationResult,
  type ParamDesc, createEmptyTiming, computeMetadata,
} from './generator-interface.ts'

export class SplineNoiseGenerator implements IWorldGenerator {
  readonly name = 'Spline-Noise'
  readonly id = 'spline-noise'

  getDefaultParams(): Record<string, number> {
    return {
      continentalFreq: 0.006,
      erosionFreq: 0.015,
      peaksFreq: 0.04,
      continentalWeight: 0.5,
      erosionWeight: 0.3,
      peaksWeight: 0.2,
      baseHeight: 10,
      heightScale: 50,
    }
  }

  getParamDescriptions(): Record<string, ParamDesc> {
    return {
      continentalFreq:   { label: 'Continental Freq',   min: 0.002, max: 0.02, step: 0.002 },
      erosionFreq:       { label: 'Erosion Freq',       min: 0.005, max: 0.05, step: 0.005 },
      peaksFreq:         { label: 'Peaks Freq',         min: 0.01, max: 0.1,  step: 0.005 },
      continentalWeight: { label: 'Continental Weight', min: 0.1, max: 1.0,  step: 0.1 },
      erosionWeight:     { label: 'Erosion Weight',     min: 0.0, max: 1.0,  step: 0.1 },
      peaksWeight:       { label: 'Peaks Weight',       min: 0.0, max: 1.0,  step: 0.1 },
      baseHeight:        { label: 'Base Height',        min: 5, max: 30,    step: 1 },
      heightScale:       { label: 'Height Scale',       min: 20, max: 60,   step: 5 },
    }
  }

  generate(config: GenerationConfig): GenerationResult {
    const timing = createEmptyTiming()
    const totalStart = performance.now()
    const params = { ...this.getDefaultParams(), ...config.params }
    const rng = createRNG(config.seed)

    const continentalNoise = createNoise2D(rng)
    const erosionNoise = createNoise2D(rng.fork())
    const peaksNoise = createNoise2D(rng.fork())
    const spline = createDefaultHeightSpline()

    const grid = new WorldgenGrid(config.worldWidth, config.worldHeight, config.worldDepth)
    const heightMap = new Float32Array(config.worldWidth * config.worldDepth)

    const terrainStart = performance.now()
    const { worldWidth, worldDepth, worldHeight } = grid

    for (let x = 0; x < worldWidth; x++) {
      for (let z = 0; z < worldDepth; z++) {
        const cVal = fractalNoise(continentalNoise, x * params.continentalFreq, z * params.continentalFreq, 3, 0.5, 2.0)
        const eVal = fractalNoise(erosionNoise, x * params.erosionFreq, z * params.erosionFreq, 3, 0.5, 2.0)
        const pVal = fractalNoise(peaksNoise, x * params.peaksFreq, z * params.peaksFreq, 2, 0.5, 2.0)

        const totalWeight = params.continentalWeight + params.erosionWeight + params.peaksWeight
        const combined = (
          cVal * params.continentalWeight +
          eVal * params.erosionWeight +
          pVal * params.peaksWeight
        ) / totalWeight

        const splineVal = evaluateSpline(spline, combined)

        const height = Math.floor(params.baseHeight + splineVal * params.heightScale)
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

    // Biomes: multi-noise selection
    const biomeStart = performance.now()
    const biomeMap = assignBiomesMultiNoise(grid, heightMap, rng.fork(), config.seaLevel)
    timing.biomesMs = performance.now() - biomeStart

    // Caves: Methods A+B combined (cheese + spaghetti)
    const caveStart = performance.now()
    carveCheeseAndSpaghetti(grid, heightMap, rng.fork())
    timing.cavesMs = performance.now() - caveStart

    timing.totalMs = performance.now() - totalStart
    const metadata = computeMetadata(grid, heightMap)

    return { grid, heightMap, biomeMap, timing, metadata }
  }
}
