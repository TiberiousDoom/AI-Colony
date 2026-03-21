import type { ScenarioDefinition } from '../scenario-runner.ts'
import { BlockType } from '../../world/block-types.ts'
import { createAgent } from '../../agents/agent.ts'
import { isWalkable } from '../../pathfinding/movement-rules.ts'

/**
 * Rush Hour: Pure congestion test on flat ground.
 * A narrow 2-wide, 20-long corridor connects two 8x8 waiting areas.
 * 24 agents (12 per side) must cross to the opposite waiting area.
 * No terrain changes. 800 ticks total.
 */
export function createRushHourScenario(): ScenarioDefinition {
  const tickScript = new Map<number, (engine: Parameters<ScenarioDefinition['setup']>[0]) => void>()

  return {
    name: 'Rush Hour',
    worldSize: 32,
    seed: 4444,
    totalTicks: 800,
    setup: (engine) => {
      const grid = engine.grid
      const size = 32

      // Build flat ground across entire map
      for (let x = 0; x < size; x++) {
        for (let z = 0; z < size; z++) {
          grid.setBlock({ x, y: 0, z }, BlockType.Solid)
        }
      }

      // Build corridor walls: corridor is at z=14..15, x=6..25
      // Walls on z=13 and z=16 along x=6..25
      for (let x = 6; x <= 25; x++) {
        for (let y = 1; y <= 3; y++) {
          grid.setBlock({ x, y, z: 13 }, BlockType.Solid)
          grid.setBlock({ x, y, z: 16 }, BlockType.Solid)
        }
      }

      // Left waiting area: x=0..5, z=10..17 (8x8 open space, ground already placed)
      // Right waiting area: x=26..31, z=10..17 (8x8 open space)
      // Both are already open on flat ground; corridor walls restrict flow

      // Also wall off the non-corridor z-range between the areas so agents must use corridor
      for (let x = 6; x <= 25; x++) {
        for (let y = 1; y <= 3; y++) {
          // Block everything except z=14..15 in the corridor range
          for (let z = 10; z <= 17; z++) {
            if (z === 14 || z === 15) continue
            if (z === 13 || z === 16) continue // already walled
            grid.setBlock({ x, y, z }, BlockType.Solid)
          }
        }
      }

      // Spawn 12 agents on the left side (x=0..5)
      const leftSpawns = [
        { x: 1, y: 1, z: 12 }, { x: 2, y: 1, z: 12 }, { x: 3, y: 1, z: 12 },
        { x: 1, y: 1, z: 14 }, { x: 2, y: 1, z: 14 }, { x: 3, y: 1, z: 14 },
        { x: 1, y: 1, z: 15 }, { x: 2, y: 1, z: 15 }, { x: 3, y: 1, z: 15 },
        { x: 1, y: 1, z: 16 }, { x: 2, y: 1, z: 16 }, { x: 3, y: 1, z: 16 },
      ]

      // Destinations in the right waiting area
      const leftDests = [
        { x: 28, y: 1, z: 12 }, { x: 29, y: 1, z: 12 }, { x: 30, y: 1, z: 12 },
        { x: 28, y: 1, z: 14 }, { x: 29, y: 1, z: 14 }, { x: 30, y: 1, z: 14 },
        { x: 28, y: 1, z: 15 }, { x: 29, y: 1, z: 15 }, { x: 30, y: 1, z: 15 },
        { x: 28, y: 1, z: 16 }, { x: 29, y: 1, z: 16 }, { x: 30, y: 1, z: 16 },
      ]

      // Spawn 12 agents on the right side (x=26..31)
      const rightSpawns = [
        { x: 28, y: 1, z: 12 }, { x: 29, y: 1, z: 12 }, { x: 30, y: 1, z: 12 },
        { x: 28, y: 1, z: 14 }, { x: 29, y: 1, z: 14 }, { x: 30, y: 1, z: 14 },
        { x: 28, y: 1, z: 15 }, { x: 29, y: 1, z: 15 }, { x: 30, y: 1, z: 15 },
        { x: 28, y: 1, z: 16 }, { x: 29, y: 1, z: 16 }, { x: 30, y: 1, z: 16 },
      ]

      // Destinations in the left waiting area
      const rightDests = [
        { x: 1, y: 1, z: 12 }, { x: 2, y: 1, z: 12 }, { x: 3, y: 1, z: 12 },
        { x: 1, y: 1, z: 14 }, { x: 2, y: 1, z: 14 }, { x: 3, y: 1, z: 14 },
        { x: 1, y: 1, z: 15 }, { x: 2, y: 1, z: 15 }, { x: 3, y: 1, z: 15 },
        { x: 1, y: 1, z: 16 }, { x: 2, y: 1, z: 16 }, { x: 3, y: 1, z: 16 },
      ]

      // Add left-side agents
      for (let i = 0; i < 12; i++) {
        if (isWalkable(grid, leftSpawns[i], 2)) {
          const agent = createAgent(leftSpawns[i])
          engine.agentManager.addAgent(agent)
          engine.agentManager.assignDestination(agent, leftDests[i])
        }
      }

      // Add right-side agents
      for (let i = 0; i < 12; i++) {
        if (isWalkable(grid, rightSpawns[i], 2)) {
          const agent = createAgent(rightSpawns[i])
          engine.agentManager.addAgent(agent)
          engine.agentManager.assignDestination(agent, rightDests[i])
        }
      }
    },
    tickScript,
    validate: (results) => {
      return results.finalMetrics.algorithmErrors === 0
    },
  }
}
