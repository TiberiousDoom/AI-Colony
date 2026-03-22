import { createRNG } from '../../shared/seed.ts'
import { createNoise2D, fractalNoise } from '../../shared/noise.ts'
import { WorldgenGrid } from '../world/worldgen-grid.ts'
import { WorldgenBlockType } from '../world/block-types.ts'
import { carveAgentWorms } from './layers/cave-carver.ts'
import { assignBiomesFromTerrain } from './layers/biome-assignment.ts'
import { placeOres } from './layers/ore-placement.ts'
import { decorateSurface } from './layers/surface-decoration.ts'
import { placeSpawnPoints } from './layers/spawn-placement.ts'
import {
  type IWorldGenerator, type GenerationConfig, type GenerationResult,
  type ParamDesc, createEmptyTiming, computeMetadata,
} from './generator-interface.ts'

export class MultiPassSculptingGenerator implements IWorldGenerator {
  readonly name = 'Multi-Pass Sculpting'
  readonly id = 'multi-pass-sculpting'

  getDefaultParams(): Record<string, number> {
    return {
      continentFreq: 0.008, continentAmp: 15, ridgeFreq: 0.03, ridgeAmp: 12,
      baseHeight: 30, octaves: 4, wormCount: 8, wormSteps: 100,
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
      wormCount:     { label: 'Worm Count',      min: 5, max: 20, step: 5 },
      wormSteps:     { label: 'Worm Steps',      min: 50, max: 300, step: 50 },
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
        const continentVal = fractalNoise(continentNoise, x * params.continentFreq, z * params.continentFreq, params.octaves, 0.5, 2.0)
        const ridgeVal = 1.0 - Math.abs(fractalNoise(ridgeNoise, x * params.ridgeFreq, z * params.ridgeFreq, params.octaves, 0.5, 2.0))
        const ridgeHeight = ridgeVal * ridgeVal * params.ridgeAmp
        const clampedHeight = Math.max(1, Math.min(worldHeight - 1, Math.floor(params.baseHeight + continentVal * params.continentAmp + ridgeHeight)))
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
    const biomeMap = assignBiomesFromTerrain(grid, heightMap, rng.fork(), config.seaLevel)
    timing.biomesMs = performance.now() - biomeStart

    const caveStart = performance.now()
    carveAgentWorms(grid, heightMap, rng.fork(), params.wormCount, params.wormSteps, 1)
    timing.cavesMs = performance.now() - caveStart

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
