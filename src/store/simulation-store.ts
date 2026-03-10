/**
 * Zustand store: bridges the competition engine and the React UI.
 * Supports both single-village and dual-village (competition) modes.
 *
 * Uses setInterval + Date.now() delta tracking so the simulation keeps
 * running even when the browser tab is in the background. A visibilitychange
 * listener catches up on any ticks missed while the tab was fully suspended.
 */

import { create } from 'zustand'
import { CompetitionEngine, type CompetitionState } from '../simulation/competition-engine.ts'
import {
  type GameConfig, getDefaultGameConfig, buildCompetitionConfig,
} from '../config/game-config.ts'

const TICK_INTERVAL_MS = 1000 // 1 tick per second at 1x speed
const SIM_LOOP_INTERVAL_MS = 50 // poll at ~20Hz; background tabs throttle to ~1Hz
const MAX_CATCHUP_TICKS = 512 // cap ticks per callback to avoid freezing after long sleep

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
let lastTimestamp = 0
let accumulator = 0

function stopLoop() {
  if (intervalId !== null) {
    clearInterval(intervalId)
    intervalId = null
  }
  lastTimestamp = 0
  accumulator = 0
}

function publishState(set: (s: Partial<SimulationStore>) => void) {
  if (!engine) return
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

  if (newState.isOver) {
    set({ isRunning: false, viewMode: 'results' })
    stopLoop()
  }
}

export const useSimulationStore = create<SimulationStore>((set, get) => {
  function processAccumulatedTicks(): boolean {
    if (!engine) return false
    let ticked = false
    let tickCount = 0
    while (accumulator >= TICK_INTERVAL_MS && tickCount < MAX_CATCHUP_TICKS) {
      engine.tick()
      accumulator -= TICK_INTERVAL_MS
      ticked = true
      tickCount++
    }
    // If we hit the cap, discard remaining accumulator to avoid perpetual catch-up
    if (tickCount >= MAX_CATCHUP_TICKS) {
      accumulator = 0
    }
    return ticked
  }

  function gameLoop() {
    const store = get()
    if (!store.isRunning || !engine) {
      stopLoop()
      return
    }

    const now = Date.now()
    if (lastTimestamp === 0) lastTimestamp = now
    const delta = now - lastTimestamp
    lastTimestamp = now

    accumulator += delta * store.speed

    if (processAccumulatedTicks()) {
      publishState(set)
    }
  }

  // When the tab becomes visible again, immediately run a catch-up tick.
  // Some browsers fully suspend setInterval for background tabs, so the
  // interval callback may not have fired at all while hidden.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const store = get()
      if (store.isRunning && engine && lastTimestamp > 0) {
        const now = Date.now()
        const delta = now - lastTimestamp
        lastTimestamp = now
        accumulator += delta * store.speed
        if (processAccumulatedTicks()) {
          publishState(set)
        }
      }
    }
  })

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
      intervalId = setInterval(gameLoop, SIM_LOOP_INTERVAL_MS)
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
      intervalId = setInterval(gameLoop, SIM_LOOP_INTERVAL_MS)
    },

    showSetupScreen() {
      stopLoop()
      set({ isRunning: false, showSetup: true })
    },
  }
})
