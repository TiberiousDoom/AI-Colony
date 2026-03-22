import type { ScenarioDefinition } from '../scenario-runner.ts'
import { BlockType } from '../../world/block-types.ts'
import { createAgent } from '../../agents/agent.ts'
import { isWalkable } from '../../pathfinding/movement-rules.ts'

/**
 * Large Canyon Run: 160×160 version of Canyon Run.
 * A 120-block canyon with 15 agents navigating through it.
 * Walls removed every 10 ticks to open new paths.
 * 800 ticks total.
 */
export function createLargeCanyonRunScenario(): ScenarioDefinition {
  const tickScript = new Map<number, (engine: Parameters<ScenarioDefinition['setup']>[0]) => void>()

  // Remove canyon walls every 10 ticks (ticks 10,20,...200)
  for (let t = 10; t <= 200; t += 10) {
    const wallX = 40 + Math.floor((t / 10) - 1)
    tickScript.set(t, (engine) => {
      for (let y = 1; y <= 3; y++) {
        engine.queueTerrainChange({ x: wallX, y, z: 60 }, BlockType.Air)
      }
    })
  }

  return {
    name: 'Large Canyon Run',
    worldSize: 160,
    seed: 7777,
    totalTicks: 800,
    setup: (engine) => {
      const grid = engine.grid
      const size = 160

      // Build flat ground
      for (let x = 0; x < size; x++) {
        for (let z = 0; z < size; z++) {
          grid.setBlock({ x, y: 0, z }, BlockType.Solid)
        }
      }

      // Build canyon walls (120 blocks long at x=40..159, z=50 and z=70)
      for (let x = 40; x < size; x++) {
        for (let y = 1; y <= 4; y++) {
          grid.setBlock({ x, y, z: 50 }, BlockType.Solid)
          grid.setBlock({ x, y, z: 70 }, BlockType.Solid)
        }
      }

      // Internal walls at z=60 (will be removed by tick script)
      for (let x = 40; x < 60; x++) {
        for (let y = 1; y <= 3; y++) {
          grid.setBlock({ x, y, z: 60 }, BlockType.Solid)
        }
      }

      // Place 15 agents on the left side of the canyon
      for (let i = 0; i < 15; i++) {
        const pos = { x: 10 + (i % 5) * 4, y: 1, z: 55 + (i % 3) * 5 }
        if (isWalkable(grid, pos, 2)) {
          const agent = createAgent(pos)
          engine.agentManager.addAgent(agent)
          const dest = { x: 140, y: 1, z: 55 + (i % 3) * 5 }
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
