import { isSolidBlock, isClimbable, isStair } from './block-types.ts'
import type { VoxelGrid } from './voxel-grid.ts'
import type { VoxelCoord } from '../pathfinding/types.ts'

export const LANDING_PAUSE_TICKS = 3

/** Check if a block supports an agent standing on it (solid, ladder, or stair) */
function supportsAgent(grid: VoxelGrid, pos: VoxelCoord): boolean {
  const block = grid.getBlock(pos)
  return isSolidBlock(block) || isClimbable(block) || isStair(block)
}

export function hasGroundBelow(grid: VoxelGrid, pos: VoxelCoord): boolean {
  if (pos.y === 0) return true
  const below = { x: pos.x, y: pos.y - 1, z: pos.z }
  if (supportsAgent(grid, below)) return true
  // Also check if the agent is currently ON a climbable/stair block
  const current = grid.getBlock(pos)
  if (isClimbable(current) || isStair(current)) return true
  return false
}

export function findGroundBelow(grid: VoxelGrid, pos: VoxelCoord): VoxelCoord | null {
  for (let y = pos.y - 1; y >= 0; y--) {
    const block = grid.getBlock({ x: pos.x, y, z: pos.z })
    if (isSolidBlock(block) || isClimbable(block) || isStair(block)) {
      return { x: pos.x, y: y + 1, z: pos.z }
    }
  }
  // World floor
  if (pos.y > 0) {
    return { x: pos.x, y: 0, z: pos.z }
  }
  return null
}
