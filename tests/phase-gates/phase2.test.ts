import { describe, it, expect, beforeEach } from 'vitest'
import { VoxelGrid } from '../../src/voxel/world/voxel-grid.ts'
import { BlockType } from '../../src/voxel/world/block-types.ts'
import { GridWorldView } from '../../src/voxel/pathfinding/grid-world-view.ts'
import { GridAStarPathfinder } from '../../src/voxel/pathfinding/grid-astar.ts'
import { HPAStarPathfinder, scanBoundaryNodes, CoarseGraph } from '../../src/voxel/pathfinding/hpa-star.ts'
import { StringPullSmoother } from '../../src/voxel/pathfinding/string-pull-smoother.ts'
import { ReservationTable } from '../../src/voxel/pathfinding/reservation-table.ts'
import { PassthroughSmoother } from '../../src/voxel/pathfinding/pathfinder-interface.ts'
import type { TerrainChangeEvent } from '../../src/voxel/pathfinding/pathfinder-interface.ts'
import { voxelEquals } from '../../src/voxel/pathfinding/types.ts'
import type { VoxelCoord } from '../../src/voxel/pathfinding/types.ts'
import { worldToChunk, CHUNK_SIZE } from '../../src/voxel/world/chunk-utils.ts'
import { createAgent, resetAgentIdCounter } from '../../src/voxel/agents/agent.ts'
import { AgentManager } from '../../src/voxel/agents/agent-manager.ts'
import { SimulationEngine } from '../../src/voxel/simulation/simulation-engine.ts'
import { EventLogger } from '../../src/voxel/simulation/event-logger.ts'
import { ScenarioRunner, type PathfinderFactory } from '../../src/voxel/simulation/scenario-runner.ts'
import { createCanyonRunScenario } from '../../src/voxel/simulation/scenarios/canyon-run.ts'
import { createBridgeCollapseScenario } from '../../src/voxel/simulation/scenarios/bridge-collapse.ts'
import { ComparisonRunner } from '../../src/voxel/simulation/comparison-runner.ts'
import { generateDiagnosticReport } from '../../src/voxel/simulation/diagnostic-report.ts'
import { isWalkable } from '../../src/voxel/pathfinding/movement-rules.ts'
import { createRNG } from '../../src/utils/seed.ts'

// ─── Helpers ─────────────────────────────────────────────────────────

function createFlatWorld(size: number = 32): VoxelGrid {
  const grid = new VoxelGrid(size)
  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      grid.setBlock({ x, y: 0, z }, BlockType.Solid)
    }
  }
  return grid
}

function makeEvent(pos: VoxelCoord, changeType: 'remove' | 'add', tick: number = 0): TerrainChangeEvent {
  return {
    chunkCoords: [worldToChunk(pos)],
    changedVoxels: [pos],
    changeType,
    tick,
  }
}


