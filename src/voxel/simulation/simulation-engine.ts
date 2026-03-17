import type { VoxelGrid } from '../world/voxel-grid.ts'
import type { IPathfinder } from '../pathfinding/pathfinder-interface.ts'
import type { TerrainChangeEvent } from '../pathfinding/pathfinder-interface.ts'
import { AgentManager } from '../agents/agent-manager.ts'
import { PathfindingBudgetManager } from '../pathfinding/budget-manager.ts'
import type { SeededRNG } from '../../utils/seed.ts'
import { worldToChunk } from '../world/chunk-utils.ts'
import type { VoxelCoord, ChunkCoord } from '../pathfinding/types.ts'
import { BlockType, isSolidBlock } from '../world/block-types.ts'

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
}

export class SimulationEngine {
  readonly grid: VoxelGrid
  readonly agentManager: AgentManager
  readonly pathfinder: IPathfinder
  private budgetManager: PathfindingBudgetManager
  private rng: SeededRNG

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
  }

  constructor(
    grid: VoxelGrid,
    pathfinder: IPathfinder,
    agentManager: AgentManager,
    rng: SeededRNG,
    budgetManager?: PathfindingBudgetManager,
  ) {
    this.grid = grid
    this.pathfinder = pathfinder
    this.agentManager = agentManager
    this.rng = rng
    this.budgetManager = budgetManager ?? new PathfindingBudgetManager()
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
    const oldType = this.grid.getBlock(pos)
    this.grid.setBlock(pos, type)

    const changeType = isSolidBlock(type) ? 'add' as const : 'remove' as const
    const cc = worldToChunk(pos)

    this.pendingTerrainChanges.push({
      chunkCoords: [cc],
      changedVoxels: [pos],
      changeType,
      tick: this._tick,
    })
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

    // 4. Periodic handle leak sweep
    if (this._tick % SWEEP_INTERVAL_TICKS === 0) {
      const activeIds = this.agentManager.getActiveAgentIds()
      this.pathfinder.sweepLeakedHandles(activeIds)
    }

    // 5. Update metrics
    const agents = this.agentManager.getAgents()
    this._metrics.tick = this._tick
    this._metrics.pathfindingTimeMs = performance.now() - tickStart
    this._metrics.agentCount = agents.length
    this._metrics.stuckAgents = agents.filter(a => a.state === 'Stuck').length
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
    }
    this.budgetManager.clear()
  }
}
