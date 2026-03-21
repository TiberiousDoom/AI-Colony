import type { ScenarioDefinition } from '../scenario-runner.ts'
import { BlockType } from '../../world/block-types.ts'
import { createAgent } from '../../agents/agent.ts'
import { isWalkable } from '../../pathfinding/movement-rules.ts'

/**
 * Large Free Fall: 160×160 version of Free Fall.
 * An 80×80 platform at y=8 above a full 160×160 ground floor at y=0.
 * Starting at tick 50, 5×5 sections of platform removed every 15 ticks,
 * expanding outward from center (80,8,80).
 * 16 agents on the platform.
 * 800 ticks total.
 */
export function createLargeFreeFallScenario(): ScenarioDefinition {
  const tickScript = new Map<number, (engine: Parameters<ScenarioDefinition['setup']>[0]) => void>()

  const centerX = 80
  const centerZ = 80
  const platformY = 8
  const platMin = 40
  const platMax = 119

  // Removal centers in expanding spiral pattern
  const removalCenters: Array<{ x: number; z: number }> = []

  // Ring 0
  removalCenters.push({ x: centerX, z: centerZ })
  // Ring 1 (offset 8)
  const ring1 = 8
  removalCenters.push({ x: centerX + ring1, z: centerZ })
  removalCenters.push({ x: centerX - ring1, z: centerZ })
  removalCenters.push({ x: centerX, z: centerZ + ring1 })
  removalCenters.push({ x: centerX, z: centerZ - ring1 })
  removalCenters.push({ x: centerX + ring1, z: centerZ + ring1 })
  removalCenters.push({ x: centerX - ring1, z: centerZ - ring1 })
  removalCenters.push({ x: centerX + ring1, z: centerZ - ring1 })
  removalCenters.push({ x: centerX - ring1, z: centerZ + ring1 })
  // Ring 2 (offset 16)
  const ring2 = 16
  removalCenters.push({ x: centerX + ring2, z: centerZ })
  removalCenters.push({ x: centerX - ring2, z: centerZ })
  removalCenters.push({ x: centerX, z: centerZ + ring2 })
  removalCenters.push({ x: centerX, z: centerZ - ring2 })
  removalCenters.push({ x: centerX + ring2, z: centerZ + ring2 })
  removalCenters.push({ x: centerX - ring2, z: centerZ - ring2 })
  removalCenters.push({ x: centerX + ring2, z: centerZ - ring2 })
  removalCenters.push({ x: centerX - ring2, z: centerZ + ring2 })
  // Ring 3 (offset 24)
  const ring3 = 24
  removalCenters.push({ x: centerX + ring3, z: centerZ })
  removalCenters.push({ x: centerX - ring3, z: centerZ })
  removalCenters.push({ x: centerX, z: centerZ + ring3 })
  removalCenters.push({ x: centerX, z: centerZ - ring3 })

  // Schedule removals
  for (let i = 0; i < removalCenters.length; i++) {
    const t = 50 + i * 15
    if (t > 800) break

    const rc = removalCenters[i]
    tickScript.set(t, (engine) => {
      // Remove a 5×5 patch at y=8
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          const rx = rc.x + dx
          const rz = rc.z + dz
          if (rx >= platMin && rx <= platMax && rz >= platMin && rz <= platMax) {
            engine.queueTerrainChange({ x: rx, y: platformY, z: rz }, BlockType.Air)
          }
        }
      }
    })
  }

  // 16 agents on the platform edges
  const spawns = [
    { x: 45, y: 9, z: 45 },  { x: 115, y: 9, z: 45 },
    { x: 45, y: 9, z: 115 }, { x: 115, y: 9, z: 115 },
    { x: 45, y: 9, z: 80 },  { x: 115, y: 9, z: 80 },
    { x: 80, y: 9, z: 45 },  { x: 80, y: 9, z: 115 },
    { x: 55, y: 9, z: 55 },  { x: 105, y: 9, z: 55 },
    { x: 55, y: 9, z: 105 }, { x: 105, y: 9, z: 105 },
    { x: 65, y: 9, z: 45 },  { x: 95, y: 9, z: 45 },
    { x: 65, y: 9, z: 115 }, { x: 95, y: 9, z: 115 },
  ]

  const dests = [
    { x: 115, y: 9, z: 115 }, { x: 45, y: 9, z: 115 },
    { x: 115, y: 9, z: 45 },  { x: 45, y: 9, z: 45 },
    { x: 115, y: 9, z: 80 },  { x: 45, y: 9, z: 80 },
    { x: 80, y: 9, z: 115 },  { x: 80, y: 9, z: 45 },
    { x: 105, y: 9, z: 105 }, { x: 55, y: 9, z: 105 },
    { x: 105, y: 9, z: 55 },  { x: 55, y: 9, z: 55 },
    { x: 95, y: 9, z: 115 },  { x: 65, y: 9, z: 115 },
    { x: 95, y: 9, z: 45 },   { x: 65, y: 9, z: 45 },
  ]

  return {
    name: 'Large Free Fall',
    worldSize: 160,
    seed: 7777,
    totalTicks: 800,
    setup: (engine) => {
      const grid = engine.grid
      const size = 160

      // Full ground floor
      for (let x = 0; x < size; x++) {
        for (let z = 0; z < size; z++) {
          grid.setBlock({ x, y: 0, z }, BlockType.Solid)
        }
      }

      // 80×80 platform at y=8 (x=40..119, z=40..119)
      for (let x = platMin; x <= platMax; x++) {
        for (let z = platMin; z <= platMax; z++) {
          grid.setBlock({ x, y: platformY, z }, BlockType.Solid)
        }
      }

      // Spawn 16 agents
      for (let i = 0; i < 16; i++) {
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
