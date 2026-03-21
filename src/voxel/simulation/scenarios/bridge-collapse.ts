import type { ScenarioDefinition } from '../scenario-runner.ts'
import { BlockType } from '../../world/block-types.ts'
import { createAgent } from '../../agents/agent.ts'
import { isWalkable } from '../../pathfinding/movement-rules.ts'

/**
 * Bridge Collapse: A 16-block bridge at y=8 with 4 agents.
 * Bridge collapses from center starting at tick 40.
 * Ground ramps allow recovery. 300 ticks total.
 */
export function createBridgeCollapseScenario(): ScenarioDefinition {
  const tickScript = new Map<number, (engine: Parameters<ScenarioDefinition['setup']>[0]) => void>()

  // Collapse bridge from center outward starting at tick 40
  const bridgeZ = 16
  const centerX = 16
  for (let i = 0; i < 8; i++) {
    tickScript.set(40 + i * 5, (engine) => {
      // Remove bridge blocks symmetrically from center
      const leftX = centerX - i
      const rightX = centerX + i
      engine.queueTerrainChange({ x: leftX, y: 8, z: bridgeZ }, BlockType.Air)
      engine.queueTerrainChange({ x: rightX, y: 8, z: bridgeZ }, BlockType.Air)
      // Also remove side rails
      engine.queueTerrainChange({ x: leftX, y: 8, z: bridgeZ - 1 }, BlockType.Air)
      engine.queueTerrainChange({ x: rightX, y: 8, z: bridgeZ + 1 }, BlockType.Air)
    })
  }

  return {
    name: 'Bridge Collapse',
    worldSize: 32,
    seed: 8888,
    totalTicks: 300,
    setup: (engine) => {
      const grid = engine.grid
      const size = 32

      // Build flat ground
      for (let x = 0; x < size; x++) {
        for (let z = 0; z < size; z++) {
          grid.setBlock({ x, y: 0, z }, BlockType.Solid)
        }
      }

      // Build two platforms at y=7 (solid pillars below)
      for (let x = 4; x < 12; x++) {
        for (let z = 14; z < 19; z++) {
          for (let y = 1; y <= 7; y++) {
            grid.setBlock({ x, y, z }, BlockType.Solid)
          }
        }
      }
      for (let x = 20; x < 28; x++) {
        for (let z = 14; z < 19; z++) {
          for (let y = 1; y <= 7; y++) {
            grid.setBlock({ x, y, z }, BlockType.Solid)
          }
        }
      }

      // Build bridge at y=8 connecting the platforms
      for (let x = 9; x < 23; x++) {
        grid.setBlock({ x, y: 8, z: bridgeZ }, BlockType.Solid)
        grid.setBlock({ x, y: 8, z: bridgeZ - 1 }, BlockType.Solid)
        grid.setBlock({ x, y: 8, z: bridgeZ + 1 }, BlockType.Solid)
      }

      // Ground ramps: stairs from ground level up to platforms
      for (let i = 0; i < 7; i++) {
        grid.setBlock({ x: 4, y: i + 1, z: 13 - i }, BlockType.Stair)
        grid.setBlock({ x: 27, y: i + 1, z: 13 - i }, BlockType.Stair)
      }

      // Place 4 agents on the left platform
      const spawnPositions = [
        { x: 6, y: 8, z: 16 },
        { x: 7, y: 8, z: 16 },
        { x: 8, y: 8, z: 16 },
        { x: 9, y: 8, z: 16 },
      ]

      const destPositions = [
        { x: 24, y: 8, z: 16 },
        { x: 25, y: 8, z: 16 },
        { x: 26, y: 8, z: 16 },
        { x: 23, y: 8, z: 16 },
      ]

      for (let i = 0; i < 4; i++) {
        if (isWalkable(grid, spawnPositions[i], 2)) {
          const agent = createAgent(spawnPositions[i])
          engine.agentManager.addAgent(agent)
          engine.agentManager.assignDestination(agent, destPositions[i])
        }
      }
    },
    tickScript,
    validate: (results) => {
      return results.finalMetrics.algorithmErrors === 0
    },
  }
}
