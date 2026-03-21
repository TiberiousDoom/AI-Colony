import type { ScenarioDefinition } from '../scenario-runner.ts'
import { BlockType } from '../../world/block-types.ts'
import { createAgent } from '../../agents/agent.ts'
import { isWalkable } from '../../pathfinding/movement-rules.ts'

/**
 * Free Fall: A 16x16 platform at y=8 above a full 32x32 ground floor at y=0.
 * Starting at tick 50, a 3x3 section of platform is removed every 15 ticks,
 * expanding outward from center (16,8,16).
 * 8 agents on the platform with destinations on the platform.
 * 400 ticks total.
 */
export function createFreeFallScenario(): ScenarioDefinition {
  const tickScript = new Map<number, (engine: Parameters<ScenarioDefinition['setup']>[0]) => void>()

  // Pre-compute 3x3 removal patches expanding from center (16,8,16)
  // Each removal is a 3x3 area; we spiral outward from center
  const centerX = 16
  const centerZ = 16
  const platformY = 8

  // Generate removal centers in an expanding spiral pattern
  const removalCenters: Array<{ x: number; z: number }> = []

  // Start at center, then expand in rings
  // Ring 0: center itself
  removalCenters.push({ x: centerX, z: centerZ })
  // Ring 1: 3 blocks out in each cardinal + diagonal direction
  removalCenters.push({ x: centerX + 3, z: centerZ })
  removalCenters.push({ x: centerX - 3, z: centerZ })
  removalCenters.push({ x: centerX, z: centerZ + 3 })
  removalCenters.push({ x: centerX, z: centerZ - 3 })
  removalCenters.push({ x: centerX + 3, z: centerZ + 3 })
  removalCenters.push({ x: centerX - 3, z: centerZ - 3 })
  removalCenters.push({ x: centerX + 3, z: centerZ - 3 })
  removalCenters.push({ x: centerX - 3, z: centerZ + 3 })
  // Ring 2: 6 blocks out
  removalCenters.push({ x: centerX + 6, z: centerZ })
  removalCenters.push({ x: centerX - 6, z: centerZ })
  removalCenters.push({ x: centerX, z: centerZ + 6 })
  removalCenters.push({ x: centerX, z: centerZ - 6 })

  // Schedule removals: starting at tick 50, every 15 ticks
  for (let i = 0; i < removalCenters.length; i++) {
    const t = 50 + i * 15
    if (t > 400) break

    const rc = removalCenters[i]
    tickScript.set(t, (engine) => {
      // Remove a 3x3 patch of platform at y=8
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const rx = rc.x + dx
          const rz = rc.z + dz
          // Only remove if within platform bounds (x=8..23, z=8..23)
          if (rx >= 8 && rx <= 23 && rz >= 8 && rz <= 23) {
            engine.queueTerrainChange({ x: rx, y: platformY, z: rz }, BlockType.Air)
          }
        }
      }
    })
  }

  // Agent spawn positions on the platform (away from center to give them time)
  const spawns = [
    { x: 9, y: 9, z: 9 },
    { x: 22, y: 9, z: 9 },
    { x: 9, y: 9, z: 22 },
    { x: 22, y: 9, z: 22 },
    { x: 9, y: 9, z: 15 },
    { x: 22, y: 9, z: 15 },
    { x: 15, y: 9, z: 9 },
    { x: 15, y: 9, z: 22 },
  ]

  // Destinations on the platform (opposite corners / edges)
  const dests = [
    { x: 22, y: 9, z: 22 },
    { x: 9, y: 9, z: 22 },
    { x: 22, y: 9, z: 9 },
    { x: 9, y: 9, z: 9 },
    { x: 22, y: 9, z: 15 },
    { x: 9, y: 9, z: 15 },
    { x: 15, y: 9, z: 22 },
    { x: 15, y: 9, z: 9 },
  ]

  return {
    name: 'Free Fall',
    worldSize: 32,
    seed: 7777,
    totalTicks: 400,
    setup: (engine) => {
      const grid = engine.grid
      const size = 32

      // Build full ground floor at y=0
      for (let x = 0; x < size; x++) {
        for (let z = 0; z < size; z++) {
          grid.setBlock({ x, y: 0, z }, BlockType.Solid)
        }
      }

      // Build 16x16 platform at y=8 (x=8..23, z=8..23)
      for (let x = 8; x <= 23; x++) {
        for (let z = 8; z <= 23; z++) {
          grid.setBlock({ x, y: platformY, z }, BlockType.Solid)
        }
      }

      // Spawn 8 agents on the platform
      for (let i = 0; i < 8; i++) {
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
