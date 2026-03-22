import { useWorldgenStore } from '../store/worldgen-store.ts'
import { ALL_GENERATORS } from '../generation/registry.ts'

export function ParameterTuner() {
  const { selectedAlgorithms, paramOverrides, setParam, generateOne } = useWorldgenStore()

  const generators = ALL_GENERATORS.filter(g => selectedAlgorithms.includes(g.id))

  return (
    <div style={{ padding: '1rem', overflow: 'auto', height: '100%' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.min(generators.length, 3)}, 1fr)`,
        gap: '1rem',
      }}>
        {generators.map(gen => {
          const paramDescs = gen.getParamDescriptions()
          const defaults = gen.getDefaultParams()
          const overrides = paramOverrides[gen.id] ?? {}

          return (
            <div key={gen.id} style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '12px',
              padding: '1rem',
            }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#f59e0b', marginBottom: '0.75rem' }}>
                {gen.name}
              </h3>
              <div style={{ display: 'grid', gap: '0.6rem' }}>
                {Object.entries(paramDescs).map(([key, desc]) => {
                  const value = overrides[key] ?? defaults[key]
                  return (
                    <div key={key}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.2rem' }}>
                        <span>{desc.label}</span>
                        <span style={{ color: '#e2e8f0' }}>{value}</span>
                      </div>
                      <input
                        type="range"
                        min={desc.min}
                        max={desc.max}
                        step={desc.step}
                        value={value}
                        onChange={(e) => setParam(gen.id, key, parseFloat(e.target.value))}
                        style={{ width: '100%', accentColor: '#f59e0b' }}
                      />
                    </div>
                  )
                })}
              </div>
              <button
                onClick={() => generateOne(gen.id)}
                style={{
                  marginTop: '0.75rem',
                  width: '100%',
                  padding: '0.4rem',
                  background: '#f59e0b',
                  color: '#0f172a',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.8rem',
                }}
              >
                Regenerate
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
