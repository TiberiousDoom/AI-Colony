import type { Agent } from './agent.ts'
import type { VoxelCoord } from '../pathfinding/types.ts'
import { voxelEquals, voxelKey, manhattanDistance3D } from '../pathfinding/types.ts'
import type { IPathfinder, IPathSmoother } from '../pathfinding/pathfinder-interface.ts'
import { HybridHandle } from '../pathfinding/hybrid-handle.ts'
import { hasGroundBelow, findGroundBelow, LANDING_PAUSE_TICKS } from '../world/gravity.ts'
import type { VoxelGrid } from '../world/voxel-grid.ts'
import { isWalkable } from '../pathfinding/movement-rules.ts'
import type { ReservationTable } from '../pathfinding/reservation-table.ts'
import type { EventLogger } from '../simulation/event-logger.ts'
import { DensityCongestionManager } from '../pathfinding/density-congestion.ts'

export type CongestionStrategy = 'reservation' | 'density' | 'hybrid'

export class AgentManager {
  private agents: Agent[] = []
  private pathfinder: IPathfinder
  private smoother: IPathSmoother
  private grid: VoxelGrid
  private reservationTable: ReservationTable | null
  private densityManager: DensityCongestionManager
  private congestionStrategy: CongestionStrategy
  private eventLogger: EventLogger | null = null
  private _waitEvents: number = 0
  private _totalWaitTicks: number = 0
  private _tripsCompleted: number = 0
  private _currentTick: number = 0
  private _reservationLookahead: number = 3

  constructor(
    pathfinder: IPathfinder,
    smoother: IPathSmoother,
    grid: VoxelGrid,
    reservationTable?: ReservationTable,
    congestionStrategy?: CongestionStrategy,
  ) {
    this.pathfinder = pathfinder
    this.smoother = smoother
    this.grid = grid
    this.reservationTable = reservationTable ?? null
    this.congestionStrategy = congestionStrategy ?? 'reservation'
    this.densityManager = new DensityCongestionManager()
  }

  get strategy(): CongestionStrategy { return this.congestionStrategy }

  /** Determine if an agent should use density congestion strategy */
  private usesDensityForAgent(agent: Agent): boolean {
    if (this.congestionStrategy === 'density') return true
    if (this.congestionStrategy === 'reservation') return false
    // Hybrid: check if agent's handle is on a flow field segment
    if (agent.navigationHandle instanceof HybridHandle) {
      return agent.navigationHandle.getActiveSubType() === 'flowfield'
    }
    return false
  }

  set reservationLookahead(ticks: number) {
    this._reservationLookahead = Math.max(1, Math.min(10, ticks))
  }

  get reservationLookahead(): number { return this._reservationLookahead }

  setEventLogger(logger: EventLogger): void {
    this.eventLogger = logger
  }

  setCurrentTick(tick: number): void {
    this._currentTick = tick
  }

