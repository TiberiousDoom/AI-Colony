/**
 * Zustand store: bridges the competition engine and the React UI.
 * Supports both single-village and dual-village (competition) modes.
 */

import { create } from 'zustand'
import { CompetitionEngine, type CompetitionState } from '../simulation/competition-engine.ts'
import {
  type GameConfig, getDefaultGameConfig, buildCompetitionConfig,
} from '../config/game-config.ts'

const TICK_INTERVAL_MS = 1000 // 1 tick per second at 1x speed

interface SimulationStore {
  /** Current competition state */
  competitionState: CompetitionState | null
  /** Is the simulation currently running? */
  isRunning: boolean
  /** Current speed multiplier */
  speed: number
  /** World seed */
  seed: number
  /** Current view mode */
  viewMode: 'metrics' | 'simulation' | 'results'
  /** Game configuration */
  gameConfig: GameConfig
  /** Whether to show the setup screen */
  showSetup: boolean

  // Actions
  init: (seed: number) => void
  start: () => void
  pause: () => void
  reset: () => void
  setSpeed: (speed: number) => void
  setSeed: (seed: number) => void
  setViewMode: (mode: 'metrics' | 'simulation' | 'results') => void
  setGameConfig: (config: GameConfig) => void
  startWithConfig: (config: GameConfig) => void
  showSetupScreen: () => void
}

let engine: CompetitionEngine | null = null
let intervalId: ReturnType<typeof setInterval> | null = null

function stopLoop() {
  if (intervalId !== null) {
    clearInterval(intervalId)
    intervalId = null
  }
}

export const useSimulationStore = create<SimulationStore>((set, get) => {
  // Interval-based loop: runs even when the tab is in the background
  const LOOP_INTERVAL_MS = 50 // 20 Hz update rate

  function gameLoop() {
    const store = get()
    if (!store.isRunning || !engine) {
      stopLoop()
      return
    }

    // Number of ticks to process this interval
    const ticksPerInterval = Math.max(1, Math.round((LOOP_INTERVAL_MS * store.speed) / TICK_INTERVAL_MS))
    // Cap to prevent runaway when tab returns from long sleep
    const maxTicks = Math.min(ticksPerInterval, 32)

    for (let i = 0; i < maxTicks; i++) {
      engine.tick()
    }

    const newState = engine.getState()
    set({
      competitionState: {
        ...newState,
        villages: newState.villages.map(v => ({
          ...v,
          history: { daily: [...v.history.daily] },
          events: [...v.events],
        })),
        globalEvents: [...newState.globalEvents],
      } as CompetitionState,
    })

    // Auto-pause when simulation ends -> switch to results view
    if (newState.isOver) {
      set({ isRunning: false, viewMode: 'results' })
      stopLoop()
    }
  }

  const defaultConfig = getDefaultGameConfig()

  return {
    competitionState: null,
    isRunning: false,
    speed: 1,
    seed: defaultConfig.seed,
    viewMode: 'metrics' as const,
    gameConfig: defaultConfig,
    showSetup: true,

    init(seed: number) {
      const store = get()
      const gc = { ...store.gameConfig, seed }
      const config = buildCompetitionConfig(gc)
      engine = new CompetitionEngine(config)
      set({ competitionState: { ...engine.getState() } as CompetitionState, seed, gameConfig: gc, showSetup: false })
    },

    start() {
      const store = get()
      if (!engine) {
        store.init(store.seed)
      }
      stopLoop()
      set({ isRunning: true })
      intervalId = setInterval(gameLoop, LOOP_INTERVAL_MS)
    },

    pause() {
      set({ isRunning: false })
      stopLoop()
    },

    reset() {
      stopLoop()
      const store = get()
      if (engine) {
        engine.reset()
        set({ competitionState: { ...engine.getState() } as CompetitionState, isRunning: false })
      } else {
        store.init(store.seed)
        set({ isRunning: false })
      }
    },

    setSpeed(speed: number) {
      set({ speed })
    },

    setSeed(seed: number) {
      set({ seed })
    },

    setViewMode(mode: 'metrics' | 'simulation' | 'results') {
      set({ viewMode: mode })
    },

    setGameConfig(config: GameConfig) {
      set({ gameConfig: config, seed: config.seed })
    },

    startWithConfig(config: GameConfig) {
      stopLoop()
      const competitionConfig = buildCompetitionConfig(config)
      engine = new CompetitionEngine(competitionConfig)
      set({
        gameConfig: config,
        seed: config.seed,
        competitionState: { ...engine.getState() } as CompetitionState,
        isRunning: true,
        showSetup: false,
        viewMode: 'metrics',
      })
      intervalId = setInterval(gameLoop, LOOP_INTERVAL_MS)
    },

    showSetupScreen() {
      stopLoop()
      set({ isRunning: false, showSetup: true })
    },
  }
})
