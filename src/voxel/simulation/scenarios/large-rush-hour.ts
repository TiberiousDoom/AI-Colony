import type { ScenarioDefinition } from '../scenario-runner.ts'
import { BlockType } from '../../world/block-types.ts'
import { createAgent } from '../../agents/agent.ts'
import { isWalkable } from '../../pathfinding/movement-rules.ts'

/**
 * Large Rush Hour: 160×160 version of Rush Hour.
 * Narrow 2-wide, 100-long corridor connects two 25×40 waiting areas.
 * 60 agents (30 per side) must cross to the opposite waiting area.
 * No terrain changes. 1600 ticks total.
 */
export function createLargeRushHourScenario(): ScenarioDefinition {
  const tickScript = new Map<number, (engine: Parameters<ScenarioDefinition['setup']>[0]) => void>()

  return {
    name: 'Large Rush Hour',
    worldSize: 160,
    seed: 4444,
    totalTicks: 1600,
    setup: (engine) => {
      const grid = engine.grid
      const size = 160

      // Build flat ground
      for (let x = 0; x < size; x++) {
        for (let z = 0; z < size; z++) {
          grid.setBlock({ x, y: 0, z }, BlockType.Solid)
        }
      }

      // Corridor: z=70..71, x=30..125 (2-wide, 96-long)
      // Walls on z=65 and z=80 along x=30..125
      for (let x = 30; x <= 125; x++) {
        for (let y = 1; y <= 3; y++) {
          grid.setBlock({ x, y, z: 65 }, BlockType.Solid)
          grid.setBlock({ x, y, z: 80 }, BlockType.Solid)
        }
      }

      // Block everything except z=70..71 in the corridor range
      for (let x = 30; x <= 125; x++) {
        for (let y = 1; y <= 3; y++) {
          for (let z = 50; z <= 85; z++) {
            if (z === 70 || z === 71) continue
            if (z === 65 || z === 80) continue // already walled
            grid.setBlock({ x, y, z }, BlockType.Solid)
          }
        }
      }

      // Spawn 30 agents on the left side
      const leftSpawns: Array<{ x: number; y: number; z: number }> = []
      const leftDests: Array<{ x: number; y: number; z: number }> = []
      for (let i = 0; i < 30; i++) {
        const row = Math.floor(i / 5)
        const col = i % 5
        leftSpawns.push({ x: 5 + col * 4, y: 1, z: 60 + row * 4 })
        leftDests.push({ x: 140 + col * 3, y: 1, z: 60 + row * 4 })
      }

      // Spawn 30 agents on the right side
      const rightSpawns: Array<{ x: number; y: number; z: number }> = []
      const rightDests: Array<{ x: number; y: number; z: number }> = []
      for (let i = 0; i < 30; i++) {
        const row = Math.floor(i / 5)
        const col = i % 5
        rightSpawns.push({ x: 140 + col * 3, y: 1, z: 60 + row * 4 })
        rightDests.push({ x: 5 + col * 4, y: 1, z: 60 + row * 4 })
      }

      for (let i = 0; i < 30; i++) {
        if (isWalkable(grid, leftSpawns[i], 2)) {
          const agent = createAgent(leftSpawns[i])
          engine.agentManager.addAgent(agent)
          engine.agentManager.assignDestination(agent, leftDests[i])
        }
      }
      for (let i = 0; i < 30; i++) {
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
