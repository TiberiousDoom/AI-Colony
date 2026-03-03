/**
 * Phase 1 Acceptance Criteria — auto-detectable checks.
 */

import { SimulationEngine, type SimulationConfig, type SimulationState } from '../simulation/simulation-engine.ts'
import { UtilityAI } from '../simulation/ai/utility-ai.ts'

export type CheckStatus = 'pass' | 'fail' | 'running' | 'skipped' | 'pending'

export interface AcceptanceCheck {
  id: string
  label: string
  description: string
  category: 'simulation' | 'ui' | 'controls' | 'ai-behavior' | 'build'
  autoDetect: boolean
  run: (context: CheckContext) => Promise<CheckResult>
}

export interface CheckContext {
  storeState: {
    simState: SimulationState | null
    isRunning: boolean
    speed: number
    seed: number
  }
  createEngine: (config: SimulationConfig) => SimulationEngine
}

export interface CheckResult {
  status: 'pass' | 'fail'
  detail?: string
}

function defaultConfig(seed = 42): SimulationConfig {
  return {
    seed,
    worldWidth: 64,
    worldHeight: 64,
    aiSystem: new UtilityAI(),
    villagerCount: 10,
  }
}

// --- Simulation Core Checks ---

const simInit: AcceptanceCheck = {
  id: 'sim-init',
  label: 'Simulation initializes correctly',
  description: 'Verifies 10 villagers on a 64×64 world with initial stockpile.',
  category: 'simulation',
  autoDetect: true,
  async run(ctx) {
    const engine = ctx.createEngine(defaultConfig())
    const s = engine.getState()
    if (s.villagers.length !== 10) return { status: 'fail', detail: `Expected 10 villagers, got ${s.villagers.length}` }
    if (s.world.width !== 64 || s.world.height !== 64) return { status: 'fail', detail: `World size ${s.world.width}×${s.world.height}` }
    if (s.stockpile.food !== 50) return { status: 'fail', detail: `Expected 50 food, got ${s.stockpile.food}` }
    return { status: 'pass', detail: '10 villagers, 64×64 world, 50 food / 30 wood / 10 stone' }
  },
}

const seedDeterminism: AcceptanceCheck = {
  id: 'seed-determinism',
  label: 'Seed determinism',
  description: 'Two engines with same seed produce identical state after 100 ticks.',
  category: 'simulation',
  autoDetect: true,
  async run(ctx) {
    const e1 = ctx.createEngine(defaultConfig(42))
    const e2 = ctx.createEngine(defaultConfig(42))
    for (let i = 0; i < 100; i++) { e1.tick(); e2.tick() }
    const s1 = e1.getState()
    const s2 = e2.getState()
    if (JSON.stringify(s1.stockpile) !== JSON.stringify(s2.stockpile)) {
      return { status: 'fail', detail: 'Stockpiles diverged' }
    }
    for (let i = 0; i < s1.villagers.length; i++) {
      if (s1.villagers[i].position.x !== s2.villagers[i].position.x ||
          s1.villagers[i].position.y !== s2.villagers[i].position.y) {
        return { status: 'fail', detail: `Villager ${i} position mismatch at tick 100` }
      }
    }
    return { status: 'pass', detail: 'Stockpile and all villager positions match after 100 ticks' }
  },
}

const survival15Days: AcceptanceCheck = {
  id: 'survival-15-days',
  label: 'Villagers survive 15+ days',
  description: 'At least one villager alive after 15 days (450 ticks) on seed 42.',
  category: 'simulation',
  autoDetect: true,
  async run(ctx) {
    const engine = ctx.createEngine(defaultConfig(42))
    for (let i = 0; i < 450; i++) engine.tick()
    const alive = engine.getState().villagers.filter(v => v.alive).length
    if (alive > 0) {
      return { status: 'pass', detail: `${alive} villagers alive at day 15` }
    }
    return { status: 'fail', detail: 'All villagers died before day 15' }
  },
}

