import { useState, useEffect } from 'react'
import { useWorldgenStore, type WorldgenView } from '../worldgen/store/worldgen-store.ts'
import { MetricsDashboard } from '../worldgen/views/MetricsDashboard.tsx'
import { WorldView } from '../worldgen/views/WorldView.tsx'
import { ParameterTuner } from '../worldgen/views/ParameterTuner.tsx'
import { ALL_GENERATORS } from '../worldgen/generation/registry.ts'
import type { VisualizationMode } from '../worldgen/rendering/worldgen-renderer.ts'

interface WorldgenAppProps {
  onBack: () => void
}

const VIEWS: WorldgenView[] = ['dashboard', 'world', 'tuner']
const VIZ_MODES: { id: VisualizationMode; label: string }[] = [
  { id: 'natural', label: 'Natural' },
  { id: 'heightmap', label: 'Height Map' },
  { id: 'biome', label: 'Biome Map' },
  { id: 'cave', label: 'Cave View' },
]

function WorldgenApp({ onBack }: WorldgenAppProps) {
  const {
    seed, setSeed, selectedAlgorithms, toggleAlgorithm,
    activeView, setActiveView, vizMode, setVizMode,
    crossSectionY, setCrossSectionY,
    generateAll, isGenerating,
  } = useWorldgenStore()

  const [seedInput, setSeedInput] = useState(String(seed))

  useEffect(() => {
    setSeedInput(String(seed))
  }, [seed])

  const handleGenerate = () => {
    const s = parseInt(seedInput) || 42
    setSeed(s)
    // Trigger generation on next tick so seed is set
    setTimeout(() => generateAll(), 0)
  }

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
        gap: '0.75rem',
        padding: '0.5rem 1rem',
        background: '#1e293b',
        borderBottom: '1px solid #334155',
        flexShrink: 0,
        flexWrap: 'wrap',
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
        <h1 style={{ fontSize: '1rem', fontWeight: 700, color: '#f59e0b' }}>
          Voxel World Gen
        </h1>

        {/* Seed input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginLeft: '0.5rem' }}>
          <label style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Seed:</label>
          <input
            type="number"
            value={seedInput}
            onChange={(e) => setSeedInput(e.target.value)}
            style={{
              width: '70px',
              padding: '0.25rem 0.4rem',
              background: '#0f172a',
              border: '1px solid #475569',
              borderRadius: '4px',
              color: '#e2e8f0',
              fontSize: '0.8rem',
            }}
          />
        </div>

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          style={{
            padding: '0.35rem 0.8rem',
            background: isGenerating ? '#475569' : '#f59e0b',
            color: '#0f172a',
            border: 'none',
            borderRadius: '6px',
            cursor: isGenerating ? 'not-allowed' : 'pointer',
            fontWeight: 600,
            fontSize: '0.8rem',
          }}
        >
          {isGenerating ? 'Generating...' : 'Generate All'}
        </button>

        {/* Algorithm toggles */}
        <div style={{ display: 'flex', gap: '0.3rem', marginLeft: '0.5rem' }}>
          {ALL_GENERATORS.map(gen => (
            <button
              key={gen.id}
              onClick={() => toggleAlgorithm(gen.id)}
              style={{
                padding: '0.2rem 0.5rem',
                background: selectedAlgorithms.includes(gen.id) ? '#f59e0b20' : 'transparent',
                border: `1px solid ${selectedAlgorithms.includes(gen.id) ? '#f59e0b' : '#475569'}`,
                color: selectedAlgorithms.includes(gen.id) ? '#f59e0b' : '#64748b',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.7rem',
              }}
            >
              {gen.name}
            </button>
          ))}
        </div>

        {/* View tabs (right side) */}
        <div style={{ display: 'flex', gap: '0.25rem', marginLeft: 'auto' }}>
          {VIEWS.map(v => (
            <button
              key={v}
              onClick={() => setActiveView(v)}
              style={{
                background: activeView === v ? '#334155' : 'transparent',
                border: `1px solid ${activeView === v ? '#475569' : 'transparent'}`,
                color: activeView === v ? '#e2e8f0' : '#64748b',
                padding: '0.35rem 0.7rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: activeView === v ? 600 : 400,
                textTransform: 'capitalize',
              }}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Viz mode bar (only for world view) */}
      {activeView === 'world' && (
        <div style={{
          display: 'flex',
          gap: '0.3rem',
          padding: '0.3rem 1rem',
          background: '#1e293b',
          borderBottom: '1px solid #334155',
          flexShrink: 0,
        }}>
          {VIZ_MODES.map(m => (
            <button
              key={m.id}
              onClick={() => setVizMode(m.id)}
              style={{
                padding: '0.2rem 0.5rem',
                background: vizMode === m.id ? '#f59e0b20' : 'transparent',
                border: `1px solid ${vizMode === m.id ? '#f59e0b' : '#475569'}`,
                color: vizMode === m.id ? '#f59e0b' : '#64748b',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.7rem',
              }}
            >
              {m.label}
            </button>
          ))}
          <span style={{ color: '#475569', margin: '0 0.3rem' }}>|</span>
          <label style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            Y-Cut:
            <input
              type="range"
              min={-1}
              max={63}
              value={crossSectionY}
              onChange={(e) => setCrossSectionY(parseInt(e.target.value))}
              style={{ width: '80px', accentColor: '#f59e0b' }}
            />
            <span style={{ color: '#e2e8f0', minWidth: '2rem' }}>
              {crossSectionY < 0 ? 'Off' : crossSectionY}
            </span>
          </label>
        </div>
      )}

      {/* Main Content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {activeView === 'dashboard' && <MetricsDashboard />}
        {activeView === 'world' && <WorldView />}
        {activeView === 'tuner' && <ParameterTuner />}
      </div>
    </div>
  )
}

export default WorldgenApp
