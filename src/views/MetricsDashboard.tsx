/**
 * Metrics Dashboard: the default "stealth mode" analytics view.
 */

import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { useSimulationStore } from '../store/simulation-store.ts'
import { KPICard } from '../components/KPICard.tsx'
import { EventLog } from '../components/EventLog.tsx'
import type { VillagerAction } from '../simulation/villager.ts'

const CHART_COLORS = {
  population: '#4ade80',
  food: '#facc15',
  wood: '#a78bfa',
  stone: '#94a3b8',
  prosperity: '#3b82f6',
  health: '#f87171',
}

export function MetricsDashboard() {
  const state = useSimulationStore(s => s.state)

  if (!state) {
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

  const { history, villagers, stockpile, events } = state
  const daily = history.daily
  const alive = villagers.filter(v => v.alive)
  const latestSnapshot = daily[daily.length - 1]

  // Activity breakdown from live state
  const activityData = computeActivityData(alive)

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 280px',
      gridTemplateRows: 'auto 1fr',
      gap: 16,
      padding: 16,
      height: '100%',
      overflow: 'auto',
    }}>
      {/* KPI Cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', gridColumn: '1 / -1' }}>
        <KPICard label="Population" value={alive.length} color="#4ade80" />
        <KPICard label="Prosperity" value={latestSnapshot?.prosperityScore ?? 0} color="#3b82f6" />
        <KPICard label="Food" value={stockpile.food} color="#facc15" />
        <KPICard label="Wood" value={stockpile.wood} color="#a78bfa" />
        <KPICard label="Stone" value={stockpile.stone} color="#94a3b8" />
        <KPICard label="Avg Health" value={latestSnapshot?.avgHealth ?? 0} color="#f87171" />
      </div>

      {/* Charts */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        {/* Population Chart */}
        <div data-testid="chart-population" style={{ background: '#1e293b', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
            Population Over Time
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="day" stroke="#64748b" fontSize={11} />
              <YAxis stroke="#64748b" fontSize={11} />
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 4 }} />
              <Line type="monotone" dataKey="population" stroke={CHART_COLORS.population} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Resource Stockpiles Chart */}
        <div data-testid="chart-resources" style={{ background: '#1e293b', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
            Resource Stockpiles
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="day" stroke="#64748b" fontSize={11} />
              <YAxis stroke="#64748b" fontSize={11} />
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 4 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="food" stackId="1" fill={CHART_COLORS.food} stroke={CHART_COLORS.food} fillOpacity={0.6} />
              <Area type="monotone" dataKey="wood" stackId="1" fill={CHART_COLORS.wood} stroke={CHART_COLORS.wood} fillOpacity={0.6} />
              <Area type="monotone" dataKey="stone" stackId="1" fill={CHART_COLORS.stone} stroke={CHART_COLORS.stone} fillOpacity={0.6} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Activity Breakdown Chart */}
        <div data-testid="chart-activity" style={{ background: '#1e293b', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
            Current Activity
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={activityData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="action" stroke="#64748b" fontSize={10} />
              <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 4 }} />
              <Bar dataKey="count" fill="#60a5fa" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Prosperity Score Chart */}
        <div data-testid="chart-prosperity" style={{ background: '#1e293b', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
            Prosperity Score
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="day" stroke="#64748b" fontSize={11} />
              <YAxis stroke="#64748b" fontSize={11} />
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 4 }} />
              <Line type="monotone" dataKey="prosperityScore" stroke={CHART_COLORS.prosperity} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Event Log */}
      <div style={{ minHeight: 300 }}>
        <EventLog events={events} />
      </div>
    </div>
  )
}

function computeActivityData(alive: readonly { currentAction: VillagerAction }[]) {
  const counts = new Map<string, number>()
  for (const v of alive) {
    counts.set(v.currentAction, (counts.get(v.currentAction) ?? 0) + 1)
  }
  // Only show actions that have > 0 count, in a readable order
  const order: VillagerAction[] = ['idle', 'forage', 'eat', 'rest', 'chop_wood', 'haul', 'fish']
  return order
    .filter(a => (counts.get(a) ?? 0) > 0)
    .map(a => ({ action: a, count: counts.get(a) ?? 0 }))
}