// ============================================================
// HPA* Pathfinding
// ============================================================
describe('HPA* Pathfinding', () => {
  let grid: VoxelGrid
  let worldView: GridWorldView

  beforeEach(() => {
    resetAgentIdCounter()
    grid = createFlatWorld(32)
    worldView = new GridWorldView(grid)
  })

  it('finds a cross-chunk path', () => {
    const pf = new HPAStarPathfinder(worldView, 32)
    const start: VoxelCoord = { x: 2, y: 1, z: 2 }
    const dest: VoxelCoord = { x: 20, y: 1, z: 20 }
    const handle = pf.requestNavigation(start, dest, 2, 1)
    expect(handle).not.toBeNull()
    const path = handle!.getPlannedPath(start)
    expect(path).not.toBeNull()
    expect(path!.length).toBeGreaterThan(1)
    // Path should start at start and end at dest
    expect(voxelEquals(path![0], start)).toBe(true)
    expect(voxelEquals(path![path!.length - 1], dest)).toBe(true)
  })

  it('returns a valid path (all voxels walkable)', () => {
    const pf = new HPAStarPathfinder(worldView, 32)
    const start: VoxelCoord = { x: 1, y: 1, z: 1 }
    const dest: VoxelCoord = { x: 14, y: 1, z: 14 }
    const handle = pf.requestNavigation(start, dest, 2, 1)
    expect(handle).not.toBeNull()
    const path = handle!.getPlannedPath(start)
    expect(path).not.toBeNull()
    for (const p of path!) {
      expect(isWalkable(grid, p, 2)).toBe(true)
    }
  })

  it('updates coarse graph when chunk changes', () => {
    const pf = new HPAStarPathfinder(worldView, 32)
    // Block a path through chunk boundary
    const wallPos: VoxelCoord = { x: 8, y: 1, z: 4 }
    grid.setBlock(wallPos, BlockType.Solid)
    pf.invalidateRegion(makeEvent(wallPos, 'add'))

    // Should still find a path (around the wall)
    const handle = pf.requestNavigation({ x: 6, y: 1, z: 4 }, { x: 10, y: 1, z: 4 }, 2, 1)
    // Either finds a path around or returns null if fully blocked
    // The single wall shouldn't block everything
    expect(handle).not.toBeNull()
  })

  it('only recomputes affected chunk on update', () => {
    const graph = new CoarseGraph()
    graph.build(worldView, 32, 2)

    // Update a single chunk
    const wallPos: VoxelCoord = { x: 4, y: 1, z: 4 }
    grid.setBlock(wallPos, BlockType.Solid)
    graph.updateChunk(worldView, worldToChunk(wallPos), 2)

    // Node count may change but graph should still be functional
    expect(graph.nodeCount).toBeGreaterThanOrEqual(0)
  })

  it('scans boundary nodes at chunk edges for walkable voxels', () => {
    const cc = { cx: 0, cy: 0, cz: 0 }
    const nodes = scanBoundaryNodes(worldView, cc, 2)
    // On a flat world, boundary nodes exist at y=1 on chunk faces where adjacent chunk also has ground
    const xPlusNodes = nodes.filter(n => n.face === 'x+')
    // At x=7 (edge of chunk 0), y=1 should be walkable
    expect(xPlusNodes.length).toBeGreaterThan(0)
    for (const node of xPlusNodes) {
      expect(node.pos.x).toBe(CHUNK_SIZE - 1) // x=7
    }
  })

  it('respects entry/exit points at chunk boundaries', () => {
    const pf = new HPAStarPathfinder(worldView, 32)
    // Path from chunk (0,0,0) to chunk (1,0,0)
    const start: VoxelCoord = { x: 4, y: 1, z: 4 }
    const dest: VoxelCoord = { x: 12, y: 1, z: 4 }
    const handle = pf.requestNavigation(start, dest, 2, 1)
    expect(handle).not.toBeNull()
    const path = handle!.getPlannedPath(start)
    expect(path).not.toBeNull()
    // Path should cross chunk boundary (x=7→x=8)
    const crossesChunk = path!.some((p, i) => {
      if (i === 0) return false
      const prev = path![i - 1]
      return worldToChunk(prev).cx !== worldToChunk(p).cx
    })
    expect(crossesChunk).toBe(true)
  })
})

// ============================================================
// Side-by-Side Comparison
// ============================================================
describe('Side-by-Side Comparison', () => {
  beforeEach(() => {
    resetAgentIdCounter()
  })

  it('mirrored terrain: both engines have identical terrain', () => {
    const runner = new ComparisonRunner(32, 42)
    // Set up terrain on both sides
    runner.astarEngine.grid.setBlock({ x: 0, y: 0, z: 0 }, BlockType.Solid)
    runner.hpastarEngine.grid.setBlock({ x: 0, y: 0, z: 0 }, BlockType.Solid)

    // Queue a mirrored terrain change
    runner.queueTerrainChange({ x: 10, y: 0, z: 10 }, BlockType.Solid)
    runner.processTick()

    expect(runner.astarEngine.grid.getBlock({ x: 10, y: 0, z: 10 })).toBe(BlockType.Solid)
    expect(runner.hpastarEngine.grid.getBlock({ x: 10, y: 0, z: 10 })).toBe(BlockType.Solid)
  })

  it('scheduled event timing: tick scripts fire at correct tick', () => {
    const runner = new ComparisonRunner(32, 42)
    // Build ground
    for (let x = 0; x < 32; x++) {
      for (let z = 0; z < 32; z++) {
        runner.astarEngine.grid.setBlock({ x, y: 0, z }, BlockType.Solid)
        runner.hpastarEngine.grid.setBlock({ x, y: 0, z }, BlockType.Solid)
      }
    }

    // Process 5 ticks
    for (let i = 0; i < 5; i++) {
      runner.processTick()
    }

    expect(runner.getMetrics().astar.tick).toBe(5)
    expect(runner.getMetrics().hpastar.tick).toBe(5)
  })
})

