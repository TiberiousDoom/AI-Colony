import type { WorldgenGrid } from '../world/worldgen-grid.ts'
import { WorldgenBlockType } from '../world/block-types.ts'

export interface OreStats {
  densityByDepth: Record<number, number[]>  // ore type -> count per Y-bucket
  totalByType: Record<number, number>
  accessibleCount: number  // ore blocks adjacent to cave air
}

const ORE_TYPES = [
  WorldgenBlockType.Coal, WorldgenBlockType.Iron, WorldgenBlockType.Copper,
  WorldgenBlockType.Gold, WorldgenBlockType.Gem, WorldgenBlockType.Crystal,
]

export function analyzeOreStats(grid: WorldgenGrid): OreStats {
  const { worldWidth, worldHeight, worldDepth } = grid
  const bucketCount = 8
  const bucketSize = Math.ceil(worldHeight / bucketCount)

  const densityByDepth: Record<number, number[]> = {}
  const totalByType: Record<number, number> = {}
  let accessibleCount = 0

  for (const oreType of ORE_TYPES) {
    densityByDepth[oreType] = new Array(bucketCount).fill(0)
    totalByType[oreType] = 0
  }

  for (let x = 0; x < worldWidth; x += 2) {
    for (let y = 0; y < worldHeight; y++) {
      for (let z = 0; z < worldDepth; z += 2) {
        const block = grid.getBlock({ x, y, z })
        if (!ORE_TYPES.includes(block)) continue

        const bucket = Math.min(bucketCount - 1, Math.floor(y / bucketSize))
        densityByDepth[block][bucket] += 4 // scale for sampling
        totalByType[block] = (totalByType[block] ?? 0) + 4

        // Check if accessible (adjacent to air)
        for (const [dx, dy, dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
          if (grid.getBlock({ x: x + dx, y: y + dy, z: z + dz }) === WorldgenBlockType.Air) {
            accessibleCount += 4
            break
          }
        }
      }
    }
  }

  return { densityByDepth, totalByType, accessibleCount }
}
