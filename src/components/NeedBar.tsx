/**
 * NeedBar: horizontal bar showing a need's current value.
 */

interface NeedBarProps {
  label: string
  value: number
  max: number
}

export function NeedBar({ label, value, max }: NeedBarProps) {
  const ratio = max > 0 ? value / max : 0
  const color = ratio > 0.6 ? '#4ade80' : ratio > 0.25 ? '#facc15' : '#ef4444'

  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>
        <span>{label}</span>
        <span>{Math.round(value)}/{max}</span>
      </div>
      <div style={{ height: 6, background: '#334155', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${ratio * 100}%`,
          background: color,
          borderRadius: 3,
          transition: 'width 0.3s ease',
        }} />
      </div>
    </div>
  )
}
