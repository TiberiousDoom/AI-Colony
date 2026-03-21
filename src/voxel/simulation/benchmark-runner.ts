/**
 * Headless benchmark runner.
 *
 * Runs scenarios at configurable world sizes (default 64x64x64) across
 * multiple seeds, collecting per-run metrics and computing aggregate
 * statistics (mean ± stddev). Exports results as CSV.
 */

import { VoxelGrid } from '../world/voxel-grid.ts'
import { GridWorldView } from '../pathfinding/grid-world-view.ts'
import { PassthroughSmoother } from '../pathfinding/pathfinder-interface.ts'
import type { IPathSmoother } from '../pathfinding/pathfinder-interface.ts'
import { AgentManager } from '../agents/agent-manager.ts'
import { SimulationEngine } from './simulation-engine.ts'
import { EventLogger } from './event-logger.ts'
import { createRNG } from '../../shared/seed.ts'
import { resetAgentIdCounter } from '../agents/agent.ts'
import type { ScenarioDefinition } from './scenario-runner.ts'
import type { PathfinderFactory } from './scenario-runner.ts'

// ─── Types ──────────────────────────────────────────────────────────

export interface BenchmarkConfig {
  scenario: ScenarioDefinition
  pathfinderFactories: Map<string, PathfinderFactory>
  seeds: number[]
  smoother?: IPathSmoother
}

export interface BenchmarkRunResult {
  algorithm: string
  seed: number
  tripsCompleted: number
  avgPathfindingTimeMs: number
  peakPathfindingTimeMs: number
  stuckAgents: number
  waitEvents: number
  totalWaitTicks: number
  algorithmErrors: number
}

export interface AggregateResult {
  algorithm: string
  mean: BenchmarkRunResult
  stddev: BenchmarkRunResult
  runs: BenchmarkRunResult[]
}

export interface BenchmarkOutput {
  scenario: string
  aggregates: AggregateResult[]
}

// ─── Pathfinder graph rebuild ────────────────────────────────────────

/** Rebuild pathfinder graphs after bulk terrain setup */
function rebuildPathfinderGraphs(pathfinder: import('../pathfinding/pathfinder-interface.ts').IPathfinder): void {
  if ('rebuildGraph' in pathfinder && typeof (pathfinder as Record<string, unknown>).rebuildGraph === 'function') {
    (pathfinder as { rebuildGraph: () => void }).rebuildGraph()
  }
  if ('rebuildLayers' in pathfinder && typeof (pathfinder as Record<string, unknown>).rebuildLayers === 'function') {
    (pathfinder as { rebuildLayers: () => void }).rebuildLayers()
  }
}

// ─── Runner ─────────────────────────────────────────────────────────

function runSingle(
  scenario: ScenarioDefinition,
  algorithmName: string,
  pathfinderFactory: PathfinderFactory,
  seed: number,
  smoother?: IPathSmoother,
): BenchmarkRunResult {
  resetAgentIdCounter()

  // Override scenario seed with benchmark seed
  const rng = createRNG(seed)
  const grid = new VoxelGrid(scenario.worldSize)
  const worldView = new GridWorldView(grid)
  const pathfinder = pathfinderFactory(worldView, scenario.worldSize)
  const sm = smoother ?? new PassthroughSmoother()
  const agentManager = new AgentManager(pathfinder, sm, grid)
  const engine = new SimulationEngine(grid, pathfinder, agentManager, rng)
  const logger = new EventLogger()
  engine.setEventLogger(logger)

  // Setup
  scenario.setup(engine)

  // Rebuild pathfinder graphs after terrain setup
  rebuildPathfinderGraphs(pathfinder)

  // Re-assign destinations for agents stuck because graph wasn't ready during setup
  for (const agent of agentManager.getAgents()) {
    if ((agent.state === 'Stuck' || agent.state === 'Idle') && agent.destination) {
      agentManager.assignDestination(agent, agent.destination)
    }
  }

  // Run and track peak pathfinding time
  let totalPathMs = 0
  let peakPathMs = 0
  let tickCount = 0

  for (let t = 0; t < scenario.totalTicks; t++) {
    const script = scenario.tickScript.get(engine.tick)
    if (script) script(engine)
    engine.processTick()

    const ms = engine.metrics.pathfindingTimeMs
    totalPathMs += ms
    if (ms > peakPathMs) peakPathMs = ms
    tickCount++
  }

  const m = engine.metrics
  return {
    algorithm: algorithmName,
    seed,
    tripsCompleted: m.tripsCompleted,
    avgPathfindingTimeMs: tickCount > 0 ? totalPathMs / tickCount : 0,
    peakPathfindingTimeMs: peakPathMs,
    stuckAgents: m.stuckAgents,
    waitEvents: m.waitEvents,
    totalWaitTicks: m.totalWaitTicks,
    algorithmErrors: m.algorithmErrors,
  }
}

