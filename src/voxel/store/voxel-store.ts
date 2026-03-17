import { create } from 'zustand'
import { VoxelGrid } from '../world/voxel-grid.ts'
import { GridWorldView } from '../pathfinding/grid-world-view.ts'
import { GridAStarPathfinder } from '../pathfinding/grid-astar.ts'
import { PassthroughSmoother } from '../pathfinding/pathfinder-interface.ts'
import { AgentManager } from '../agents/agent-manager.ts'
import { SimulationEngine, type SimulationMetrics } from '../simulation/simulation-engine.ts'
import { generateTerrain } from '../world/terrain-generator.ts'
import { createRNG } from '../../utils/seed.ts'
import { createAgent, resetAgentIdCounter } from '../agents/agent.ts'
import type { Agent } from '../agents/agent.ts'
import type { VoxelCoord } from '../pathfinding/types.ts'
import { BlockType } from '../world/block-types.ts'
import { isWalkable } from '../pathfinding/movement-rules.ts'

const WORLD_SIZE = 32
const SIM_INTERVAL_MS = 50 // 20 TPS

export type EditMode = 'select' | 'addSolid' | 'removeSolid' | 'addLadder' | 'addStair'

interface VoxelStore {
  engine: SimulationEngine | null
  seed: number
  isRunning: boolean
  metrics: SimulationMetrics | null
  agents: ReadonlyArray<Agent>
  selectedAgentId: number | null
  editMode: EditMode
  worldVersion: number // bumped on terrain change for re-render

  init: (seed?: number) => void
  start: () => void
  pause: () => void
  reset: () => void
  setSeed: (seed: number) => void
  setEditMode: (mode: EditMode) => void
  selectAgent: (id: number | null) => void
  addAgent: (pos: VoxelCoord) => void
  assignAgentDestination: (agentId: number, dest: VoxelCoord) => void
  editTerrain: (pos: VoxelCoord) => void
}

let intervalId: ReturnType<typeof setInterval> | null = null

function stopLoop() {
  if (intervalId !== null) {
    clearInterval(intervalId)
    intervalId = null
  }
}

export const useVoxelStore = create<VoxelStore>((set, get) => {
  function tick() {
    const { engine, isRunning } = get()
    if (!engine || !isRunning) return
    engine.processTick()
    set({
      metrics: engine.metrics,
      agents: [...engine.agentManager.getAgents()],
    })
  }

  return {
    engine: null,
    seed: 42,
    isRunning: false,
    metrics: null,
    agents: [],
    selectedAgentId: null,
    editMode: 'select',
    worldVersion: 0,

    init(seed?: number) {
      stopLoop()
      const s = seed ?? get().seed
      resetAgentIdCounter()
      const rng = createRNG(s)
      const grid = new VoxelGrid(WORLD_SIZE)
      generateTerrain(grid, rng)

      const worldView = new GridWorldView(grid)
      const pathfinder = new GridAStarPathfinder(worldView)
      const smoother = new PassthroughSmoother()
      const agentManager = new AgentManager(pathfinder, smoother, grid)
      const engine = new SimulationEngine(grid, pathfinder, agentManager, rng)

      // Place a default agent on the terrain surface near center
      const cx = Math.floor(WORLD_SIZE / 2)
      const cz = Math.floor(WORLD_SIZE / 2)
      let spawnY = WORLD_SIZE - 1
      for (let y = WORLD_SIZE - 1; y >= 0; y--) {
        if (isWalkable(grid, { x: cx, y, z: cz }, 2)) {
          spawnY = y
          break
        }
      }
      const agent = createAgent({ x: cx, y: spawnY, z: cz })
      agentManager.addAgent(agent)

      set({
        engine,
        seed: s,
        isRunning: false,
        metrics: engine.metrics,
        agents: [...agentManager.getAgents()],
        selectedAgentId: null,
        worldVersion: 0,
      })
    },

    start() {
      const { engine } = get()
      if (!engine) get().init()
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

    setEditMode(mode: EditMode) {
      set({ editMode: mode })
    },

    selectAgent(id: number | null) {
      set({ selectedAgentId: id })
    },

    addAgent(pos: VoxelCoord) {
      const { engine } = get()
      if (!engine) return
      if (!isWalkable(engine.grid, pos, 2)) return
      const agent = createAgent(pos)
      engine.agentManager.addAgent(agent)
      set({ agents: [...engine.agentManager.getAgents()] })
    },

    assignAgentDestination(agentId: number, dest: VoxelCoord) {
      const { engine } = get()
      if (!engine) return
      const agent = engine.agentManager.getAgent(agentId)
      if (!agent) return
      engine.agentManager.assignDestination(agent, dest)
      set({ agents: [...engine.agentManager.getAgents()] })
    },

    editTerrain(pos: VoxelCoord) {
      const { engine, editMode, worldVersion } = get()
      if (!engine) return

      let blockType: BlockType | null = null
      switch (editMode) {
        case 'addSolid': blockType = BlockType.Solid; break
        case 'removeSolid': blockType = BlockType.Air; break
        case 'addLadder': blockType = BlockType.Ladder; break
        case 'addStair': blockType = BlockType.Stair; break
        default: return
      }

      engine.queueTerrainChange(pos, blockType)
      set({ worldVersion: worldVersion + 1 })
    },
  }
})