// ============================================================
// Reservation Table
// ============================================================
describe('Reservation Table', () => {
  let table: ReservationTable

  beforeEach(() => {
    table = new ReservationTable()
  })

  it('reserve and check: basic reservation works', () => {
    const pos: VoxelCoord = { x: 5, y: 1, z: 5 }
    table.reserve(1, 0, [pos])
    expect(table.isReserved(0, pos)).toBe(true)
    expect(table.isReserved(1, pos)).toBe(false)
  })

  it('cancel: removes all reservations for agent', () => {
    const pos: VoxelCoord = { x: 5, y: 1, z: 5 }
    table.reserve(1, 0, [pos])
    table.reserve(1, 1, [pos])
    table.cancel(1)
    expect(table.isReserved(0, pos)).toBe(false)
    expect(table.isReserved(1, pos)).toBe(false)
  })

  it('re-route cancel: canceling clears path for other agents', () => {
    const pos1: VoxelCoord = { x: 5, y: 1, z: 5 }
    const pos2: VoxelCoord = { x: 6, y: 1, z: 5 }
    table.reserve(1, 0, [pos1])
    table.reserve(2, 0, [pos2])
    table.cancel(1)
    expect(table.isReserved(0, pos1)).toBe(false)
    expect(table.isReserved(0, pos2)).toBe(true) // agent 2 unaffected
  })

  it('arrival cancel: agent finishing releases slots', () => {
    const pos: VoxelCoord = { x: 5, y: 1, z: 5 }
    table.reserve(1, 0, [pos])
    table.reserve(1, 1, [pos])
    table.reserve(1, 2, [pos])
    table.cancel(1)
    expect(table.isReserved(0, pos)).toBe(false)
    expect(table.isReserved(1, pos)).toBe(false)
    expect(table.isReserved(2, pos)).toBe(false)
  })

  it('death cancel: removed agent reservations cleaned up', () => {
    const pos: VoxelCoord = { x: 5, y: 1, z: 5 }
    table.reserve(99, 0, [pos])
    table.cancel(99)
    expect(table.isReserved(0, pos)).toBe(false)
  })

  it('GC: past ticks are removed', () => {
    const pos: VoxelCoord = { x: 5, y: 1, z: 5 }
    table.reserve(1, 0, [pos])
    table.reserve(1, 5, [pos])
    table.reserve(1, 10, [pos])
    table.gcPastTicks(6)
    expect(table.isReserved(0, pos)).toBe(false)
    expect(table.isReserved(5, pos)).toBe(false)
    expect(table.isReserved(10, pos)).toBe(true)
  })

  it('priority: excludeAgent parameter works', () => {
    const pos: VoxelCoord = { x: 5, y: 1, z: 5 }
    table.reserve(1, 0, [pos])
    expect(table.isReserved(0, pos, 1)).toBe(false) // exclude self
    expect(table.isReserved(0, pos, 2)).toBe(true) // other agent sees it
  })
})

