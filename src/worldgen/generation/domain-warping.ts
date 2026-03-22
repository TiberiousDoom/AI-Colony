import { createRNG } from '../../shared/seed.ts'
import { createNoise2D, fractalNoise } from '../../shared/noise.ts'
import { WorldgenGrid } from '../world/worldgen-grid.ts'
import { WorldgenBlockType } from '../world/block-types.ts'
import { carveSpaghetti } from './layers/cave-carver.ts'
import { assignBiomesWarped } from './layers/biome-assignment.ts'
import { generateWaterFeatures } from './layers/water-features.ts'
import { placeOres } from './layers/ore-placement.ts'
import { decorateSurface } from './layers/surface-decoration.ts'
import { placeSpawnPoints } from './layers/spawn-placement.ts'
import {
  type IWorldGenerator, type GenerationConfig, type GenerationResult,
  type ParamDesc, createEmptyTiming, computeMetadata,
} from './generator-interface.ts'

export class DomainWarpingGenerator implements IWorldGenerator {
  readonly name = 'Domain Warping'
  readonly id = 'domain-warping'

  getDefaultParams(): Record<string, number> {
    return {
      octaves: 4, frequency: 0.02, amplitude: 20, baseHeight: 32,
      warpStrength: 30, warpFrequency: 0.01, warpOctaves: 3, caveThreshold: 0.06,
    }
  }

  getParamDescriptions(): Record<string, ParamDesc> {
    return {
      octaves:        { label: 'Octaves',         min: 1, max: 8,    step: 1 },
      frequency:      { label: 'Frequency',       min: 0.005, max: 0.1, step: 0.005 },
      amplitude:      { label: 'Amplitude',       min: 5, max: 30,   step: 1 },
      baseHeight:     { label: 'Base Height',     min: 16, max: 48,  step: 1 },
      warpStrength:   { label: 'Warp Strength',   min: 5, max: 60,   step: 5 },
      warpFrequency:  { label: 'Warp Frequency',  min: 0.005, max: 0.05, step: 0.005 },
      warpOctaves:    { label: 'Warp Octaves',    min: 1, max: 5,    step: 1 },
      caveThreshold:  { label: 'Cave Threshold',  min: 0.01, max: 0.08, step: 0.005 },
    }
  }

  generate(config: GenerationConfig): GenerationResult {
    const timing = createEmptyTiming()
    const totalStart = performance.now()
    const params = { ...this.getDefaultParams(), ...config.params }
    const rng = createRNG(config.seed)

    const terrainNoise = createNoise2D(rng)
    const warpNoiseX = createNoise2D(rng.fork())
    const warpNoiseZ = createNoise2D(rng.fork())
    const grid = new WorldgenGrid(config.worldWidth, config.worldHeight, config.worldDepth)
    const heightMap = new Float32Array(config.worldWidth * config.worldDepth)

    const terrainStart = performance.now()
    const { worldWidth, worldDepth, worldHeight } = grid
    for (let x = 0; x < worldWidth; x++) {
      for (let z = 0; z < worldDepth; z++) {
        const wx = x * params.warpFrequency, wz = z * params.warpFrequency
        const dx = fractalNoise(warpNoiseX, wx, wz, params.warpOctaves, 0.5, 2.0) * params.warpStrength
        const dz = fractalNoise(warpNoiseZ, wx, wz, params.warpOctaves, 0.5, 2.0) * params.warpStrength
        const nx = (x + dx) * params.frequency, nz = (z + dz) * params.frequency
        const noiseVal = fractalNoise(terrainNoise, nx, nz, params.octaves, 0.5, 2.0)
        const clampedHeight = Math.max(1, Math.min(worldHeight - 1, Math.floor(params.baseHeight + noiseVal * params.amplitude)))
        heightMap[x * worldDepth + z] = clampedHeight
        for (let y = 0; y < worldHeight; y++) {
          if (y === 0) grid.setBlock({ x, y, z }, WorldgenBlockType.Bedrock)
          else if (y < clampedHeight - 3) grid.setBlock({ x, y, z }, WorldgenBlockType.Stone)
          else if (y < clampedHeight) grid.setBlock({ x, y, z }, WorldgenBlockType.Dirt)
          else if (y === clampedHeight) grid.setBlock({ x, y, z }, WorldgenBlockType.Grass)
          else if (y <= config.seaLevel) grid.setBlock({ x, y, z }, WorldgenBlockType.Water)
        }
      }
    }
    timing.terrainMs = performance.now() - terrainStart

    const biomeStart = performance.now()
    const biomeMap = assignBiomesWarped(grid, heightMap, rng.fork(), config.seaLevel, params.warpStrength * 0.5)
    timing.biomesMs = performance.now() - biomeStart

    const caveStart = performance.now()
    carveSpaghetti(grid, heightMap, rng.fork(), params.caveThreshold)
    timing.cavesMs = performance.now() - caveStart

    const waterStart = performance.now()
    generateWaterFeatures(grid, heightMap, biomeMap, rng.fork(), config.seaLevel)
    timing.waterMs = performance.now() - waterStart

    const oreStart = performance.now()
    placeOres(grid, heightMap, rng.fork())
    timing.oresMs = performance.now() - oreStart

    const decoStart = performance.now()
    decorateSurface(grid, heightMap, biomeMap, rng.fork(), config.seaLevel)
    timing.decorationMs = performance.now() - decoStart

    const spawnStart = performance.now()
    const spawnPoints = placeSpawnPoints(grid, heightMap, biomeMap, rng.fork(), config.seaLevel)
    timing.spawnsMs = performance.now() - spawnStart

    timing.totalMs = performance.now() - totalStart
    const metadata = computeMetadata(grid, heightMap)
    return { grid, heightMap, biomeMap, spawnPoints, timing, metadata }
  }
}
