/**
 * Terrain analyzer — scans a VoxelGrid and produces a profile
 * used by AdaptivePathfinder to select the best algorithm.
 */

import type { VoxelGrid } from '../world/voxel-grid.ts'
import { BlockType, isSolidBlock, isClimbable, isStair } from '../world/block-types.ts'

export interface TerrainProfile {
  totalBlocks: number
  solidBlockCount: number
  verticalBlockCount: number
  distinctWalkableYLevels: number
  obstacleDensity: number
}

export function analyzeGrid(grid: VoxelGrid): TerrainProfile {
  const size = grid.worldSize
  let totalBlocks = 0
  let solidBlockCount = 0
  let verticalBlockCount = 0
  const walkableYLevels = new Set<number>()

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      for (let z = 0; z < size; z++) {
        const type = grid.getBlock({ x, y, z })
        if (type === BlockType.Air) continue

        totalBlocks++

        if (isSolidBlock(type)) {
          solidBlockCount++
          // A walkable floor: solid block with air above
          if (y + 1 < size && grid.getBlock({ x, y: y + 1, z }) === BlockType.Air) {
            walkableYLevels.add(y)
          }
        }

        if (isClimbable(type) || isStair(type)) {
          verticalBlockCount++
        }
      }
    }
  }

  const area = size * size
  const obstacleDensity = area > 0 ? solidBlockCount / area : 0

  return {
    totalBlocks,
    solidBlockCount,
    verticalBlockCount,
    distinctWalkableYLevels: walkableYLevels.size,
    obstacleDensity,
  }
}

export function isVerticallyComplex(profile: TerrainProfile): boolean {
  return profile.verticalBlockCount > 0 && profile.distinctWalkableYLevels >= 3
}