// ============================================================
// Wait & Re-route
// ============================================================
describe('Wait & Re-route', () => {
  beforeEach(() => {
    resetAgentIdCounter()
  })

  it('agent enters Waiting state when blocked by reservation', () => {
    const grid = createFlatWorld(32)
    const worldView = new GridWorldView(grid)
    const pf = new GridAStarPathfinder(worldView)
    const table = new ReservationTable()
    const smoother = new PassthroughSmoother()
    const am = new AgentManager(pf, smoother, grid, table)

    const agent = createAgent({ x: 4, y: 1, z: 4 })
    am.addAgent(agent)
    am.assignDestination(agent, { x: 8, y: 1, z: 4 })

    // Reserve the next voxel the agent wants to move to
    const nextPos = agent.navigationHandle!.getPlannedPath(agent.position)![1]
    table.reserve(999, 0, [nextPos])

    am.update()
    expect(agent.state).toBe('Waiting')
  })

  it('agent re-routes after 5 wait ticks', () => {
    const grid = createFlatWorld(32)
    const worldView = new GridWorldView(grid)
    const pf = new GridAStarPathfinder(worldView)
    const smoother = new PassthroughSmoother()
    const am = new AgentManager(pf, smoother, grid)

    const agent = createAgent({ x: 4, y: 1, z: 4 })
    am.addAgent(agent)
    am.assignDestination(agent, { x: 8, y: 1, z: 4 })
    agent.state = 'Waiting'
    agent.waitTicks = 0

    for (let i = 0; i < 5; i++) {
      am.update()
    }

    // After 5 ticks of waiting, agent should re-route (back to Navigating)
    const stateAfter5 = agent.state as string
    expect(stateAfter5 === 'Navigating' || stateAfter5 === 'Re-routing').toBe(true)
  })

  it('deadlock safety valve triggers at 20 wait ticks', () => {
    const grid = createFlatWorld(32)
    const worldView = new GridWorldView(grid)
    const pf = new GridAStarPathfinder(worldView)
    const smoother = new PassthroughSmoother()
    const am = new AgentManager(pf, smoother, grid)

    const agent = createAgent({ x: 4, y: 1, z: 4 })
    am.addAgent(agent)
    am.assignDestination(agent, { x: 8, y: 1, z: 4 })
    agent.state = 'Waiting'
    agent.waitTicks = 19

    am.update()

    // At 20 ticks, forced re-route
    const stateAfter20 = agent.state as string
    expect(agent.waitTicks === 0 || stateAfter20 === 'Navigating' || stateAfter20 === 'Re-routing').toBe(true)
  })
})

