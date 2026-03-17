/**
 * ViewToggle: buttons to switch between metrics, simulation, and results views.
 */

import { useSimulationStore } from '../store/simulation-store.ts'

type ViewMode = 'metrics' | 'simulation' | 'results' | 'voxel'

const MODES: { key: ViewMode; label: string }[] = [
  { key: 'metrics', label: 'Metrics' },
  { key: 'simulation', label: 'Sim' },
  { key: 'results', label: 'Results' },
  { key: 'voxel', label: 'Voxel' },
]

export function ViewToggle() {
  const viewMode = useSimulationStore(s => s.viewMode)
  const setViewMode = useSimulationStore(s => s.setViewMode)
  const competitionState = useSimulationStore(s => s.competitionState)

  const hasHistory = competitionState?.villages.some(v => v.history.daily.length > 0) ?? false

  return (
    <div data-testid="view-toggle" style={{ display: 'flex', gap: 2 }}>
      {MODES.map((mode, i) => {
        const isFirst = i === 0
        const isLast = i === MODES.length - 1
        const isActive = viewMode === mode.key
        const isDisabled = mode.key === 'results' && !hasHistory

        return (
          <button
            key={mode.key}
            onClick={() => !isDisabled && setViewMode(mode.key)}
            disabled={isDisabled}
            style={{
              padding: '4px 10px',
              borderRadius: isFirst ? '4px 0 0 4px' : isLast ? '0 4px 4px 0' : '0',
              border: '1px solid #334155',
              borderLeft: isFirst ? '1px solid #334155' : 'none',
              background: isActive ? '#1e3a5f' : 'transparent',
              color: isDisabled ? '#334155' : isActive ? '#60a5fa' : '#64748b',
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              fontSize: 12,
              fontWeight: isActive ? 600 : 400,
              opacity: isDisabled ? 0.5 : 1,
            }}
          >
            {mode.label}
          </button>
        )
      })}
    </div>
  )
}
