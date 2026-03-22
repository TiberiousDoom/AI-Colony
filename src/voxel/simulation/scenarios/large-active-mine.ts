import type { ScenarioDefinition } from '../scenario-runner.ts'
import { BlockType } from '../../world/block-types.ts'
import { createAgent } from '../../agents/agent.ts'
import { isWalkable } from '../../pathfinding/movement-rules.ts'

/**
 * Large Active Mine: 160×160 version of Active Mine.
 * Underground tunnel network with miners and transit agents.
 * Main corridor at y=3 from x=10 to x=140, z=70..80 (11 wide).
 * 8 branch tunnels at x=25,40,55,70,85,100,115,130.
 * 10 transit agents navigating corridors.
 * 1200 ticks total.
 */
export function createLargeActiveMineScenario(): ScenarioDefinition {
  const tickScript = new Map<number, (engine: Parameters<ScenarioDefinition['setup']>[0]) => void>()

  // Mining targets: branches being extended
  const mineTargets = [
    // Branch at x=25
    { x: 25, y: 3, z: 55 }, { x: 25, y: 3, z: 54 }, { x: 25, y: 3, z: 53 },
    // Branch at x=55
    { x: 55, y: 3, z: 95 }, { x: 55, y: 3, z: 96 }, { x: 55, y: 3, z: 97 },
    // Branch at x=85
    { x: 85, y: 3, z: 55 }, { x: 85, y: 3, z: 54 }, { x: 85, y: 3, z: 53 },
    // Branch at x=115
    { x: 115, y: 3, z: 95 }, { x: 115, y: 3, z: 96 }, { x: 115, y: 3, z: 97 },
    // Branch at x=40
    { x: 40, y: 3, z: 55 }, { x: 40, y: 3, z: 54 },
    // Branch at x=100
    { x: 100, y: 3, z: 95 }, { x: 100, y: 3, z: 96 },
  ]

  for (let i = 0; i < mineTargets.length; i++) {
    const tick = 16 + i * 8
    const target = mineTargets[i]
    tickScript.set(tick, (engine) => {
      engine.queueTerrainChange(target, BlockType.Air)
      engine.queueTerrainChange({ ...target, y: target.y + 1 }, BlockType.Air)
    })
  }

  return {
    name: 'Large Active Mine',
    worldSize: 160,
    seed: 5555,
    totalTicks: 1200,
    setup: (engine) => {
      const grid = engine.grid
      const size = 160

      // Solid ground
      for (let x = 0; x < size; x++) {
        for (let z = 0; z < size; z++) {
          grid.setBlock({ x, y: 0, z }, BlockType.Solid)
        }
      }

      // Underground solid mass (y=1 to y=6)
      for (let x = 0; x < size; x++) {
        for (let z = 0; z < size; z++) {
          for (let y = 1; y <= 6; y++) {
            grid.setBlock({ x, y, z }, BlockType.Solid)
          }
        }
      }

      // Carve main corridor at y=3..4, z=70..80, x=10..140
      for (let x = 10; x <= 140; x++) {
        for (let z = 70; z <= 80; z++) {
          grid.setBlock({ x, y: 3, z }, BlockType.Air)
          grid.setBlock({ x, y: 4, z }, BlockType.Air)
        }
      }

      // Carve branch tunnels
      const branches = [25, 40, 55, 70, 85, 100, 115, 130]
      for (const bx of branches) {
        // Branch going z- (from z=70 down to z=56)
        for (let z = 56; z < 70; z++) {
          grid.setBlock({ x: bx, y: 3, z }, BlockType.Air)
          grid.setBlock({ x: bx, y: 4, z }, BlockType.Air)
        }
        // Branch going z+ (from z=80 up to z=94)
        for (let z = 81; z <= 94; z++) {
          grid.setBlock({ x: bx, y: 3, z }, BlockType.Air)
          grid.setBlock({ x: bx, y: 4, z }, BlockType.Air)
        }
      }

      // Place 10 transit agents
      const transitPositions = [
        { x: 15, y: 3, z: 75 }, { x: 25, y: 3, z: 75 },
        { x: 35, y: 3, z: 75 }, { x: 45, y: 3, z: 75 },
        { x: 55, y: 3, z: 75 }, { x: 65, y: 3, z: 75 },
        { x: 75, y: 3, z: 75 }, { x: 85, y: 3, z: 75 },
        { x: 95, y: 3, z: 75 }, { x: 105, y: 3, z: 75 },
      ]
      const transitDests = [
        { x: 135, y: 3, z: 75 }, { x: 125, y: 3, z: 75 },
        { x: 100, y: 3, z: 56 }, { x: 70, y: 3, z: 94 },
        { x: 130, y: 3, z: 56 }, { x: 40, y: 3, z: 94 },
        { x: 115, y: 3, z: 94 }, { x: 25, y: 3, z: 56 },
        { x: 55, y: 3, z: 56 },  { x: 85, y: 3, z: 94 },
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
      return results.finalMetrics.algorithmErrors === 0
    },
  }
}
