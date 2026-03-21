/**
 * SaveLoadPanel: save/load game snapshots to localStorage.
 */

import { useState, useEffect } from 'react'
import { listSnapshots, deleteSnapshot, getStorageUsage, saveSnapshot, type SimulationSnapshot } from '../utils/serialization.ts'
import { useSimulationStore } from '../store/simulation-store.ts'

export function SaveLoadPanel({ onClose }: { onClose: () => void }) {
  const [snapshots, setSnapshots] = useState<Array<{ label: string; timestamp: number; sizeBytes: number }>>([])
  const [usage, setUsage] = useState({ usedBytes: 0, capBytes: 5 * 1024 * 1024 })
  const [status, setStatus] = useState('')
  const competitionState = useSimulationStore(s => s.competitionState)
  const seed = useSimulationStore(s => s.seed)

  function refresh() {
    setSnapshots(listSnapshots())
    setUsage(getStorageUsage())
  }

  useEffect(() => { refresh() }, [])

  function handleSave() {
    if (!competitionState) {
      setStatus('No simulation to save')
      return
    }
    const label = `seed-${seed}-day-${competitionState.dayCount}`
    const snapshot: SimulationSnapshot = {
      version: 1,
      label,
      timestamp: Date.now(),
      seed,
      competitionState: {
        villages: competitionState.villages.map(v => ({
          id: v.id,
          name: v.name,
          villagers: v.villagers.map(vl => ({
            id: vl.id,
            name: vl.name,
            position: { ...vl.position },
            needs: Array.from(vl.needs.entries()).map(([k, val]) => [k as string, { ...val }]),
            currentAction: vl.currentAction,
            actionTicksRemaining: vl.actionTicksRemaining,
            targetPosition: vl.targetPosition ? { ...vl.targetPosition } : null,
            path: [...vl.path],
            alive: vl.alive,
            carrying: vl.carrying ? { ...vl.carrying } : null,
          })),
          stockpile: { ...v.stockpile },
          structures: v.structures.map(s => ({ ...s, position: { ...s.position } })),
          campfirePosition: { ...v.campfirePosition },
          history: { daily: [...v.history.daily] },
          events: [...v.events],
          isEliminated: v.isEliminated,
          eliminationTick: v.eliminationTick,
          eliminationCause: v.eliminationCause,
          growthTimer: v.growthTimer,
          aiSystemName: v.id,
        })),
        tick: competitionState.tick,
        dayCount: competitionState.dayCount,
        timeOfDay: competitionState.timeOfDay,
        season: competitionState.season,
        seasonDay: competitionState.seasonDay,
        activeEvents: [...competitionState.activeEvents],
        globalEvents: [...competitionState.globalEvents],
        isOver: competitionState.isOver,
        winner: competitionState.winner,
        victoryLapRemaining: competitionState.victoryLapRemaining,
      },
      rngState: [],
    }

    if (saveSnapshot(snapshot)) {
      setStatus('Saved!')
      refresh()
    } else {
      setStatus('Save failed (storage full?)')
    }
  }

  function handleDelete(label: string) {
    deleteSnapshot(label)
    refresh()
    setStatus(`Deleted ${label}`)
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const usagePercent = Math.min(100, (usage.usedBytes / usage.capBytes) * 100)

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 200,
    }} onClick={onClose}>
      <div style={{
        background: '#1e293b', borderRadius: 12, padding: 24,
        width: 400, maxWidth: '90vw', maxHeight: '70vh', overflowY: 'auto',
        border: '1px solid #334155',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ color: '#e2e8f0', margin: 0, fontSize: 18 }}>Save / Load</h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 18,
          }}>x</button>
        </div>

        {/* Save Button */}
        <button onClick={handleSave} style={{
          width: '100%', padding: '8px 0', borderRadius: 6,
          background: '#3b82f6', color: '#fff', border: 'none',
          cursor: 'pointer', fontSize: 13, fontWeight: 600, marginBottom: 12,
        }}>
          Save Current Game
        </button>

        {status && (
          <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 8, textAlign: 'center' }}>
            {status}
          </div>
        )}

        {/* Storage Usage Bar */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b', marginBottom: 4 }}>
            <span>Storage: {formatBytes(usage.usedBytes)} / {formatBytes(usage.capBytes)}</span>
            <span>{usagePercent.toFixed(0)}%</span>
          </div>
          <div style={{ background: '#0f172a', borderRadius: 3, height: 6, overflow: 'hidden' }}>
            <div style={{
              width: `${usagePercent}%`,
              height: '100%',
              background: usagePercent > 80 ? '#ef4444' : '#3b82f6',
              borderRadius: 3,
              transition: 'width 0.3s',
            }} />
          </div>
        </div>

        {/* Saved Snapshots */}
        {snapshots.length === 0 ? (
          <div style={{ color: '#475569', fontSize: 12, textAlign: 'center', padding: 16 }}>
            No saved games
          </div>
        ) : (
          snapshots.map(snap => (
            <div key={snap.label} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 10px', borderBottom: '1px solid #1e293b',
            }}>
              <div>
                <div style={{ color: '#e2e8f0', fontSize: 13 }}>{snap.label}</div>
                <div style={{ color: '#64748b', fontSize: 11 }}>
                  {new Date(snap.timestamp).toLocaleString()} | {formatBytes(snap.sizeBytes)}
                </div>
              </div>
              <button onClick={() => handleDelete(snap.label)} style={{
                background: 'none', border: '1px solid #334155', borderRadius: 4,
                color: '#ef4444', padding: '3px 8px', cursor: 'pointer', fontSize: 11,
              }}>
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
