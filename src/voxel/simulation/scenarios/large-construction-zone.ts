import type { ScenarioDefinition } from '../scenario-runner.ts'
import { BlockType } from '../../world/block-types.ts'
import { createAgent } from '../../agents/agent.ts'
import { isWalkable } from '../../pathfinding/movement-rules.ts'

/**
 * Large Construction Zone: 160×160 version of Construction Zone.
 * A wall of Platform blocks progressively built at x=80, one block every 4 ticks.
 * A 10-block gap at z=50..59 so agents can cross.
 * 15 agents on left must reach destinations on right.
 * 1000 ticks total.
 */
export function createLargeConstructionZoneScenario(): ScenarioDefinition {
  const tickScript = new Map<number, (engine: Parameters<ScenarioDefinition['setup']>[0]) => void>()

  const size = 160

  // Build wall one block at a time: z=0,1,...159 (skip z=50..59 for gap)
  let zIndex = 0
  for (let t = 4; t <= 1000 && zIndex < size; t += 4) {
    if (zIndex === 50) { zIndex = 60 }
    if (zIndex >= size) break

    const wallZ = zIndex
    tickScript.set(t, (engine) => {
      for (let y = 1; y <= 3; y++) {
        engine.queueTerrainChange({ x: 80, y, z: wallZ }, BlockType.Platform)
      }
    })
    zIndex++
  }

  // 15 agents on the left
  const spawns: Array<{ x: number; y: number; z: number }> = []
  const dests: Array<{ x: number; y: number; z: number }> = []
  for (let i = 0; i < 15; i++) {
    const z = 40 + i * 5
    spawns.push({ x: 20 + (i % 5) * 4, y: 1, z })
    dests.push({ x: 120 + (i % 5) * 4, y: 1, z })
  }

  return {
    name: 'Large Construction Zone',
    worldSize: size,
    seed: 6666,
    totalTicks: 1000,
    setup: (engine) => {
      const grid = engine.grid

      // Build flat ground
      for (let x = 0; x < size; x++) {
        for (let z = 0; z < size; z++) {
          grid.setBlock({ x, y: 0, z }, BlockType.Solid)
        }
      }

      // Spawn 15 agents
      for (let i = 0; i < 15; i++) {
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
