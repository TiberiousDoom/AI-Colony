/**
 * Quick comparison table: one row per village, leader highlighted per metric.
 */

import type { VillageState } from '../simulation/competition-engine.ts'
import { getNeed, NeedType } from '../simulation/villager.ts'

const VILLAGE_COLORS: Record<string, string> = {
  utility: '#3b82f6',
  bt: '#f97316',
  goap: '#10b981',
  evolutionary: '#a855f7',
}

interface QuickCompareProps {
  villages: VillageState[]
}

interface MetricDef {
  label: string
  getValue: (v: VillageState) => number
  higherIsBetter: boolean
}

const METRICS: MetricDef[] = [
  { label: 'Population', getValue: v => v.villagers.filter(x => x.alive).length, higherIsBetter: true },
  { label: 'Prosperity', getValue: v => v.history.daily[v.history.daily.length - 1]?.prosperityScore ?? 0, higherIsBetter: true },
  { label: 'Food', getValue: v => v.stockpile.food, higherIsBetter: true },
  { label: 'Wood', getValue: v => v.stockpile.wood, higherIsBetter: true },
  { label: 'Stone', getValue: v => v.stockpile.stone, higherIsBetter: true },
  { label: 'Structures', getValue: v => v.structures.length, higherIsBetter: true },
  {
    label: 'Avg Health',
    getValue: v => {
      const alive = v.villagers.filter(x => x.alive)
      if (alive.length === 0) return 0
      return alive.reduce((sum, x) => sum + getNeed(x, NeedType.Health).current, 0) / alive.length
    },
    higherIsBetter: true,
  },
]

export function QuickCompare({ villages }: QuickCompareProps) {
  return (
    <div
      data-testid="quick-compare"
      style={{
        background: '#1e293b',
        borderRadius: 8,
        padding: 16,
        overflow: 'auto',
      }}
    >
      <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
        Quick Compare
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '4px 8px', color: '#64748b', borderBottom: '1px solid #334155' }}>Village</th>
            {METRICS.map(m => (
              <th key={m.label} style={{ textAlign: 'right', padding: '4px 8px', color: '#64748b', borderBottom: '1px solid #334155' }}>
                {m.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {villages.map(village => {
            const color = VILLAGE_COLORS[village.id] ?? '#94a3b8'
            return (
              <tr key={village.id} style={{ opacity: village.isEliminated ? 0.4 : 1 }}>
                <td style={{ padding: '4px 8px', color, fontWeight: 600, borderBottom: '1px solid #334155' }}>
                  {village.name}
                  {village.isEliminated && <span style={{ color: '#ef4444', marginLeft: 4 }}>(Eliminated)</span>}
                </td>
                {METRICS.map(metric => {
                  const val = metric.getValue(village)
                  const values = villages
                    .filter(v => !v.isEliminated)
                    .map(v => metric.getValue(v))
                  const best = metric.higherIsBetter ? Math.max(...values) : Math.min(...values)
                  const isLeader = !village.isEliminated && val === best && values.length > 1

                  return (
                    <td
                      key={metric.label}
                      style={{
                        textAlign: 'right',
                        padding: '4px 8px',
                        color: isLeader ? '#4ade80' : '#cbd5e1',
                        fontWeight: isLeader ? 700 : 400,
                        borderBottom: '1px solid #334155',
                        background: isLeader ? '#4ade8010' : 'transparent',
                      }}
                    >
                      {Math.round(val)}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
