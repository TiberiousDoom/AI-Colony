/**
 * Scrolling event log showing notable simulation events.
 */

import type { SimulationEvent } from '../simulation/simulation-engine.ts'

interface EventLogProps {
  events: SimulationEvent[]
}

const EVENT_COLORS: Record<string, string> = {
  death: '#ef4444',
  day_start: '#facc15',
  night_start: '#818cf8',
  milestone: '#4ade80',
}

export function EventLog({ events }: EventLogProps) {
  // Show most recent events first, limit to 50
  const recent = events.slice(-50).reverse()

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
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {recent.length === 0 && (
          <div style={{ color: '#475569', fontSize: 13 }}>No events yet</div>
        )}
        {recent.map((event, i) => (
          <div
            key={`${event.tick}-${i}`}
            data-testid="event-log-entry"
            style={{
              fontSize: 13,
              padding: '4px 0',
              borderBottom: '1px solid #334155',
              color: EVENT_COLORS[event.type] ?? '#cbd5e1',
            }}
          >
            <span style={{ color: '#64748b', marginRight: 8 }}>D{event.day + 1}</span>
            {event.message}
          </div>
        ))}
      </div>
    </div>
  )
}