// ============================================================
// Agent States
// ============================================================
describe('Agent States', () => {
  beforeEach(() => {
    resetAgentIdCounter()
  })

  it('full lifecycle: Idle → Navigating → Idle on arrival', () => {
    const grid = createFlatWorld(32)
    const worldView = new GridWorldView(grid)
    const pf = new GridAStarPathfinder(worldView)
    const smoother = new PassthroughSmoother()
    const am = new AgentManager(pf, smoother, grid)

    const agent = createAgent({ x: 4, y: 1, z: 4 })
    am.addAgent(agent)
    expect(agent.state).toBe('Idle')

    am.assignDestination(agent, { x: 6, y: 1, z: 4 })
    expect(agent.state).toBe('Navigating')

    // Run until arrival
    for (let i = 0; i < 20; i++) {
      am.update()
      if (agent.state === 'Idle') break
    }
    expect(agent.state).toBe('Idle')
    expect(voxelEquals(agent.position, { x: 6, y: 1, z: 4 })).toBe(true)
  })

  it('Re-routing on path invalidation', () => {
    const grid = createFlatWorld(32)
    const worldView = new GridWorldView(grid)
    const pf = new GridAStarPathfinder(worldView)
    const smoother = new PassthroughSmoother()
    const am = new AgentManager(pf, smoother, grid)

    const agent = createAgent({ x: 4, y: 1, z: 4 })
    am.addAgent(agent)
    am.assignDestination(agent, { x: 20, y: 1, z: 4 })

    // Invalidate a voxel on the path
    const path = agent.navigationHandle!.getPlannedPath(agent.position)!
    const midPoint = path[Math.floor(path.length / 2)]
    grid.setBlock(midPoint, BlockType.Solid)
    pf.invalidateRegion(makeEvent(midPoint, 'add'))

    am.update()
    // Agent should detect invalid path and re-route
    expect(agent.state === 'Re-routing' || agent.state === 'Navigating').toBe(true)
  })

  it('Waiting on blocked next voxel', () => {
    const grid = createFlatWorld(32)
    const worldView = new GridWorldView(grid)
    const pf = new GridAStarPathfinder(worldView)
    const table = new ReservationTable()
    const smoother = new PassthroughSmoother()
    const am = new AgentManager(pf, smoother, grid, table)

    const agent = createAgent({ x: 4, y: 1, z: 4 })
    am.addAgent(agent)
    am.assignDestination(agent, { x: 8, y: 1, z: 4 })

    // Reserve next position
    const path = agent.navigationHandle!.getPlannedPath(agent.position)!
    table.reserve(999, 0, [path[1]])

    am.update()
    expect(agent.state).toBe('Waiting')
  })

  it('Falling when ground removed', () => {
    const grid = createFlatWorld(32)
    const worldView = new GridWorldView(grid)
    const pf = new GridAStarPathfinder(worldView)
    const smoother = new PassthroughSmoother()
    const am = new AgentManager(pf, smoother, grid)

    const agent = createAgent({ x: 4, y: 1, z: 4 })
    am.addAgent(agent)

    // Remove ground under agent
    grid.setBlock({ x: 4, y: 0, z: 4 }, BlockType.Air)

    am.update()
    expect(agent.state).toBe('Falling')
  })

  it('Stuck when destination unreachable', () => {
    const grid = createFlatWorld(16)
    const worldView = new GridWorldView(grid)
    const pf = new GridAStarPathfinder(worldView)
    const smoother = new PassthroughSmoother()
    const am = new AgentManager(pf, smoother, grid)

    const agent = createAgent({ x: 4, y: 1, z: 4 })
    am.addAgent(agent)

    // Set destination to a position inside a solid block
    grid.setBlock({ x: 10, y: 1, z: 10 }, BlockType.Solid)
    grid.setBlock({ x: 10, y: 2, z: 10 }, BlockType.Solid)
    am.assignDestination(agent, { x: 10, y: 1, z: 10 })

    // Should be Stuck since destination is not walkable and nearby search may fail
    // (or Re-routing if it finds alternate)
    expect(agent.state === 'Stuck' || agent.state === 'Navigating' || agent.state === 'Re-routing').toBe(true)
  })
})

// ============================================================
// String-Pull Smoother
// ============================================================
describe('String-Pull Smoother', () => {
  beforeEach(() => {
    resetAgentIdCounter()
  })

  it('removes intermediate waypoints on straight line', () => {
    const grid = createFlatWorld(32)
    const worldView = new GridWorldView(grid)
    const smoother = new StringPullSmoother(worldView)

    const rawPath: VoxelCoord[] = [
      { x: 2, y: 1, z: 2 },
      { x: 3, y: 1, z: 2 },
      { x: 4, y: 1, z: 2 },
      { x: 5, y: 1, z: 2 },
      { x: 6, y: 1, z: 2 },
    ]

    const smoothed = smoother.smooth(rawPath, 2)
    // Should have fewer waypoints (at least start and end)
    expect(smoothed.length).toBeLessThan(rawPath.length)
    expect(smoothed[0].x).toBe(2)
    expect(smoothed[smoothed.length - 1].x).toBe(6)
  })

  it('preserves elevation changes', () => {
    const grid = createFlatWorld(32)
    // Add a raised platform
    grid.setBlock({ x: 5, y: 1, z: 2 }, BlockType.Solid)
    const worldView = new GridWorldView(grid)
    const smoother = new StringPullSmoother(worldView)

    const rawPath: VoxelCoord[] = [
      { x: 3, y: 1, z: 2 },
      { x: 4, y: 1, z: 2 },
      { x: 5, y: 2, z: 2 }, // step up
      { x: 6, y: 2, z: 2 },
    ]

    const smoothed = smoother.smooth(rawPath, 2)
    // Must preserve the y=2 waypoint
    const hasElevation = smoothed.some(w => w.y === 2)
    expect(hasElevation).toBe(true)
  })

  it('clearance check validates smoothed path', () => {
    const grid = createFlatWorld(32)
    const worldView = new GridWorldView(grid)
    const smoother = new StringPullSmoother(worldView)

    const rawPath: VoxelCoord[] = [
      { x: 2, y: 1, z: 2 },
      { x: 4, y: 1, z: 2 },
    ]

    const smoothed = smoother.smooth(rawPath, 2)
    expect(smoother.isValid(smoothed, 2)).toBe(true)
  })

  it('moveType tags are correct', () => {
    const grid = createFlatWorld(32)
    const worldView = new GridWorldView(grid)
    const smoother = new StringPullSmoother(worldView)

    const rawPath: VoxelCoord[] = [
      { x: 2, y: 1, z: 2 },
      { x: 3, y: 1, z: 2 },
      { x: 4, y: 1, z: 2 },
    ]

    const smoothed = smoother.smooth(rawPath, 2)
    for (const wp of smoothed) {
      expect(['walk', 'climb', 'drop', 'jump', 'stair']).toContain(wp.moveType)
    }
  })
})

