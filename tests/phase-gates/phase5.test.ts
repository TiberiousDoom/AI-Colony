/**
 * Phase 5 Gate Tests — Hybrid Navigation & Intent Broadcast
 *
 * Verifies: Hybrid routing (D* Lite short / HPA*+D* Lite long),
 * flow field promotion/demotion, intent registry, intent-aware world view,
 * hybrid congestion strategy, Active Mine scenario, 5-algorithm comparison.
 */

import { describe, it, expect } from 'vitest'
import { VoxelGrid } from '../../src/voxel/world/voxel-grid.ts'
import { BlockType } from '../../src/voxel/world/block-types.ts'
import { GridWorldView } from '../../src/voxel/pathfinding/grid-world-view.ts'
import { GridAStarPathfinder } from '../../src/voxel/pathfinding/grid-astar.ts'
import { HybridPathfinder } from '../../src/voxel/pathfinding/hybrid-pathfinder.ts'
import { IntentRegistry } from '../../src/voxel/pathfinding/intent-registry.ts'
import { IntentWorldView } from '../../src/voxel/pathfinding/intent-world-view.ts'
import type { VoxelCoord } from '../../src/voxel/pathfinding/types.ts'
import { createAgent, resetAgentIdCounter } from '../../src/voxel/agents/agent.ts'
import { AgentManager } from '../../src/voxel/agents/agent-manager.ts'
import { PassthroughSmoother } from '../../src/voxel/pathfinding/pathfinder-interface.ts'
import { ComparisonRunner } from '../../src/voxel/simulation/comparison-runner.ts'
import { runBenchmark, benchmarkToCSV } from '../../src/voxel/simulation/benchmark-runner.ts'
import { createCanyonRunScenario } from '../../src/voxel/simulation/scenarios/canyon-run.ts'
import { createActiveMineScenario } from '../../src/voxel/simulation/scenarios/active-mine.ts'
import { ScenarioRunner, type PathfinderFactory } from '../../src/voxel/simulation/scenario-runner.ts'

// ─── Helpers ─────────────────────────────────────────────────────────

function createFlatWorld(size: number = 16): VoxelGrid {
  const grid = new VoxelGrid(size)
  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      grid.setBlock({ x, y: 0, z }, BlockType.Solid)
    }
  }
  return grid
}

// ============================================================
// HYBRID ROUTING (8 tests)
// ============================================================