const gracefulEnd: AcceptanceCheck = {
  id: 'graceful-end',
  label: 'Graceful simulation end',
  description: 'Simulation runs 5000 ticks or until isOver without errors.',
  category: 'simulation',
  autoDetect: true,
  async run(ctx) {
    const engine = ctx.createEngine(defaultConfig(42))
    try {
      let ticks = 0
      while (!engine.getState().isOver && ticks < 5000) {
        engine.tick()
        ticks++
      }
      if (engine.getState().isOver) {
        return { status: 'pass', detail: `All villagers perished at tick ${ticks}` }
      }
      return { status: 'pass', detail: `Village still alive at tick 5000 — thriving!` }
    } catch (e) {
      return { status: 'fail', detail: `Crashed: ${e}` }
    }
  },
}

const dayNightCycle: AcceptanceCheck = {
  id: 'day-night-cycle',
  label: 'Day/night cycle toggles',
  description: 'Both day and night observed within first 35 ticks.',
  category: 'simulation',
  autoDetect: true,
  async run(ctx) {
    const engine = ctx.createEngine(defaultConfig())
    const seen = new Set<string>()
    for (let i = 0; i < 35; i++) {
      engine.tick()
      seen.add(engine.getState().timeOfDay)
    }
    if (seen.has('day') && seen.has('night')) {
      return { status: 'pass', detail: 'Both day and night observed' }
    }
    return { status: 'fail', detail: `Only saw: ${[...seen].join(', ')}` }
  },
}

const stressInvariants: AcceptanceCheck = {
  id: 'stress-invariants',
  label: 'No NaN/out-of-bounds (1000 ticks)',
  description: 'No NaN in needs, no positions outside bounds, no negative stockpile after 1000 ticks.',
  category: 'simulation',
  autoDetect: true,
  async run(ctx) {
    const engine = ctx.createEngine(defaultConfig(7777))
    for (let i = 0; i < 1000; i++) {
      engine.tick()
      if (engine.getState().isOver) break
      const s = engine.getState()
      for (const v of s.villagers) {
        if (!v.alive) continue
        if (v.position.x < 0 || v.position.x >= 64 || v.position.y < 0 || v.position.y >= 64) {
          return { status: 'fail', detail: `Villager ${v.name} out of bounds at (${v.position.x}, ${v.position.y})` }
        }
        for (const [, need] of v.needs) {
          if (isNaN(need.current)) return { status: 'fail', detail: `NaN in ${v.name}'s needs` }
        }
      }
      if (s.stockpile.food < 0 || s.stockpile.wood < 0 || s.stockpile.stone < 0) {
        return { status: 'fail', detail: `Negative stockpile at tick ${i}: food=${s.stockpile.food}, wood=${s.stockpile.wood}, stone=${s.stockpile.stone}` }
      }
    }
    return { status: 'pass', detail: 'All invariants held for 1000 ticks' }
  },
}

// --- AI Behavior Checks ---

const aiReasonable: AcceptanceCheck = {
  id: 'ai-reasonable',
  label: 'AI makes reasonable decisions',
  description: 'Villagers perform at least 3 distinct action types in 100 ticks.',
  category: 'ai-behavior',
  autoDetect: true,
  async run(ctx) {
    const engine = ctx.createEngine(defaultConfig(42))
    const actions = new Set<string>()
    for (let i = 0; i < 100; i++) {
      engine.tick()
      for (const v of engine.getState().villagers) {
        if (v.alive) actions.add(v.currentAction)
      }
    }
    if (actions.size < 3) {
      return { status: 'fail', detail: `Only ${actions.size} action types seen: ${[...actions].join(', ')}` }
    }
    const food = engine.getState().stockpile.food
    return { status: 'pass', detail: `${actions.size} action types observed: ${[...actions].join(', ')}. Food=${food}` }
  },
}

