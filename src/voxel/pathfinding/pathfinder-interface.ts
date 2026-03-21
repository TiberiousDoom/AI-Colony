import type { VoxelCoord, ChunkCoord, SmoothedWaypoint } from './types.ts'

export interface TerrainChangeEvent {
  chunkCoords: ChunkCoord[]
  changedVoxels: VoxelCoord[]
  changeType: 'remove' | 'add'
  tick: number
}

export interface MemoryReport {
  sharedBytes: number
  peakBytes: number
}

export interface NavigationHandle {
  getNextVoxel(currentPosition: VoxelCoord): VoxelCoord | null
  isValid(): boolean
  isComputing(): boolean
  getPlannedPath(currentPosition: VoxelCoord): VoxelCoord[] | null
  getDebugInfo(): Record<string, string | number>
  getHandleMemory(): number
}

export interface IPathfinder {
  requestNavigation(
    start: VoxelCoord,
    destination: VoxelCoord,
    agentHeight: number,
    agentId: number,
    maxComputeMs?: number,
  ): NavigationHandle | null

  invalidateRegion(event: TerrainChangeEvent): void
  releaseNavigation(handle: NavigationHandle): void
  getMemoryUsage(): MemoryReport
  sweepLeakedHandles(activeAgentIds: Set<number>): number
}

export interface IPathSmoother {
  smooth(rawPath: VoxelCoord[], agentHeight: number): SmoothedWaypoint[]
  isValid(smoothedPath: SmoothedWaypoint[], agentHeight: number): boolean
}

export class PassthroughSmoother implements IPathSmoother {
  smooth(rawPath: VoxelCoord[]): SmoothedWaypoint[] {
    return rawPath.map(p => ({
      x: p.x,
      y: p.y,
      z: p.z,
      moveType: 'walk' as const,
    }))
  }

  isValid(): boolean {
    return true
  }
}
