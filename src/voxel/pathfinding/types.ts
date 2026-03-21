export interface VoxelCoord {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface ChunkCoord {
  readonly cx: number
  readonly cy: number
  readonly cz: number
}

export type MoveType = 'walk' | 'climb' | 'drop' | 'jump' | 'stair'

export interface SmoothedWaypoint {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly moveType: MoveType
}

export function voxelKey(pos: VoxelCoord): string {
  return `${pos.x},${pos.y},${pos.z}`
}

export function voxelEquals(a: VoxelCoord, b: VoxelCoord): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z
}

export function manhattanDistance3D(a: VoxelCoord, b: VoxelCoord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z)
}
