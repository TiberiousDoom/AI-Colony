import { createRNG } from '../../shared/seed.ts'
import { createNoise2D } from '../../shared/noise.ts'
import { WorldgenGrid } from '../world/worldgen-grid.ts'
import { WorldgenBlockType } from '../world/block-types.ts'
import { generateTerrainShape } from './layers/terrain-shape.ts'
import {
  type IWorldGenerator, type GenerationConfig, type GenerationResult,
  type ParamDesc, createEmptyTiming, computeMetadata, BiomeType,
} from './generator-interface.ts'

/**
 * Algorithm 5: Grammar Hybrid
 * Uses noise for base terrain (like Layered Perlin) then carves
 * grammar-generated structures underground.
 * Phase 1: places a single test room as proof of concept.
 */
export class GrammarHybridGenerator implements IWorldGenerator {
  readonly name = 'Grammar Hybrid'
  readonly id = 'grammar-hybrid'

  getDefaultParams(): Record<string, number> {
    return {
      octaves: 4,
      frequency: 0.02,
      amplitude: 20,
      baseHeight: 32,
      roomCount: 3,
      roomMinSize: 6,
      roomMaxSize: 12,
    }
  }

  getParamDescriptions(): Record<string, ParamDesc> {
    return {
      octaves:     { label: 'Octaves',       min: 1, max: 8,  step: 1 },
      frequency:   { label: 'Frequency',     min: 0.005, max: 0.1, step: 0.005 },
      amplitude:   { label: 'Amplitude',     min: 5, max: 30, step: 1 },
      baseHeight:  { label: 'Base Height',   min: 16, max: 48, step: 1 },
      roomCount:   { label: 'Room Count',    min: 1, max: 10, step: 1 },
      roomMinSize: { label: 'Room Min Size', min: 4, max: 10, step: 1 },
      roomMaxSize: { label: 'Room Max Size', min: 6, max: 16, step: 1 },
    }
  }

  generate(config: GenerationConfig): GenerationResult {
    const timing = createEmptyTiming()
    const totalStart = performance.now()
    const params = { ...this.getDefaultParams(), ...config.params }
    const rng = createRNG(config.seed)
    const noise2D = createNoise2D(rng)
    const grid = new WorldgenGrid(config.worldWidth, config.worldHeight, config.worldDepth)

    // Phase 1: Generate base terrain
    const terrainStart = performance.now()
    const heightMap = generateTerrainShape(grid, noise2D, {
      octaves: params.octaves,
      frequency: params.frequency,
      amplitude: params.amplitude,
      baseHeight: params.baseHeight,
      seaLevel: config.seaLevel,
    })
    timing.terrainMs = performance.now() - terrainStart

    // Phase 1: Carve simple rectangular rooms underground
    const structureRng = rng.fork()
    const roomCount = Math.floor(params.roomCount)
    for (let r = 0; r < roomCount; r++) {
      const roomW = structureRng.nextInt(params.roomMinSize, params.roomMaxSize)
      const roomH = structureRng.nextInt(4, 6)
      const roomD = structureRng.nextInt(params.roomMinSize, params.roomMaxSize)

      const rx = structureRng.nextInt(10, config.worldWidth - roomW - 10)
      const ry = structureRng.nextInt(3, 15) // Underground
      const rz = structureRng.nextInt(10, config.worldDepth - roomD - 10)

      for (let x = rx; x < rx + roomW && x < config.worldWidth; x++) {
        for (let y = ry; y < ry + roomH && y < config.worldHeight; y++) {
          for (let z = rz; z < rz + roomD && z < config.worldDepth; z++) {
            grid.setBlock({ x, y, z }, WorldgenBlockType.Air)
          }
        }
      }
    }

    const biomeMap = new Uint8Array(config.worldWidth * config.worldDepth)
    biomeMap.fill(BiomeType.Plains)

    timing.totalMs = performance.now() - totalStart
    const metadata = computeMetadata(grid, heightMap)

    return { grid, heightMap, biomeMap, timing, metadata }
  }
}
