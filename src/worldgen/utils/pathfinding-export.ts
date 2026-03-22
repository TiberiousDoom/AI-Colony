/**
 * Export a WorldgenGrid region to a pathfinding-compatible VoxelGrid.
 * Crops a 32x32x32 region and maps WorldgenBlockType to pathfinding BlockType.
 */
import type { WorldgenGrid } from '../world/worldgen-grid.ts'
import { WorldgenBlockType } from '../world/block-types.ts'
import { VoxelGrid } from '../../voxel/world/voxel-grid.ts'
import { BlockType } from '../../voxel/world/block-types.ts'

export interface ExportOptions {
  startX: number
  startY: number
  startZ: number
  size: number  // 32
}

export function exportToPathfindingGrid(
  worldgenGrid: WorldgenGrid,
  options: ExportOptions = { startX: 48, startY: 0, startZ: 48, size: 32 },
): VoxelGrid {
  const { startX, startY, startZ, size } = options
  const pathGrid = new VoxelGrid(size)

  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      for (let z = 0; z < size; z++) {
        const wx = startX + x
        const wy = startY + y
        const wz = startZ + z

        const wBlock = worldgenGrid.getBlock({ x: wx, y: wy, z: wz })
        let pBlock: BlockType

        switch (wBlock) {
          case WorldgenBlockType.Air:
          case WorldgenBlockType.Water:
            pBlock = BlockType.Air
            break
          case WorldgenBlockType.Leaves:
          case WorldgenBlockType.DeadBush:
          case WorldgenBlockType.Flower:
            pBlock = BlockType.Air
            break
          default:
            pBlock = BlockType.Solid
            break
        }

        pathGrid.setBlock({ x, y, z }, pBlock)
      }
    }
  }

  return pathGrid
}
