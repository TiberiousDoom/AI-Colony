/**
 * Headless benchmark — run via: npx vitest run tests/benchmark-headless.test.ts
 *
 * Runs all scenarios across 3 algorithms with 10 seeds each.
 * Outputs CSV to stdout via console.log.
 */

import { describe, it } from 'vitest'
import { writeFileSync } from 'fs'
import { runBenchmark, benchmarkToCSV } from '../../src/voxel/simulation/benchmark-runner.ts'
import { GridAStarPathfinder } from '../../src/voxel/pathfinding/grid-astar.ts'
import { HPAStarPathfinder } from '../../src/voxel/pathfinding/hpa-star.ts'
import { FlowFieldPathfinder } from '../../src/voxel/pathfinding/flow-field-pathfinder.ts'
import { DStarLitePathfinder } from '../../src/voxel/pathfinding/dstar-lite.ts'
import { HybridPathfinder } from '../../src/voxel/pathfinding/hybrid-pathfinder.ts'
import type { PathfinderFactory } from '../../src/voxel/simulation/scenario-runner.ts'
import { createCanyonRunScenario } from '../../src/voxel/simulation/scenarios/canyon-run.ts'
import { createBridgeCollapseScenario } from '../../src/voxel/simulation/scenarios/bridge-collapse.ts'

const SEEDS = [42, 123, 456, 789, 1000, 2000, 3000, 4000, 5000, 6000]

const FACTORIES = new Map<string, PathfinderFactory>([
  ['A*', (wv) => new GridAStarPathfinder(wv)],
  ['HPA*', (wv, ws) => new HPAStarPathfinder(wv, ws)],
  ['FlowField', (wv, ws) => new FlowFieldPathfinder(wv, ws)],
  ['D* Lite', (wv, ws) => new DStarLitePathfinder(wv, ws)],
  ['Hybrid', (wv, ws) => new HybridPathfinder(wv, ws)],
])

describe('Headless Benchmark', () => {
  it('Canyon Run — 5 algorithms × 10 seeds', { timeout: 180000 }, () => {
    const output = runBenchmark({
      scenario: createCanyonRunScenario(),
      pathfinderFactories: FACTORIES,
      seeds: SEEDS,
    })

    const csv = benchmarkToCSV(output)
    writeFileSync('navigation/Benchmark Results/canyon-run-benchmark.csv', csv)

    // Print summary
    for (const agg of output.aggregates) {
      console.log(`${agg.algorithm}: trips=${agg.mean.tripsCompleted.toFixed(1)}±${agg.stddev.tripsCompleted.toFixed(1)}, errors=${agg.mean.algorithmErrors}`)
    }
  })

  it('Bridge Collapse — 5 algorithms × 10 seeds', { timeout: 180000 }, () => {
    const output = runBenchmark({
      scenario: createBridgeCollapseScenario(),
      pathfinderFactories: FACTORIES,
      seeds: SEEDS,
    })

    const csv = benchmarkToCSV(output)
    writeFileSync('navigation/Benchmark Results/bridge-collapse-benchmark.csv', csv)

    for (const agg of output.aggregates) {
      console.log(`${agg.algorithm}: trips=${agg.mean.tripsCompleted.toFixed(1)}±${agg.stddev.tripsCompleted.toFixed(1)}, errors=${agg.mean.algorithmErrors}`)
    }
  })
})
