import { create } from 'zustand'
import { ComparisonRunner, type ComparisonMetrics } from '../simulation/comparison-runner.ts'
import { BlockType } from '../world/block-types.ts'
import { createAgent, resetAgentIdCounter } from '../agents/agent.ts'
import type { Agent } from '../agents/agent.ts'
import type { VoxelCoord } from '../pathfinding/types.ts'
import { isWalkable } from '../pathfinding/movement-rules.ts'
import { generateDiagnosticReport, generateComparisonReport } from '../simulation/diagnostic-report.ts'
import { ScenarioRunner, type ScenarioDefinition, type PathfinderFactory } from '../simulation/scenario-runner.ts'
import { GridAStarPathfinder } from '../pathfinding/grid-astar.ts'
import { HPAStarPathfinder } from '../pathfinding/hpa-star.ts'
import { createCanyonRunScenario } from '../simulation/scenarios/canyon-run.ts'
import { createBridgeCollapseScenario } from '../simulation/scenarios/bridge-collapse.ts'

const WORLD_SIZE = 32
const SIM_INTERVAL_MS = 50
const DEFAULT_SEED = 42

export type ScenarioName = 'none' | 'canyon-run' | 'bridge-collapse' | 'custom'

interface ComparisonStore {
  runner: ComparisonRunner | null
  seed: number
  isRunning: boolean
  tick: number
  astarAgents: ReadonlyArray<Agent>
  hpastarAgents: ReadonlyArray<Agent>
  flowfieldAgents: ReadonlyArray<Agent>
  dstarAgents: ReadonlyArray<Agent>
  hybridAgents: ReadonlyArray<Agent>
  metrics: ComparisonMetrics | null
  selectedScenario: ScenarioName
  report: string | null

  init: (seed?: number) => void
  start: () => void
  pause: () => void
  reset: () => void
  setSeed: (seed: number) => void
  setScenario: (name: ScenarioName) => void
  runScenario: () => void
  exportReport: () => void
}

let intervalId: ReturnType<typeof setInterval> | null = null

function stopLoop() {
  if (intervalId !== null) {
    clearInterval(intervalId)
    intervalId = null
  }
}

