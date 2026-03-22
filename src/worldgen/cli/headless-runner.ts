/**
 * Headless CLI runner for worldgen algorithms.
 * Run with: npx tsx src/worldgen/cli/headless-runner.ts [seed] [--algorithms algo1,algo2,...] [--width N] [--height N] [--depth N]
 *
 * Outputs diagnostic metrics and comparison tables to stdout.
 */
import { ALL_GENERATORS } from '../generation/registry.ts'
import { createDefaultConfig, type GenerationResult, type IWorldGenerator, BiomeType } from '../generation/generator-interface.ts'
import { WorldgenBlockType } from '../world/block-types.ts'
import { analyzeNavigability } from '../analysis/navigability.ts'
import { createRNG as createAnalysisRNG } from '../../shared/seed.ts'

const BIOME_NAMES: Record<number, string> = {
  [BiomeType.Plains]: 'Plains',
  [BiomeType.Forest]: 'Forest',
  [BiomeType.Desert]: 'Desert',
  [BiomeType.Tundra]: 'Tundra',
  [BiomeType.Swamp]: 'Swamp',
  [BiomeType.Mountains]: 'Mountains',
  [BiomeType.Badlands]: 'Badlands',
}

interface CLIArgs {
  seed: number
  algorithms: string[]
  width: number
  height: number
  depth: number
  seeds: number[] // multiple seeds for benchmark mode
}

function parseArgs(argv: string[]): CLIArgs {
  const args: CLIArgs = {
    seed: 42,
    algorithms: ALL_GENERATORS.map(g => g.id),
    width: 128,
    height: 64,
    depth: 128,
    seeds: [],
  }

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--algorithms' && argv[i + 1]) {
      args.algorithms = argv[++i].split(',')
    } else if (arg === '--width' && argv[i + 1]) {
      args.width = parseInt(argv[++i])
    } else if (arg === '--height' && argv[i + 1]) {
      args.height = parseInt(argv[++i])
    } else if (arg === '--depth' && argv[i + 1]) {
      args.depth = parseInt(argv[++i])
    } else if (arg === '--benchmark' && argv[i + 1]) {
      const count = parseInt(argv[++i])
      args.seeds = Array.from({ length: count }, (_, i) => i + 1)
    } else if (!arg.startsWith('--')) {
      args.seed = parseInt(arg) || 42
    }
  }

  if (args.seeds.length === 0) {
    args.seeds = [args.seed]
  }

  return args
}

function getBlockName(type: number): string {
  return WorldgenBlockType[type] ?? `Unknown(${type})`
}

function formatTable(headers: string[], rows: string[][]): string {
  const colWidths = headers.map((h, i) => {
    const maxRow = Math.max(...rows.map(r => (r[i] ?? '').length))
    return Math.max(h.length, maxRow)
  })

  const sep = colWidths.map(w => '-'.repeat(w + 2)).join('+')
  const headerLine = headers.map((h, i) => ` ${h.padEnd(colWidths[i])} `).join('|')
  const dataLines = rows.map(row =>
    row.map((cell, i) => ` ${cell.padEnd(colWidths[i])} `).join('|'),
  )

  return [headerLine, sep, ...dataLines].join('\n')
}

