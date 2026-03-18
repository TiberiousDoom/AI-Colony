import type { VoxelGrid } from '../world/voxel-grid.ts'
import type { IPathfinder } from '../pathfinding/pathfinder-interface.ts'
import type { TerrainChangeEvent } from '../pathfinding/pathfinder-interface.ts'
import { AgentManager } from '../agents/agent-manager.ts'
import { PathfindingBudgetManager } from '../pathfinding/budget-manager.ts'
import type { SeededRNG } from '../../utils/seed.ts'
import { worldToChunk } from '../world/chunk-utils.ts'
import type { VoxelCoord, ChunkCoord } from '../pathfinding/types.ts'
import { BlockType, isSolidBlock } from '../world/block-types.ts'
import { isWalkable } from '../pathfinding/movement-rules.ts'
import type { ReservationTable } from '../pathfinding/reservation-table.ts'
import type { EventLogger } from './event-logger.ts'

export const TICKS_PER_SECOND = 20
export const SWEEP_INTERVAL_TICKS = 100

export interface SimulationMetrics {
  tick: number
  pathfindingTimeMs: number
  agentCount: number
  stuckAgents: number
  algorithmErrors: number
  budgetOverruns: number
  deferredReroutes: number
  waitEvents: number
  totalWaitTicks: number
  tripsCompleted: number
  /** Average angle change (radians) between consecutive path segments across all navigating agents */
  pathSmoothness: number
}

export class SimulationEngine {
  readonly grid: VoxelGrid
  readonly agentManager: AgentManager
  readonly pathfinder: IPathfinder
  private budgetManager: PathfindingBudgetManager
  private rng: SeededRNG
  private reservationTable: ReservationTable | null
  private eventLogger: EventLogger | null = null

  private _tick: number = 0
  private pendingTerrainChanges: TerrainChangeEvent[] = []
  private _metrics: SimulationMetrics = {
    tick: 0,
    pathfindingTimeMs: 0,
    agentCount: 0,
    stuckAgents: 0,
    algorithmErrors: 0,
    budgetOverruns: 0,
    deferredReroutes: 0,
    waitEvents: 0,
    totalWaitTicks: 0,
    tripsCompleted: 0,
    pathSmoothness: 0,
  }

  constructor(
    grid: VoxelGrid,
    pathfinder: IPathfinder,
    agentManager: AgentManager,
    rng: SeededRNG,
    budgetManager?: PathfindingBudgetManager,
    reservationTable?: ReservationTable,
  ) {
    this.grid = grid
    this.pathfinder = pathfinder
    this.agentManager = agentManager
    this.rng = rng
    this.budgetManager = budgetManager ?? new PathfindingBudgetManager()
    this.reservationTable = reservationTable ?? null
  }

  setEventLogger(logger: EventLogger): void {
    this.eventLogger = logger
    this.agentManager.setEventLogger(logger)
  }

  get tick(): number {
    return this._tick
  }

  get metrics(): SimulationMetrics {
    return { ...this._metrics }
  }

  getRNG(): SeededRNG {
    return this.rng
  }

  /** Queue a terrain change to be processed on the next tick */
  queueTerrainChange(pos: VoxelCoord, type: BlockType): void {
    this.grid.setBlock(pos, type)

    const changeType = isSolidBlock(type) ? 'add' as const : 'remove' as const
    const cc = worldToChunk(pos)

    const event: TerrainChangeEvent = {
      chunkCoords: [cc],
      changedVoxels: [pos],
      changeType,
      tick: this._tick,
    }

    this.pendingTerrainChanges.push(event)

    if (this.eventLogger) {
      this.eventLogger.log(this._tick, 'terrain_change', {
        pos: { x: pos.x, y: pos.y, z: pos.z },
        blockType: type,
        changeType,
      })
    }
  }