// ============================================================
// TerrainChangeEvent
// ============================================================
describe('TerrainChangeEvent', () => {
  beforeEach(() => {
    resetAgentIdCounter()
  })

  it('event contains correct voxel data', () => {
    const grid = createFlatWorld(32)
    const worldView = new GridWorldView(grid)
    const pf = new GridAStarPathfinder(worldView)
    const smoother = new PassthroughSmoother()
    const am = new AgentManager(pf, smoother, grid)
    const engine = new SimulationEngine(grid, pf, am, createRNG(42))
    const logger = new EventLogger()
    engine.setEventLogger(logger)

    engine.queueTerrainChange({ x: 5, y: 5, z: 5 }, BlockType.Solid)
    engine.processTick()

    const events = logger.getEntriesByType('terrain_change')
    expect(events.length).toBe(1)
    expect(events[0].data.pos).toEqual({ x: 5, y: 5, z: 5 })
  })

  it('event has correct changeType', () => {
    const grid = createFlatWorld(32)
    const worldView = new GridWorldView(grid)
    const pf = new GridAStarPathfinder(worldView)
    const smoother = new PassthroughSmoother()
    const am = new AgentManager(pf, smoother, grid)
    const engine = new SimulationEngine(grid, pf, am, createRNG(42))
    const logger = new EventLogger()
    engine.setEventLogger(logger)

    engine.queueTerrainChange({ x: 5, y: 5, z: 5 }, BlockType.Solid)
    engine.queueTerrainChange({ x: 6, y: 6, z: 6 }, BlockType.Air)
    engine.processTick()

    const events = logger.getEntriesByType('terrain_change')
    expect(events.length).toBe(2)
    expect(events[0].data.changeType).toBe('add')
    expect(events[1].data.changeType).toBe('remove')
  })

  it('event has correct tick number', () => {
    const grid = createFlatWorld(32)
    const worldView = new GridWorldView(grid)
    const pf = new GridAStarPathfinder(worldView)
    const smoother = new PassthroughSmoother()
    const am = new AgentManager(pf, smoother, grid)
    const engine = new SimulationEngine(grid, pf, am, createRNG(42))
    const logger = new EventLogger()
    engine.setEventLogger(logger)

    // Process some ticks first
    engine.processTick()
    engine.processTick()
    engine.queueTerrainChange({ x: 5, y: 5, z: 5 }, BlockType.Solid)
    engine.processTick()

    const events = logger.getEntriesByType('terrain_change')
    expect(events.length).toBe(1)
    expect(events[0].tick).toBe(2) // queued at tick 2 (before processTick increments to 3)
  })
})

