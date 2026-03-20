import { VoxelGrid } from '../world/voxel-grid.ts'
import { GridWorldView } from '../pathfinding/grid-world-view.ts'
import { GridAStarPathfinder } from '../pathfinding/grid-astar.ts'
import { HPAStarPathfinder } from '../pathfinding/hpa-star.ts'
import { FlowFieldPathfinder } from '../pathfinding/flow-field-pathfinder.ts'
import { DStarLitePathfinder } from '../pathfinding/dstar-lite.ts'
import { HybridPathfinder } from '../pathfinding/hybrid-pathfinder.ts'
import { PassthroughSmoother } from '../pathfinding/pathfinder-interface.ts'
import type { IPathSmoother } from '../pathfinding/pathfinder-interface.ts'
import { AgentManager } from '../agents/agent-manager.ts'
import { SimulationEngine, type SimulationMetrics } from './simulation-engine.ts'
import { EventLogger } from './event-logger.ts'
import type { LogEntry } from './event-logger.ts'
import { createRNG } from '../../utils/seed.ts'
import { resetAgentIdCounter } from '../agents/agent.ts'
import type { VoxelCoord } from '../pathfinding/types.ts'
import type { BlockType } from '../world/block-types.ts'
import type { Agent } from '../agents/agent.ts'

export interface ComparisonMetrics {
  astar: SimulationMetrics
  hpastar: SimulationMetrics
  flowfield: SimulationMetrics
  dstar: SimulationMetrics
  hybrid: SimulationMetrics
}

export interface ComparisonState {
  tick: number
  astarAgents: ReadonlyArray<Agent>
  hpastarAgents: ReadonlyArray<Agent>
  flowfieldAgents: ReadonlyArray<Agent>
  dstarAgents: ReadonlyArray<Agent>
  hybridAgents: ReadonlyArray<Agent>
  metrics: ComparisonMetrics
}

export class ComparisonRunner {
  readonly astarEngine: SimulationEngine
  readonly hpastarEngine: SimulationEngine
  readonly flowfieldEngine: SimulationEngine
  readonly dstarEngine: SimulationEngine
  readonly hybridEngine: SimulationEngine
  private astarLogger: EventLogger
  private hpastarLogger: EventLogger
  private flowfieldLogger: EventLogger
  private dstarLogger: EventLogger
  private hybridLogger: EventLogger
  private pendingChanges: Array<{ pos: VoxelCoord; type: BlockType }> = []
  private destRng: ReturnType<typeof createRNG>
  autoAssign: boolean = false

  constructor(worldSize: number, seed: number, smoother?: IPathSmoother) {
    resetAgentIdCounter()
    const sm = smoother ?? new PassthroughSmoother()

    // A* side
    const rng1 = createRNG(seed)
    const grid1 = new VoxelGrid(worldSize)
    const wv1 = new GridWorldView(grid1)
    const pf1 = new GridAStarPathfinder(wv1)
    const am1 = new AgentManager(pf1, sm, grid1)
    this.astarEngine = new SimulationEngine(grid1, pf1, am1, rng1)
    this.astarLogger = new EventLogger()
    this.astarEngine.setEventLogger(this.astarLogger)

    // HPA* side — reset IDs again so both sides match
    resetAgentIdCounter()
    const rng2 = createRNG(seed)
    const grid2 = new VoxelGrid(worldSize)
    const wv2 = new GridWorldView(grid2)
    const pf2 = new HPAStarPathfinder(wv2, worldSize)
    const am2 = new AgentManager(pf2, sm, grid2)
    this.hpastarEngine = new SimulationEngine(grid2, pf2, am2, rng2)
    this.hpastarLogger = new EventLogger()
    this.hpastarEngine.setEventLogger(this.hpastarLogger)

    // Flow field side — reset IDs again, use density congestion
    resetAgentIdCounter()
    const rng3 = createRNG(seed)
    const grid3 = new VoxelGrid(worldSize)
    const wv3 = new GridWorldView(grid3)
    const pf3 = new FlowFieldPathfinder(wv3, worldSize)
    const am3 = new AgentManager(pf3, sm, grid3, undefined, 'density')
    this.flowfieldEngine = new SimulationEngine(grid3, pf3, am3, rng3)
    this.flowfieldLogger = new EventLogger()
    this.flowfieldEngine.setEventLogger(this.flowfieldLogger)

    // D* Lite side — reset IDs again
    resetAgentIdCounter()
    const rng4 = createRNG(seed)
    const grid4 = new VoxelGrid(worldSize)
    const wv4 = new GridWorldView(grid4)
    const pf4 = new DStarLitePathfinder(wv4, worldSize)
    const am4 = new AgentManager(pf4, sm, grid4)
    this.dstarEngine = new SimulationEngine(grid4, pf4, am4, rng4)
    this.dstarLogger = new EventLogger()
    this.dstarEngine.setEventLogger(this.dstarLogger)

    // Hybrid side — reset IDs again, use hybrid congestion
    resetAgentIdCounter()
    const rng5 = createRNG(seed)
    const grid5 = new VoxelGrid(worldSize)
    const wv5 = new GridWorldView(grid5)
    const pf5 = new HybridPathfinder(wv5, worldSize)
    const am5 = new AgentManager(pf5, sm, grid5, undefined, 'hybrid')
    this.hybridEngine = new SimulationEngine(grid5, pf5, am5, rng5)
    this.hybridLogger = new EventLogger()
    this.hybridEngine.setEventLogger(this.hybridLogger)

    this.destRng = createRNG(seed + 999)
  }

