import { isSolidBlock } from './block-types.ts'
import type { VoxelGrid } from './voxel-grid.ts'
import type { VoxelCoord } from '../pathfinding/types.ts'

export const LANDING_PAUSE_TICKS = 3

export function hasGroundBelow(grid: VoxelGrid, pos: VoxelCoord): boolean {
  if (pos.y === 0) return true
  return isSolidBlock(grid.getBlock({ x: pos.x, y: pos.y - 1, z: pos.z }))
}

export function findGroundBelow(grid: VoxelGrid, pos: VoxelCoord): VoxelCoord | null {
  for (let y = pos.y - 1; y >= 0; y--) {
    if (isSolidBlock(grid.getBlock({ x: pos.x, y, z: pos.z }))) {
      return { x: pos.x, y: y + 1, z: pos.z }
    }
  }
  // World floor
  if (pos.y > 0) {
    return { x: pos.x, y: 0, z: pos.z }
  }
  return null
}
