/**
 * HelpModal: keyboard shortcuts reference, AI descriptions, scoring formula.
 */

const SHORTCUTS = [
  ['Space', 'Start / Pause'],
  ['1 / 2 / 3 / 4', 'Speed 1x / 2x / 4x / 8x'],
  ['M', 'Metrics view'],
  ['S', 'Simulation view'],
  ['R', 'Results view'],
  ['F', 'Toggle FPS counter'],
  ['?', 'Toggle this help'],
  ['Escape', 'Close panels'],
]

const AI_SYSTEMS = [
  {
    name: 'Utility AI',
    desc: 'Scores each possible action with weighted utility functions. Adaptable but can oscillate between priorities.',
  },
  {
    name: 'Behavior Tree',
    desc: 'Hierarchical decision tree with priority-ordered branches. Predictable and structured, but less flexible.',
  },
  {
    name: 'GOAP',
    desc: 'Goal-Oriented Action Planning. Plans multi-step action sequences toward goals. Strategic but computationally heavier.',
  },
]

export function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 200,
    }} onClick={onClose}>
      <div style={{
        background: '#1e293b', borderRadius: 12, padding: 28,
        width: 480, maxWidth: '90vw', maxHeight: '80vh', overflowY: 'auto',
        border: '1px solid #334155',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ color: '#e2e8f0', margin: 0, fontSize: 18 }}>Help</h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 18,
          }}>x</button>
        </div>

        <h3 style={{ color: '#94a3b8', fontSize: 13, marginBottom: 8 }}>Keyboard Shortcuts</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
          <tbody>
            {SHORTCUTS.map(([key, action]) => (
              <tr key={key}>
                <td style={{ color: '#60a5fa', fontSize: 12, padding: '3px 8px 3px 0', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                  {key}
                </td>
                <td style={{ color: '#e2e8f0', fontSize: 12, padding: '3px 0' }}>{action}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 style={{ color: '#94a3b8', fontSize: 13, marginBottom: 8 }}>AI Systems</h3>
        {AI_SYSTEMS.map(ai => (
          <div key={ai.name} style={{ marginBottom: 10 }}>
            <div style={{ color: '#60a5fa', fontSize: 13, fontWeight: 600 }}>{ai.name}</div>
            <div style={{ color: '#94a3b8', fontSize: 12 }}>{ai.desc}</div>
          </div>
        ))}

        <h3 style={{ color: '#94a3b8', fontSize: 13, marginBottom: 8, marginTop: 16 }}>Scoring Formula</h3>
        <pre style={{
          color: '#e2e8f0', fontSize: 11, background: '#0f172a',
          padding: 10, borderRadius: 6, lineHeight: 1.4, overflow: 'auto',
        }}>
{`population * 5
+ avgHealth * 1.0
+ food * 0.3 + wood * 0.2 + stone * 0.2
+ structures * 5
+ uniqueTypes * 5
+ daysSurvived * 1.0
+ efficiencyBonus
  = (health + hunger + energy) / 3
    * population * 0.02`}
        </pre>
      </div>
    </div>
  )
}
