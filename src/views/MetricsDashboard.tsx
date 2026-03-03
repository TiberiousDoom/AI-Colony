/**
 * Metrics Dashboard: side-by-side dual-village analytics view.
 */

import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { useSimulationStore } from '../store/simulation-store.ts'
import { KPICard } from '../components/KPICard.tsx'
import { EventLog } from '../components/EventLog.tsx'
import { QuickCompare } from '../components/QuickCompare.tsx'
import type { VillagerAction } from '../simulation/villager.ts'
import type { VillageState } from '../simulation/competition-engine.ts'
import type { SimulationEvent } from '../simulation/simulation-engine.ts'

const VILLAGE_COLORS: Record<string, string> = {
  utility: '#3b82f6',
  bt: '#f97316',
}

export function MetricsDashboard() {
  const compState = useSimulationStore(s => s.competitionState)

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

  // Build overlaid chart data (by day)
  const maxDays = Math.max(...villages.map(v => v.history.daily.length))
  const chartData = buildOverlaidChartData(villages, maxDays)

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 280px',
      gridTemplateRows: 'auto 1fr auto',
      gap: 16,
      padding: 16,
      height: '100%',
      overflow: 'auto',
    }}>
      {/* KPI Cards — one row per village */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, gridColumn: '1 / -1' }}>
        {villages.map(village => {
          const alive = village.villagers.filter(v => v.alive)
          const latestSnap = village.history.daily[village.history.daily.length - 1]
          const color = VILLAGE_COLORS[village.id] ?? '#94a3b8'

          return (
            <div key={village.id} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{
                fontSize: 12, color, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: 1,
                minWidth: 100, opacity: village.isEliminated ? 0.5 : 1,
              }}>
                {village.name}
                {village.isEliminated && ' (X)'}
              </div>
              <KPICard label="Pop" value={alive.length} villageColor={color} eliminated={village.isEliminated} />
              <KPICard label="Prosperity" value={latestSnap?.prosperityScore ?? 0} color="#3b82f6" villageColor={color} eliminated={village.isEliminated} />
              <KPICard label="Food" value={village.stockpile.food} color="#facc15" villageColor={color} eliminated={village.isEliminated} />
              <KPICard label="Wood" value={village.stockpile.wood} color="#a78bfa" villageColor={color} eliminated={village.isEliminated} />
              <KPICard label="Stone" value={village.stockpile.stone} color="#94a3b8" villageColor={color} eliminated={village.isEliminated} />
              <KPICard label="Health" value={latestSnap?.avgHealth ?? 0} color="#f87171" villageColor={color} eliminated={village.isEliminated} />
            </div>
          )
        })}
      </div>

      {/* Charts */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        {/* Population Chart */}
        <div data-testid="chart-population" style={{ background: '#1e293b', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
            Population Over Time
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="day" stroke="#64748b" fontSize={11} />
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
        <div data-testid="chart-resources" style={{ background: '#1e293b', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
            Food Stockpiles
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="day" stroke="#64748b" fontSize={11} />
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
        <div data-testid="chart-activity" style={{ background: '#1e293b', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
            Current Activity
          </div>
          <ResponsiveContainer width="100%" height={180}>
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
        <div data-testid="chart-prosperity" style={{ background: '#1e293b', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
            Prosperity Score
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="day" stroke="#64748b" fontSize={11} />
              <YAxis stroke="#64748b" fontSize={11} />
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 4 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {villages.map(v => (
                <Line
                  key={v.id}
                  type="monotone"
                  dataKey={`${v.id}_prosperity`}
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

function buildOverlaidChartData(villages: VillageState[], maxDays: number) {
  const data: Record<string, unknown>[] = []

  for (let i = 0; i < maxDays; i++) {
    const entry: Record<string, unknown> = { day: i }
    for (const village of villages) {
      const snap = village.history.daily[i]
      if (snap) {
        entry[`${village.id}_pop`] = snap.population
        entry[`${village.id}_food`] = snap.food
        entry[`${village.id}_wood`] = snap.wood
        entry[`${village.id}_stone`] = snap.stone
        entry[`${village.id}_prosperity`] = snap.prosperityScore
      }
    }
    data.push(entry)
  }

  return data
}

function computeActivityData(villages: VillageState[]) {
  const order: VillagerAction[] = [
    'idle', 'forage', 'eat', 'rest', 'chop_wood', 'mine_stone',
    'haul', 'fish', 'flee', 'build_shelter', 'build_storage', 'warm_up',
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
