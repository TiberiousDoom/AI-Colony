/**
 * In-app acceptance criteria checklist panel.
 * Runs automated checks against the live simulation and DOM.
 */

import { useState, useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  ALL_CHECKS, CATEGORIES,
  type CheckStatus, type CheckContext, type AcceptanceCheck,
} from '../utils/acceptance-checks.ts'
import { SimulationEngine, type SimulationConfig } from '../simulation/simulation-engine.ts'
import { useSimulationStore } from '../store/simulation-store.ts'

interface CheckState {
  status: CheckStatus
  detail?: string
}

export function AcceptanceChecklist({ onClose }: { onClose: () => void }) {
  const [results, setResults] = useState<Map<string, CheckState>>(new Map())
  const [isRunning, setIsRunning] = useState(false)

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
    const autoChecks = ALL_CHECKS.filter(c => c.autoDetect)
    for (const check of autoChecks) {
      await runCheck(check)
    }
    setIsRunning(false)
  }, [runCheck])

  const statusIcon = (status: CheckStatus): string => {
    switch (status) {
      case 'pass': return '\u2705'
      case 'fail': return '\u274C'
      case 'running': return '\u23F3'
      case 'skipped': return '\u2B1C'
      case 'pending': return '\u2B1C'
    }
  }

  const autoChecks = ALL_CHECKS.filter(c => c.autoDetect)
  const passCount = autoChecks.filter(c => results.get(c.id)?.status === 'pass').length

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
          Phase 1 Acceptance Criteria
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

      {/* Check list */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {CATEGORIES.map(cat => {
          const checks = ALL_CHECKS.filter(c => c.category === cat.key)
          const catPassed = checks.filter(c => results.get(c.id)?.status === 'pass').length
          const catAuto = checks.filter(c => c.autoDetect).length

          return (
            <div key={cat.key} style={{ marginBottom: 20 }}>
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
      </div>
    </div>
  )
}