  /** Rebuild the HPA* coarse graph (call after bulk terrain setup) */
  rebuildHPAGraph(): void {
    const pf = this.hpastarEngine.pathfinder as HPAStarPathfinder
    pf.rebuildGraph()
  }

  /** Rebuild the flow field layers (call after bulk terrain setup) */
  rebuildFlowFieldLayers(): void {
    const pf = this.flowfieldEngine.pathfinder as FlowFieldPathfinder
    pf.rebuildLayers()
  }

  /** Rebuild hybrid pathfinder graphs (call after bulk terrain setup) */
  rebuildHybridGraphs(): void {
    const pf = this.hybridEngine.pathfinder as HybridPathfinder
    pf.rebuildGraph()
    pf.rebuildLayers()
  }

  queueTerrainChange(pos: VoxelCoord, type: BlockType): void {
    this.pendingChanges.push({ pos, type })
  }

  processTick(): void {
    // Apply mirrored terrain changes to all 5 engines
    for (const { pos, type } of this.pendingChanges) {
      this.astarEngine.queueTerrainChange(pos, type)
      this.hpastarEngine.queueTerrainChange(pos, type)
      this.flowfieldEngine.queueTerrainChange(pos, type)
      this.dstarEngine.queueTerrainChange(pos, type)
      this.hybridEngine.queueTerrainChange(pos, type)
    }
    this.pendingChanges = []

    this.astarEngine.processTick()
    this.hpastarEngine.processTick()
    this.flowfieldEngine.processTick()
    this.dstarEngine.processTick()
    this.hybridEngine.processTick()

    if (this.autoAssign) {
      this.assignIdleAgents()
    }
  }

  /** Assign the same random destination to matching idle agents on all sides */
  private assignIdleAgents(): void {
    const astarAgents = this.astarEngine.agentManager.getAgents()
    const hpaAgents = this.hpastarEngine.agentManager.getAgents()
    const ffAgents = this.flowfieldEngine.agentManager.getAgents()
    const dsAgents = this.dstarEngine.agentManager.getAgents()
    const hyAgents = this.hybridEngine.agentManager.getAgents()

    for (let i = 0; i < astarAgents.length; i++) {
      const a = astarAgents[i]
      const h = hpaAgents[i]
      const f = ffAgents[i]
      const d = dsAgents[i]
      const y = hyAgents[i]
      if (!a || !h || !f || !d || !y) continue
      if (a.state !== 'Idle' && h.state !== 'Idle' && f.state !== 'Idle' && d.state !== 'Idle' && y.state !== 'Idle') continue

      // Pick one destination for all sides
      const dest = this.astarEngine.findRandomWalkablePosition(this.destRng)
      if (!dest) continue

      if (a.state === 'Idle') this.astarEngine.agentManager.assignDestination(a, dest)
      if (h.state === 'Idle') this.hpastarEngine.agentManager.assignDestination(h, dest)
      if (f.state === 'Idle') this.flowfieldEngine.agentManager.assignDestination(f, dest)
      if (d.state === 'Idle') this.dstarEngine.agentManager.assignDestination(d, dest)
      if (y.state === 'Idle') this.hybridEngine.agentManager.assignDestination(y, dest)
    }
  }

  getMetrics(): ComparisonMetrics {
    return {
      astar: this.astarEngine.metrics,
      hpastar: this.hpastarEngine.metrics,
      flowfield: this.flowfieldEngine.metrics,
      dstar: this.dstarEngine.metrics,
      hybrid: this.hybridEngine.metrics,
    }
  }

  getState(): ComparisonState {
    return {
      tick: this.astarEngine.tick,
      astarAgents: [...this.astarEngine.agentManager.getAgents()],
      hpastarAgents: [...this.hpastarEngine.agentManager.getAgents()],
      flowfieldAgents: [...this.flowfieldEngine.agentManager.getAgents()],
      dstarAgents: [...this.dstarEngine.agentManager.getAgents()],
      hybridAgents: [...this.hybridEngine.agentManager.getAgents()],
      metrics: this.getMetrics(),
    }
  }

  getAStarEvents(): ReadonlyArray<LogEntry> { return this.astarLogger.getEntries() }
  getHPAStarEvents(): ReadonlyArray<LogEntry> { return this.hpastarLogger.getEntries() }
  getFlowFieldEvents(): ReadonlyArray<LogEntry> { return this.flowfieldLogger.getEntries() }
  getDStarEvents(): ReadonlyArray<LogEntry> { return this.dstarLogger.getEntries() }
  getHybridEvents(): ReadonlyArray<LogEntry> { return this.hybridLogger.getEntries() }
}
