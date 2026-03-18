import { useEffect, useState } from 'react'
import { useComparisonStore, type ScenarioName } from '../store/comparison-store.ts'
import type { SimulationMetrics } from '../simulation/simulation-engine.ts'
import type { Agent } from '../agents/agent.ts'
import { ScenarioEditor } from './ScenarioEditor.tsx'

const SCENARIOS: { key: ScenarioName; label: string }[] = [
  { key: 'none', label: 'Free Run' },
  { key: 'canyon-run', label: 'Canyon Run' },
  { key: 'bridge-collapse', label: 'Bridge Collapse' },
  { key: 'custom', label: 'Custom' },
]

const stateColors: Record<string, string> = {
  'Idle': '#64748b',
  'Navigating': '#22c55e',
  'Re-routing': '#f59e0b',
  'Waiting': '#eab308',
  'Falling': '#3b82f6',
  'Stuck': '#ef4444',
}

const ALGO_PANELS: { key: 'astar' | 'hpastar' | 'flowfield' | 'dstar'; label: string; color: string }[] = [
  { key: 'astar', label: 'A* Pathfinder', color: '#60a5fa' },
  { key: 'hpastar', label: 'HPA* Pathfinder', color: '#f59e0b' },
  { key: 'flowfield', label: 'FlowField Pathfinder', color: '#34d399' },
  { key: 'dstar', label: 'D* Lite Pathfinder', color: '#a78bfa' },
]

