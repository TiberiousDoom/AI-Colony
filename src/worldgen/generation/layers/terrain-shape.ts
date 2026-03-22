import { WorldgenBlockType } from '../../world/block-types.ts'
import type { WorldgenGrid } from '../../world/worldgen-grid.ts'
import { fractalNoise } from '../../../shared/noise.ts'

export interface TerrainShapeParams {
  octaves: number
  frequency: number
  amplitude: number
  baseHeight: number
  seaLevel: number
}

/**
 * Generates a height map using 2D fractal noise and fills the grid.
 * Returns the height map as Float32Array of size width * depth.
 */
export function generateTerrainShape(
  grid: WorldgenGrid,
  noise2D: (x: number, y: number) => number,
  params: TerrainShapeParams,
): Float32Array {
  const { worldWidth, worldDepth, worldHeight } = grid
  const heightMap = new Float32Array(worldWidth * worldDepth)

  for (let x = 0; x < worldWidth; x++) {
    for (let z = 0; z < worldDepth; z++) {
      const nx = x * params.frequency
      const nz = z * params.frequency
      const noiseVal = fractalNoise(noise2D, nx, nz, params.octaves, 0.5, 2.0)

      // Map [-1,1] noise to height
      const height = Math.floor(params.baseHeight + noiseVal * params.amplitude)
      const clampedHeight = Math.max(1, Math.min(worldHeight - 1, height))
      heightMap[x * worldDepth + z] = clampedHeight

      // Fill column
      for (let y = 0; y < worldHeight; y++) {
        if (y === 0) {
          grid.setBlock({ x, y, z }, WorldgenBlockType.Bedrock)
        } else if (y < clampedHeight - 3) {
          grid.setBlock({ x, y, z }, WorldgenBlockType.Stone)
        } else if (y < clampedHeight) {
          grid.setBlock({ x, y, z }, WorldgenBlockType.Dirt)
        } else if (y === clampedHeight) {
          grid.setBlock({ x, y, z }, WorldgenBlockType.Grass)
        } else if (y <= params.seaLevel) {
          grid.setBlock({ x, y, z }, WorldgenBlockType.Water)
        }
        // else Air (default)
      }
    }
  }

  return heightMap
}
