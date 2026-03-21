import { useState } from 'react'
import { VoxelSandbox } from '../voxel/views/VoxelSandbox.tsx'
import { ComparisonView } from '../voxel/views/ComparisonView.tsx'

interface VoxelAppProps {
  onBack: () => void
}

type VoxelView = 'sandbox' | 'comparison'

function VoxelApp({ onBack }: VoxelAppProps) {
  const [view, setView] = useState<VoxelView>('sandbox')

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: '#0f172a',
      color: '#e2e8f0',
    }}>
      {/* Top Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        padding: '0.5rem 1rem',
        background: '#1e293b',
        borderBottom: '1px solid #334155',
        flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: '1px solid #475569',
            color: '#94a3b8',
            padding: '0.35rem 0.7rem',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.8rem',
          }}
        >
          Hub
        </button>
        <h1 style={{ fontSize: '1rem', fontWeight: 700, color: '#10b981' }}>
          Voxel Pathfinding Sandbox
        </h1>
        <div style={{ display: 'flex', gap: '0.25rem', marginLeft: 'auto' }}>
          {(['sandbox', 'comparison'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                background: view === v ? '#334155' : 'transparent',
                border: `1px solid ${view === v ? '#475569' : 'transparent'}`,
                color: view === v ? '#e2e8f0' : '#64748b',
                padding: '0.35rem 0.7rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: view === v ? 600 : 400,
                textTransform: 'capitalize',
              }}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {view === 'sandbox' ? <VoxelSandbox /> : <ComparisonView />}
      </div>
    </div>
  )
}

export default VoxelApp