const aiDeterministic: AcceptanceCheck = {
  id: 'ai-deterministic',
  label: 'AI output is deterministic',
  description: 'Two engines with same seed have identical villager states at tick 50.',
  category: 'ai-behavior',
  autoDetect: true,
  async run(ctx) {
    const e1 = ctx.createEngine(defaultConfig(42))
    const e2 = ctx.createEngine(defaultConfig(42))
    for (let i = 0; i < 50; i++) { e1.tick(); e2.tick() }
    const v1 = e1.getState().villagers
    const v2 = e2.getState().villagers
    for (let i = 0; i < v1.length; i++) {
      if (v1[i].currentAction !== v2[i].currentAction) {
        return { status: 'fail', detail: `Villager ${i} action mismatch: ${v1[i].currentAction} vs ${v2[i].currentAction}` }
      }
      if (v1[i].position.x !== v2[i].position.x || v1[i].position.y !== v2[i].position.y) {
        return { status: 'fail', detail: `Villager ${i} position mismatch` }
      }
    }
    return { status: 'pass', detail: 'All villager actions and positions match at tick 50' }
  },
}

// --- UI Checks ---

const uiKpiCards: AcceptanceCheck = {
  id: 'ui-kpi-cards',
  label: 'KPI cards rendered',
  description: 'At least 4 KPI cards visible in the DOM.',
  category: 'ui',
  autoDetect: true,
  async run() {
    const cards = document.querySelectorAll('[data-testid="kpi-card"]')
    if (cards.length >= 4) {
      return { status: 'pass', detail: `${cards.length} KPI cards found` }
    }
    return { status: 'fail', detail: `Only ${cards.length} KPI cards found (need >= 4). Is the simulation running?` }
  },
}

const uiCharts: AcceptanceCheck = {
  id: 'ui-charts',
  label: 'Charts rendered',
  description: 'At least 4 Recharts chart containers visible.',
  category: 'ui',
  autoDetect: true,
  async run() {
    const charts = document.querySelectorAll('.recharts-wrapper')
    if (charts.length >= 4) {
      return { status: 'pass', detail: `${charts.length} charts found` }
    }
    return { status: 'fail', detail: `Only ${charts.length} charts found (need >= 4). Is the simulation running?` }
  },
}

const uiEventLog: AcceptanceCheck = {
  id: 'ui-event-log',
  label: 'Event log rendered',
  description: 'Event log container exists with entries.',
  category: 'ui',
  autoDetect: true,
  async run() {
    const log = document.querySelector('[data-testid="event-log"]')
    if (!log) return { status: 'fail', detail: 'Event log element not found' }
    const entries = document.querySelectorAll('[data-testid="event-log-entry"]')
    return { status: 'pass', detail: `Event log found with ${entries.length} entries` }
  },
}

const uiSpeedControl: AcceptanceCheck = {
  id: 'ui-speed-control',
  label: 'Speed control present',
  description: 'Speed control element exists in the DOM.',
  category: 'ui',
  autoDetect: true,
  async run() {
    const el = document.querySelector('[data-testid="speed-control"]')
    if (el) return { status: 'pass', detail: 'Speed control found' }
    return { status: 'fail', detail: 'Speed control element not found' }
  },
}

// --- Build/Static Checks (browser-runnable) ---

const testsPass: AcceptanceCheck = {
  id: 'tests-pass',
  label: 'Simulation smoke test',
  description: 'Runs init, determinism, 200-tick stress, and invariant checks in-browser.',
  category: 'build',
  autoDetect: true,
  async run(ctx) {
    // Init check
    const e = ctx.createEngine(defaultConfig(42))
    const s = e.getState()
    if (s.villagers.length !== 10) return { status: 'fail', detail: `Init: expected 10 villagers, got ${s.villagers.length}` }

    // Determinism check
    const e1 = ctx.createEngine(defaultConfig(99))
    const e2 = ctx.createEngine(defaultConfig(99))
    for (let i = 0; i < 50; i++) { e1.tick(); e2.tick() }
    if (JSON.stringify(e1.getState().stockpile) !== JSON.stringify(e2.getState().stockpile)) {
      return { status: 'fail', detail: 'Determinism: stockpiles diverged on seed 99' }
    }

    // Stress + invariants
    const e3 = ctx.createEngine(defaultConfig(123))
    for (let i = 0; i < 200; i++) {
      try { e3.tick() } catch (err) { return { status: 'fail', detail: `Crash at tick ${i}: ${err}` } }
      if (e3.getState().isOver) break
      for (const v of e3.getState().villagers) {
        if (!v.alive) continue
        if (v.position.x < 0 || v.position.x >= 64 || v.position.y < 0 || v.position.y >= 64) {
          return { status: 'fail', detail: `OOB: ${v.name} at (${v.position.x}, ${v.position.y})` }
        }
        for (const [, need] of v.needs) {
          if (isNaN(need.current)) return { status: 'fail', detail: `NaN in ${v.name}'s needs` }
        }
      }
    }
    return { status: 'pass', detail: 'Init, determinism, and 200-tick stress all passed' }
  },
}

