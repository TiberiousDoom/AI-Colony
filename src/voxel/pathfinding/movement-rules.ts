import { BlockType, isSolidBlock, isClimbable, isStair } from '../world/block-types.ts'
import type { VoxelCoord } from './types.ts'
import type { VoxelGrid } from '../world/voxel-grid.ts'

export const DEFAULT_AGENT_HEIGHT = 2
export const MAX_DROP_HEIGHT = 3
export const LADDER_SPEED = 0.5
export const STAIR_SPEED = 0.7

export type MoveType = 'walk' | 'climb' | 'drop' | 'stair'

export interface Neighbor {
  coord: VoxelCoord
  cost: number
  moveType: MoveType
}

function hasFloor(grid: VoxelGrid, pos: VoxelCoord): boolean {
  if (pos.y === 0) return true // world floor
  return isSolidBlock(grid.getBlock({ x: pos.x, y: pos.y - 1, z: pos.z }))
}

function hasClearance(grid: VoxelGrid, pos: VoxelCoord, height: number): boolean {
  for (let dy = 0; dy < height; dy++) {
    const block = grid.getBlock({ x: pos.x, y: pos.y + dy, z: pos.z })
    if (isSolidBlock(block)) return false
  }
  return true
}

export function isWalkable(grid: VoxelGrid, pos: VoxelCoord, agentHeight: number): boolean {
  if (!grid.isInBounds(pos)) return false
  if (!hasFloor(grid, pos)) return false
  return hasClearance(grid, pos, agentHeight)
}

// Cardinal directions on XZ plane
const CARDINAL_DIRS: ReadonlyArray<{ dx: number; dz: number }> = [
  { dx: 1, dz: 0 },
  { dx: -1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: 0, dz: -1 },
]

export function getNeighbors(
  grid: VoxelGrid,
  pos: VoxelCoord,
  agentHeight: number,
): Neighbor[] {
  const neighbors: Neighbor[] = []

  for (const dir of CARDINAL_DIRS) {
    const nx = pos.x + dir.dx
    const nz = pos.z + dir.dz

    // Same-level walk
    const sameLevel: VoxelCoord = { x: nx, y: pos.y, z: nz }
    if (isWalkable(grid, sameLevel, agentHeight)) {
      neighbors.push({ coord: sameLevel, cost: 1, moveType: 'walk' })
      continue // if same-level works, skip step-up/down in this direction
    }

    // Step-up: destination is 1 higher
    const stepUp: VoxelCoord = { x: nx, y: pos.y + 1, z: nz }
    if (grid.isInBounds(stepUp) && isWalkable(grid, stepUp, agentHeight)) {
      // 4-voxel check: origin+agentHeight must be air (head clearance as we rise)
      const originAboveHead: VoxelCoord = { x: pos.x, y: pos.y + agentHeight, z: pos.z }
      if (grid.isInBounds(originAboveHead) && !isSolidBlock(grid.getBlock(originAboveHead))) {
        neighbors.push({ coord: stepUp, cost: 1.2, moveType: 'walk' })
        continue
      }
    }

    // Step-down / drop: destination is 1-3 lower
    for (let dropDist = 1; dropDist <= MAX_DROP_HEIGHT; dropDist++) {
      const dropDest: VoxelCoord = { x: nx, y: pos.y - dropDist, z: nz }
      if (!grid.isInBounds(dropDest)) continue
      if (!isWalkable(grid, dropDest, agentHeight)) continue
      // Check clearance at the edge (at original height, in the destination column)
      const edgePos: VoxelCoord = { x: nx, y: pos.y, z: nz }
      if (hasClearance(grid, edgePos, agentHeight)) {
        const cost = 1 + dropDist * 0.5
        neighbors.push({ coord: dropDest, cost, moveType: 'drop' })
        break // only shortest drop in this direction
      }
    }
  }

  // Ladder: up and down
  const currentBlock = grid.getBlock(pos)
  if (isClimbable(currentBlock)) {
    // Climb up
    const up: VoxelCoord = { x: pos.x, y: pos.y + 1, z: pos.z }
    if (grid.isInBounds(up)) {
      const upBlock = grid.getBlock(up)
      if (isClimbable(upBlock) || !isSolidBlock(upBlock)) {
        // Check clearance at top of agent at new position
        const topClear: VoxelCoord = { x: pos.x, y: pos.y + agentHeight, z: pos.z }
        if (!grid.isInBounds(topClear) || !isSolidBlock(grid.getBlock(topClear))) {
          neighbors.push({ coord: up, cost: 1 / LADDER_SPEED, moveType: 'climb' })
        }
      }
    }
    // Climb down
    const down: VoxelCoord = { x: pos.x, y: pos.y - 1, z: pos.z }
    if (grid.isInBounds(down) && pos.y > 0) {
      const downBlock = grid.getBlock(down)
      if (isClimbable(downBlock) || !isSolidBlock(downBlock)) {
        neighbors.push({ coord: down, cost: 1 / LADDER_SPEED, moveType: 'climb' })
      }
    }
  }

  // Stair traversal: check each cardinal direction for stair blocks
  for (const dir of CARDINAL_DIRS) {
    const nx = pos.x + dir.dx
    const nz = pos.z + dir.dz
    const stairPos: VoxelCoord = { x: nx, y: pos.y, z: nz }
    if (!grid.isInBounds(stairPos)) continue
    if (!isStair(grid.getBlock(stairPos))) continue

    // Stair takes us diagonally up: destination is 1 higher at (nx, y+1, nz)
    const dest: VoxelCoord = { x: nx, y: pos.y + 1, z: nz }
    if (grid.isInBounds(dest) && hasClearance(grid, dest, agentHeight)) {
      neighbors.push({ coord: dest, cost: 1 / STAIR_SPEED, moveType: 'stair' })
    }
  }

  return neighbors
}
