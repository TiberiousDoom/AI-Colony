/**
 * Top bar: simulation controls, speed, time display, seed input.
 */

import { useSimulationStore } from '../store/simulation-store.ts'
import { ViewToggle } from './ViewToggle.tsx'
import { useIsMobile } from '../hooks/useIsMobile.ts'

const SPEED_OPTIONS = [1, 2, 4, 8, 32]

const SEASON_LABELS: Record<string, string> = {
  spring: 'Spring',
  summer: 'Summer',
  autumn: 'Autumn',
  winter: 'Winter',
}

export function TopBar({ onToggleChecklist, onToggleSaveLoad, voxelOnly }: { onToggleChecklist?: () => void; onToggleSaveLoad?: () => void; voxelOnly?: boolean }) {
  const { competitionState, isRunning, speed, seed, start, pause, reset, setSpeed, setSeed, init, showSetupScreen } = useSimulationStore()
  const mobile = useIsMobile()

  const handleStartPause = () => {
    if (isRunning) {
      pause()
    } else {
      if (!competitionState) {
        init(seed)
      }
      start()
    }
  }

  const handleReset = () => {
    reset()
  }

  const handleSeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10)
    if (!isNaN(val)) setSeed(val)
  }

  const handleRandomize = () => {
    setSeed(Math.floor(Math.random() * 1000000))
  }

  const dayCount = competitionState ? competitionState.dayCount + 1 : 0
  const timeOfDay = competitionState?.timeOfDay ?? 'day'
  const season = competitionState?.season ?? 'summer'
  const isOver = competitionState?.isOver ?? false
  const winner = competitionState?.winner ?? null
  const victoryLap = competitionState?.victoryLapRemaining ?? 0

  // Village names for matchup display
  const villageNames = competitionState?.villages.map(v => v.name) ?? []
  const winnerVillage = winner ? competitionState?.villages.find(v => v.id === winner) : null

  const btnStyle: React.CSSProperties = {
    padding: mobile ? '4px 6px' : '4px 8px',
    borderRadius: 4,
    border: '1px solid #334155',
    background: 'transparent',
    color: '#94a3b8',
    cursor: 'pointer',
    fontSize: mobile ? 11 : 12,
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: mobile ? 8 : 16,
      padding: mobile ? '8px 12px' : '12px 20px',
      background: '#0f172a',
      borderBottom: '1px solid #1e293b',
      flexWrap: 'wrap',
    }}>
      {/* Title */}
      <div style={{ fontWeight: 700, fontSize: mobile ? 14 : 16, color: '#f1f5f9', marginRight: mobile ? 4 : 8 }}>
        {voxelOnly ? 'Voxel Sandbox' : 'AI Colony'}
      </div>

      {!voxelOnly && <>
        {/* Matchup */}
        {villageNames.length > 1 && !mobile && (
          <div style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600 }}>
            {villageNames.join(' vs ')}
          </div>
        )}

        {/* Start / Pause */}
        <button
          onClick={handleStartPause}
          disabled={isOver}
          style={{
            padding: mobile ? '4px 12px' : '6px 16px',
            borderRadius: 6,
            border: 'none',
            background: isRunning ? '#f59e0b' : '#22c55e',
            color: '#0f172a',
            fontWeight: 600,
            cursor: isOver ? 'not-allowed' : 'pointer',
            fontSize: 13,
          }}
        >
          {isRunning ? 'Pause' : 'Start'}
        </button>

        {/* Reset */}
        <button
          onClick={handleReset}
          style={{
            padding: mobile ? '4px 12px' : '6px 16px',
            borderRadius: 6,
            border: '1px solid #334155',
            background: 'transparent',
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          Reset
        </button>

        {/* Speed */}
        <div data-testid="speed-control" style={{ display: 'flex', alignItems: 'center', gap: mobile ? 2 : 4 }}>
          <span style={{ color: '#64748b', fontSize: mobile ? 11 : 12 }}>Speed:</span>
          {SPEED_OPTIONS.map(s => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              style={{
                padding: mobile ? '2px 6px' : '4px 8px',
                borderRadius: 4,
                border: speed === s ? '1px solid #3b82f6' : '1px solid #334155',
                background: speed === s ? '#1e3a5f' : 'transparent',
                color: speed === s ? '#60a5fa' : '#64748b',
                cursor: 'pointer',
                fontSize: mobile ? 11 : 12,
              }}
            >
              {s}x
            </button>
          ))}
        </div>

        {/* Day / Time / Season / Biome */}
        {competitionState && (
          <div style={{ color: '#94a3b8', fontSize: mobile ? 11 : 13 }}>
            Day {dayCount} — {timeOfDay === 'day' ? 'Daytime' : 'Night'} — {SEASON_LABELS[season] ?? season}
            {competitionState.config.biome && competitionState.config.biome !== 'temperate' && (
              <span style={{ color: '#a78bfa', marginLeft: 8, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
                {competitionState.config.biome}
              </span>
            )}
          </div>
        )}

        {/* Seed */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: mobile ? undefined : 'auto' }}>
          <span style={{ color: '#64748b', fontSize: mobile ? 11 : 12 }}>Seed:</span>
          <input
            type="number"
            value={seed}
            onChange={handleSeedChange}
            disabled={isRunning}
            style={{
              width: mobile ? 70 : 90,
              padding: '4px 8px',
              borderRadius: 4,
              border: '1px solid #334155',
              background: '#1e293b',
              color: '#f1f5f9',
              fontSize: mobile ? 12 : 13,
            }}
          />
          <button
            onClick={handleRandomize}
            disabled={isRunning}
            style={{
              ...btnStyle,
              cursor: isRunning ? 'not-allowed' : 'pointer',
              color: '#64748b',
            }}
          >
            Random
          </button>
        </div>

        {/* Winner / End state indicator */}
        {winnerVillage && (
          <div style={{ color: '#4ade80', fontSize: 13, fontWeight: 600 }}>
            {winnerVillage.name} wins!
            {victoryLap > 0 && ` (Victory lap: ${victoryLap} days)`}
          </div>
        )}
        {isOver && !winner && (
          <div style={{ color: '#ef4444', fontSize: 13, fontWeight: 600 }}>
            Simulation Over
          </div>
        )}
      </>}

      {/* View toggle */}
      <ViewToggle />

      {!voxelOnly && (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {onToggleSaveLoad && (
            <button onClick={onToggleSaveLoad} style={btnStyle}>
              Save/Load
            </button>
          )}

          <button onClick={showSetupScreen} style={btnStyle}>
            New Game
          </button>

          {onToggleChecklist && (
            <button
              onClick={onToggleChecklist}
              title="Acceptance Criteria Checklist"
              style={{ ...btnStyle, fontSize: 14 }}
            >
              &#9745;
            </button>
          )}
        </div>
      )}
    </div>
  )
}
