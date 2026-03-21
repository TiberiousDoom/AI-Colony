import type { ScenarioDefinition } from '../scenario-runner.ts'
import { BlockType } from '../../world/block-types.ts'
import { createAgent } from '../../agents/agent.ts'
import { isWalkable } from '../../pathfinding/movement-rules.ts'

/**
 * Construction Zone: A wall of Platform blocks is progressively built across
 * the map at x=16, one block every 4 ticks (z=0,1,2,...).
 * A 2-block gap is left at z=10..11 so agents can still cross.
 * 6 agents on the left must reach destinations on the right.
 * 500 ticks total.
 */
export function createConstructionZoneScenario(): ScenarioDefinition {
  const tickScript = new Map<number, (engine: Parameters<ScenarioDefinition['setup']>[0]) => void>()

  // Build wall one block at a time: z=0,1,2,...31 (skip z=10,11 for gap)
  // One block every 4 ticks, starting at tick 4
  let zIndex = 0
  for (let t = 4; t <= 500 && zIndex < 32; t += 4) {
    // Skip the gap at z=10..11
    if (zIndex === 10) { zIndex = 12 }
    if (zIndex >= 32) break

    const wallZ = zIndex
    tickScript.set(t, (engine) => {
      // Build Platform blocks at x=16 for y=1..3 (wall 3 high)
      for (let y = 1; y <= 3; y++) {
        engine.queueTerrainChange({ x: 16, y, z: wallZ }, BlockType.Platform)
      }
    })
    zIndex++
  }

  // Agent spawn positions on the left (x=4..8, various z)
  const spawns = [
    { x: 4, y: 1, z: 8 },
    { x: 5, y: 1, z: 10 },
    { x: 6, y: 1, z: 12 },
    { x: 7, y: 1, z: 14 },
    { x: 8, y: 1, z: 16 },
    { x: 4, y: 1, z: 18 },
  ]

  // Destinations on the right (x=24..28, various z)
  const dests = [
    { x: 24, y: 1, z: 8 },
    { x: 25, y: 1, z: 10 },
    { x: 26, y: 1, z: 12 },
    { x: 27, y: 1, z: 14 },
    { x: 28, y: 1, z: 16 },
    { x: 24, y: 1, z: 18 },
  ]

  return {
    name: 'Construction Zone',
    worldSize: 32,
    seed: 6666,
    totalTicks: 500,
    setup: (engine) => {
      const grid = engine.grid
      const size = 32

      // Build flat ground
      for (let x = 0; x < size; x++) {
        for (let z = 0; z < size; z++) {
          grid.setBlock({ x, y: 0, z }, BlockType.Solid)
        }
      }

      // Spawn 6 agents
      for (let i = 0; i < 6; i++) {
        if (isWalkable(grid, spawns[i], 2)) {
          const agent = createAgent(spawns[i])
          engine.agentManager.addAgent(agent)
          engine.agentManager.assignDestination(agent, dests[i])
        }
      }
    },
    tickScript,
    validate: (results) => {
      return results.finalMetrics.algorithmErrors === 0 &&
        results.finalMetrics.tripsCompleted >= 1
    },
  }
}
