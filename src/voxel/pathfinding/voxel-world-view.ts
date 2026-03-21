import { BlockType } from '../world/block-types.ts'
import type { VoxelGrid } from '../world/voxel-grid.ts'
import type { VoxelCoord } from './types.ts'
import type { Neighbor } from './movement-rules.ts'

export interface VoxelWorldView {
  isWalkable(pos: VoxelCoord, agentHeight: number): boolean
  isSolid(pos: VoxelCoord): boolean
  getBlockType(pos: VoxelCoord): BlockType
  getNeighbors(pos: VoxelCoord, agentHeight: number): Neighbor[]
  /** Access the underlying voxel grid (needed by flow field layer system) */
  getGrid(): VoxelGrid
}
