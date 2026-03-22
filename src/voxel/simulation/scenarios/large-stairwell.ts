import type { ScenarioDefinition } from '../scenario-runner.ts'
import { BlockType } from '../../world/block-types.ts'
import { createAgent } from '../../agents/agent.ts'
import { isWalkable } from '../../pathfinding/movement-rules.ts'

/**
 * Large Stairwell: 160×160 version of Stairwell.
 * 4-floor building with 60×60 platforms, ladder shafts and stairways.
 * 16 agents on various floors with cross-floor destinations.
 * 1200 ticks total.
 */
export function createLargeStairwellScenario(): ScenarioDefinition {
  const tickScript = new Map<number, (engine: Parameters<ScenarioDefinition['setup']>[0]) => void>()

  const floorYs = [0, 4, 8, 12]

  const agentConfigs = [
    { spawnFloor: 0, destFloor: 3, xOff: 20, zOff: 20 },
    { spawnFloor: 0, destFloor: 2, xOff: 25, zOff: 25 },
    { spawnFloor: 0, destFloor: 1, xOff: 30, zOff: 20 },
    { spawnFloor: 0, destFloor: 3, xOff: 35, zOff: 25 },
    { spawnFloor: 1, destFloor: 3, xOff: 30, zOff: 20 },
    { spawnFloor: 1, destFloor: 0, xOff: 35, zOff: 25 },
    { spawnFloor: 1, destFloor: 2, xOff: 20, zOff: 30 },
    { spawnFloor: 1, destFloor: 3, xOff: 25, zOff: 35 },
    { spawnFloor: 2, destFloor: 0, xOff: 20, zOff: 30 },
    { spawnFloor: 2, destFloor: 1, xOff: 25, zOff: 35 },
    { spawnFloor: 2, destFloor: 3, xOff: 30, zOff: 30 },
    { spawnFloor: 2, destFloor: 0, xOff: 35, zOff: 35 },
    { spawnFloor: 3, destFloor: 1, xOff: 30, zOff: 30 },
    { spawnFloor: 3, destFloor: 0, xOff: 35, zOff: 35 },
    { spawnFloor: 3, destFloor: 2, xOff: 40, zOff: 20 },
    { spawnFloor: 3, destFloor: 1, xOff: 45, zOff: 25 },
  ]

  return {
    name: 'Large Stairwell',
    worldSize: 160,
    seed: 3333,
    totalTicks: 1200,
    setup: (engine) => {
      const grid = engine.grid

      // Build 4 floors: 60×60 platforms at y=0, 4, 8, 12
      for (const floorY of floorYs) {
        for (let x = 0; x < 60; x++) {
          for (let z = 0; z < 60; z++) {
            grid.setBlock({ x, y: floorY, z }, BlockType.Solid)
          }
        }
      }

      // Ladder shaft at (10, _, 10)
      for (let y = 1; y <= 12; y++) {
        if (floorYs.includes(y)) {
          grid.setBlock({ x: 10, y, z: 10 }, BlockType.Ladder)
        } else {
          grid.setBlock({ x: 10, y, z: 10 }, BlockType.Ladder)
        }
      }
      // Open floor blocks at ladder column for floors 1-3
      for (let fi = 1; fi < floorYs.length; fi++) {
        grid.setBlock({ x: 10, y: floorYs[fi], z: 10 }, BlockType.Ladder)
      }

      // Stairs at (50, _, 50) connecting floors
      for (let fi = 0; fi < floorYs.length - 1; fi++) {
        const baseY = floorYs[fi]
        const nextY = floorYs[fi + 1]
        for (let step = 0; step < (nextY - baseY); step++) {
          const stairY = baseY + step + 1
          const stairZ = 50 - step
          grid.setBlock({ x: 50, y: stairY, z: stairZ }, BlockType.Stair)
          grid.setBlock({ x: 51, y: stairY, z: stairZ }, BlockType.Stair)
        }
        if (fi < floorYs.length - 1) {
          const topStairZ = 50 - (nextY - baseY) + 1
          grid.setBlock({ x: 50, y: nextY, z: topStairZ }, BlockType.Stair)
          grid.setBlock({ x: 51, y: nextY, z: topStairZ }, BlockType.Stair)
        }
      }

      // Spawn agents
      for (const cfg of agentConfigs) {
        const spawnY = floorYs[cfg.spawnFloor] + 1
        const destY = floorYs[cfg.destFloor] + 1
        const spawnPos = { x: cfg.xOff, y: spawnY, z: cfg.zOff }
        const destPos = { x: cfg.xOff, y: destY, z: cfg.zOff }

        if (isWalkable(grid, spawnPos, 2)) {
          const agent = createAgent(spawnPos)
          engine.agentManager.addAgent(agent)
          engine.agentManager.assignDestination(agent, destPos)
        }
      }
    },
    tickScript,
    validate: (results) => {
      return results.finalMetrics.algorithmErrors === 0
    },
  }
}