// ─── Aggregation ────────────────────────────────────────────────────

function computeAggregate(runs: BenchmarkRunResult[]): AggregateResult {
  if (runs.length === 0) throw new Error('No runs to aggregate')

  const algorithm = runs[0].algorithm
  const fields: (keyof Omit<BenchmarkRunResult, 'algorithm' | 'seed'>)[] = [
    'tripsCompleted', 'avgPathfindingTimeMs', 'peakPathfindingTimeMs',
    'stuckAgents', 'waitEvents', 'totalWaitTicks', 'algorithmErrors',
  ]

  const mean: Record<string, number> = {}
  const stddev: Record<string, number> = {}

  for (const field of fields) {
    const values = runs.map(r => r[field])
    const avg = values.reduce((a, b) => a + b, 0) / values.length
    mean[field] = avg
    const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length
    stddev[field] = Math.sqrt(variance)
  }

  return {
    algorithm,
    mean: { algorithm, seed: 0, ...mean } as BenchmarkRunResult,
    stddev: { algorithm, seed: 0, ...stddev } as BenchmarkRunResult,
    runs,
  }
}

// ─── Public API ─────────────────────────────────────────────────────

export function runBenchmark(config: BenchmarkConfig): BenchmarkOutput {
  const aggregates: AggregateResult[] = []

  for (const [name, factory] of config.pathfinderFactories) {
    const runs: BenchmarkRunResult[] = []
    for (const seed of config.seeds) {
      runs.push(runSingle(config.scenario, name, factory, seed, config.smoother))
    }
    aggregates.push(computeAggregate(runs))
  }

  return {
    scenario: config.scenario.name,
    aggregates,
  }
}

// ─── CSV Export ──────────────────────────────────────────────────────

const CSV_HEADERS = [
  'algorithm', 'seed', 'tripsCompleted', 'avgPathfindingTimeMs',
  'peakPathfindingTimeMs', 'stuckAgents', 'waitEvents', 'totalWaitTicks',
  'algorithmErrors',
]

export function benchmarkToCSV(output: BenchmarkOutput): string {
  const lines: string[] = []
  lines.push(CSV_HEADERS.join(','))

  // Per-run rows
  for (const agg of output.aggregates) {
    for (const run of agg.runs) {
      lines.push([
        run.algorithm, run.seed, run.tripsCompleted,
        run.avgPathfindingTimeMs.toFixed(4), run.peakPathfindingTimeMs.toFixed(4),
        run.stuckAgents, run.waitEvents, run.totalWaitTicks, run.algorithmErrors,
      ].join(','))
    }
  }

  // Aggregate summary rows
  lines.push('')
  lines.push('# Aggregate Summary (mean ± stddev)')
  lines.push(CSV_HEADERS.join(','))
  for (const agg of output.aggregates) {
    const m = agg.mean
    const s = agg.stddev
    lines.push([
      `${m.algorithm} (mean)`, '-', m.tripsCompleted.toFixed(1),
      m.avgPathfindingTimeMs.toFixed(4), m.peakPathfindingTimeMs.toFixed(4),
      m.stuckAgents.toFixed(1), m.waitEvents.toFixed(1),
      m.totalWaitTicks.toFixed(1), m.algorithmErrors.toFixed(1),
    ].join(','))
    lines.push([
      `${s.algorithm} (stddev)`, '-', s.tripsCompleted.toFixed(2),
      s.avgPathfindingTimeMs.toFixed(4), s.peakPathfindingTimeMs.toFixed(4),
      s.stuckAgents.toFixed(2), s.waitEvents.toFixed(2),
      s.totalWaitTicks.toFixed(2), s.algorithmErrors.toFixed(2),
    ].join(','))
  }

  return lines.join('\n')
}