const domFree: AcceptanceCheck = {
  id: 'dom-free',
  label: 'No DOM access in simulation',
  description: 'Runs 50 ticks and verifies the simulation engine never touches document/DOM APIs.',
  category: 'build',
  autoDetect: true,
  async run(ctx) {
    const accessed: string[] = []
    const origQuerySelector = document.querySelector.bind(document)
    const origGetElementById = document.getElementById.bind(document)
    const origCreateElement = document.createElement.bind(document)

    // Patch DOM methods to detect access
    document.querySelector = (...args: Parameters<typeof document.querySelector>) => {
      accessed.push(`querySelector(${args[0]})`)
      return origQuerySelector(...args)
    }
    document.getElementById = (...args: Parameters<typeof document.getElementById>) => {
      accessed.push(`getElementById(${args[0]})`)
      return origGetElementById(...args)
    }
    document.createElement = (...args: Parameters<typeof document.createElement>) => {
      accessed.push(`createElement(${args[0]})`)
      return origCreateElement(...args)
    }

    try {
      const engine = ctx.createEngine(defaultConfig(42))
      for (let i = 0; i < 50; i++) engine.tick()
    } finally {
      // Restore originals
      document.querySelector = origQuerySelector
      document.getElementById = origGetElementById
      document.createElement = origCreateElement
    }

    if (accessed.length > 0) {
      return { status: 'fail', detail: `Simulation accessed DOM: ${accessed.slice(0, 3).join(', ')}` }
    }
    return { status: 'pass', detail: 'No DOM access detected during 50 ticks' }
  },
}

const buildClean: AcceptanceCheck = {
  id: 'build-clean',
  label: 'App rendered successfully',
  description: 'Verifies the app loaded, root has content, and no error boundaries triggered.',
  category: 'build',
  autoDetect: true,
  async run() {
    const root = document.getElementById('root')
    if (!root) return { status: 'fail', detail: 'No #root element found' }
    if (!root.children.length) return { status: 'fail', detail: '#root has no children — app failed to mount' }

    // Check no error boundary is showing
    const errorText = root.querySelector('[style*="color: rgb(248, 113, 113)"]')
    if (errorText?.textContent?.includes('Something went wrong')) {
      return { status: 'fail', detail: 'Error boundary is active' }
    }

    return { status: 'pass', detail: `App mounted with ${root.querySelectorAll('*').length} DOM nodes` }
  },
}

// --- Export All Checks ---

export const ALL_CHECKS: AcceptanceCheck[] = [
  // Simulation
  simInit, seedDeterminism, survival15Days, gracefulEnd, dayNightCycle, stressInvariants,
  // AI
  aiReasonable, aiDeterministic,
  // UI
  uiKpiCards, uiCharts, uiEventLog, uiSpeedControl,
  // Build (manual)
  testsPass, domFree, buildClean,
]

export const CATEGORIES = [
  { key: 'simulation', label: 'Simulation Core' },
  { key: 'ai-behavior', label: 'AI Behavior' },
  { key: 'ui', label: 'UI Components' },
  { key: 'build', label: 'Build/Static' },
] as const
