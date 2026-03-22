/**
 * Benchmark runner: generates N worlds per algorithm and aggregates metrics.
 * Run with: npx tsx src/worldgen/cli/benchmark.ts [count] [--csv]
 */
import { ALL_GENERATORS } from '../generation/registry.ts'
import { createDefaultConfig } from '../generation/generator-interface.ts'
import { analyzeNavigability } from '../analysis/navigability.ts'
import { createRNG } from '../../shared/seed.ts'

const count = parseInt(process.argv[2]) || 10
const csvMode = process.argv.includes('--csv')

interface BenchmarkRow {
  algorithm: string
  seed: number
  totalMs: number
  terrainMs: number
  biomesMs: number
  cavesMs: number
  oresMs: number
  decorationMs: number
  spawnsMs: number
  minHeight: number
  maxHeight: number
  avgHeight: number
  biomeCount: number
  spawnCount: number
  navScore: number
}

const rows: BenchmarkRow[] = []

console.error(`Benchmarking ${count} seeds across ${ALL_GENERATORS.length} algorithms...`)

for (let seed = 1; seed <= count; seed++) {
  for (const gen of ALL_GENERATORS) {
    const config = createDefaultConfig(seed)
    config.params = gen.getDefaultParams()
    const result = gen.generate(config)

    const biomeSet = new Set<number>()
    for (let i = 0; i < result.biomeMap.length; i++) biomeSet.add(result.biomeMap[i])

    const rng = createRNG(seed + 9999)
    const nav = analyzeNavigability(result.grid, result.heightMap, rng, config.seaLevel, 10)

    rows.push({
      algorithm: gen.id,
      seed,
      totalMs: result.timing.totalMs,
      terrainMs: result.timing.terrainMs,
      biomesMs: result.timing.biomesMs,
      cavesMs: result.timing.cavesMs,
      oresMs: result.timing.oresMs,
      decorationMs: result.timing.decorationMs,
      spawnsMs: result.timing.spawnsMs,
      minHeight: result.metadata.minHeight,
      maxHeight: result.metadata.maxHeight,
      avgHeight: result.metadata.avgHeight,
      biomeCount: biomeSet.size,
      spawnCount: result.spawnPoints.length,
      navScore: nav.navigabilityScore,
    })
  }
  if (seed % 5 === 0) process.stderr.write(`.`)
}
console.error()

if (csvMode) {
  console.log('algorithm,seed,totalMs,terrainMs,biomesMs,cavesMs,oresMs,decorationMs,spawnsMs,minHeight,maxHeight,avgHeight,biomeCount,spawnCount,navScore')
  for (const r of rows) {
    console.log(`${r.algorithm},${r.seed},${r.totalMs.toFixed(0)},${r.terrainMs.toFixed(0)},${r.biomesMs.toFixed(0)},${r.cavesMs.toFixed(0)},${r.oresMs.toFixed(0)},${r.decorationMs.toFixed(0)},${r.spawnsMs.toFixed(0)},${r.minHeight},${r.maxHeight},${r.avgHeight.toFixed(1)},${r.biomeCount},${r.spawnCount},${r.navScore.toFixed(3)}`)
  }
} else {
  // Aggregate stats per algorithm
  const algos = [...new Set(rows.map(r => r.algorithm))]
  const pad = (s: string, n: number) => s.padEnd(n)

  console.log(`\n${'='.repeat(100)}`)
  console.log(`BENCHMARK: ${count} seeds per algorithm`)
  console.log(`${'='.repeat(100)}`)

  const header = `${pad('Algorithm', 22)}| ${pad('Time(ms)', 20)}| ${pad('Height', 16)}| ${pad('Biomes', 8)}| ${pad('Spawns', 8)}| ${pad('Nav Score', 16)}`
  console.log(header)
  console.log('-'.repeat(100))

  for (const algo of algos) {
    const algoRows = rows.filter(r => r.algorithm === algo)
    const times = algoRows.map(r => r.totalMs)
    const heights = algoRows.map(r => r.avgHeight)
    const biomes = algoRows.map(r => r.biomeCount)
    const spawns = algoRows.map(r => r.spawnCount)
    const navs = algoRows.map(r => r.navScore)

    const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length
    const std = (arr: number[]) => {
      const m = mean(arr)
      return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length)
    }

    const gen = ALL_GENERATORS.find(g => g.id === algo)
    console.log(
      `${pad(gen?.name ?? algo, 22)}| ` +
      `${pad(`${mean(times).toFixed(0)} +/- ${std(times).toFixed(0)}`, 20)}| ` +
      `${pad(`${mean(heights).toFixed(1)} +/- ${std(heights).toFixed(1)}`, 16)}| ` +
      `${pad(`${mean(biomes).toFixed(1)}`, 8)}| ` +
      `${pad(`${mean(spawns).toFixed(0)}`, 8)}| ` +
      `${mean(navs).toFixed(3)} +/- ${std(navs).toFixed(3)}`,
    )
  }
}

console.error('Done.')
