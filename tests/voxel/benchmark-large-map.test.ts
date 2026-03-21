/**
 * Large Map Benchmark (160×160) — run via:
 *   npx vitest run tests/voxel/benchmark-large-map.test.ts
 *
 * Runs all 8 scenarios at 160×160 world size across 6 algorithms with 10 seeds.
 * Outputs CSV to navigation/Benchmark Results/.
 */

import { describe, it } from 'vitest'
import { writeFileSync } from 'fs'
import { runBenchmark, benchmarkToCSV } from '../../src/voxel/simulation/benchmark-runner.ts'
import { GridAStarPathfinder } from '../../src/voxel/pathfinding/grid-astar.ts'
import { HPAStarPathfinder } from '../../src/voxel/pathfinding/hpa-star.ts'
import { FlowFieldPathfinder } from '../../src/voxel/pathfinding/flow-field-pathfinder.ts'
import { DStarLitePathfinder } from '../../src/voxel/pathfinding/dstar-lite.ts'
import { HybridPathfinder } from '../../src/voxel/pathfinding/hybrid-pathfinder.ts'
import { AdaptivePathfinder } from '../../src/voxel/pathfinding/adaptive-pathfinder.ts'
import type { PathfinderFactory } from '../../src/voxel/simulation/scenario-runner.ts'
import { createLargeCanyonRunScenario } from '../../src/voxel/simulation/scenarios/large-canyon-run.ts'
import { createLargeBridgeCollapseScenario } from '../../src/voxel/simulation/scenarios/large-bridge-collapse.ts'
import { createLargeStairwellScenario } from '../../src/voxel/simulation/scenarios/large-stairwell.ts'
import { createLargeRushHourScenario } from '../../src/voxel/simulation/scenarios/large-rush-hour.ts'
import { createLargeSwissCheeseScenario } from '../../src/voxel/simulation/scenarios/large-swiss-cheese.ts'
import { createLargeConstructionZoneScenario } from '../../src/voxel/simulation/scenarios/large-construction-zone.ts'
import { createLargeFreeFallScenario } from '../../src/voxel/simulation/scenarios/large-free-fall.ts'
import { createLargeActiveMineScenario } from '../../src/voxel/simulation/scenarios/large-active-mine.ts'

const SEEDS = [42, 123, 456, 789, 1000, 2000, 3000, 4000, 5000, 6000]

const FACTORIES = new Map<string, PathfinderFactory>([
  ['A*', (wv) => new GridAStarPathfinder(wv)],
  ['HPA*', (wv, ws) => new HPAStarPathfinder(wv, ws)],
  ['FlowField', (wv, ws) => new FlowFieldPathfinder(wv, ws)],
  ['D* Lite', (wv, ws) => new DStarLitePathfinder(wv, ws)],
  ['Hybrid', (wv, ws) => new HybridPathfinder(wv, ws)],
  ['Adaptive', (wv, ws) => new AdaptivePathfinder(wv, ws)],
])

function logSummary(output: ReturnType<typeof runBenchmark>) {
  for (const agg of output.aggregates) {
    console.log(`${agg.algorithm}: trips=${agg.mean.tripsCompleted.toFixed(1)}±${agg.stddev.tripsCompleted.toFixed(1)}, avgMs=${agg.mean.avgPathfindingTimeMs.toFixed(2)}, peakMs=${agg.mean.peakPathfindingTimeMs.toFixed(2)}, errors=${agg.mean.algorithmErrors}`)
  }
}

describe('Large Map Benchmark (160×160)', () => {
  it('Large Canyon Run — 6 algorithms × 10 seeds', { timeout: 600000 }, () => {
    const output = runBenchmark({
      scenario: createLargeCanyonRunScenario(),
      pathfinderFactories: FACTORIES,
      seeds: SEEDS,
    })
    writeFileSync('navigation/Benchmark Results/large-canyon-run-benchmark.csv', benchmarkToCSV(output))
    logSummary(output)
  })

  it('Large Bridge Collapse — 6 algorithms × 10 seeds', { timeout: 600000 }, () => {
    const output = runBenchmark({
      scenario: createLargeBridgeCollapseScenario(),
      pathfinderFactories: FACTORIES,
      seeds: SEEDS,
    })
    writeFileSync('navigation/Benchmark Results/large-bridge-collapse-benchmark.csv', benchmarkToCSV(output))
    logSummary(output)
  })

  it('Large Stairwell — 6 algorithms × 10 seeds', { timeout: 600000 }, () => {
    const output = runBenchmark({
      scenario: createLargeStairwellScenario(),
      pathfinderFactories: FACTORIES,
      seeds: SEEDS,
    })
    writeFileSync('navigation/Benchmark Results/large-stairwell-benchmark.csv', benchmarkToCSV(output))
    logSummary(output)
  })

  it('Large Rush Hour — 6 algorithms × 10 seeds', { timeout: 600000 }, () => {
    const output = runBenchmark({
      scenario: createLargeRushHourScenario(),
      pathfinderFactories: FACTORIES,
      seeds: SEEDS,
    })
    writeFileSync('navigation/Benchmark Results/large-rush-hour-benchmark.csv', benchmarkToCSV(output))
    logSummary(output)
  })

  it('Large Swiss Cheese — 6 algorithms × 10 seeds', { timeout: 1800000 }, () => {
    const output = runBenchmark({
      scenario: createLargeSwissCheeseScenario(),
      pathfinderFactories: FACTORIES,
      seeds: SEEDS,
    })
    writeFileSync('navigation/Benchmark Results/large-swiss-cheese-benchmark.csv', benchmarkToCSV(output))
    logSummary(output)
  })

  it('Large Construction Zone — 6 algorithms × 10 seeds', { timeout: 600000 }, () => {
    const output = runBenchmark({
      scenario: createLargeConstructionZoneScenario(),
      pathfinderFactories: FACTORIES,
      seeds: SEEDS,
    })
    writeFileSync('navigation/Benchmark Results/large-construction-zone-benchmark.csv', benchmarkToCSV(output))
    logSummary(output)
  })

  it('Large Free Fall — 6 algorithms × 10 seeds', { timeout: 600000 }, () => {
    const output = runBenchmark({
      scenario: createLargeFreeFallScenario(),
      pathfinderFactories: FACTORIES,
      seeds: SEEDS,
    })
    writeFileSync('navigation/Benchmark Results/large-free-fall-benchmark.csv', benchmarkToCSV(output))
    logSummary(output)
  })

  it('Large Active Mine — 6 algorithms × 10 seeds', { timeout: 600000 }, () => {
    const output = runBenchmark({
      scenario: createLargeActiveMineScenario(),
      pathfinderFactories: FACTORIES,
      seeds: SEEDS,
    })
    writeFileSync('navigation/Benchmark Results/large-active-mine-benchmark.csv', benchmarkToCSV(output))
    logSummary(output)
  })
})