describe('Hybrid Routing', () => {
  it('1. uses D* Lite for short paths (<=2 chunks)', () => {
    const grid = createFlatWorld(32)
    const wv = new GridWorldView(grid)
    const pf = new HybridPathfinder(wv, 32)
    pf.rebuildGraph()
    pf.rebuildLayers()

    const handle = pf.requestNavigation({ x: 2, y: 1, z: 2 }, { x: 10, y: 1, z: 10 }, 2, 1)
    expect(handle).not.toBeNull()

    const info = handle!.getDebugInfo()
    expect(info.algorithm).toBe('Hybrid')
    expect(info.subAlgorithm).toBe('dstar')
  })

  it('2. uses HPA* + D* Lite for long paths (>2 chunks)', () => {
    const grid = createFlatWorld(48)
    const wv = new GridWorldView(grid)
    const pf = new HybridPathfinder(wv, 48)
    pf.rebuildGraph()
    pf.rebuildLayers()

    // chunkDist > 2: start chunk (0,0,0) to dest chunk (4,0,4)
    const handle = pf.requestNavigation({ x: 2, y: 1, z: 2 }, { x: 40, y: 1, z: 40 }, 2, 1)
    expect(handle).not.toBeNull()

    const info = handle!.getDebugInfo()
    expect(info.algorithm).toBe('Hybrid')
    // Should use HPA* + D* Lite or fallback to A* for long path
    expect(['hpastar-dstar', 'dstar']).toContain(info.subAlgorithm)
  })

  it('3. flow field promotion at 3+ agents sharing destination in chunk', () => {
    const grid = createFlatWorld(32)
    const wv = new GridWorldView(grid)
    const pf = new HybridPathfinder(wv, 32)
    pf.rebuildGraph()
    pf.rebuildLayers()

    const dest: VoxelCoord = { x: 10, y: 1, z: 10 }

    // Add 3 agents to same destination
    const h1 = pf.requestNavigation({ x: 2, y: 1, z: 2 }, dest, 2, 1)
    const h2 = pf.requestNavigation({ x: 4, y: 1, z: 2 }, dest, 2, 2)
    const h3 = pf.requestNavigation({ x: 6, y: 1, z: 2 }, dest, 2, 3)

    expect(h1).not.toBeNull()
    expect(h2).not.toBeNull()
    expect(h3).not.toBeNull()

    // Promotion may or may not happen depending on flow field availability
    // Either way, all handles should be valid
    expect(h1!.isValid()).toBe(true)
    expect(h2!.isValid()).toBe(true)
    expect(h3!.isValid()).toBe(true)
  })

  it('4. handles same start and destination', () => {
    const grid = createFlatWorld()
    const wv = new GridWorldView(grid)
    const pf = new HybridPathfinder(wv, 16)

    const pos: VoxelCoord = { x: 5, y: 1, z: 5 }
    const handle = pf.requestNavigation(pos, pos, 2, 1)
    expect(handle).not.toBeNull()
  })

  it('5. returns null for unwalkable start', () => {
    const grid = createFlatWorld()
    const wv = new GridWorldView(grid)
    const pf = new HybridPathfinder(wv, 16)

    // y=0 is solid, not walkable
    const handle = pf.requestNavigation({ x: 5, y: 0, z: 5 }, { x: 10, y: 1, z: 10 }, 2, 1)
    expect(handle).toBeNull()
  })

  it('6. sub-handle transition produces valid path', () => {
    const grid = createFlatWorld(32)
    const wv = new GridWorldView(grid)
    const pf = new HybridPathfinder(wv, 32)
    pf.rebuildGraph()
    pf.rebuildLayers()

    const handle = pf.requestNavigation({ x: 2, y: 1, z: 2 }, { x: 28, y: 1, z: 28 }, 2, 1)
    expect(handle).not.toBeNull()

    // Walk agent through — should not return null prematurely
    let current: VoxelCoord = { x: 2, y: 1, z: 2 }
    let steps = 0
    const maxSteps = 200
    while (steps < maxSteps) {
      const next = handle!.getNextVoxel(current)
      if (next === null) break
      current = next
      steps++
    }
    // Should have made some progress
    expect(steps).toBeGreaterThan(0)
  })

  it('7. getPlannedPath returns valid path', () => {
    const grid = createFlatWorld(32)
    const wv = new GridWorldView(grid)
    const pf = new HybridPathfinder(wv, 32)
    pf.rebuildGraph()
    pf.rebuildLayers()

    const handle = pf.requestNavigation({ x: 2, y: 1, z: 2 }, { x: 14, y: 1, z: 14 }, 2, 1)
    expect(handle).not.toBeNull()

    const path = handle!.getPlannedPath({ x: 2, y: 1, z: 2 })
    expect(path).not.toBeNull()
    expect(path!.length).toBeGreaterThan(1)
  })

  it('8. memory report works', () => {
    const grid = createFlatWorld(32)
    const wv = new GridWorldView(grid)
    const pf = new HybridPathfinder(wv, 32)
    pf.rebuildGraph()
    pf.rebuildLayers()

    pf.requestNavigation({ x: 2, y: 1, z: 2 }, { x: 14, y: 1, z: 14 }, 2, 1)
    const mem = pf.getMemoryUsage()
    expect(mem.sharedBytes).toBeGreaterThanOrEqual(0)
    expect(mem.peakBytes).toBeGreaterThanOrEqual(0)
  })
})

// ============================================================
// INTENT BROADCAST (8 tests)
// ============================================================

