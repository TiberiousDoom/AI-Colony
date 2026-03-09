/**
 * VillagerInspector: panel showing villager details, needs, and AI rationale.
 */

import type { Villager } from '../simulation/villager.ts'
import type { Genome } from '../simulation/ai/genome.ts'
import { NeedBar } from './NeedBar.tsx'
import { GenomeHeatmap } from './GenomeHeatmap.tsx'

interface GOAPPlanDisplay {
  goal: string
  steps: Array<{ action: string; cost: number; completed: boolean }>
  totalCost: number
  currentStepIndex: number
}

interface VillagerInspectorProps {
  villager: Villager
  villageName: string
  villageColor: string
  aiName: string
  scores?: Array<{ action: string; score: number; reason: string }>
  goapPlan?: GOAPPlanDisplay
  genome?: Genome
  onClose: () => void
}

const NEED_LABELS: Record<string, string> = {
  hunger: 'Hunger',
  energy: 'Energy',
  health: 'Health',
  warmth: 'Warmth',
  cooling: 'Cooling',
}

export function VillagerInspector({ villager, villageName, villageColor, aiName, scores, goapPlan, genome, onClose }: VillagerInspectorProps) {
  return (
    <div
      data-testid="villager-inspector"
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        background: '#0f172aee',
        borderTop: '1px solid #334155',
        padding: '12px 16px',
        zIndex: 100,
        maxHeight: '40%',
        overflow: 'auto',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div>
          <span style={{ fontWeight: 600, fontSize: 14, color: '#e2e8f0' }}>{villager.name}</span>
          <span style={{ fontSize: 12, color: villageColor, marginLeft: 8 }}>{villageName}</span>
          <span style={{ fontSize: 11, color: '#64748b', marginLeft: 8 }}>({aiName})</span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: '1px solid #475569',
            color: '#94a3b8',
            borderRadius: 4,
            padding: '2px 8px',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          Close
        </button>
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        {/* Needs */}
        <div style={{ flex: '1 1 160px', minWidth: 140 }}>
          <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Needs</div>
          {Array.from(villager.needs.entries()).map(([type, state]) => (
            <NeedBar key={type} label={NEED_LABELS[type] ?? type} value={state.current} max={state.max} />
          ))}
        </div>

        {/* Status */}
        <div style={{ flex: '1 1 160px', minWidth: 140 }}>
          <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Status</div>
          <div style={{ fontSize: 12, color: '#e2e8f0', marginBottom: 4 }}>
            Action: <span style={{ color: '#60a5fa' }}>{villager.currentAction}</span>
            {villager.actionTicksRemaining > 0 && (
              <span style={{ color: '#64748b' }}> ({villager.actionTicksRemaining} ticks left)</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
            Position: ({villager.position.x}, {villager.position.y})
          </div>
          {villager.targetPosition && (
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
              Target: ({villager.targetPosition.x}, {villager.targetPosition.y})
            </div>
          )}
          {villager.carrying && (
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
              Carrying: {villager.carrying.amount} {villager.carrying.type}
            </div>
          )}
          {villager.statusEffects && villager.statusEffects.length > 0 && (
            <div style={{ fontSize: 12, color: '#f87171' }}>
              {villager.statusEffects.map((e, i) => (
                <span key={i}>{e.type} ({e.ticksRemaining}t){i < villager.statusEffects.length - 1 ? ', ' : ''}</span>
              ))}
            </div>
          )}
        </div>

        {/* AI Rationale */}
        <div style={{ flex: '1 1 200px', minWidth: 180 }}>
          <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>AI Decision</div>
          {goapPlan ? (
            <div>
              <div style={{ fontSize: 11, color: '#a78bfa', marginBottom: 4 }}>
                Goal: <span style={{ fontWeight: 600 }}>{goapPlan.goal}</span>
                <span style={{ color: '#64748b', marginLeft: 6 }}>cost: {goapPlan.totalCost}</span>
              </div>
              {goapPlan.steps.length > 0 ? (
                goapPlan.steps.map((step, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 11,
                    color: i === goapPlan.currentStepIndex ? '#4ade80' : step.completed ? '#64748b' : '#94a3b8',
                    marginBottom: 2,
                    padding: '1px 4px',
                    background: i === goapPlan.currentStepIndex ? '#1e3a2f' : 'transparent',
                    borderRadius: 3,
                  }}>
                    <span>{step.completed ? '\u2713 ' : i === goapPlan.currentStepIndex ? '\u25B6 ' : '  '}{step.action}</span>
                    <span>{step.cost}</span>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>No plan steps</div>
              )}
            </div>
          ) : scores && scores.length > 0 ? (
            <div>
              {scores.slice(0, 5).map((s, i) => (
                <div key={i} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 11,
                  color: i === 0 ? '#4ade80' : '#94a3b8',
                  marginBottom: 2,
                  padding: '1px 4px',
                  background: i === 0 ? '#1e3a2f' : 'transparent',
                  borderRadius: 3,
                }}>
                  <span>{s.action}</span>
                  <span>{s.score.toFixed(2)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>
              {villager.currentAction !== 'idle' ? `Active: ${villager.currentAction}` : 'Idle'}
            </div>
          )}
        </div>

        {/* Genome Heatmap (Evolutionary AI only) */}
        {genome && (
          <div style={{ flex: '1 1 280px', minWidth: 280 }}>
            <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Genome</div>
            <GenomeHeatmap genome={genome} />
          </div>
        )}
      </div>
    </div>
  )
}
