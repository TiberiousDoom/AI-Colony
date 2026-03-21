import { isSolidBlock } from '../world/block-types.ts'
import type { BlockType } from '../world/block-types.ts'
import type { VoxelGrid } from '../world/voxel-grid.ts'
import type { VoxelCoord } from './types.ts'
import { isWalkable, getNeighbors } from './movement-rules.ts'
import type { Neighbor } from './movement-rules.ts'
import type { VoxelWorldView } from './voxel-world-view.ts'

export class GridWorldView implements VoxelWorldView {
  constructor(private grid: VoxelGrid) {}

  getGrid(): VoxelGrid {
    return this.grid
  }


  isWalkable(pos: VoxelCoord, agentHeight: number): boolean {
    return isWalkable(this.grid, pos, agentHeight)
  }

  isSolid(pos: VoxelCoord): boolean {
    return isSolidBlock(this.grid.getBlock(pos))
  }

  getBlockType(pos: VoxelCoord): BlockType {
    return this.grid.getBlock(pos)
  }

  getNeighbors(pos: VoxelCoord, agentHeight: number): Neighbor[] {
    return getNeighbors(this.grid, pos, agentHeight)
  }
}
