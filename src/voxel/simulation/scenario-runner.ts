import { VoxelGrid } from '../world/voxel-grid.ts'
import { GridWorldView } from '../pathfinding/grid-world-view.ts'
import { PassthroughSmoother } from '../pathfinding/pathfinder-interface.ts'
import type { IPathfinder, IPathSmoother } from '../pathfinding/pathfinder-interface.ts'
import { AgentManager } from '../agents/agent-manager.ts'
import { SimulationEngine, type SimulationMetrics } from './simulation-engine.ts'
import { EventLogger, type LogEntry } from './event-logger.ts'
import { createRNG } from '../../utils/seed.ts'
import { resetAgentIdCounter } from '../agents/agent.ts'

export interface ScenarioDefinition {
  name: string
  worldSize: number
  seed: number
  totalTicks: number
  setup: (engine: SimulationEngine) => void
  tickScript: Map<number, (engine: SimulationEngine) => void>
  validate?: (results: ScenarioResults) => boolean
}

export interface ScenarioResults {
  name: string
  totalTicks: number
  finalMetrics: SimulationMetrics
  events: ReadonlyArray<LogEntry>
  passed: boolean
}

export type PathfinderFactory = (worldView: GridWorldView, worldSize: number) => IPathfinder

export class ScenarioRunner {
  static run(
    definition: ScenarioDefinition,
    pathfinderFactory: PathfinderFactory,
    smoother?: IPathSmoother,
  ): ScenarioResults {
    resetAgentIdCounter()
    const rng = createRNG(definition.seed)
    const grid = new VoxelGrid(definition.worldSize)
    const worldView = new GridWorldView(grid)
    const pathfinder = pathfinderFactory(worldView, definition.worldSize)
    const sm = smoother ?? new PassthroughSmoother()
    const agentManager = new AgentManager(pathfinder, sm, grid)
    const engine = new SimulationEngine(grid, pathfinder, agentManager, rng)

    const logger = new EventLogger()
    engine.setEventLogger(logger)

    // Run setup
    definition.setup(engine)

    // Rebuild pathfinder graphs after terrain setup (HPA*, FlowField)
    if ('rebuildGraph' in pathfinder && typeof (pathfinder as Record<string, unknown>).rebuildGraph === 'function') {
      (pathfinder as { rebuildGraph: () => void }).rebuildGraph()
    }
    if ('rebuildLayers' in pathfinder && typeof (pathfinder as Record<string, unknown>).rebuildLayers === 'function') {
      (pathfinder as { rebuildLayers: () => void }).rebuildLayers()
    }

    // Re-assign destinations for agents that were stuck because the graph wasn't ready
    for (const agent of agentManager.getAgents()) {
      if ((agent.state === 'Stuck' || agent.state === 'Idle') && agent.destination) {
        agentManager.assignDestination(agent, agent.destination)
      }
    }

    // Run ticks
    for (let t = 0; t < definition.totalTicks; t++) {
      const script = definition.tickScript.get(engine.tick)
      if (script) script(engine)
      engine.processTick()
    }

    const results: ScenarioResults = {
      name: definition.name,
      totalTicks: definition.totalTicks,
      finalMetrics: engine.metrics,
      events: logger.getEntries(),
      passed: true,
    }

    if (definition.validate) {
      results.passed = definition.validate(results)
    }

    return results
  }
}
