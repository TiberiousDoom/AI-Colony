/**
 * Metrics Dashboard: side-by-side dual-village analytics view.
 */

import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { useSimulationStore } from '../store/simulation-store.ts'
import { KPICard } from '../components/KPICard.tsx'
import { EventLog } from '../components/EventLog.tsx'
import { QuickCompare } from '../components/QuickCompare.tsx'
import { useState } from 'react'
import type { VillagerAction } from '../simulation/villager.ts'
import type { VillageState } from '../simulation/competition-engine.ts'
import type { SimulationEvent } from '../simulation/simulation-engine.ts'
import { perCapitaProsperity } from '../utils/scoring.ts'
import { EvolutionaryAI } from '../simulation/ai/evolutionary-ai.ts'
import { TIMING } from '../config/game-constants.ts'
import { useIsMobile } from '../hooks/useIsMobile.ts'

const VILLAGE_COLORS: Record<string, string> = {
  utility: '#3b82f6',
  bt: '#f97316',
  goap: '#10b981',
  evolutionary: '#e879f9',
}

export function MetricsDashboard() {
  const compState = useSimulationStore(s => s.competitionState)
  const [showPerCapita, setShowPerCapita] = useState(false)
  const mobile = useIsMobile()

  if (!compState) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: '#64748b',
        fontSize: 16,
      }}>
        Press Start to begin the simulation
      </div>
    )
  }

  const { villages, globalEvents } = compState

  // Merge all events for the log
  const allEvents: SimulationEvent[] = [
    ...globalEvents,
    ...villages.flatMap(v => v.events),
  ].sort((a, b) => a.tick - b.tick)

  const villageNames: Record<string, string> = {}
  for (const v of villages) villageNames[v.id] = v.name

  // Build overlaid chart data (snapshots every 6 hours)
  const maxSnapshots = Math.max(...villages.map(v => v.history.daily.length))
  const chartData = buildOverlaidChartData(villages, maxSnapshots)
  const dayTicks = getDayTicks(maxSnapshots)

  const chartHeight = mobile ? 140 : 180
  const chartPad = mobile ? 10 : 16
  const chartStyle = { background: '#1e293b', borderRadius: 8, padding: chartPad }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: mobile ? '1fr' : '1fr 280px',
      gridTemplateRows: 'auto 1fr auto',
      gap: mobile ? 10 : 16,
      padding: mobile ? 8 : 16,
      height: '100%',
      overflow: 'auto',
    }}>
      {/* KPI Cards — one row per village */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: mobile ? 6 : 8, gridColumn: '1 / -1' }}>
        {villages.map(village => {
          const alive = village.villagers.filter(v => v.alive)
          const latestSnap = village.history.daily[village.history.daily.length - 1]
          const color = VILLAGE_COLORS[village.id] ?? '#94a3b8'

          return (
            <div key={village.id} style={{ display: 'flex', gap: mobile ? 6 : 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{
                fontSize: mobile ? 11 : 12, color, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: 1,
                minWidth: mobile ? 80 : 100, opacity: village.isEliminated ? 0.5 : 1,
              }}>
                {village.name}
                {village.isEliminated && ' (X)'}
              </div>
              <KPICard label="Pop" value={alive.length} villageColor={color} eliminated={village.isEliminated} compact={mobile} />
              <KPICard label="Prosperity" value={latestSnap?.prosperityScore ?? 0} color="#3b82f6" villageColor={color} eliminated={village.isEliminated} compact={mobile} />
              <KPICard label="Food" value={village.stockpile.food} color="#facc15" villageColor={color} eliminated={village.isEliminated} compact={mobile} />
              <KPICard label="Wood" value={village.stockpile.wood} color="#a78bfa" villageColor={color} eliminated={village.isEliminated} compact={mobile} />
              <KPICard label="Stone" value={village.stockpile.stone} color="#94a3b8" villageColor={color} eliminated={village.isEliminated} compact={mobile} />
              <KPICard label="Health" value={latestSnap?.avgHealth ?? 0} color="#f87171" villageColor={color} eliminated={village.isEliminated} compact={mobile} />
              {village.aiSystem instanceof EvolutionaryAI && (() => {
                const genome = village.aiSystem.getGenome()
                return (
                  <div style={{ fontSize: 10, color: '#e879f9', marginLeft: 4, alignSelf: 'center' }}>
                    Gen {genome.generation} | Fit: {genome.fitness.toFixed(0)}
                  </div>
                )
              })()}
            </div>
          )
        })}
      </div>

      {/* Charts */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: mobile ? 10 : 16, minWidth: 0 }}>
        {/* Population Chart */}
        <div data-testid="chart-population" style={chartStyle}>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
            Population Over Time
          </div>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="day" stroke="#64748b" fontSize={11} ticks={dayTicks} type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v: number) => String(Math.round(v))} />
              <YAxis stroke="#64748b" fontSize={11} />
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 4 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {villages.map(v => (
                <Line
                  key={v.id}
                  type="monotone"
                  dataKey={`${v.id}_pop`}
                  name={v.name}
                  stroke={VILLAGE_COLORS[v.id] ?? '#94a3b8'}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Resource Stockpiles Chart */}
        <div data-testid="chart-resources" style={chartStyle}>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
            Food Stockpiles
          </div>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="day" stroke="#64748b" fontSize={11} ticks={dayTicks} type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v: number) => String(Math.round(v))} />
              <YAxis stroke="#64748b" fontSize={11} />
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 4 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {villages.map(v => (
                <Line
                  key={v.id}
                  type="monotone"
                  dataKey={`${v.id}_food`}
                  name={`${v.name} Food`}
                  stroke={VILLAGE_COLORS[v.id] ?? '#94a3b8'}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Activity Breakdown — side by side bars */}
        <div data-testid="chart-activity" style={chartStyle}>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
            Current Activity
          </div>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={computeActivityData(villages)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="action" stroke="#64748b" fontSize={10} />
              <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 4 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {villages.map(v => (
                <Bar
                  key={v.id}
                  dataKey={v.id}
                  name={v.name}
                  fill={VILLAGE_COLORS[v.id] ?? '#94a3b8'}
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Prosperity Score Chart */}
        <div data-testid="chart-prosperity" style={chartStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>
              {showPerCapita ? 'Per-Capita Prosperity' : 'Prosperity Score'}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#64748b', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showPerCapita}
                onChange={(e) => setShowPerCapita(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              Per-capita
            </label>
          </div>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="day" stroke="#64748b" fontSize={11} ticks={dayTicks} type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v: number) => String(Math.round(v))} />
              <YAxis stroke="#64748b" fontSize={11} />
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 4 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {villages.map(v => (
                <Line
                  key={v.id}
                  type="monotone"
                  dataKey={showPerCapita ? `${v.id}_perCapita` : `${v.id}_prosperity`}
                  name={v.name}
                  stroke={VILLAGE_COLORS[v.id] ?? '#94a3b8'}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Quick Compare */}
        <QuickCompare villages={villages} />
      </div>

      {/* Event Log */}
      <div style={{ minHeight: 300 }}>
        <EventLog events={allEvents} villageNames={villageNames} />
      </div>
    </div>
  )
}

function buildOverlaidChartData(villages: VillageState[], maxSnapshots: number) {
  const data: Record<string, unknown>[] = []

  for (let i = 0; i < maxSnapshots; i++) {
    const entry: Record<string, unknown> = { day: i / TIMING.SNAPSHOTS_PER_DAY }
    for (const village of villages) {
      const snap = village.history.daily[i]
      if (snap) {
        entry.day = snap.day
        entry[`${village.id}_pop`] = snap.population
        entry[`${village.id}_food`] = snap.food
        entry[`${village.id}_wood`] = snap.wood
        entry[`${village.id}_stone`] = snap.stone
        entry[`${village.id}_prosperity`] = snap.prosperityScore
        entry[`${village.id}_perCapita`] = snap.population > 0
          ? Math.round(perCapitaProsperity(snap.prosperityScore, snap.population) * 10) / 10
          : 0
      }
    }
    data.push(entry)
  }

  return data
}

function getDayTicks(maxSnapshots: number): number[] {
  const maxDays = Math.ceil(maxSnapshots / TIMING.SNAPSHOTS_PER_DAY)
  return Array.from({ length: maxDays + 1 }, (_, i) => i)
}

function computeActivityData(villages: VillageState[]) {
  const order: VillagerAction[] = [
    'idle', 'forage', 'eat', 'rest', 'chop_wood', 'mine_stone',
    'haul', 'fish', 'flee', 'build_shelter', 'build_storage', 'warm_up',
    'build_watchtower', 'build_farm', 'build_wall', 'build_well',
    'cool_down', 'attack', 'craft_weapon', 'craft_armor',
  ]

  return order
    .filter(action => {
      return villages.some(v => {
        const alive = v.villagers.filter(x => x.alive)
        return alive.some(x => x.currentAction === action)
      })
    })
    .map(action => {
      const entry: Record<string, unknown> = { action }
      for (const village of villages) {
        const alive = village.villagers.filter(x => x.alive)
        entry[village.id] = alive.filter(x => x.currentAction === action).length
      }
      return entry
    })
}
