/**
 * KPI card: large number, small label, subtle background.
 */

interface KPICardProps {
  label: string
  value: string | number
  color?: string
  villageColor?: string
  eliminated?: boolean
  compact?: boolean
}

export function KPICard({ label, value, color = '#4ade80', villageColor, eliminated, compact }: KPICardProps) {
  return (
    <div
      data-testid="kpi-card"
      style={{
        background: eliminated ? '#1a1f2e' : '#1e293b',
        borderRadius: compact ? 6 : 8,
        padding: compact ? '8px 12px' : '16px 20px',
        minWidth: compact ? 80 : 140,
        borderLeft: `3px solid ${villageColor ?? color}`,
        opacity: eliminated ? 0.5 : 1,
      }}
    >
      <div style={{ fontSize: compact ? 10 : 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>
        {label}
      </div>
      <div style={{ fontSize: compact ? 20 : 28, fontWeight: 700, color: eliminated ? '#475569' : '#f1f5f9', marginTop: compact ? 2 : 4 }}>
        {typeof value === 'number' ? Math.round(value) : value}
      </div>
    </div>
  )
}
