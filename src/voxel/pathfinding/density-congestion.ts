/**
 * Density-based congestion strategy for flow field agents.
 *
 * Flow field agents don't have planned future positions — they follow
 * flow vectors each tick. Instead of reservation tables, they use a
 * reactive density-based approach:
 *
 * 1. Check if the next voxel is occupied by another agent
 * 2. If blocked, wait in place
 * 3. After 5 ticks of waiting, attempt a sidestep (perpendicular to
 *    flow direction, dot product > 0.5 with ideal direction)
 * 4. After 20 ticks, forced scatter
 */

import type { VoxelCoord } from './types.ts'
import { manhattanDistance3D } from './types.ts'

export interface DensityConfig {
  /** Ticks before attempting a sidestep (default: 5) */
  waitEscalationTicks: number
  /** Ticks before forced scatter (default: 20) */
  forceScatterTicks: number
  /** Minimum agents in proximity to trigger group scatter (default: 3) */
  scatterGroupSize: number
  /** Manhattan distance for group scatter proximity check (default: 3) */
  scatterRadius: number
}

const DEFAULT_CONFIG: DensityConfig = {
  waitEscalationTicks: 5,
  forceScatterTicks: 20,
  scatterGroupSize: 3,
  scatterRadius: 3,
}

export class DensityCongestionManager {
  readonly config: DensityConfig

  constructor(config?: Partial<DensityConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Check if a target voxel is occupied by another agent.
   * Returns the blocking agent's ID, or -1 if clear.
   */
  isOccupied(
    target: VoxelCoord,
    selfId: number,
    agentPositions: ReadonlyArray<{ id: number; position: VoxelCoord }>,
  ): number {
    for (const agent of agentPositions) {
      if (agent.id === selfId) continue
      if (agent.position.x === target.x &&
          agent.position.y === target.y &&
          agent.position.z === target.z) {
        return agent.id
      }
    }
    return -1
  }

  /**
   * Compute a sidestep: find an adjacent voxel that is unoccupied
   * and whose direction from the current position has a dot product > 0.5
   * with the ideal flow direction.
   *
   * Returns the sidestep position, or null if no valid sidestep exists.
   */
  computeSidestep(
    currentPos: VoxelCoord,
    flowDx: number,
    flowDz: number,
    selfId: number,
    agentPositions: ReadonlyArray<{ id: number; position: VoxelCoord }>,
    isWalkable: (pos: VoxelCoord) => boolean,
  ): VoxelCoord | null {
    // Perpendicular directions to the flow
    const candidates: Array<{ pos: VoxelCoord; dot: number }> = []

    const dirs = [
      { dx: 1, dz: 0 },
      { dx: -1, dz: 0 },
      { dx: 0, dz: 1 },
      { dx: 0, dz: -1 },
    ]

    // Normalize flow direction for dot product
    const flowLen = Math.sqrt(flowDx * flowDx + flowDz * flowDz)
    if (flowLen === 0) return null
    const nfx = flowDx / flowLen
    const nfz = flowDz / flowLen

    for (const dir of dirs) {
      const pos: VoxelCoord = {
        x: currentPos.x + dir.dx,
        y: currentPos.y,
        z: currentPos.z + dir.dz,
      }

      if (!isWalkable(pos)) continue
      if (this.isOccupied(pos, selfId, agentPositions) >= 0) continue

      // Dot product between step direction and flow direction
      const dot = dir.dx * nfx + dir.dz * nfz
      if (dot > -0.5) { // Accept sidesteps that aren't directly backwards
        candidates.push({ pos, dot })
      }
    }

    if (candidates.length === 0) return null

    // Pick the candidate with highest dot product (most aligned with flow)
    candidates.sort((a, b) => b.dot - a.dot)
    return candidates[0].pos
  }

  /**
   * Check if a group scatter should trigger.
   * Returns true if scatterGroupSize+ agents are within scatterRadius
   * of the given position and all are in a waiting state.
   */
  shouldGroupScatter(
    pos: VoxelCoord,
    waitingAgents: ReadonlyArray<{ id: number; position: VoxelCoord }>,
  ): boolean {
    if (waitingAgents.length < this.config.scatterGroupSize) return false

    let nearbyCount = 0
    for (const agent of waitingAgents) {
      if (manhattanDistance3D(pos, agent.position) <= this.config.scatterRadius) {
        nearbyCount++
      }
      if (nearbyCount >= this.config.scatterGroupSize) return true
    }
    return false
  }
}
