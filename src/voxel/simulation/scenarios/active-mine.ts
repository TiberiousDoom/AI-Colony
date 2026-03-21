import type { ScenarioDefinition } from '../scenario-runner.ts'
import { BlockType } from '../../world/block-types.ts'
import { createAgent } from '../../agents/agent.ts'
import { isWalkable } from '../../pathfinding/movement-rules.ts'

/**
 * Active Mine: Underground tunnel network with miners and transit agents.
 * Tests predictive navigation via the intent broadcast system.
 *
 * Layout: Main corridor at y=3 from x=2 to x=28, z=14..16 (3 wide).
 * 4 branch tunnels perpendicular at x=8, x=14, x=20, x=26.
 * 3 mining agents at branch tunnel ends, 4 transit agents navigating corridors.
 * Miners remove wall blocks every 8 ticks.
 */
export function createActiveMineScenario(): ScenarioDefinition {
  const tickScript = new Map<number, (engine: Parameters<ScenarioDefinition['setup']>[0]) => void>()

  // Mining script: miners remove blocks from branch tunnel walls
  const mineTargets = [
    // Branch 1 extensions at x=8
    { x: 8, y: 3, z: 10 },
    { x: 8, y: 3, z: 9 },
    { x: 8, y: 3, z: 8 },
    // Branch 2 extensions at x=14
    { x: 14, y: 3, z: 20 },
    { x: 14, y: 3, z: 21 },
    { x: 14, y: 3, z: 22 },
    // Branch 3 extensions at x=20
    { x: 20, y: 3, z: 10 },
    { x: 20, y: 3, z: 9 },
    { x: 20, y: 3, z: 8 },
  ]

  for (let i = 0; i < mineTargets.length; i++) {
    const tick = 16 + i * 8 // mine one block every 8 ticks
    const target = mineTargets[i]
    tickScript.set(tick, (engine) => {
      // Remove the block (clear both y=3 and y=4 for agent clearance)
      engine.queueTerrainChange(target, BlockType.Air)
      engine.queueTerrainChange({ ...target, y: target.y + 1 }, BlockType.Air)
    })
  }

  return {
    name: 'Active Mine',
    worldSize: 32,
    seed: 5555,
    totalTicks: 600,
    setup: (engine) => {
      const grid = engine.grid
      const size = 32

      // Build solid ground
      for (let x = 0; x < size; x++) {
        for (let z = 0; z < size; z++) {
          grid.setBlock({ x, y: 0, z }, BlockType.Solid)
        }
      }

      // Build underground solid mass (y=1 to y=6)
      for (let x = 0; x < size; x++) {
        for (let z = 0; z < size; z++) {
          for (let y = 1; y <= 6; y++) {
            grid.setBlock({ x, y, z }, BlockType.Solid)
          }
        }
      }

      // Carve main corridor at y=3..4, z=14..16, x=2..28
      for (let x = 2; x <= 28; x++) {
        for (let z = 14; z <= 16; z++) {
          grid.setBlock({ x, y: 3, z }, BlockType.Air)
          grid.setBlock({ x, y: 4, z }, BlockType.Air)
        }
      }

      // Carve branch tunnels (perpendicular to main corridor)
      const branches = [8, 14, 20, 26]
      for (const bx of branches) {
        // Branch going z- (from z=14 down to z=11)
        for (let z = 11; z < 14; z++) {
          grid.setBlock({ x: bx, y: 3, z }, BlockType.Air)
          grid.setBlock({ x: bx, y: 4, z }, BlockType.Air)
        }
        // Branch going z+ (from z=16 up to z=19)
        for (let z = 17; z <= 19; z++) {
          grid.setBlock({ x: bx, y: 3, z }, BlockType.Air)
          grid.setBlock({ x: bx, y: 4, z }, BlockType.Air)
        }
      }

      // Place 4 transit agents in main corridor
      const transitPositions = [
        { x: 3, y: 3, z: 15 },
        { x: 5, y: 3, z: 15 },
        { x: 7, y: 3, z: 15 },
        { x: 9, y: 3, z: 15 },
      ]
      const transitDests = [
        { x: 27, y: 3, z: 15 },
        { x: 25, y: 3, z: 15 },
        { x: 20, y: 3, z: 11 },
        { x: 14, y: 3, z: 19 },
      ]

      for (let i = 0; i < transitPositions.length; i++) {
        const pos = transitPositions[i]
        if (isWalkable(grid, pos, 2)) {
          const agent = createAgent(pos)
          engine.agentManager.addAgent(agent)
          engine.agentManager.assignDestination(agent, transitDests[i])
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
