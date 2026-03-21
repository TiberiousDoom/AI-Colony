import type { VoxelCoord, SmoothedWaypoint } from '../pathfinding/types.ts'
import type { NavigationHandle } from '../pathfinding/pathfinder-interface.ts'

export type AgentState = 'Idle' | 'Navigating' | 'Re-routing' | 'Waiting' | 'Falling' | 'Stuck'

export interface Agent {
  id: number
  position: VoxelCoord
  height: number
  destination: VoxelCoord | null
  state: AgentState
  speed: number
  moveProgress: number // 0 to 1, tick-based progress between voxels
  navigationHandle: NavigationHandle | null
  smoothedPath: SmoothedWaypoint[]
  pathAge: number
  landingTicksRemaining: number
  waitTicks: number
}

let nextAgentId = 1

export function createAgent(position: VoxelCoord, height: number = 2): Agent {
  return {
    id: nextAgentId++,
    position,
    height,
    destination: null,
    state: 'Idle',
    speed: 1.0,
    moveProgress: 0,
    navigationHandle: null,
    smoothedPath: [],
    pathAge: 0,
    landingTicksRemaining: 0,
    waitTicks: 0,
  }
}

export function resetAgentIdCounter(): void {
  nextAgentId = 1
}