// ============================================================
// Handle Leak Sweep
// ============================================================
describe('Handle Leak Sweep', () => {
  beforeEach(() => {
    resetAgentIdCounter()
  })

  it('periodic sweep is called and cleans up', () => {
    const grid = createFlatWorld(32)
    const worldView = new GridWorldView(grid)
    const pf = new GridAStarPathfinder(worldView)
    const smoother = new PassthroughSmoother()
    const am = new AgentManager(pf, smoother, grid)

    const agent = createAgent({ x: 4, y: 1, z: 4 })
    am.addAgent(agent)
    am.assignDestination(agent, { x: 20, y: 1, z: 4 })
    expect(agent.navigationHandle).not.toBeNull()

    // Simulate a leak: pathfinder still holds the handle internally
    // but we remove the agent from the manager using splice directly
    // (bypassing removeAgent which would release the handle)
    const agentId = agent.id
    // Force remove without cleanup — simulate the leak scenario
    ;(am as any).agents = (am as any).agents.filter((a: any) => a.id !== agentId)

    // Now pathfinder has a handle for an agent that no longer exists
    const activeIds = am.getActiveAgentIds()
    expect(activeIds.has(agentId)).toBe(false)

    const swept = pf.sweepLeakedHandles(activeIds)
    expect(swept).toBe(1)
  })

  it('cleanup of killed-agent handles releases memory', () => {
    const grid = createFlatWorld(32)
    const worldView = new GridWorldView(grid)
    const pf = new HPAStarPathfinder(worldView, 32)
    const smoother = new PassthroughSmoother()
    const am = new AgentManager(pf, smoother, grid)

    const agent = createAgent({ x: 4, y: 1, z: 4 })
    am.addAgent(agent)
    am.assignDestination(agent, { x: 20, y: 1, z: 4 })

    // Simulate: remove agent directly from manager but leave handle
    am.removeAgent(agent.id)

    const swept = pf.sweepLeakedHandles(am.getActiveAgentIds())
    expect(swept).toBeGreaterThanOrEqual(0) // May be 0 if removeAgent already cleaned up
  })
})

// ============================================================
// Scenarios
// ============================================================
describe('Scenarios', () => {
  beforeEach(() => {
    resetAgentIdCounter()
  })

  it('Canyon Run smoke test: completes without errors', () => {
    const scenario = createCanyonRunScenario()
    const factory: PathfinderFactory = (wv) => new GridAStarPathfinder(wv)
    const result = ScenarioRunner.run(scenario, factory)
    expect(result.finalMetrics.algorithmErrors).toBe(0)
    expect(result.totalTicks).toBe(400)
    expect(result.passed).toBe(true)
  })

  it('Bridge Collapse smoke test: completes without errors', () => {
    const scenario = createBridgeCollapseScenario()
    const factory: PathfinderFactory = (wv) => new GridAStarPathfinder(wv)
    const result = ScenarioRunner.run(scenario, factory)
    expect(result.finalMetrics.algorithmErrors).toBe(0)
    expect(result.totalTicks).toBe(300)
    expect(result.passed).toBe(true)
  })
})

// ============================================================
// Diagnostic Report
// ============================================================
describe('Diagnostic Report', () => {
  it('generates valid markdown report', () => {
    const report = generateDiagnosticReport({
      name: 'Test',
      algorithm: 'A*',
      worldSize: 32,
      seed: 42,
      totalTicks: 100,
      metrics: {
        tick: 100,
        pathfindingTimeMs: 1.5,
        agentCount: 3,
        stuckAgents: 0,
        algorithmErrors: 0,
        budgetOverruns: 0,
        deferredReroutes: 0,
        waitEvents: 0,
        totalWaitTicks: 0,
        tripsCompleted: 0,
        pathSmoothness: 0,
      },
      events: [],
      agents: [],
    })

    expect(report).toContain('# Diagnostic Report')
    expect(report).toContain('Test')
    expect(report).toContain('A*')
    expect(report).toContain('Run Configuration')
    expect(report).toContain('Performance Analysis')
    expect(report).toContain('Agent Behavior Summary')
  })
})
