/**
 * ViewToggle: button to switch between metrics dashboard and simulation view.
 */

import { useSimulationStore } from '../store/simulation-store.ts'

export function ViewToggle() {
  const viewMode = useSimulationStore(s => s.viewMode)
  const setViewMode = useSimulationStore(s => s.setViewMode)

  return (
    <div data-testid="view-toggle" style={{ display: 'flex', gap: 2 }}>
      <button
        onClick={() => setViewMode('metrics')}
        style={{
          padding: '4px 10px',
          borderRadius: '4px 0 0 4px',
          border: '1px solid #334155',
          background: viewMode === 'metrics' ? '#1e3a5f' : 'transparent',
          color: viewMode === 'metrics' ? '#60a5fa' : '#64748b',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: viewMode === 'metrics' ? 600 : 400,
        }}
      >
        Metrics
      </button>
      <button
        onClick={() => setViewMode('simulation')}
        style={{
          padding: '4px 10px',
          borderRadius: '0 4px 4px 0',
          border: '1px solid #334155',
          borderLeft: 'none',
          background: viewMode === 'simulation' ? '#1e3a5f' : 'transparent',
          color: viewMode === 'simulation' ? '#60a5fa' : '#64748b',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: viewMode === 'simulation' ? 600 : 400,
        }}
      >
        Sim
      </button>
    </div>
  )
}