export const useComparisonStore = create<ComparisonStore>((set, get) => {
  function tick() {
    const { runner, isRunning } = get()
    if (!runner || !isRunning) return
    runner.processTick()
    const state = runner.getState()
    set({
      tick: state.tick,
      astarAgents: state.astarAgents,
      hpastarAgents: state.hpastarAgents,
      flowfieldAgents: state.flowfieldAgents,
      dstarAgents: state.dstarAgents,
      hybridAgents: state.hybridAgents,
      metrics: state.metrics,
    })
  }

  return {
    runner: null,
    seed: DEFAULT_SEED,
    isRunning: false,
    tick: 0,
    astarAgents: [],
    hpastarAgents: [],
    flowfieldAgents: [],
    dstarAgents: [],
    hybridAgents: [],
    metrics: null,
    selectedScenario: 'none',
    report: null,

    init(seed?: number) {
      stopLoop()
      const s = seed ?? get().seed
      resetAgentIdCounter()
      const runner = new ComparisonRunner(WORLD_SIZE, s)

      // Build identical flat terrain on all 4 grids
      for (let x = 0; x < WORLD_SIZE; x++) {
        for (let z = 0; z < WORLD_SIZE; z++) {
          runner.astarEngine.grid.setBlock({ x, y: 0, z }, BlockType.Solid)
          runner.hpastarEngine.grid.setBlock({ x, y: 0, z }, BlockType.Solid)
          runner.flowfieldEngine.grid.setBlock({ x, y: 0, z }, BlockType.Solid)
          runner.dstarEngine.grid.setBlock({ x, y: 0, z }, BlockType.Solid)
          runner.hybridEngine.grid.setBlock({ x, y: 0, z }, BlockType.Solid)
        }
      }

      // Rebuild pathfinder graphs now that terrain exists
      runner.rebuildHPAGraph()
      runner.rebuildFlowFieldLayers()
      runner.rebuildHybridGraphs()

      // Add a default agent on each side
      const pos = { x: 4, y: 1, z: 4 }
      const a1 = createAgent(pos)
      runner.astarEngine.agentManager.addAgent(a1)
      resetAgentIdCounter()
      const a2 = createAgent(pos)
      runner.hpastarEngine.agentManager.addAgent(a2)
      resetAgentIdCounter()
      const a3 = createAgent(pos)
      runner.flowfieldEngine.agentManager.addAgent(a3)
      resetAgentIdCounter()
      const a4 = createAgent(pos)
      runner.dstarEngine.agentManager.addAgent(a4)
      resetAgentIdCounter()
      const a5 = createAgent(pos)
      runner.hybridEngine.agentManager.addAgent(a5)

      // Auto-assign destinations so agents pathfind continuously
      runner.autoAssign = true

      set({
        runner,
        seed: s,
        isRunning: false,
        tick: 0,
        astarAgents: [...runner.astarEngine.agentManager.getAgents()],
        hpastarAgents: [...runner.hpastarEngine.agentManager.getAgents()],
        flowfieldAgents: [...runner.flowfieldEngine.agentManager.getAgents()],
        dstarAgents: [...runner.dstarEngine.agentManager.getAgents()],
        hybridAgents: [...runner.hybridEngine.agentManager.getAgents()],
        metrics: runner.getMetrics(),
        report: null,
      })
    },

    start() {
      const { runner } = get()
      if (!runner) get().init()
      stopLoop()
      set({ isRunning: true })
      intervalId = setInterval(tick, SIM_INTERVAL_MS)
    },

    pause() {
      stopLoop()
      set({ isRunning: false })
    },

    reset() {
      stopLoop()
      get().init()
    },

    setSeed(seed: number) {
      set({ seed })
    },

    setScenario(name: ScenarioName) {
      set({ selectedScenario: name })
    },

    runScenario() {
      const { selectedScenario } = get()
      if (selectedScenario === 'none') return

      const scenario = selectedScenario === 'canyon-run'
        ? createCanyonRunScenario()
        : createBridgeCollapseScenario()

      const astarFactory: PathfinderFactory = (wv, ws) => new GridAStarPathfinder(wv)
      const hpaFactory: PathfinderFactory = (wv, ws) => new HPAStarPathfinder(wv, ws)

      const astarResult = ScenarioRunner.run(scenario, astarFactory)

      resetAgentIdCounter()
      const hpaResult = ScenarioRunner.run(scenario, hpaFactory)

      // Generate combined report
      const report = [
        '# Comparison Report: ' + scenario.name,
        '',
        '---',
        '',
        generateDiagnosticReport({
          name: scenario.name,
          algorithm: 'A*',
          worldSize: scenario.worldSize,
          seed: scenario.seed,
          totalTicks: scenario.totalTicks,
          metrics: astarResult.finalMetrics,
          events: astarResult.events,
          agents: [],
        }),
        '---',
        '',
        generateDiagnosticReport({
          name: scenario.name,
          algorithm: 'HPA*',
          worldSize: scenario.worldSize,
          seed: scenario.seed,
          totalTicks: scenario.totalTicks,
          metrics: hpaResult.finalMetrics,
          events: hpaResult.events,
          agents: [],
        }),
      ].join('\n')

      set({ report })
    },

    exportReport() {
      const { runner } = get()
      if (!runner) return

      const report = generateComparisonReport({
        name: 'Live Comparison',
        worldSize: WORLD_SIZE,
        seed: get().seed,
        totalTicks: runner.astarEngine.tick,
        astar: {
          metrics: runner.astarEngine.metrics,
          events: runner.getAStarEvents(),
          agents: [...runner.astarEngine.agentManager.getAgents()],
        },
        hpastar: {
          metrics: runner.hpastarEngine.metrics,
          events: runner.getHPAStarEvents(),
          agents: [...runner.hpastarEngine.agentManager.getAgents()],
        },
        flowfield: {
          metrics: runner.flowfieldEngine.metrics,
          events: runner.getFlowFieldEvents(),
          agents: [...runner.flowfieldEngine.agentManager.getAgents()],
        },
        dstar: {
          metrics: runner.dstarEngine.metrics,
          events: runner.getDStarEvents(),
          agents: [...runner.dstarEngine.agentManager.getAgents()],
        },
        hybrid: {
          metrics: runner.hybridEngine.metrics,
          events: runner.getHybridEvents(),
          agents: [...runner.hybridEngine.agentManager.getAgents()],
        },
      })

      // Download as .md file
      const blob = new Blob([report], { type: 'text/markdown' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `comparison-report-seed${get().seed}-tick${runner.astarEngine.tick}.md`
      a.click()
      URL.revokeObjectURL(url)

      set({ report })
    },
  }
})
