/**
 * TrainingView: shows evolutionary AI training progress.
 * Displays generation counter, fitness chart, convergence indicator, and controls.
 */

import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts'
import type { TrainingState } from '../training/trainer.ts'

interface TrainingViewProps {
  state: TrainingState
  isTraining: boolean
  onStop: () => void
  onClose: () => void
  startTime: number
}

export function TrainingView({ state, isTraining, onStop, onClose, startTime }: TrainingViewProps) {
  const chartData = state.fitnessHistory.map((fitness, i) => ({
    generation: i + 1,
    fitness,
  }))

  const progressPct = state.generation > 0
    ? Math.round((state.generation / Math.max(state.generation, chartData.length + 1)) * 100)
    : 0

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        background: '#1e293b',
        borderRadius: 12,
        padding: 24,
        width: 500,
        maxWidth: '90vw',
        border: '1px solid #334155',
      }}>
        <h3 style={{ color: '#e2e8f0', margin: '0 0 16px 0', fontSize: 16 }}>
          Evolutionary AI Training
        </h3>

        {/* Progress bar */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
            <span>Generation {state.generation}</span>
            <span>{progressPct}%</span>
          </div>
          <div style={{ height: 6, background: '#0f172a', borderRadius: 3 }}>
            <div style={{
              height: '100%',
              width: `${progressPct}%`,
              background: state.isPlateaued ? '#f59e0b' : '#3b82f6',
              borderRadius: 3,
              transition: 'width 0.3s',
            }} />
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 16, fontSize: 13 }}>
          <div>
            <div style={{ color: '#64748b', fontSize: 11 }}>Best Fitness</div>
            <div style={{ color: '#4ade80', fontWeight: 600 }}>{state.bestFitness.toFixed(1)}</div>
          </div>
          <div>
            <div style={{ color: '#64748b', fontSize: 11 }}>Elapsed</div>
            <div style={{ color: '#94a3b8' }}>{elapsed.toFixed(1)}s</div>
          </div>
          {state.isPlateaued && (
            <div>
              <div style={{ color: '#64748b', fontSize: 11 }}>Status</div>
              <div style={{ color: '#f59e0b' }}>Plateaued</div>
            </div>
          )}
        </div>

        {/* Fitness chart */}
        {chartData.length > 1 && (
          <div style={{ marginBottom: 16 }}>
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="generation" stroke="#64748b" fontSize={10} />
                <YAxis stroke="#64748b" fontSize={10} />
                <Line
                  type="monotone"
                  dataKey="fitness"
                  stroke="#3b82f6"
                  dot={false}
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Controls */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {isTraining ? (
            <button
              onClick={onStop}
              style={{
                background: '#f59e0b',
                color: '#0f172a',
                border: 'none',
                borderRadius: 6,
                padding: '8px 16px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              Stop Early (Use Best)
            </button>
          ) : (
            <button
              onClick={onClose}
              style={{
                background: '#3b82f6',
                color: '#ffffff',
                border: 'none',
                borderRadius: 6,
                padding: '8px 16px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              {state.isComplete || state.bestFitness > 0 ? 'Use Trained Genome' : 'Close'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
