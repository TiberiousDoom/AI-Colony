/**
 * In-app acceptance criteria checklist panel.
 * Runs automated checks against the live simulation and DOM.
 * Supports Phase 1, 2, and 3 acceptance criteria.
 */

import { useState, useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  ALL_CHECKS, CATEGORIES,
  type CheckStatus, type CheckContext, type AcceptanceCheck, type Phase,
} from '../utils/acceptance-checks.ts'
import { SimulationEngine, type SimulationConfig } from '../simulation/simulation-engine.ts'
import { useSimulationStore } from '../store/simulation-store.ts'

interface CheckState {
  status: CheckStatus
  detail?: string
}

const PHASE_LABELS: Record<Phase, string> = {
  1: 'Phase 1 — Simulation Core',
  2: 'Phase 2 — Competition & Advanced Systems',
  3: 'Phase 3 — Visual Rendering',
}

const PHASE_COLORS: Record<Phase, string> = {
  1: '#3b82f6',
  2: '#8b5cf6',
  3: '#f59e0b',
}

export function AcceptanceChecklist({ onClose }: { onClose: () => void }) {
  const [results, setResults] = useState<Map<string, CheckState>>(new Map())
  const [isRunning, setIsRunning] = useState(false)
  const [activePhase, setActivePhase] = useState<Phase | 'all'>('all')

  const storeState = useSimulationStore(useShallow(s => ({
    simState: s.competitionState,
    isRunning: s.isRunning,
    speed: s.speed,
    seed: s.seed,
  })))

  const buildContext = useCallback((): CheckContext => ({
    storeState,
    createEngine: (config: SimulationConfig) => new SimulationEngine(config),
  }), [storeState])

  const runCheck = useCallback(async (check: AcceptanceCheck) => {
    setResults(prev => {
      const next = new Map(prev)
      next.set(check.id, { status: 'running' })
      return next
    })

    try {
      const result = await check.run(buildContext())
      setResults(prev => {
        const next = new Map(prev)
        next.set(check.id, { status: result.status, detail: result.detail })
        return next
      })
    } catch (e) {
      setResults(prev => {
        const next = new Map(prev)
        next.set(check.id, { status: 'fail', detail: `Error: ${e}` })
        return next
      })
    }
  }, [buildContext])

  const runAll = useCallback(async () => {
    setIsRunning(true)
    const checksToRun = ALL_CHECKS.filter(c =>
      c.autoDetect && (activePhase === 'all' || c.phase === activePhase)
    )
    for (const check of checksToRun) {
      await runCheck(check)
    }
    setIsRunning(false)
  }, [runCheck, activePhase])

  const statusIcon = (status: CheckStatus): string => {
    switch (status) {
      case 'pass': return '\u2705'
      case 'fail': return '\u274C'
      case 'running': return '\u23F3'
      case 'skipped': return '\u2B1C'
      case 'pending': return '\u2B1C'
    }
  }

  const filteredChecks = activePhase === 'all'
    ? ALL_CHECKS
    : ALL_CHECKS.filter(c => c.phase === activePhase)

  const autoChecks = filteredChecks.filter(c => c.autoDetect)
  const passCount = autoChecks.filter(c => results.get(c.id)?.status === 'pass').length

  // Group categories that have checks in the current filter
  const visibleCategories = CATEGORIES.filter(cat =>
    filteredChecks.some(c => c.category === cat.key)
  )

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      right: 0,
      bottom: 0,
      width: 480,
      maxWidth: '100vw',
      background: '#0f172a',
      borderLeft: '1px solid #334155',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid #334155',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>
          Acceptance Criteria
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={runAll}
            disabled={isRunning}
            style={{
              padding: '4px 12px',
              background: isRunning ? '#475569' : '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: isRunning ? 'default' : 'pointer',
              fontSize: 12,
            }}
          >
            {isRunning ? 'Running...' : 'Run All'}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '4px 8px',
              background: 'transparent',
              color: '#94a3b8',
              border: '1px solid #475569',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Close
          </button>
        </div>
      </div>

      {/* Phase tabs */}
      <div style={{
        display: 'flex',
        gap: 4,
        padding: '8px 16px',
        borderBottom: '1px solid #334155',
        flexShrink: 0,
      }}>
        {(['all', 1, 2, 3] as const).map(phase => {
          const isActive = activePhase === phase
          const label = phase === 'all' ? 'All' : `P${phase}`
          const phaseChecks = phase === 'all' ? ALL_CHECKS : ALL_CHECKS.filter(c => c.phase === phase)
          const phaseAuto = phaseChecks.filter(c => c.autoDetect)
          const phasePassed = phaseAuto.filter(c => results.get(c.id)?.status === 'pass').length

          return (
            <button
              key={phase}
              onClick={() => setActivePhase(phase)}
              style={{
                padding: '4px 10px',
                background: isActive ? (phase === 'all' ? '#334155' : PHASE_COLORS[phase]) : 'transparent',
                color: isActive ? '#fff' : '#94a3b8',
                border: isActive ? 'none' : '1px solid #475569',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: isActive ? 600 : 400,
              }}
              title={phase === 'all' ? 'All Phases' : PHASE_LABELS[phase]}
            >
              {label} {phaseAuto.length > 0 && `(${phasePassed}/${phaseAuto.length})`}
            </button>
          )
        })}
      </div>

      {/* Check list */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {([1, 2, 3] as const)
          .filter(phase => activePhase === 'all' || activePhase === phase)
          .map(phase => {
            const phaseChecks = filteredChecks.filter(c => c.phase === phase)
            if (phaseChecks.length === 0) return null

            const phaseCats = visibleCategories.filter(cat =>
              phaseChecks.some(c => c.category === cat.key)
            )

            return (
              <div key={phase}>
                {/* Phase header (only shown in 'all' view) */}
                {activePhase === 'all' && (
                  <div style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: PHASE_COLORS[phase],
                    marginBottom: 12,
                    marginTop: phase === 1 ? 0 : 16,
                    paddingBottom: 6,
                    borderBottom: `1px solid ${PHASE_COLORS[phase]}33`,
                  }}>
                    {PHASE_LABELS[phase]}
                  </div>
                )}

                {phaseCats.map(cat => {
                  const checks = phaseChecks.filter(c => c.category === cat.key)
                  if (checks.length === 0) return null
                  const catPassed = checks.filter(c => results.get(c.id)?.status === 'pass').length
                  const catAuto = checks.filter(c => c.autoDetect).length

                  return (
                    <div key={`${phase}-${cat.key}`} style={{ marginBottom: 20 }}>
                      <div style={{
                        fontSize: 11,
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                        color: '#94a3b8',
                        marginBottom: 8,
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}>
                        <span>{cat.label} ({checks.length} checks)</span>
                        {catAuto > 0 && (
                          <span>{catPassed}/{catAuto} pass</span>
                        )}
                      </div>

                      {checks.map(check => {
                        const result = results.get(check.id)
                        const status = result?.status ?? (check.autoDetect ? 'pending' : 'skipped')

                        return (
                          <div
                            key={check.id}
                            onClick={() => check.autoDetect && !isRunning && runCheck(check)}
                            style={{
                              padding: '8px 12px',
                              marginBottom: 4,
                              background: '#1e293b',
                              borderRadius: 6,
                              cursor: check.autoDetect ? 'pointer' : 'default',
                              borderLeft: `3px solid ${
                                status === 'pass' ? '#4ade80' :
                                status === 'fail' ? '#f87171' :
                                status === 'running' ? '#facc15' :
                                '#475569'
                              }`,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 14 }}>{statusIcon(status)}</span>
                              <span style={{ fontSize: 13, color: '#e2e8f0' }}>{check.label}</span>
                            </div>
                            {result?.detail && (
                              <div style={{
                                fontSize: 11,
                                color: '#94a3b8',
                                marginTop: 4,
                                marginLeft: 22,
                              }}>
                                {result.detail}
                              </div>
                            )}
                            {!check.autoDetect && !result?.detail && (
                              <div style={{
                                fontSize: 11,
                                color: '#64748b',
                                marginTop: 4,
                                marginLeft: 22,
                                fontStyle: 'italic',
                              }}>
                                {check.description}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            )
          })}
      </div>

      {/* Footer */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid #334155',
        fontSize: 12,
        color: '#94a3b8',
        textAlign: 'center',
        flexShrink: 0,
      }}>
        {passCount}/{autoChecks.length} checks passed
        {activePhase !== 'all' && ` (${PHASE_LABELS[activePhase]})`}
      </div>
    </div>
  )
}
