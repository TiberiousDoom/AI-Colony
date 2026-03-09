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
let animFrameId: number | null = null
let lastTimestamp = 0
let accumulator = 0

function stopLoop() {
  if (animFrameId !== null) {
    cancelAnimationFrame(animFrameId)
    animFrameId = null
  }
}

export const useSimulationStore = create<SimulationStore>((set, get) => {
  function gameLoop(timestamp: number) {
    const store = get()
    if (!store.isRunning || !engine) {
      animFrameId = null
      return
    }

    if (lastTimestamp === 0) lastTimestamp = timestamp

    const delta = timestamp - lastTimestamp
    lastTimestamp = timestamp

    accumulator += delta * store.speed

    let ticked = false
    while (accumulator >= TICK_INTERVAL_MS) {
      engine.tick()
      accumulator -= TICK_INTERVAL_MS
      ticked = true

      // Safety: don't process more than 16 ticks per frame
      if (accumulator >= TICK_INTERVAL_MS * 16) {
        accumulator = 0
        break
      }
    }

    if (ticked) {
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
        return
      }
    }

    animFrameId = requestAnimationFrame(gameLoop)
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
      lastTimestamp = 0
      accumulator = 0
      set({ isRunning: true })
      animFrameId = requestAnimationFrame(gameLoop)
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
      lastTimestamp = 0
      accumulator = 0
      set({
        gameConfig: config,
        seed: config.seed,
        competitionState: { ...engine.getState() } as CompetitionState,
        isRunning: true,
        showSetup: false,
        viewMode: 'metrics',
      })
      animFrameId = requestAnimationFrame(gameLoop)
    },

    showSetupScreen() {
      stopLoop()
      set({ isRunning: false, showSetup: true })
    },
  }
})
