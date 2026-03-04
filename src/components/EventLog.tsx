/**
 * Scrolling event log showing notable simulation events.
 * Supports village-aware color coding and filtering.
 */

import { useState } from 'react'
import type { SimulationEvent } from '../simulation/simulation-engine.ts'

const VILLAGE_COLORS: Record<string, string> = {
  utility: '#3b82f6',
  bt: '#f97316',
}

interface EventLogProps {
  events: SimulationEvent[]
  villageNames?: Record<string, string>
}

const EVENT_COLORS: Record<string, string> = {
  death: '#ef4444',
  birth: '#4ade80',
  day_start: '#facc15',
  night_start: '#818cf8',
  milestone: '#4ade80',
  season_change: '#fbbf24',
  structure_built: '#a78bfa',
  random_event: '#fb923c',
  village_eliminated: '#ef4444',
  critical_population: '#ef4444',
  stagnation_warning: '#f59e0b',
  resource_exhaustion: '#f59e0b',
}

type FilterTab = 'all' | string

export function EventLog({ events, villageNames }: EventLogProps) {
  const [filter, setFilter] = useState<FilterTab>('all')

  // Collect unique village IDs
  const villageIds = Array.from(new Set(events.filter(e => e.villageId).map(e => e.villageId!)))

  // Filter events
  const filtered = filter === 'all'
    ? events
    : events.filter(e => e.villageId === filter || !e.villageId)

  // Show most recent events first, limit to 50
  const recent = filtered.slice(-50).reverse()

  return (
    <div
      data-testid="event-log"
      style={{
        background: '#1e293b',
        borderRadius: 8,
        padding: 16,
        height: '100%',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
        Event Log
      </div>

      {/* Filter tabs */}
      {villageIds.length > 0 && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          <FilterButton label="All" active={filter === 'all'} onClick={() => setFilter('all')} />
          {villageIds.map(vid => (
            <FilterButton
              key={vid}
              label={villageNames?.[vid] ?? vid}
              active={filter === vid}
              color={VILLAGE_COLORS[vid]}
              onClick={() => setFilter(vid)}
            />
          ))}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {recent.length === 0 && (
          <div style={{ color: '#475569', fontSize: 13 }}>No events yet</div>
        )}
        {recent.map((event, i) => {
          const villageColor = event.villageId ? VILLAGE_COLORS[event.villageId] : undefined
          const villageName = event.villageId ? (villageNames?.[event.villageId] ?? event.villageId) : undefined

          return (
            <div
              key={`${event.tick}-${i}`}
              data-testid="event-log-entry"
              style={{
                fontSize: 13,
                padding: '4px 0',
                borderBottom: '1px solid #334155',
                color: EVENT_COLORS[event.type] ?? '#cbd5e1',
                borderLeft: villageColor ? `2px solid ${villageColor}` : undefined,
                paddingLeft: villageColor ? 8 : 0,
              }}
            >
              <span style={{ color: '#64748b', marginRight: 8 }}>D{event.day + 1}</span>
              {villageName && <span style={{ color: villageColor, marginRight: 4 }}>[{villageName}]</span>}
              {event.message}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function FilterButton({ label, active, color, onClick }: {
  label: string
  active: boolean
  color?: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '2px 8px',
        borderRadius: 4,
        border: active ? `1px solid ${color ?? '#3b82f6'}` : '1px solid #334155',
        background: active ? (color ?? '#3b82f6') + '22' : 'transparent',
        color: active ? (color ?? '#3b82f6') : '#64748b',
        cursor: 'pointer',
        fontSize: 11,
      }}
    >
      {label}
    </button>
  )
}
