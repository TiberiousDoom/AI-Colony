import type { ScenarioDefinition } from '../scenario-runner.ts'
import { BlockType } from '../../world/block-types.ts'
import { createAgent } from '../../agents/agent.ts'
import { isWalkable } from '../../pathfinding/movement-rules.ts'

/**
 * Large Bridge Collapse: 160×160 version of Bridge Collapse.
 * A 65-block bridge at y=8 with 10 agents.
 * Bridge collapses from center starting at tick 40.
 * Ground ramps allow recovery. 600 ticks total.
 */
export function createLargeBridgeCollapseScenario(): ScenarioDefinition {
  const tickScript = new Map<number, (engine: Parameters<ScenarioDefinition['setup']>[0]) => void>()

  const bridgeZ = 80
  const centerX = 80

  // Collapse bridge from center outward starting at tick 40
  for (let i = 0; i < 20; i++) {
    tickScript.set(40 + i * 5, (engine) => {
      const leftX = centerX - i
      const rightX = centerX + i
      engine.queueTerrainChange({ x: leftX, y: 8, z: bridgeZ }, BlockType.Air)
      engine.queueTerrainChange({ x: rightX, y: 8, z: bridgeZ }, BlockType.Air)
      engine.queueTerrainChange({ x: leftX, y: 8, z: bridgeZ - 1 }, BlockType.Air)
      engine.queueTerrainChange({ x: rightX, y: 8, z: bridgeZ + 1 }, BlockType.Air)
    })
  }

  return {
    name: 'Large Bridge Collapse',
    worldSize: 160,
    seed: 8888,
    totalTicks: 600,
    setup: (engine) => {
      const grid = engine.grid
      const size = 160

      // Build flat ground
      for (let x = 0; x < size; x++) {
        for (let z = 0; z < size; z++) {
          grid.setBlock({ x, y: 0, z }, BlockType.Solid)
        }
      }

      // Left platform: x=20..55, z=70..90, y=1..7
      for (let x = 20; x < 56; x++) {
        for (let z = 70; z < 91; z++) {
          for (let y = 1; y <= 7; y++) {
            grid.setBlock({ x, y, z }, BlockType.Solid)
          }
        }
      }
      // Right platform: x=100..135, z=70..90, y=1..7
      for (let x = 100; x < 136; x++) {
        for (let z = 70; z < 91; z++) {
          for (let y = 1; y <= 7; y++) {
            grid.setBlock({ x, y, z }, BlockType.Solid)
          }
        }
      }

      // Bridge at y=8 connecting platforms (x=45..115)
      for (let x = 45; x < 116; x++) {
        grid.setBlock({ x, y: 8, z: bridgeZ }, BlockType.Solid)
        grid.setBlock({ x, y: 8, z: bridgeZ - 1 }, BlockType.Solid)
        grid.setBlock({ x, y: 8, z: bridgeZ + 1 }, BlockType.Solid)
      }

      // Ground ramps
      for (let i = 0; i < 7; i++) {
        grid.setBlock({ x: 20, y: i + 1, z: 69 - i }, BlockType.Stair)
        grid.setBlock({ x: 135, y: i + 1, z: 69 - i }, BlockType.Stair)
      }

      // Place 10 agents on the left platform
      const spawns = [
        { x: 30, y: 8, z: 80 }, { x: 32, y: 8, z: 80 },
        { x: 34, y: 8, z: 80 }, { x: 36, y: 8, z: 80 },
        { x: 38, y: 8, z: 80 }, { x: 30, y: 8, z: 78 },
        { x: 32, y: 8, z: 78 }, { x: 34, y: 8, z: 78 },
        { x: 36, y: 8, z: 78 }, { x: 38, y: 8, z: 78 },
      ]
      const dests = [
        { x: 120, y: 8, z: 80 }, { x: 122, y: 8, z: 80 },
        { x: 124, y: 8, z: 80 }, { x: 126, y: 8, z: 80 },
        { x: 128, y: 8, z: 80 }, { x: 120, y: 8, z: 82 },
        { x: 122, y: 8, z: 82 }, { x: 124, y: 8, z: 82 },
        { x: 126, y: 8, z: 82 }, { x: 128, y: 8, z: 82 },
      ]

      for (let i = 0; i < 10; i++) {
        if (isWalkable(grid, spawns[i], 2)) {
          const agent = createAgent(spawns[i])
          engine.agentManager.addAgent(agent)
          engine.agentManager.assignDestination(agent, dests[i])
        }
      }
    },
    tickScript,
    validate: (results) => {
      return results.finalMetrics.algorithmErrors === 0
    },
  }
}
