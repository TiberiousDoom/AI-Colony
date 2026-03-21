import type { ScenarioDefinition } from '../scenario-runner.ts'
import { BlockType } from '../../world/block-types.ts'
import { createAgent } from '../../agents/agent.ts'
import { isWalkable } from '../../pathfinding/movement-rules.ts'

/**
 * Stairwell: A 4-floor building with ladder shafts and stairways.
 * Each floor is a 12x12 platform at y=0, y=4, y=8, y=12.
 * Ladder shaft at (2, _, 2) connects all floors.
 * Stairs (2-wide) at (10, _, 10).
 * 8 agents spawned on various floors, destinations on different floors.
 * 600 ticks total.
 */
export function createStairwellScenario(): ScenarioDefinition {
  const tickScript = new Map<number, (engine: Parameters<ScenarioDefinition['setup']>[0]) => void>()

  const floorYs = [0, 4, 8, 12]

  // Agent spawn floor assignments (deterministic, based on scenario design)
  // 8 agents: each placed on a specific floor with destination on a different floor
  const agentConfigs = [
    { spawnFloor: 0, destFloor: 3, xOff: 4, zOff: 4 },
    { spawnFloor: 0, destFloor: 2, xOff: 5, zOff: 5 },
    { spawnFloor: 1, destFloor: 3, xOff: 6, zOff: 4 },
    { spawnFloor: 1, destFloor: 0, xOff: 7, zOff: 5 },
    { spawnFloor: 2, destFloor: 0, xOff: 4, zOff: 6 },
    { spawnFloor: 2, destFloor: 1, xOff: 5, zOff: 7 },
    { spawnFloor: 3, destFloor: 1, xOff: 6, zOff: 6 },
    { spawnFloor: 3, destFloor: 0, xOff: 7, zOff: 7 },
  ]

  return {
    name: 'Stairwell',
    worldSize: 32,
    seed: 3333,
    totalTicks: 600,
    setup: (engine) => {
      const grid = engine.grid

      // Build 4 floors: 12x12 platforms at y=0, 4, 8, 12
      for (const floorY of floorYs) {
        for (let x = 0; x < 12; x++) {
          for (let z = 0; z < 12; z++) {
            grid.setBlock({ x, y: floorY, z }, BlockType.Solid)
          }
        }
      }

      // Build ladder shaft at (2, _, 2) connecting all floors
      // Ladders go from y=1 to y=12 (filling gaps between floors)
      for (let y = 1; y <= 12; y++) {
        // Skip the floor-level blocks (those are already solid)
        if (floorYs.includes(y)) continue
        grid.setBlock({ x: 2, y, z: 2 }, BlockType.Ladder)
      }
      // Clear headroom above ladders at each floor level (y+1, y+2 must be air)
      // The floor blocks at (2, floorY, 2) need to be open for ladder access
      // Remove floor blocks at the ladder column for floors 1-3 so agents can climb through
      for (let fi = 1; fi < floorYs.length; fi++) {
        grid.setBlock({ x: 2, y: floorYs[fi], z: 2 }, BlockType.Ladder)
      }

      // Build 2-wide stairs at (10, _, 10) and (11, _, 10) connecting floors
      for (let fi = 0; fi < floorYs.length - 1; fi++) {
        const baseY = floorYs[fi]
        const nextY = floorYs[fi + 1]
        // 4 stair steps to climb 4 blocks (one step per y level)
        for (let step = 0; step < (nextY - baseY); step++) {
          const stairY = baseY + step + 1
          const stairZ = 10 - step // stairs extend in -z direction
          grid.setBlock({ x: 10, y: stairY, z: stairZ }, BlockType.Stair)
          grid.setBlock({ x: 11, y: stairY, z: stairZ }, BlockType.Stair)
        }
        // Remove floor block at stair entry on upper floor so agents can step through
        if (fi < floorYs.length - 1) {
          const topStairZ = 10 - (nextY - baseY) + 1
          grid.setBlock({ x: 10, y: nextY, z: topStairZ }, BlockType.Stair)
          grid.setBlock({ x: 11, y: nextY, z: topStairZ }, BlockType.Stair)
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
      return results.finalMetrics.algorithmErrors === 0 &&
        results.finalMetrics.stuckAgents === 0
    },
  }
}