function printResults(results: Map<string, GenerationResult>, generators: IWorldGenerator[]) {
  console.log('\n' + '='.repeat(80))
  console.log('WORLDGEN ALGORITHM COMPARISON')
  console.log('='.repeat(80))

  // Timing table
  console.log('\n--- Generation Timing ---')
  const timingHeaders = ['Algorithm', 'Total', 'Terrain', 'Biomes', 'Caves', 'Water', 'Ores', 'Decoration', 'Spawns']
  const timingRows = generators.map(gen => {
    const r = results.get(gen.id)
    if (!r) return [gen.name, '-', '-', '-', '-', '-', '-', '-', '-']
    const t = r.timing
    return [
      gen.name,
      `${t.totalMs.toFixed(0)}ms`,
      `${t.terrainMs.toFixed(0)}ms`,
      `${t.biomesMs.toFixed(0)}ms`,
      `${t.cavesMs.toFixed(0)}ms`,
      `${t.waterMs.toFixed(0)}ms`,
      `${t.oresMs.toFixed(0)}ms`,
      `${t.decorationMs.toFixed(0)}ms`,
      `${t.spawnsMs.toFixed(0)}ms`,
    ]
  })
  console.log(formatTable(timingHeaders, timingRows))

  // Height stats table
  console.log('\n--- Height Statistics ---')
  const heightHeaders = ['Algorithm', 'Min', 'Max', 'Avg', 'Range']
  const heightRows = generators.map(gen => {
    const r = results.get(gen.id)
    if (!r) return [gen.name, '-', '-', '-', '-']
    const m = r.metadata
    return [
      gen.name,
      m.minHeight.toFixed(0),
      m.maxHeight.toFixed(0),
      m.avgHeight.toFixed(1),
      (m.maxHeight - m.minHeight).toFixed(0),
    ]
  })
  console.log(formatTable(heightHeaders, heightRows))

  // Block distribution table
  console.log('\n--- Block Distribution ---')
  const allBlockTypes = new Set<number>()
  for (const r of results.values()) {
    for (const type of Object.keys(r.metadata.blockCounts)) {
      allBlockTypes.add(Number(type))
    }
  }
  const sortedTypes = [...allBlockTypes].sort((a, b) => a - b)
  const blockHeaders = ['Block Type', ...generators.map(g => g.name)]
  const blockRows = sortedTypes.map(type => [
    getBlockName(type),
    ...generators.map(gen => {
      const r = results.get(gen.id)
      const count = r?.metadata.blockCounts[type] ?? 0
      if (count === 0) return '-'
      if (count > 1_000_000) return `${(count / 1_000_000).toFixed(2)}M`
      if (count > 1_000) return `${(count / 1_000).toFixed(1)}K`
      return String(count)
    }),
  ])
  console.log(formatTable(blockHeaders, blockRows))

  // Cave density by depth
  console.log('\n--- Cave Density by Depth ---')
  for (const gen of generators) {
    const r = results.get(gen.id)
    if (!r) continue
    console.log(`\n  ${gen.name}:`)
    const bucketCount = 8
    const bucketSize = Math.ceil(r.grid.worldHeight / bucketCount)
    const caveCounts = new Array(bucketCount).fill(0)
    const totalCounts = new Array(bucketCount).fill(0)

    for (let x = 0; x < r.grid.worldWidth; x += 4) {
      for (let z = 0; z < r.grid.worldDepth; z += 4) {
        const surfaceY = Math.floor(r.heightMap[x * r.grid.worldDepth + z])
        for (let y = 1; y < surfaceY - 1; y++) {
          const bucket = Math.min(bucketCount - 1, Math.floor(y / bucketSize))
          totalCounts[bucket]++
          if (r.grid.getBlock({ x, y, z }) === WorldgenBlockType.Air) {
            caveCounts[bucket]++
          }
        }
      }
    }

    for (let b = 0; b < bucketCount; b++) {
      const label = `Y ${(b * bucketSize).toString().padStart(3)}-${((b + 1) * bucketSize - 1).toString().padStart(3)}`
      const density = totalCounts[b] > 0 ? caveCounts[b] / totalCounts[b] : 0
      const barLen = Math.round(density * 200)
      const bar = '#'.repeat(barLen)
      console.log(`    ${label} | ${bar} ${(density * 100).toFixed(1)}%`)
    }
  }

  // Biome coverage
  console.log('\n--- Biome Coverage ---')
  const biomeHeaders = ['Algorithm', ...Object.values(BIOME_NAMES)]
  const biomeRows = generators.map(gen => {
    const r = results.get(gen.id)
    if (!r) return [gen.name, ...Object.values(BIOME_NAMES).map(() => '-')]
    const total = r.biomeMap.length
    const counts: Record<number, number> = {}
    for (let i = 0; i < r.biomeMap.length; i++) {
      const b = r.biomeMap[i]
      counts[b] = (counts[b] ?? 0) + 1
    }
    return [
      gen.name,
      ...Object.keys(BIOME_NAMES).map(b => {
        const count = counts[Number(b)] ?? 0
        return count > 0 ? `${(count / total * 100).toFixed(1)}%` : '-'
      }),
    ]
  })
  console.log(formatTable(biomeHeaders, biomeRows))

  // Height distribution histogram (text-based)
  // Navigability analysis
  console.log('\n--- Navigability Analysis ---')
  const navHeaders = ['Algorithm', 'Success Rate', 'Path Ratio', 'Regions', 'Score']
  const navRows = generators.map(gen => {
    const r = results.get(gen.id)
    if (!r) return [gen.name, '-', '-', '-', '-']
    const rng = createAnalysisRNG(42 + 9999)
    const nav = analyzeNavigability(r.grid, r.heightMap, rng, 32, 20)
    return [
      gen.name,
      `${(nav.successRate * 100).toFixed(0)}%`,
      nav.avgPathRatio.toFixed(2),
      String(nav.isolatedRegionCount),
      nav.navigabilityScore.toFixed(3),
    ]
  })
  console.log(formatTable(navHeaders, navRows))

  // Spawn point summary
  console.log('\n--- Spawn Points ---')
  const spawnHeaders = ['Algorithm', 'Rifts', 'Resources', 'Total', 'Avg Difficulty']
  const spawnRows = generators.map(gen => {
    const r = results.get(gen.id)
    if (!r) return [gen.name, '-', '-', '-', '-']
    const rifts = r.spawnPoints.filter(s => s.type === 'rift')
    const resources = r.spawnPoints.filter(s => s.type === 'resource')
    const avgDiff = r.spawnPoints.length > 0
      ? (r.spawnPoints.reduce((s, p) => s + p.difficulty, 0) / r.spawnPoints.length).toFixed(2)
      : '-'
    return [gen.name, String(rifts.length), String(resources.length), String(r.spawnPoints.length), avgDiff]
  })
  console.log(formatTable(spawnHeaders, spawnRows))

  console.log('\n--- Height Distribution (histogram) ---')
  for (const gen of generators) {
    const r = results.get(gen.id)
    if (!r) continue
    console.log(`\n  ${gen.name}:`)
    const buckets = new Array(16).fill(0)
    for (let i = 0; i < r.heightMap.length; i++) {
      const bucket = Math.min(15, Math.floor(r.heightMap[i] / 4))
      buckets[bucket]++
    }
    const maxBucket = Math.max(...buckets)
    for (let b = 0; b < 16; b++) {
      const label = `${(b * 4).toString().padStart(3)}-${((b + 1) * 4 - 1).toString().padStart(3)}`
      const barLen = Math.round((buckets[b] / maxBucket) * 40)
      const bar = '#'.repeat(barLen)
      console.log(`    ${label} | ${bar} ${buckets[b]}`)
    }
  }
}

