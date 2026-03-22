import { useWorldgenStore } from '../store/worldgen-store.ts'
import { ALL_GENERATORS } from '../generation/registry.ts'
import { WorldgenBlockType } from '../world/block-types.ts'

function formatMs(ms: number): string {
  return ms < 1000 ? `${ms.toFixed(0)}ms` : `${(ms / 1000).toFixed(2)}s`
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
          const airCount = metadata.blockCounts[WorldgenBlockType.Air] ?? 0
          const totalBlocks = gen.getDefaultParams().baseHeight ? 128 * 64 * 128 : 0
          const solidPct = totalBlocks > 0 ? ((totalBlocks - airCount) / totalBlocks * 100).toFixed(1) : '?'

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
                <div>Height: <span style={{ color: '#e2e8f0' }}>
                  {metadata.minHeight.toFixed(0)} — {metadata.maxHeight.toFixed(0)} (avg {metadata.avgHeight.toFixed(1)})
                </span></div>
                <div>Solid: <span style={{ color: '#e2e8f0' }}>{solidPct}%</span></div>
              </div>
            </div>
          )
        })}
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
              { label: 'Generation Time', fn: (r: typeof results extends Map<string, infer V> ? V : never) => formatMs(r.timing.totalMs) },
              { label: 'Terrain Time', fn: (r: any) => formatMs(r.timing.terrainMs) },
              { label: 'Min Height', fn: (r: any) => r.metadata.minHeight.toFixed(0) },
              { label: 'Max Height', fn: (r: any) => r.metadata.maxHeight.toFixed(0) },
              { label: 'Avg Height', fn: (r: any) => r.metadata.avgHeight.toFixed(1) },
              { label: 'Height Range', fn: (r: any) => (r.metadata.maxHeight - r.metadata.minHeight).toFixed(0) },
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
