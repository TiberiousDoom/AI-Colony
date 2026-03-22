import { useWorldgenStore } from '../store/worldgen-store.ts'
import { ALL_GENERATORS } from '../generation/registry.ts'
import { WorldgenBlockType } from '../world/block-types.ts'
import { BiomeType, type GenerationResult } from '../generation/generator-interface.ts'

function formatMs(ms: number): string {
  return ms < 1000 ? `${ms.toFixed(0)}ms` : `${(ms / 1000).toFixed(2)}s`
}

function formatCount(n: number): string {
  if (n > 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n > 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

const BIOME_NAMES: Record<number, string> = {
  [BiomeType.Plains]: 'Plains',
  [BiomeType.Forest]: 'Forest',
  [BiomeType.Desert]: 'Desert',
  [BiomeType.Tundra]: 'Tundra',
  [BiomeType.Swamp]: 'Swamp',
  [BiomeType.Mountains]: 'Mountains',
  [BiomeType.Badlands]: 'Badlands',
}

const BIOME_COLORS: Record<number, string> = {
  [BiomeType.Plains]: '#7cfc00',
  [BiomeType.Forest]: '#228b22',
  [BiomeType.Desert]: '#edc967',
  [BiomeType.Tundra]: '#b0c4de',
  [BiomeType.Swamp]: '#556b2f',
  [BiomeType.Mountains]: '#808080',
  [BiomeType.Badlands]: '#cd853f',
}

function computeBiomeCoverage(biomeMap: Uint8Array): Record<number, number> {
  const counts: Record<number, number> = {}
  for (let i = 0; i < biomeMap.length; i++) {
    const b = biomeMap[i]
    counts[b] = (counts[b] ?? 0) + 1
  }
  return counts
}

export function MetricsDashboard() {
  const { results, selectedAlgorithms } = useWorldgenStore()

  if (results.size === 0) {
    return (
      <div style={{ padding: '2rem', color: '#94a3b8', textAlign: 'center' }}>
        Click "Generate" to run all selected algorithms and see comparison metrics.
      </div>
    )
  }

  const generators = ALL_GENERATORS.filter(g => selectedAlgorithms.includes(g.id))

  return (
    <div style={{ padding: '1rem', overflow: 'auto', height: '100%' }}>
      {/* KPI Cards */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {generators.map(gen => {
          const result = results.get(gen.id)
          if (!result) return null
          const { timing, metadata } = result
          const totalVoxels = 128 * 64 * 128
          const airCount = metadata.blockCounts[WorldgenBlockType.Air] ?? 0
          const solidPct = ((totalVoxels - airCount) / totalVoxels * 100).toFixed(1)

          // Count underground air (caves)
          let caveAir = 0
          for (let x = 0; x < result.grid.worldWidth; x += 4) {
            for (let z = 0; z < result.grid.worldDepth; z += 4) {
              const surfY = Math.floor(result.heightMap[x * result.grid.worldDepth + z])
              for (let y = 1; y < surfY - 1; y++) {
                if (result.grid.getBlock({ x, y, z }) === WorldgenBlockType.Air) caveAir++
              }
            }
          }
          // Scale up from sample
          const caveDensity = caveAir > 0 ? `${(caveAir * 16 / totalVoxels * 100).toFixed(1)}%` : '0%'

          const biomeCoverage = computeBiomeCoverage(result.biomeMap)
          const biomeCount = Object.keys(biomeCoverage).length

          return (
            <div key={gen.id} style={{
              flex: '1 1 220px',
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '12px',
              padding: '1rem',
            }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#f59e0b', marginBottom: '0.75rem' }}>
                {gen.name}
              </h3>
              <div style={{ display: 'grid', gap: '0.4rem', fontSize: '0.8rem', color: '#94a3b8' }}>
                <div>Total: <span style={{ color: '#e2e8f0' }}>{formatMs(timing.totalMs)}</span></div>
                <div>Terrain: <span style={{ color: '#e2e8f0' }}>{formatMs(timing.terrainMs)}</span></div>
                <div>Biomes: <span style={{ color: '#e2e8f0' }}>{formatMs(timing.biomesMs)}</span></div>
                <div>Caves: <span style={{ color: '#e2e8f0' }}>{formatMs(timing.cavesMs)}</span></div>
                <div>Height: <span style={{ color: '#e2e8f0' }}>
                  {metadata.minHeight.toFixed(0)}–{metadata.maxHeight.toFixed(0)} (avg {metadata.avgHeight.toFixed(1)})
                </span></div>
                <div>Solid: <span style={{ color: '#e2e8f0' }}>{solidPct}%</span></div>
                <div>Cave Density: <span style={{ color: '#e2e8f0' }}>{caveDensity}</span></div>
                <div>Biomes: <span style={{ color: '#e2e8f0' }}>{biomeCount}</span></div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Biome Coverage */}
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '12px',
        padding: '1rem',
        marginBottom: '1.5rem',
      }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.75rem' }}>
          Biome Coverage
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(generators.length, 5)}, 1fr)`, gap: '1rem' }}>
          {generators.map(gen => {
            const result = results.get(gen.id)
            if (!result) return null
            const coverage = computeBiomeCoverage(result.biomeMap)
            const total = result.biomeMap.length

            return (
              <div key={gen.id}>
                <div style={{ fontSize: '0.75rem', color: '#f59e0b', fontWeight: 600, marginBottom: '0.4rem' }}>
                  {gen.name}
                </div>
                {Object.entries(coverage).sort((a, b) => Number(b[1]) - Number(a[1])).map(([biome, count]) => {
                  const pct = (count / total * 100)
                  return (
                    <div key={biome} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.2rem' }}>
                      <div style={{
                        width: '8px', height: '8px', borderRadius: '2px',
                        background: BIOME_COLORS[Number(biome)] ?? '#888',
                        flexShrink: 0,
                      }} />
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8', minWidth: '60px' }}>
                        {BIOME_NAMES[Number(biome)] ?? '?'}
                      </span>
                      <div style={{
                        flex: 1, height: '6px', background: '#0f172a', borderRadius: '3px', overflow: 'hidden',
                      }}>
                        <div style={{
                          width: `${pct}%`, height: '100%',
                          background: BIOME_COLORS[Number(biome)] ?? '#888',
                          borderRadius: '3px',
                        }} />
                      </div>
                      <span style={{ fontSize: '0.65rem', color: '#64748b', minWidth: '30px', textAlign: 'right' }}>
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {/* Comparison Table */}
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '12px',
        padding: '1rem',
        overflowX: 'auto',
      }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.75rem' }}>
          Algorithm Comparison
        </h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #334155' }}>
              <th style={{ textAlign: 'left', padding: '0.5rem', color: '#94a3b8' }}>Metric</th>
              {generators.map(gen => (
                <th key={gen.id} style={{ textAlign: 'right', padding: '0.5rem', color: '#f59e0b' }}>
                  {gen.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { label: 'Total Time', fn: (r: GenerationResult) => formatMs(r.timing.totalMs) },
              { label: 'Terrain', fn: (r: GenerationResult) => formatMs(r.timing.terrainMs) },
              { label: 'Biomes', fn: (r: GenerationResult) => formatMs(r.timing.biomesMs) },
              { label: 'Caves', fn: (r: GenerationResult) => formatMs(r.timing.cavesMs) },
              { label: 'Min Height', fn: (r: GenerationResult) => r.metadata.minHeight.toFixed(0) },
              { label: 'Max Height', fn: (r: GenerationResult) => r.metadata.maxHeight.toFixed(0) },
              { label: 'Avg Height', fn: (r: GenerationResult) => r.metadata.avgHeight.toFixed(1) },
              { label: 'Height Range', fn: (r: GenerationResult) => (r.metadata.maxHeight - r.metadata.minHeight).toFixed(0) },
              { label: 'Biome Count', fn: (r: GenerationResult) => String(Object.keys(computeBiomeCoverage(r.biomeMap)).length) },
              { label: 'Water Blocks', fn: (r: GenerationResult) => formatCount(r.metadata.blockCounts[WorldgenBlockType.Water] ?? 0) },
            ].map(row => (
              <tr key={row.label} style={{ borderBottom: '1px solid #1e293b' }}>
                <td style={{ padding: '0.4rem 0.5rem', color: '#94a3b8' }}>{row.label}</td>
                {generators.map(gen => {
                  const result = results.get(gen.id)
                  return (
                    <td key={gen.id} style={{ textAlign: 'right', padding: '0.4rem 0.5rem', color: '#e2e8f0' }}>
                      {result ? row.fn(result) : '—'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
