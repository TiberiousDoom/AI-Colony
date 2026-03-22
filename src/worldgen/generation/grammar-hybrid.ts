import { createRNG } from '../../shared/seed.ts'
import { createNoise2D } from '../../shared/noise.ts'
import { WorldgenGrid } from '../world/worldgen-grid.ts'
import { generateTerrainShape } from './layers/terrain-shape.ts'
import { carveSpaghetti } from './layers/cave-carver.ts'
import { assignBiomes } from './layers/biome-assignment.ts'
import { placeOres } from './layers/ore-placement.ts'
import { decorateSurface } from './layers/surface-decoration.ts'
import { placeSpawnPoints } from './layers/spawn-placement.ts'
import { expandGrammar } from '../grammar/grammar-engine.ts'
import { placeStructures } from '../grammar/structure-placer.ts'
import {
  type IWorldGenerator, type GenerationConfig, type GenerationResult,
  type ParamDesc, createEmptyTiming, computeMetadata,
} from './generator-interface.ts'

export class GrammarHybridGenerator implements IWorldGenerator {
  readonly name = 'Grammar Hybrid'
  readonly id = 'grammar-hybrid'

  getDefaultParams(): Record<string, number> {
    return {
      octaves: 4, frequency: 0.02, amplitude: 20, baseHeight: 32,
      caveThreshold: 0.03, maxExpansions: 8,
    }
  }

  getParamDescriptions(): Record<string, ParamDesc> {
    return {
      octaves:        { label: 'Octaves',         min: 1, max: 8,  step: 1 },
      frequency:      { label: 'Frequency',       min: 0.005, max: 0.1, step: 0.005 },
      amplitude:      { label: 'Amplitude',       min: 5, max: 30, step: 1 },
      baseHeight:     { label: 'Base Height',     min: 16, max: 48, step: 1 },
      caveThreshold:  { label: 'Cave Threshold',  min: 0.01, max: 0.08, step: 0.005 },
      maxExpansions:  { label: 'Max Rooms',       min: 3, max: 15, step: 1 },
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
      octaves: params.octaves, frequency: params.frequency,
      amplitude: params.amplitude, baseHeight: params.baseHeight, seaLevel: config.seaLevel,
    })
    timing.terrainMs = performance.now() - terrainStart

    const biomeStart = performance.now()
    const biomeMap = assignBiomes(grid, heightMap, rng.fork(), config.seaLevel)
    timing.biomesMs = performance.now() - biomeStart

    // Caves: spaghetti + grammar structures
    const caveStart = performance.now()
    carveSpaghetti(grid, heightMap, rng.fork(), params.caveThreshold)

    // Grammar engine: expand and place structures underground
    const grammarRng = rng.fork()
    const startX = Math.floor(config.worldWidth / 2)
    const startZ = Math.floor(config.worldDepth / 2)
    const grammarResult = expandGrammar(
      grammarRng, startX, 5, startZ, Math.floor(params.maxExpansions),
      config.worldWidth, config.worldHeight, config.worldDepth,
    )
    placeStructures(grid, grammarResult)
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
