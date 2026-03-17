import type { Agent } from './agent.ts'
import type { VoxelCoord } from '../pathfinding/types.ts'
import { voxelEquals, voxelKey } from '../pathfinding/types.ts'
import type { IPathfinder, IPathSmoother } from '../pathfinding/pathfinder-interface.ts'
import { hasGroundBelow, findGroundBelow, LANDING_PAUSE_TICKS } from '../world/gravity.ts'
import type { VoxelGrid } from '../world/voxel-grid.ts'
import { isWalkable } from '../pathfinding/movement-rules.ts'

export class AgentManager {
  private agents: Agent[] = []
  private pathfinder: IPathfinder
  private smoother: IPathSmoother
  private grid: VoxelGrid

  constructor(pathfinder: IPathfinder, smoother: IPathSmoother, grid: VoxelGrid) {
    this.pathfinder = pathfinder
    this.smoother = smoother
    this.grid = grid
  }

  addAgent(agent: Agent): void {
    this.agents.push(agent)
    this.agents.sort((a, b) => a.id - b.id)
  }

  removeAgent(agentId: number): void {
    const idx = this.agents.findIndex(a => a.id === agentId)
    if (idx >= 0) {
      const agent = this.agents[idx]
      if (agent.navigationHandle) {
        this.pathfinder.releaseNavigation(agent.navigationHandle)
      }
      this.agents.splice(idx, 1)
    }
  }

  getAgents(): ReadonlyArray<Agent> {
    return this.agents
  }

  getAgent(id: number): Agent | undefined {
    return this.agents.find(a => a.id === id)
  }

  getActiveAgentIds(): Set<number> {
    return new Set(this.agents.map(a => a.id))
  }

  assignDestination(agent: Agent, destination: VoxelCoord): void {
    if (agent.navigationHandle) {
      this.pathfinder.releaseNavigation(agent.navigationHandle)
      agent.navigationHandle = null
    }

    agent.destination = destination
    const handle = this.pathfinder.requestNavigation(
      agent.position,
      destination,
      agent.height,
      agent.id,
    )

    if (handle) {
      agent.navigationHandle = handle
      const path = handle.getPlannedPath(agent.position)
      if (path) {
        agent.smoothedPath = this.smoother.smooth(path, agent.height)
      }
      agent.state = handle.isComputing() ? 'Re-routing' : 'Navigating'
      agent.pathAge = 0
    } else {
      agent.state = 'Stuck'
      agent.navigationHandle = null
    }
  }

  /** Process destination invalidation: when destination becomes solid, retarget */
  handleDestinationInvalidation(agent: Agent): void {
    if (!agent.destination) return
    if (isWalkable(this.grid, agent.destination, agent.height)) return

    // BFS to find nearest walkable voxel
    const nearest = this.findNearestWalkable(agent.destination, agent.height)
    if (nearest) {
      this.assignDestination(agent, nearest)
    } else {
      agent.state = 'Stuck'
    }
  }

  private findNearestWalkable(origin: VoxelCoord, agentHeight: number): VoxelCoord | null {
    const visited = new Set<string>()
    const queue: VoxelCoord[] = [origin]
    visited.add(voxelKey(origin))

    const dirs = [
      { dx: 1, dy: 0, dz: 0 }, { dx: -1, dy: 0, dz: 0 },
      { dx: 0, dy: 1, dz: 0 }, { dx: 0, dy: -1, dz: 0 },
      { dx: 0, dy: 0, dz: 1 }, { dx: 0, dy: 0, dz: -1 },
    ]

    while (queue.length > 0) {
      const pos = queue.shift()!
      if (isWalkable(this.grid, pos, agentHeight)) return pos

      for (const d of dirs) {
        const next: VoxelCoord = { x: pos.x + d.dx, y: pos.y + d.dy, z: pos.z + d.dz }
        const key = voxelKey(next)
        if (!visited.has(key) && this.grid.isInBounds(next)) {
          visited.add(key)
          queue.push(next)
        }
      }

      if (visited.size > 1000) break // safety limit
    }

    return null
  }

  /** Per-tick update — agents processed in ascending ID order */
  update(): void {
    for (const agent of this.agents) {
      this.updateAgent(agent)
    }
  }

  private updateAgent(agent: Agent): void {
    // Handle gravity
    if (agent.state === 'Falling') {
      this.processFalling(agent)
      return
    }

    if (agent.landingTicksRemaining > 0) {
      agent.landingTicksRemaining--
      if (agent.landingTicksRemaining === 0) {
        // Re-path after landing
        if (agent.destination) {
          this.assignDestination(agent, agent.destination)
        } else {
          agent.state = 'Idle'
        }
      }
      return
    }

    // Check if ground disappeared
    if (!hasGroundBelow(this.grid, agent.position) && agent.position.y > 0) {
      agent.state = 'Falling'
      if (agent.navigationHandle) {
        this.pathfinder.releaseNavigation(agent.navigationHandle)
        agent.navigationHandle = null
      }
      return
    }

    // Check destination invalidation
    if (agent.destination) {
      this.handleDestinationInvalidation(agent)
    }

    switch (agent.state) {
      case 'Idle':
        break

      case 'Navigating':
        this.processNavigation(agent)
        break

      case 'Re-routing':
        this.processRerouting(agent)
        break

      case 'Waiting':
        agent.waitTicks++
        if (agent.waitTicks >= 5 && agent.destination) {
          this.assignDestination(agent, agent.destination)
        }
        break

      case 'Stuck':
        break
    }
  }

  private processNavigation(agent: Agent): void {
    if (!agent.navigationHandle) {
      agent.state = 'Idle'
      return
    }

    if (!agent.navigationHandle.isValid()) {
      agent.state = 'Re-routing'
      if (agent.destination) {
        this.assignDestination(agent, agent.destination)
      }
      return
    }

    const next = agent.navigationHandle.getNextVoxel(agent.position)
    if (!next) {
      // Arrived or no more path
      if (agent.destination && voxelEquals(agent.position, agent.destination)) {
        this.pathfinder.releaseNavigation(agent.navigationHandle)
        agent.navigationHandle = null
        agent.destination = null
        agent.state = 'Idle'
      }
      return
    }

    agent.position = next
    agent.pathAge++
  }

  private processRerouting(agent: Agent): void {
    if (!agent.navigationHandle) return

    if (agent.navigationHandle.isComputing()) {
      // Still computing, wait
      return
    }

    // Computation finished, switch to navigating
    agent.state = 'Navigating'
    const path = agent.navigationHandle.getPlannedPath(agent.position)
    if (path) {
      agent.smoothedPath = this.smoother.smooth(path, agent.height)
    }
  }

  private processFalling(agent: Agent): void {
    const ground = findGroundBelow(this.grid, agent.position)
    if (ground) {
      agent.position = ground
      agent.state = 'Idle' // landed — pause ticks handle the recovery delay
      agent.landingTicksRemaining = LANDING_PAUSE_TICKS
    }
  }
}