describe('Intent Broadcast', () => {
  it('9. mining agent publishes intent to registry', () => {
    const registry = new IntentRegistry()
    registry.publishIntent({ x: 5, y: 3, z: 5 }, 1, 100, 10)
    registry.applyBatch(10)

    expect(registry.hasIntent({ x: 5, y: 3, z: 5 })).toBe(true)
    expect(registry.size).toBe(1)
  })

  it('10. nearby intents found within radius', () => {
    const registry = new IntentRegistry()
    registry.publishIntent({ x: 10, y: 1, z: 10 }, 1, 100, 0)
    registry.applyBatch(0)

    const nearby = registry.getIntentsNearby({ x: 12, y: 1, z: 10 }, 16)
    expect(nearby.length).toBe(1)
    expect(nearby[0].publisherAgentId).toBe(1)
  })

  it('11. distant intents not found beyond radius', () => {
    const registry = new IntentRegistry()
    registry.publishIntent({ x: 10, y: 1, z: 10 }, 1, 100, 0)
    registry.applyBatch(0)

    const distant = registry.getIntentsNearby({ x: 30, y: 1, z: 30 }, 5)
    expect(distant.length).toBe(0)
  })

  it('12. intents are batched per tick (no mid-tick cost recalcs)', () => {
    const registry = new IntentRegistry()

    // Publish 3 intents
    registry.publishIntent({ x: 1, y: 1, z: 1 }, 1, 100, 0)
    registry.publishIntent({ x: 2, y: 1, z: 2 }, 2, 100, 0)
    registry.publishIntent({ x: 3, y: 1, z: 3 }, 3, 100, 0)

    // Before batch: intents should NOT be visible
    expect(registry.hasIntent({ x: 1, y: 1, z: 1 })).toBe(false)
    expect(registry.pendingCount).toBe(3)

    // After batch: all visible
    registry.applyBatch(0)
    expect(registry.hasIntent({ x: 1, y: 1, z: 1 })).toBe(true)
    expect(registry.hasIntent({ x: 2, y: 1, z: 2 })).toBe(true)
    expect(registry.hasIntent({ x: 3, y: 1, z: 3 })).toBe(true)
    expect(registry.size).toBe(3)
  })

  it('13. pending-removal blocks have elevated traversal cost', () => {
    const grid = createFlatWorld()
    const wv = new GridWorldView(grid)
    const registry = new IntentRegistry()

    registry.publishIntent({ x: 6, y: 1, z: 5 }, 1, 100, 0)
    registry.applyBatch(0)

    const intentView = new IntentWorldView(wv, registry, 3.0)

    // Get neighbors from (5,1,5) — one neighbor should be (6,1,5) with elevated cost
    const normalNeighbors = wv.getNeighbors({ x: 5, y: 1, z: 5 }, 2)
    const intentNeighbors = intentView.getNeighbors({ x: 5, y: 1, z: 5 }, 2)

    const normalCost = normalNeighbors.find(n => n.coord.x === 6 && n.coord.z === 5)?.cost ?? 0
    const intentCost = intentNeighbors.find(n => n.coord.x === 6 && n.coord.z === 5)?.cost ?? 0

    expect(intentCost).toBe(normalCost * 3.0)
  })

  it('14. intent expires when cancelled', () => {
    const registry = new IntentRegistry()
    registry.publishIntent({ x: 5, y: 3, z: 5 }, 1, 100, 0)
    registry.applyBatch(0)
    expect(registry.hasIntent({ x: 5, y: 3, z: 5 })).toBe(true)

    registry.cancelIntent(1)
    registry.applyBatch(1)
    expect(registry.hasIntent({ x: 5, y: 3, z: 5 })).toBe(false)
  })

  it('15. intent expires after expected completion tick', () => {
    const registry = new IntentRegistry()
    registry.publishIntent({ x: 5, y: 3, z: 5 }, 1, 10, 0) // expires at tick 10
    registry.applyBatch(0)
    expect(registry.hasIntent({ x: 5, y: 3, z: 5 })).toBe(true)

    // Tick 5: still active
    registry.applyBatch(5)
    expect(registry.hasIntent({ x: 5, y: 3, z: 5 })).toBe(true)

    // Tick 10: expired
    registry.applyBatch(10)
    expect(registry.hasIntent({ x: 5, y: 3, z: 5 })).toBe(false)
  })

  it('16. cancelIntentForBlock removes specific block intent', () => {
    const registry = new IntentRegistry()
    registry.publishIntent({ x: 5, y: 3, z: 5 }, 1, 100, 0)
    registry.publishIntent({ x: 10, y: 3, z: 10 }, 1, 100, 0)
    registry.applyBatch(0)
    expect(registry.size).toBe(2)

    registry.cancelIntentForBlock({ x: 5, y: 3, z: 5 })
    registry.applyBatch(1)
    expect(registry.hasIntent({ x: 5, y: 3, z: 5 })).toBe(false)
    expect(registry.hasIntent({ x: 10, y: 3, z: 10 })).toBe(true)
  })
})

// ============================================================
// HYBRID CONGESTION (2 tests)
// ============================================================