function printBenchmarkResults(
  allResults: Map<string, GenerationResult[]>,
  generators: IWorldGenerator[],
  seedCount: number,
) {
  console.log('\n' + '='.repeat(80))
  console.log(`BENCHMARK: ${seedCount} seeds per algorithm`)
  console.log('='.repeat(80))

  const headers = ['Algorithm', 'Mean(ms)', 'Median(ms)', 'StdDev(ms)', 'Min(ms)', 'Max(ms)',
    'Avg Height Mean', 'Avg Height StdDev']
  const rows = generators.map(gen => {
    const results = allResults.get(gen.id) ?? []
    const times = results.map(r => r.timing.totalMs)
    const heights = results.map(r => r.metadata.avgHeight)

    const mean = times.reduce((a, b) => a + b, 0) / times.length
    const sorted = [...times].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    const stdDev = Math.sqrt(times.reduce((s, t) => s + (t - mean) ** 2, 0) / times.length)

    const hMean = heights.reduce((a, b) => a + b, 0) / heights.length
    const hStd = Math.sqrt(heights.reduce((s, h) => s + (h - hMean) ** 2, 0) / heights.length)

    return [
      gen.name,
      mean.toFixed(0),
      median.toFixed(0),
      stdDev.toFixed(1),
      Math.min(...times).toFixed(0),
      Math.max(...times).toFixed(0),
      hMean.toFixed(1),
      hStd.toFixed(2),
    ]
  })
  console.log(formatTable(headers, rows))
}

// Main
const cliArgs = parseArgs(process.argv)

const generators = ALL_GENERATORS.filter(g => cliArgs.algorithms.includes(g.id))
if (generators.length === 0) {
  console.error('No matching algorithms found. Available:', ALL_GENERATORS.map(g => g.id).join(', '))
  process.exit(1)
}

console.log(`World size: ${cliArgs.width}x${cliArgs.height}x${cliArgs.depth}`)
console.log(`Algorithms: ${generators.map(g => g.name).join(', ')}`)
console.log(`Seeds: ${cliArgs.seeds.length === 1 ? cliArgs.seeds[0] : `${cliArgs.seeds.length} seeds (benchmark mode)`}`)

if (cliArgs.seeds.length === 1) {
  // Single seed mode
  const config = createDefaultConfig(cliArgs.seeds[0])
  config.worldWidth = cliArgs.width
  config.worldHeight = cliArgs.height
  config.worldDepth = cliArgs.depth

  const results = new Map<string, GenerationResult>()
  for (const gen of generators) {
    console.log(`\nGenerating: ${gen.name}...`)
    config.params = gen.getDefaultParams()
    const result = gen.generate(config)
    results.set(gen.id, result)
    console.log(`  Done in ${result.timing.totalMs.toFixed(0)}ms`)
  }

  printResults(results, generators)
} else {
  // Benchmark mode
  const allResults = new Map<string, GenerationResult[]>()
  for (const gen of generators) {
    allResults.set(gen.id, [])
  }

  for (const seed of cliArgs.seeds) {
    const config = createDefaultConfig(seed)
    config.worldWidth = cliArgs.width
    config.worldHeight = cliArgs.height
    config.worldDepth = cliArgs.depth

    for (const gen of generators) {
      config.params = gen.getDefaultParams()
      const result = gen.generate(config)
      allResults.get(gen.id)!.push(result)
    }
    if (seed % 10 === 0) {
      process.stdout.write(`.`)
    }
  }
  console.log()

  // Also show single-seed detail for seed 1
  const config = createDefaultConfig(1)
  config.worldWidth = cliArgs.width
  config.worldHeight = cliArgs.height
  config.worldDepth = cliArgs.depth
  const singleResults = new Map<string, GenerationResult>()
  for (const gen of generators) {
    config.params = gen.getDefaultParams()
    singleResults.set(gen.id, gen.generate(config))
  }
  printResults(singleResults, generators)
  printBenchmarkResults(allResults, generators, cliArgs.seeds.length)
}

console.log('\nDone.')
