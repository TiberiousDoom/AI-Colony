// Re-export shared coordinate types for backward compatibility
export type { VoxelCoord, ChunkCoord } from '../../shared/types.ts'
export { voxelKey, voxelEquals, manhattanDistance3D } from '../../shared/types.ts'

export type MoveType = 'walk' | 'climb' | 'drop' | 'jump' | 'stair'

export interface SmoothedWaypoint {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly moveType: MoveType
}