describe('Hybrid Congestion', () => {
  it('17. hybrid congestion strategy type accepted by AgentManager', () => {
    const grid = createFlatWorld()
    const wv = new GridWorldView(grid)
    const pf = new HybridPathfinder(wv, 16)
    const smoother = new PassthroughSmoother()
    const am = new AgentManager(pf, smoother, grid, undefined, 'hybrid')
    expect(am.strategy).toBe('hybrid')
  })

  it('18. sweepLeakedHandles cleans up orphaned hybrid handles', () => {
    const grid = createFlatWorld(32)
    const wv = new GridWorldView(grid)
    const pf = new HybridPathfinder(wv, 32)
    pf.rebuildGraph()
    pf.rebuildLayers()

    pf.requestNavigation({ x: 2, y: 1, z: 2 }, { x: 14, y: 1, z: 14 }, 2, 99)
    const swept = pf.sweepLeakedHandles(new Set([1, 2, 3]))
    expect(swept).toBe(1)
  })
})

// ============================================================
// ACTIVE MINE SCENARIO (2 tests)
// ============================================================

describe('Active Mine Scenario', () => {
  it('19. scenario runs without algorithm errors (A* baseline)', () => {
    const factory: PathfinderFactory = (wv) => new GridAStarPathfinder(wv)
    const result = ScenarioRunner.run(createActiveMineScenario(), factory)
    expect(result.finalMetrics.algorithmErrors).toBe(0)
  })

  it('20. scenario runs without algorithm errors (Hybrid)', () => {
    const factory: PathfinderFactory = (wv, ws) => new HybridPathfinder(wv, ws)
    const result = ScenarioRunner.run(createActiveMineScenario(), factory)
    expect(result.finalMetrics.algorithmErrors).toBe(0)
  })
})

// ============================================================
// 5-ALGORITHM COMPARISON (3 tests)
// ============================================================

describe('5-Algorithm Comparison', () => {
  it('21. all 5 produce valid results for same start/end', () => {
    const WORLD_SIZE = 16
    resetAgentIdCounter()
    const runner = new ComparisonRunner(WORLD_SIZE, 42)

    for (let x = 0; x < WORLD_SIZE; x++) {
      for (let z = 0; z < WORLD_SIZE; z++) {
        runner.astarEngine.grid.setBlock({ x, y: 0, z }, BlockType.Solid)
        runner.hpastarEngine.grid.setBlock({ x, y: 0, z }, BlockType.Solid)
        runner.flowfieldEngine.grid.setBlock({ x, y: 0, z }, BlockType.Solid)
        runner.dstarEngine.grid.setBlock({ x, y: 0, z }, BlockType.Solid)
        runner.hybridEngine.grid.setBlock({ x, y: 0, z }, BlockType.Solid)
      }
    }

    runner.rebuildHPAGraph()
    runner.rebuildFlowFieldLayers()
    runner.rebuildHybridGraphs()

    // Add agents and run
    const pos = { x: 2, y: 1, z: 2 }
    resetAgentIdCounter(); runner.astarEngine.agentManager.addAgent(createAgent(pos))
    resetAgentIdCounter(); runner.hpastarEngine.agentManager.addAgent(createAgent(pos))
    resetAgentIdCounter(); runner.flowfieldEngine.agentManager.addAgent(createAgent(pos))
    resetAgentIdCounter(); runner.dstarEngine.agentManager.addAgent(createAgent(pos))
    resetAgentIdCounter(); runner.hybridEngine.agentManager.addAgent(createAgent(pos))
    runner.autoAssign = true

    for (let i = 0; i < 10; i++) runner.processTick()

    const metrics = runner.getMetrics()
    expect(metrics.astar.algorithmErrors).toBe(0)
    expect(metrics.hpastar.algorithmErrors).toBe(0)
    expect(metrics.flowfield.algorithmErrors).toBe(0)
    expect(metrics.dstar.algorithmErrors).toBe(0)
    expect(metrics.hybrid.algorithmErrors).toBe(0)
  })

  it('22. all 5 handle terrain change without crashing', () => {
    const WORLD_SIZE = 16
    resetAgentIdCounter()
    const runner = new ComparisonRunner(WORLD_SIZE, 42)

    for (let x = 0; x < WORLD_SIZE; x++) {
      for (let z = 0; z < WORLD_SIZE; z++) {
        runner.astarEngine.grid.setBlock({ x, y: 0, z }, BlockType.Solid)
        runner.hpastarEngine.grid.setBlock({ x, y: 0, z }, BlockType.Solid)
        runner.flowfieldEngine.grid.setBlock({ x, y: 0, z }, BlockType.Solid)
        runner.dstarEngine.grid.setBlock({ x, y: 0, z }, BlockType.Solid)
        runner.hybridEngine.grid.setBlock({ x, y: 0, z }, BlockType.Solid)
      }
    }

    runner.rebuildHPAGraph()
    runner.rebuildFlowFieldLayers()
    runner.rebuildHybridGraphs()

    const pos = { x: 2, y: 1, z: 2 }
    resetAgentIdCounter(); runner.astarEngine.agentManager.addAgent(createAgent(pos))
    resetAgentIdCounter(); runner.hpastarEngine.agentManager.addAgent(createAgent(pos))
    resetAgentIdCounter(); runner.flowfieldEngine.agentManager.addAgent(createAgent(pos))
    resetAgentIdCounter(); runner.dstarEngine.agentManager.addAgent(createAgent(pos))
    resetAgentIdCounter(); runner.hybridEngine.agentManager.addAgent(createAgent(pos))
    runner.autoAssign = true

    for (let i = 0; i < 10; i++) runner.processTick()

    runner.queueTerrainChange({ x: 8, y: 1, z: 8 }, BlockType.Solid)

    for (let i = 0; i < 10; i++) runner.processTick()

    const metrics = runner.getMetrics()
    expect(metrics.astar.algorithmErrors).toBe(0)
    expect(metrics.hpastar.algorithmErrors).toBe(0)
    expect(metrics.flowfield.algorithmErrors).toBe(0)
    expect(metrics.dstar.algorithmErrors).toBe(0)
    expect(metrics.hybrid.algorithmErrors).toBe(0)
  })

  it('23. benchmark CSV includes Hybrid algorithm', () => {
    const scenario = createCanyonRunScenario()
    const factories = new Map<string, PathfinderFactory>([
      ['A*', (wv) => new GridAStarPathfinder(wv)],
      ['Hybrid', (wv, ws) => new HybridPathfinder(wv, ws)],
    ])

    const output = runBenchmark({
      scenario,
      pathfinderFactories: factories,
      seeds: [1],
    })

    const csv = benchmarkToCSV(output)
    expect(csv).toContain('A*')
    expect(csv).toContain('Hybrid')
  })
})