function AlgoPanel({ label, color, metrics, agents }: {
  label: string
  color: string
  metrics: SimulationMetrics | null
  agents: ReadonlyArray<Agent>
}) {
  return (
    <div style={{ flex: 1, border: '1px solid #334155', borderRadius: 6, padding: 12, overflow: 'auto', minWidth: 0 }}>
      <h3 style={{ margin: '0 0 8px', color, fontSize: 14 }}>{label}</h3>
      {metrics && (
        <div style={{ fontSize: 12, marginBottom: 8 }}>
          <div style={metricRow}>Tick: {metrics.tick}</div>
          <div style={metricRow}>Agents: {metrics.agentCount}</div>
          <div style={metricRow}>Trips: {metrics.tripsCompleted}</div>
          <div style={metricRow}>Stuck: {metrics.stuckAgents}</div>
          <div style={metricRow}>Path ms: {metrics.pathfindingTimeMs.toFixed(3)}</div>
          <div style={metricRow}>Errors: {metrics.algorithmErrors}</div>
          <div style={metricRow}>Wait events: {metrics.waitEvents}</div>
        </div>
      )}
      <div style={{ fontSize: 11 }}>
        {agents.map(a => (
          <div key={a.id} style={{ padding: '2px 0', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{
              display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
              background: stateColors[a.state] ?? '#64748b',
            }} />
            Agent #{a.id}: {a.state} @ ({a.position.x},{a.position.y},{a.position.z})
          </div>
        ))}
      </div>
    </div>
  )
}

export function ComparisonView() {
  const [showEditor, setShowEditor] = useState(false)
  const runner = useComparisonStore(s => s.runner)
  const isRunning = useComparisonStore(s => s.isRunning)
  const tick = useComparisonStore(s => s.tick)
  const astarAgents = useComparisonStore(s => s.astarAgents)
  const hpastarAgents = useComparisonStore(s => s.hpastarAgents)
  const flowfieldAgents = useComparisonStore(s => s.flowfieldAgents)
  const dstarAgents = useComparisonStore(s => s.dstarAgents)
  const metrics = useComparisonStore(s => s.metrics)
  const seed = useComparisonStore(s => s.seed)
  const selectedScenario = useComparisonStore(s => s.selectedScenario)
  const report = useComparisonStore(s => s.report)

  const init = useComparisonStore(s => s.init)
  const start = useComparisonStore(s => s.start)
  const pause = useComparisonStore(s => s.pause)
  const reset = useComparisonStore(s => s.reset)
  const setSeed = useComparisonStore(s => s.setSeed)
  const setScenario = useComparisonStore(s => s.setScenario)
  const runScenario = useComparisonStore(s => s.runScenario)
  const exportReport = useComparisonStore(s => s.exportReport)

  useEffect(() => {
    if (!runner) init()
  }, [runner, init])

  const agentsByAlgo: Record<string, ReadonlyArray<Agent>> = {
    astar: astarAgents,
    hpastar: hpastarAgents,
    flowfield: flowfieldAgents,
    dstar: dstarAgents,
  }

  return (
    <div style={{ display: 'flex', height: '100%', background: '#0f172a', color: '#e2e8f0' }}>
      {/* Side-by-side panels */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 12, gap: 12, overflow: 'auto' }}>
        <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0 }}>
          {ALGO_PANELS.map(panel => (
            <AlgoPanel
              key={panel.key}
              label={panel.label}
              color={panel.color}
              metrics={metrics ? metrics[panel.key] : null}
              agents={agentsByAlgo[panel.key] ?? []}
            />
          ))}
        </div>

        {/* Report panel */}
        {report && (
          <div style={{
            border: '1px solid #334155', borderRadius: 6, padding: 12,
            maxHeight: 300, overflow: 'auto', fontSize: 11,
            fontFamily: 'monospace', whiteSpace: 'pre-wrap', background: '#1e293b',
          }}>
            {report}
          </div>
        )}
      </div>

      {/* Controls Panel */}
      <div style={{
        width: 240, padding: 12, overflowY: 'auto',
        background: '#1e293b', borderLeft: '1px solid #334155',
        fontSize: 13, display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <h3 style={{ margin: 0, fontSize: 16, color: '#94a3b8' }}>Compare</h3>

        <div style={{ display: 'flex', gap: 6 }}>
          {!isRunning ? (
            <button onClick={start} style={btnStyle}>Play</button>
          ) : (
            <button onClick={pause} style={btnStyle}>Pause</button>
          )}
          <button onClick={reset} style={btnStyle}>Reset</button>
        </div>

        <div>
          <label style={labelStyle}>Seed</label>
          <input
            type="number"
            value={seed}
            onChange={e => setSeed(Number(e.target.value))}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Tick</label>
          <div style={{ fontSize: 18, fontWeight: 600 }}>{tick}</div>
        </div>

        <div>
          <label style={labelStyle}>Scenario</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {SCENARIOS.map(s => (
              <button
                key={s.key}
                onClick={() => setScenario(s.key)}
                style={{
                  ...btnStyle,
                  fontSize: 11,
                  border: selectedScenario === s.key ? '2px solid #4488ff' : '1px solid #334155',
                  background: selectedScenario === s.key ? '#1e3a5f' : '#334155',
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
          {selectedScenario !== 'none' && (
            <button onClick={runScenario} style={{ ...btnStyle, marginTop: 6, width: '100%', background: '#1e3a5f' }}>
              Run Scenario
            </button>
          )}
        </div>

        <button onClick={exportReport} style={{ ...btnStyle, background: '#1e3a5f' }}>
          Export Report
        </button>

        {selectedScenario === 'custom' && (
          <button onClick={() => setShowEditor(true)} style={{ ...btnStyle, background: '#166534' }}>
            Open Editor
          </button>
        )}
      </div>

      {showEditor && (
        <ScenarioEditor
          onSave={(json) => {
            setShowEditor(false)
            // Store the custom JSON for use by runScenario
            sessionStorage.setItem('customScenarioJSON', json)
          }}
          onClose={() => setShowEditor(false)}
        />
      )}
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 4, border: '1px solid #334155',
  background: '#334155', color: '#e2e8f0', cursor: 'pointer', fontSize: 13,
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, color: '#64748b',
  textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4,
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '4px 8px', borderRadius: 4,
  border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0',
  fontSize: 13,
}

const metricRow: React.CSSProperties = {
  padding: '2px 0', borderBottom: '1px solid #1e293b',
}
