/**
 * ResultsSummary: post-simulation results screen with winner banner,
 * final stats, key moments, and export capabilities.
 */

import { useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts'
import { useSimulationStore } from '../store/simulation-store.ts'
import { exportRunJSON, exportMetricsCSV, downloadBlob } from '../utils/export.ts'
import { encodeConfigString } from '../config/game-config.ts'
import type { CompetitionState, VillageState } from '../simulation/competition-engine.ts'
import type { SimulationEvent } from '../simulation/simulation-engine.ts'
import { TIMING } from '../config/game-constants.ts'

const VILLAGE_COLORS: Record<string, string> = {
  utility: '#3b82f6',
  bt: '#f97316',
  goap: '#10b981',
}

function getVillageColor(id: string): string {
  return VILLAGE_COLORS[id] ?? '#94a3b8'
}

function getWinnerMessage(state: CompetitionState): { text: string; color: string } {
  if (!state.winner) {
    const alive = state.villages.filter(v => !v.isEliminated)
    if (alive.length === 0) return { text: 'All villages eliminated!', color: '#f87171' }
    if (alive.length > 1) return { text: 'Draw — time limit reached', color: '#fbbf24' }
    return { text: 'Draw', color: '#fbbf24' }
  }
  const winner = state.villages.find(v => v.id === state.winner)
  return {
    text: `${winner?.name ?? state.winner} wins!`,
    color: getVillageColor(state.winner),
  }
}

function getFinalPop(v: VillageState): number {
  return v.villagers.filter(vl => vl.alive).length
}

function getFinalProsperity(v: VillageState): number {
  const daily = v.history.daily
  return daily.length > 0 ? daily[daily.length - 1].prosperityScore : 0
}

function getDaysSurvived(v: VillageState, state: CompetitionState): number {
  if (v.isEliminated && v.eliminationTick !== null) {
    return Math.floor(v.eliminationTick / TIMING.TICKS_PER_DAY)
  }
  return state.dayCount
}

export function ResultsSummary() {
  const compState = useSimulationStore(s => s.competitionState)
  const setSeed = useSimulationStore(s => s.setSeed)
  const reset = useSimulationStore(s => s.reset)
  const start = useSimulationStore(s => s.start)
  const setViewMode = useSimulationStore(s => s.setViewMode)
  const seed = useSimulationStore(s => s.seed)
  const gameConfig = useSimulationStore(s => s.gameConfig)
  const [scrubDay, setScrubDay] = useState<number | null>(null)
  const [shareText, setShareText] = useState('')

  if (!compState) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b' }}>
        No simulation data
      </div>
    )
  }

  const { villages, globalEvents } = compState
  const winnerInfo = getWinnerMessage(compState)

  // Build prosperity chart data
  const maxDays = Math.max(...villages.map(v => v.history.daily.length))
  const prosperityData = Array.from({ length: maxDays }, (_, d) => {
    const point: Record<string, number | string> = { day: d + 1 }
    for (const v of villages) {
      const snap = v.history.daily[d]
      point[v.id] = snap ? snap.prosperityScore : 0
    }
    return point
  })

  // Build population chart data
  const populationData = Array.from({ length: maxDays }, (_, d) => {
    const point: Record<string, number | string> = { day: d + 1 }
    for (const v of villages) {
      const snap = v.history.daily[d]
      point[v.id] = snap ? snap.population : 0
    }
    return point
  })

  // Key moments
  const keyMoments: SimulationEvent[] = [
    ...globalEvents,
    ...villages.flatMap(v => v.events),
  ]
    .filter(e => ['death', 'birth', 'season_change', 'milestone'].includes(e.type))
    .sort((a, b) => a.tick - b.tick)
    .slice(-20)

  const handleRunAgain = () => {
    reset()
    setViewMode('metrics')
    start()
  }

  const handleNewSeed = () => {
    setSeed(Math.floor(Math.random() * 1000000))
    reset()
    setViewMode('metrics')
  }

  const handleExportJSON = () => {
    const blob = exportRunJSON(compState)
    downloadBlob(blob, `ai-colony-run-${seed}.json`)
  }

  const handleExportCSV = () => {
    const blob = exportMetricsCSV(compState)
    downloadBlob(blob, `ai-colony-metrics-${seed}.csv`)
  }

  const btnStyle: React.CSSProperties = {
    background: '#1e293b',
    border: '1px solid #334155',
    color: '#e2e8f0',
    borderRadius: 6,
    padding: '6px 14px',
    cursor: 'pointer',
    fontSize: 13,
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto', overflowY: 'auto', height: '100%', color: '#e2e8f0' }}>
      {/* Winner Banner */}
      <div style={{
        textAlign: 'center',
        marginBottom: 24,
        padding: '20px 16px',
        background: '#0f172a',
        borderRadius: 12,
        border: `2px solid ${winnerInfo.color}44`,
      }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: winnerInfo.color, marginBottom: 4 }}>
          {winnerInfo.text}
        </div>
        <div style={{ fontSize: 13, color: '#64748b' }}>
          Day {compState.dayCount} | Seed: {compState.config.seed}
        </div>
      </div>

      {/* Final Stats Table */}
      <div style={{ marginBottom: 24, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #334155' }}>
              <th style={{ textAlign: 'left', padding: '8px 12px', color: '#64748b' }}>Metric</th>
              {villages.map(v => (
                <th key={v.id} style={{ textAlign: 'right', padding: '8px 12px', color: getVillageColor(v.id) }}>
                  {v.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { label: 'Population', fn: (v: VillageState) => getFinalPop(v) },
              { label: 'Prosperity', fn: (v: VillageState) => Math.round(getFinalProsperity(v)) },
              { label: 'Food', fn: (v: VillageState) => Math.round(v.stockpile.food) },
              { label: 'Wood', fn: (v: VillageState) => Math.round(v.stockpile.wood) },
              { label: 'Stone', fn: (v: VillageState) => Math.round(v.stockpile.stone) },
              { label: 'Structures', fn: (v: VillageState) => v.structures.length },
              { label: 'Days Survived', fn: (v: VillageState) => getDaysSurvived(v, compState) },
              { label: 'Status', fn: (v: VillageState) => v.isEliminated ? 'Eliminated' : 'Alive' },
            ].map(row => (
              <tr key={row.label} style={{ borderBottom: '1px solid #1e293b' }}>
                <td style={{ padding: '6px 12px', color: '#94a3b8' }}>{row.label}</td>
                {villages.map(v => (
                  <td key={v.id} style={{
                    textAlign: 'right',
                    padding: '6px 12px',
                    color: v.isEliminated && row.label !== 'Status' ? '#475569' : '#e2e8f0',
                    fontWeight: row.label === 'Status' && v.isEliminated ? 400 : undefined,
                  }}>
                    {row.fn(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Charts */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 400px', background: '#0f172a', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>Prosperity Over Time</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={prosperityData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="day" stroke="#475569" fontSize={11} />
              <YAxis stroke="#475569" fontSize={11} />
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', fontSize: 12 }} />
              <Legend />
              {scrubDay !== null && <ReferenceLine x={scrubDay} stroke="#f59e0b" strokeDasharray="3 3" />}
              {villages.map(v => (
                <Line key={v.id} type="monotone" dataKey={v.id} name={v.name} stroke={getVillageColor(v.id)} dot={false} strokeWidth={2} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div style={{ flex: '1 1 400px', background: '#0f172a', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>Population Over Time</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={populationData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="day" stroke="#475569" fontSize={11} />
              <YAxis stroke="#475569" fontSize={11} />
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', fontSize: 12 }} />
              <Legend />
              {scrubDay !== null && <ReferenceLine x={scrubDay} stroke="#f59e0b" strokeDasharray="3 3" />}
              {villages.map(v => (
                <Line key={v.id} type="monotone" dataKey={v.id} name={v.name} stroke={getVillageColor(v.id)} dot={false} strokeWidth={2} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Timeline Scrubber */}
      {maxDays > 1 && (
        <div style={{ marginBottom: 24, background: '#0f172a', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>
            Timeline Scrubber {scrubDay !== null && `— Day ${scrubDay}`}
          </div>
          <input
            type="range"
            min={1}
            max={maxDays}
            value={scrubDay ?? 1}
            onChange={e => setScrubDay(parseInt(e.target.value, 10))}
            style={{ width: '100%', accentColor: '#3b82f6' }}
          />
          {scrubDay !== null && (
            <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
              {villages.map(v => {
                const snap = v.history.daily[scrubDay - 1]
                if (!snap) return null
                return (
                  <div key={v.id} style={{ fontSize: 12, color: getVillageColor(v.id) }}>
                    <div style={{ fontWeight: 600 }}>{v.name}</div>
                    <div style={{ color: '#94a3b8' }}>
                      Pop: {snap.population} | Food: {Math.round(snap.food)} | Health: {Math.round(snap.avgHealth)} | Score: {Math.round(snap.prosperityScore)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Key Moments */}
      <div style={{ marginBottom: 24, background: '#0f172a', borderRadius: 8, padding: 16 }}>
        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>Key Moments</div>
        <div style={{ maxHeight: 180, overflowY: 'auto' }}>
          {keyMoments.length === 0 ? (
            <div style={{ fontSize: 12, color: '#475569', fontStyle: 'italic' }}>No key moments recorded</div>
          ) : (
            keyMoments.map((ev, i) => (
              <div key={i} style={{ fontSize: 12, color: '#94a3b8', marginBottom: 2, display: 'flex', gap: 8 }}>
                <span style={{ color: '#475569', minWidth: 50 }}>Day {Math.floor(ev.tick / TIMING.TICKS_PER_DAY)}</span>
                <span style={{ color: ev.villageId ? getVillageColor(ev.villageId) : '#64748b' }}>{ev.message}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button style={btnStyle} onClick={handleRunAgain}>Run Again (Same Seed)</button>
        <button style={btnStyle} onClick={handleNewSeed}>New Seed</button>
        <button style={btnStyle} onClick={handleExportJSON}>Export JSON</button>
        <button style={btnStyle} onClick={handleExportCSV}>Export CSV</button>
        <button style={btnStyle} onClick={() => {
          const str = encodeConfigString(gameConfig)
          navigator.clipboard?.writeText(str).then(() => setShareText('Copied!'))
            .catch(() => setShareText(str))
          if (!navigator.clipboard) setShareText(str)
        }}>
          Share Config {shareText && <span style={{ color: '#4ade80', marginLeft: 4 }}>{shareText === 'Copied!' ? shareText : ''}</span>}
        </button>
        <button style={btnStyle} onClick={() => setViewMode('metrics')}>Back to Metrics</button>
      </div>
      {shareText && shareText !== 'Copied!' && (
        <div style={{ textAlign: 'center', marginTop: 8, fontSize: 11, color: '#94a3b8', wordBreak: 'break-all' }}>
          {shareText}
        </div>
      )}
    </div>
  )
}