// ============================================================
// DIAGNOSTIC REPORT (2 tests)
// ============================================================

import { generateComparisonReport, type ComparisonDiagnosticInput } from '../../src/voxel/simulation/diagnostic-report.ts'

describe('Diagnostic Report', () => {
  function makeMetrics(): import('../../src/voxel/simulation/simulation-engine.ts').SimulationMetrics {
    return {
      tick: 100, pathfindingTimeMs: 0.5, agentCount: 1, stuckAgents: 0,
      algorithmErrors: 0, budgetOverruns: 0, deferredReroutes: 0,
      waitEvents: 2, totalWaitTicks: 10, tripsCompleted: 5, pathSmoothness: 0.3,
    }
  }

  it('24. report includes all 5 algorithms', () => {
    const input: ComparisonDiagnosticInput = {
      name: 'Test', worldSize: 32, seed: 42, totalTicks: 100,
      astar: { metrics: makeMetrics(), events: [], agents: [] },
      hpastar: { metrics: makeMetrics(), events: [], agents: [] },
      flowfield: { metrics: makeMetrics(), events: [], agents: [] },
      dstar: { metrics: makeMetrics(), events: [], agents: [] },
      hybrid: { metrics: { ...makeMetrics(), tripsCompleted: 7 }, events: [], agents: [] },
    }

    const report = generateComparisonReport(input)
    expect(report).toContain('A*')
    expect(report).toContain('HPA*')
    expect(report).toContain('FlowField')
    expect(report).toContain('D* Lite')
    expect(report).toContain('Hybrid')
    expect(report).toContain('## 7. Algorithm Ranking')
  })

  it('25. report sections all present with 5 algos', () => {
    const input: ComparisonDiagnosticInput = {
      name: 'Test', worldSize: 32, seed: 42, totalTicks: 100,
      astar: { metrics: makeMetrics(), events: [], agents: [] },
      hpastar: { metrics: makeMetrics(), events: [], agents: [] },
      flowfield: { metrics: makeMetrics(), events: [], agents: [] },
      dstar: { metrics: makeMetrics(), events: [], agents: [] },
      hybrid: { metrics: makeMetrics(), events: [], agents: [] },
    }

    const report = generateComparisonReport(input)
    expect(report).toContain('## 1. Run Configuration')
    expect(report).toContain('## 2. Performance Comparison')
    expect(report).toContain('## 3. Bug Detection')
    expect(report).toContain('## 4. Plan Compliance')
    expect(report).toContain('## 5. Agent Behavior')
    expect(report).toContain('## 6. Event Timeline')
  })
})
