import { createRNG } from '../../shared/seed.ts'
import { createNoise2D, fractalNoise } from '../../shared/noise.ts'
import { WorldgenGrid } from '../world/worldgen-grid.ts'
import { WorldgenBlockType } from '../world/block-types.ts'
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
import type { SeededRNG } from '../../shared/seed.ts'

export class GrammarHybridGenerator implements IWorldGenerator {
  readonly name = 'Grammar Hybrid'
  readonly id = 'grammar-hybrid'

  getDefaultParams(): Record<string, number> {
    return {
      octaves: 4, frequency: 0.02, amplitude: 16, baseHeight: 30,
      featureCount: 12, featureRadius: 10,
      caveThreshold: 0.06, maxExpansions: 8,
    }
  }

  getParamDescriptions(): Record<string, ParamDesc> {
    return {
      octaves:        { label: 'Octaves',         min: 1, max: 8,  step: 1 },
      frequency:      { label: 'Frequency',       min: 0.005, max: 0.1, step: 0.005 },
      amplitude:      { label: 'Amplitude',       min: 5, max: 30, step: 1 },
      baseHeight:     { label: 'Base Height',     min: 16, max: 48, step: 1 },
      featureCount:   { label: 'Feature Count',   min: 3, max: 20, step: 1 },
      featureRadius:  { label: 'Feature Radius',  min: 5, max: 20, step: 1 },
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
    const heightMap = generateGrammarTerrain(
      grid, noise2D, rng.fork(), params, config.seaLevel,
    )
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

/**
 * Grammar-driven terrain: base noise + stamped terrain features.
 * Features are placed via a grammar-like system: plateaus, valleys, craters,
 * and ridges are randomly scattered, creating terrain distinct from plain Perlin.
 */
function generateGrammarTerrain(
  grid: WorldgenGrid,
  noise2D: (x: number, y: number) => number,
  rng: SeededRNG,
  params: Record<string, number>,
  seaLevel: number,
): Float32Array {
  const { worldWidth, worldDepth, worldHeight } = grid
  const heightMap = new Float32Array(worldWidth * worldDepth)

  // Step 1: Base noise heightmap (lower amplitude than standard Perlin)
  for (let x = 0; x < worldWidth; x++) {
    for (let z = 0; z < worldDepth; z++) {
      const nx = x * params.frequency
      const nz = z * params.frequency
      const noiseVal = fractalNoise(noise2D, nx, nz, params.octaves, 0.5, 2.0)
      heightMap[x * worldDepth + z] = params.baseHeight + noiseVal * params.amplitude
    }
  }

  // Step 2: Stamp terrain features using grammar-style rules
  const featureTypes = ['plateau', 'valley', 'crater', 'ridge'] as const
  type FeatureType = typeof featureTypes[number]

  const featureCount = Math.floor(params.featureCount)
  const baseRadius = params.featureRadius

  for (let i = 0; i < featureCount; i++) {
    const type: FeatureType = featureTypes[rng.nextInt(0, featureTypes.length - 1)]
    const cx = rng.nextInt(8, worldWidth - 8)
    const cz = rng.nextInt(8, worldDepth - 8)
    const radius = rng.nextInt(Math.floor(baseRadius * 0.6), Math.floor(baseRadius * 1.4))
    const strength = rng.nextFloat(0.4, 1.0)

    for (let x = Math.max(0, cx - radius); x < Math.min(worldWidth, cx + radius); x++) {
      for (let z = Math.max(0, cz - radius); z < Math.min(worldDepth, cz + radius); z++) {
        const dx = x - cx, dz = z - cz
        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist >= radius) continue

        // Smooth falloff from center to edge
        const falloff = 1 - (dist / radius) * (dist / radius)
        const idx = x * worldDepth + z

        switch (type) {
          case 'plateau': {
            // Raise and flatten to a target height
            const targetH = params.baseHeight + 12 * strength
            const current = heightMap[idx]
            heightMap[idx] = current + (targetH - current) * falloff * 0.7
            break
          }
          case 'valley': {
            // Lower terrain into a bowl
            heightMap[idx] -= 8 * strength * falloff
            break
          }
          case 'crater': {
            // Ring shape: raised rim, depressed center
            const ringFalloff = Math.sin(dist / radius * Math.PI)
            const centerDepth = falloff * 6 * strength
            heightMap[idx] += ringFalloff * 4 * strength - centerDepth * 0.5
            break
          }
          case 'ridge': {
            // Linear ridge along a random angle
            const angle = rng.nextFloat(0, Math.PI)
            const perpDist = Math.abs(dx * Math.sin(angle) - dz * Math.cos(angle))
            const ridgeFalloff = Math.max(0, 1 - perpDist / (radius * 0.3))
            heightMap[idx] += ridgeFalloff * 8 * strength * falloff
            break
          }
        }
      }
    }
  }

  // Step 3: Clamp and fill grid
  for (let x = 0; x < worldWidth; x++) {
    for (let z = 0; z < worldDepth; z++) {
      const idx = x * worldDepth + z
      const clampedHeight = Math.max(1, Math.min(worldHeight - 1, Math.floor(heightMap[idx])))
      heightMap[idx] = clampedHeight

      for (let y = 0; y < worldHeight; y++) {
        if (y === 0) {
          grid.setBlock({ x, y, z }, WorldgenBlockType.Bedrock)
        } else if (y < clampedHeight - 3) {
          grid.setBlock({ x, y, z }, WorldgenBlockType.Stone)
        } else if (y < clampedHeight) {
          grid.setBlock({ x, y, z }, WorldgenBlockType.Dirt)
        } else if (y === clampedHeight) {
          grid.setBlock({ x, y, z }, WorldgenBlockType.Grass)
        } else if (y <= seaLevel) {
          grid.setBlock({ x, y, z }, WorldgenBlockType.Water)
        }
      }
    }
  }

  return heightMap
}