  get waitEvents(): number { return this._waitEvents }
  get totalWaitTicks(): number { return this._totalWaitTicks }
  get tripsCompleted(): number { return this._tripsCompleted }

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
      this.cancelReservations(agent)
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
      agent.waitTicks = 0
      // Reserve next N ticks of planned positions
      this.reserveAgentPath(agent, this._reservationLookahead)
      this.eventLogger?.log(this._currentTick, 'destination_assigned', {
        agentId: agent.id,
        from: { ...agent.position },
        to: { ...destination },
        pathLength: path?.length ?? 0,
      })
    } else {
      agent.state = 'Stuck'
      agent.navigationHandle = null
      this.eventLogger?.log(this._currentTick, 'agent_stuck', {
        agentId: agent.id,
        position: { ...agent.position },
        destination: { ...destination },
      })
    }
  }

  /** Reserve the next N ticks of an agent's planned path */
  reserveAgentPath(agent: Agent, ticks: number, currentTick?: number): void {
    if (!this.reservationTable || !agent.navigationHandle) return
    const tick = currentTick ?? 0
    const path = agent.navigationHandle.getPlannedPath(agent.position)
    if (!path) return
    const positions: VoxelCoord[] = []
    for (let i = 0; i < Math.min(ticks, path.length); i++) {
      positions.push(path[i])
    }
    if (positions.length > 0) {
      for (let t = 0; t < ticks; t++) {
        const pos = positions[Math.min(t, positions.length - 1)]
        this.reservationTable.reserve(agent.id, tick + t, [pos])
      }
    }
  }

  /** Cancel an agent's reservations */
  cancelReservations(agent: Agent): void {
    if (this.reservationTable) {
      this.reservationTable.cancel(agent.id)
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
    this.checkGroupScatter()
  }

  /** Group scatter: if 3+ Waiting agents within Manhattan distance 3, trigger group re-route */
  private checkGroupScatter(): void {
    const waiting = this.agents.filter(a => a.state === 'Waiting')
    if (waiting.length < 3) return

    for (let i = 0; i < waiting.length; i++) {
      const nearby = [waiting[i]]
      for (let j = 0; j < waiting.length; j++) {
        if (i === j) continue
        if (manhattanDistance3D(waiting[i].position, waiting[j].position) <= 3) {
          nearby.push(waiting[j])
        }
      }
      if (nearby.length >= 3) {
        for (const agent of nearby) {
          if (agent.destination) {
            this.cancelReservations(agent)
            this.assignDestination(agent, agent.destination)
          }
        }
        return // one scatter per tick
      }
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
        this._totalWaitTicks++
        if (agent.waitTicks >= 20 && agent.destination) {
          // Deadlock safety valve: force re-route (both strategies)
          this.cancelReservations(agent)
          this.assignDestination(agent, agent.destination)
        } else if (agent.waitTicks >= 5 && agent.destination) {
          if (this.usesDensityForAgent(agent)) {
            // Density: attempt sidestep
            this.processDensitySidestep(agent)
          } else {
            // Reservation: re-route
            this.assignDestination(agent, agent.destination)
          }
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
      this.eventLogger?.log(this._currentTick, 'agent_reroute', {
        agentId: agent.id,
        reason: 'path_invalidated',
        position: { ...agent.position },
      })
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
        this._tripsCompleted++
        this.eventLogger?.log(this._currentTick, 'destination_reached', {
          agentId: agent.id,
          position: { ...agent.position },
          ticksTaken: agent.pathAge,
        })
        this.pathfinder.releaseNavigation(agent.navigationHandle)
        this.cancelReservations(agent)
        agent.navigationHandle = null
        agent.destination = null
        agent.state = 'Idle'
      }
      return
    }

    // Check for congestion based on strategy
    if (this.usesDensityForAgent(agent)) {
      // Density-based: check if next voxel is occupied
      const agentPositions = this.agents.map(a => ({ id: a.id, position: a.position }))
      const blockerId = this.densityManager.isOccupied(next, agent.id, agentPositions)
      if (blockerId >= 0) {
        agent.state = 'Waiting'
        agent.waitTicks = 0
        this._waitEvents++
        this.eventLogger?.log(this._currentTick, 'agent_waiting', {
          agentId: agent.id,
          position: { ...agent.position },
          blockedBy: { ...next },
          strategy: 'density',
        })
        return
      }
    } else {
      // Reservation-based: check reservation table
      if (this.reservationTable && this.reservationTable.isReserved(0, next, agent.id)) {
        agent.state = 'Waiting'
        agent.waitTicks = 0
        this._waitEvents++
        this.eventLogger?.log(this._currentTick, 'agent_waiting', {
          agentId: agent.id,
          position: { ...agent.position },
          blockedBy: { ...next },
          strategy: 'reservation',
        })
        return
      }
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

  private processDensitySidestep(agent: Agent): void {
    if (!agent.navigationHandle || !agent.destination) return

    // Get the flow direction the agent wants to move in
    const next = agent.navigationHandle.getNextVoxel(agent.position)
    if (!next) return

    const flowDx = next.x - agent.position.x
    const flowDz = next.z - agent.position.z
    const agentPositions = this.agents.map(a => ({ id: a.id, position: a.position }))

    const sidestep = this.densityManager.computeSidestep(
      agent.position,
      flowDx,
      flowDz,
      agent.id,
      agentPositions,
      (pos) => isWalkable(this.grid, pos, agent.height),
    )

    if (sidestep) {
      agent.position = sidestep
      agent.state = 'Navigating'
      agent.waitTicks = 0
      agent.pathAge++
      this.eventLogger?.log(this._currentTick, 'agent_sidestep', {
        agentId: agent.id,
        from: { ...agent.position },
        to: { ...sidestep },
      })
    }
    // If no sidestep available, continue waiting (20-tick deadlock will trigger re-route)
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
