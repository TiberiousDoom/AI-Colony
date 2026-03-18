import type { ScenarioDefinition } from '../scenario-runner.ts'
import { BlockType } from '../../world/block-types.ts'
import { createAgent } from '../../agents/agent.ts'
import { isWalkable } from '../../pathfinding/movement-rules.ts'

/**
 * Canyon Run: A 24-block canyon with 6 agents navigating through it.
 * Walls are removed every 10 ticks to open new paths.
 * 400 ticks total.
 */
export function createCanyonRunScenario(): ScenarioDefinition {
  const tickScript = new Map<number, (engine: Parameters<ScenarioDefinition['setup']>[0]) => void>()

  // Remove canyon walls every 10 ticks (ticks 10,20,...100)
  for (let t = 10; t <= 100; t += 10) {
    const wallX = 8 + Math.floor((t / 10) - 1)
    tickScript.set(t, (engine) => {
      // Remove a section of wall to open the canyon
      for (let y = 1; y <= 3; y++) {
        engine.queueTerrainChange({ x: wallX, y, z: 12 }, BlockType.Air)
      }
    })
  }

  return {
    name: 'Canyon Run',
    worldSize: 32,
    seed: 7777,
    totalTicks: 400,
    setup: (engine) => {
      const grid = engine.grid
      const size = 32

      // Build flat ground
      for (let x = 0; x < size; x++) {
        for (let z = 0; z < size; z++) {
          grid.setBlock({ x, y: 0, z }, BlockType.Solid)
        }
      }

      // Build canyon walls (24 blocks long at x=8..31, z=10 and z=14)
      for (let x = 8; x < size; x++) {
        for (let y = 1; y <= 4; y++) {
          grid.setBlock({ x, y, z: 10 }, BlockType.Solid)
          grid.setBlock({ x, y, z: 14 }, BlockType.Solid)
        }
      }

      // Add some internal walls at z=12 (will be removed by tick script)
      for (let x = 8; x < 18; x++) {
        for (let y = 1; y <= 3; y++) {
          grid.setBlock({ x, y, z: 12 }, BlockType.Solid)
        }
      }

      // Place 6 agents on the left side of the canyon
      for (let i = 0; i < 6; i++) {
        const pos = { x: 2 + i, y: 1, z: 11 + (i % 3) }
        if (isWalkable(grid, pos, 2)) {
          const agent = createAgent(pos)
          engine.agentManager.addAgent(agent)
          // Set destinations on the right side
          const dest = { x: 28, y: 1, z: 11 + (i % 3) }
          engine.agentManager.assignDestination(agent, dest)
        }
      }
    },
    tickScript,
    validate: (results) => {
      return results.finalMetrics.algorithmErrors === 0
    },
  }
}