  /** Advance simulation by one tick */
  processTick(): void {
    this._tick++
    const tickStart = performance.now()

    // 1. Process pending terrain changes
    for (const event of this.pendingTerrainChanges) {
      try {
        this.pathfinder.invalidateRegion(event)
      } catch (err) {
        this._metrics.algorithmErrors++
        console.error('[SimEngine] invalidateRegion error:', err)
      }
    }
    this.pendingTerrainChanges = []

    // 2. Update agents (processes gravity, navigation, etc. in ascending ID order)
    this.agentManager.setCurrentTick(this._tick)
    try {
      this.agentManager.update()
    } catch (err) {
      this._metrics.algorithmErrors++
      console.error('[SimEngine] agent update error:', err)
    }

    // 3. Process budget manager queue
    const budgetResult = this.budgetManager.processTick()
    if (budgetResult.deferred > 0) {
      this._metrics.budgetOverruns++
      this._metrics.deferredReroutes += budgetResult.deferred
    }

    // 4. Refresh reservations for navigating agents
    if (this.reservationTable) {
      const agents = this.agentManager.getAgents()
      for (const agent of agents) {
        if (agent.state === 'Navigating') {
          this.agentManager.reserveAgentPath(agent, 3, this._tick)
        }
      }
      // GC past ticks every 20 ticks
      if (this._tick % 20 === 0) {
        this.reservationTable.gcPastTicks(this._tick)
      }
    }

    // 5. Periodic handle leak sweep
    if (this._tick % SWEEP_INTERVAL_TICKS === 0) {
      const activeIds = this.agentManager.getActiveAgentIds()
      this.pathfinder.sweepLeakedHandles(activeIds)
    }

    // 6. Update metrics
    const agents = this.agentManager.getAgents()
    this._metrics.tick = this._tick
    this._metrics.pathfindingTimeMs = performance.now() - tickStart
    this._metrics.agentCount = agents.length
    this._metrics.stuckAgents = agents.filter(a => a.state === 'Stuck').length
    this._metrics.waitEvents = this.agentManager.waitEvents
    this._metrics.totalWaitTicks = this.agentManager.totalWaitTicks
    this._metrics.tripsCompleted = this.agentManager.tripsCompleted
    this._metrics.pathSmoothness = this.computePathSmoothness()
  }

  /** Compute average angle change across all navigating agents' smoothed paths */
  private computePathSmoothness(): number {
    const agents = this.agentManager.getAgents()
    let totalAngle = 0
    let totalSegments = 0

    for (const agent of agents) {
      if (agent.smoothedPath.length < 3) continue
      const path = agent.smoothedPath
      for (let i = 1; i < path.length - 1; i++) {
        const dx1 = path[i].x - path[i - 1].x
        const dz1 = path[i].z - path[i - 1].z
        const dx2 = path[i + 1].x - path[i].x
        const dz2 = path[i + 1].z - path[i].z
        const len1 = Math.sqrt(dx1 * dx1 + dz1 * dz1)
        const len2 = Math.sqrt(dx2 * dx2 + dz2 * dz2)
        if (len1 === 0 || len2 === 0) continue
        const dot = (dx1 * dx2 + dz1 * dz2) / (len1 * len2)
        const clamped = Math.max(-1, Math.min(1, dot))
        totalAngle += Math.acos(clamped)
        totalSegments++
      }
    }

    return totalSegments > 0 ? totalAngle / totalSegments : 0
  }

  /** Find a random walkable position on the grid using the provided RNG (or the engine's own) */
  findRandomWalkablePosition(rng?: SeededRNG): VoxelCoord | null {
    const r = rng ?? this.rng
    const size = this.grid.worldSize
    for (let attempt = 0; attempt < 50; attempt++) {
      const x = r.nextInt(0, size - 1)
      const z = r.nextInt(0, size - 1)
      for (let y = size - 1; y >= 0; y--) {
        const pos = { x, y, z }
        if (isWalkable(this.grid, pos, 2)) return pos
      }
    }
    return null
  }

  reset(rng: SeededRNG): void {
    this._tick = 0
    this.pendingTerrainChanges = []
    this.rng = rng
    this._metrics = {
      tick: 0,
      pathfindingTimeMs: 0,
      agentCount: 0,
      stuckAgents: 0,
      algorithmErrors: 0,
      budgetOverruns: 0,
      deferredReroutes: 0,
      waitEvents: 0,
      totalWaitTicks: 0,
      tripsCompleted: 0,
    }
    this.budgetManager.clear()
  }
}
