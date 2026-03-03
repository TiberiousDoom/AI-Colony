/**
 * Zustand store: bridges the simulation engine and the React UI.
 */

import { create } from 'zustand'
import { SimulationEngine, type SimulationState, type SimulationConfig } from '../simulation/simulation-engine.ts'
import { UtilityAI } from '../simulation/ai/utility-ai.ts'

const TICK_INTERVAL_MS = 1000 // 1 tick per second at 1× speed

interface SimulationStore {
  /** Current simulation state */
  state: SimulationState | null
  /** Is the simulation currently running? */
  isRunning: boolean
  /** Current speed multiplier */
  speed: number
  /** World seed */
  seed: number

  // Actions
  init: (seed: number) => void
  start: () => void
  pause: () => void
  reset: () => void
  setSpeed: (speed: number) => void
  setSeed: (seed: number) => void
}

let engine: SimulationEngine | null = null
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
        state: {
          ...newState,
          history: { daily: [...newState.history.daily] },
          events: [...newState.events],
        } as SimulationState,
      })

      // Auto-pause when simulation ends
      if (newState.isOver) {
        set({ isRunning: false })
        stopLoop()
        return
      }
    }

    animFrameId = requestAnimationFrame(gameLoop)
  }

  return {
    state: null,
    isRunning: false,
    speed: 1,
    seed: Math.floor(Math.random() * 1000000),

    init(seed: number) {
      const config: SimulationConfig = {
        seed,
        worldWidth: 64,
        worldHeight: 64,
        aiSystem: new UtilityAI(),
        villagerCount: 10,
      }
      engine = new SimulationEngine(config)
      set({ state: { ...engine.getState() } as SimulationState, seed })
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
        set({ state: { ...engine.getState() } as SimulationState, isRunning: false })
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
  }
})
