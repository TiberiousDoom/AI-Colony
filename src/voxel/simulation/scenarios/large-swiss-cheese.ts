import type { ScenarioDefinition } from '../scenario-runner.ts'
import { BlockType } from '../../world/block-types.ts'
import { createAgent } from '../../agents/agent.ts'
import { isWalkable } from '../../pathfinding/movement-rules.ts'

/**
 * Large Swiss Cheese: 160×160 version of Swiss Cheese.
 * Flat terrain with random solid pillars at ~30% coverage.
 * Every 3 ticks, one random pillar block is removed.
 * Every 5 ticks, one random solid block is added on the ground.
 * 25 agents with random destinations, reassigned on arrival.
 * 2000 ticks total.
 */
export function createLargeSwissCheeseScenario(): ScenarioDefinition {
  const tickScript = new Map<number, (engine: Parameters<ScenarioDefinition['setup']>[0]) => void>()

  const size = 160

  function lcg(seed: number): () => number {
    let s = seed
    return () => {
      s = (s * 1664525 + 1013904223) & 0x7fffffff
      return s
    }
  }

  const rng = lcg(5555)
  const pillarPositions: Array<{ x: number; z: number }> = []

  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      if (rng() % 100 < 30) {
        pillarPositions.push({ x, z })
      }
    }
  }

  const removalOrder: number[] = []
  for (let i = 0; i < Math.ceil(2000 / 3); i++) {
    removalOrder.push(rng() % pillarPositions.length)
  }

  const addPositions: Array<{ x: number; z: number }> = []
  for (let i = 0; i < Math.ceil(2000 / 5); i++) {
    addPositions.push({ x: rng() % size, z: rng() % size })
  }

  // Pillar removal every 3 ticks
  let removalIdx = 0
  for (let t = 3; t <= 2000; t += 3) {
    const idx = removalOrder[removalIdx++]
    tickScript.set(t, (engine) => {
      const pillar = pillarPositions[idx]
      if (pillar) {
        const removeY = 1 + (engine.tick % 3)
        engine.queueTerrainChange({ x: pillar.x, y: removeY, z: pillar.z }, BlockType.Air)
      }
    })
  }

  // Block addition every 5 ticks
  let addIdx = 0
  for (let t = 5; t <= 2000; t += 5) {
    const pos = addPositions[addIdx++]
    const existing = tickScript.get(t)
    if (existing) {
      const prev = existing
      tickScript.set(t, (engine) => {
        prev(engine)
        engine.queueTerrainChange({ x: pos.x, y: 1, z: pos.z }, BlockType.Solid)
      })
    } else {
      tickScript.set(t, (engine) => {
        engine.queueTerrainChange({ x: pos.x, y: 1, z: pos.z }, BlockType.Solid)
      })
    }
  }

  // Reassign idle agents every 10 ticks
  for (let t = 10; t <= 2000; t += 10) {
    const existing = tickScript.get(t)
    const reassignFn = (engine: Parameters<ScenarioDefinition['setup']>[0]) => {
      const agents = engine.agentManager.getAgents()
      for (const agent of agents) {
        if (agent.state === 'Idle') {
          const dest = engine.findRandomWalkablePosition()
          if (dest) {
            engine.agentManager.assignDestination(agent, dest)
          }
        }
      }
    }
    if (existing) {
      const prev = existing
      tickScript.set(t, (engine) => {
        prev(engine)
        reassignFn(engine)
      })
    } else {
      tickScript.set(t, reassignFn)
    }
  }

  // 25 agent spawns spread across the 160×160 map
  const agentSpawns = [
    { x: 5, y: 1, z: 5 },     { x: 155, y: 1, z: 5 },
    { x: 5, y: 1, z: 155 },   { x: 155, y: 1, z: 155 },
    { x: 80, y: 1, z: 5 },    { x: 80, y: 1, z: 155 },
    { x: 5, y: 1, z: 80 },    { x: 155, y: 1, z: 80 },
    { x: 40, y: 1, z: 40 },   { x: 120, y: 1, z: 120 },
    { x: 40, y: 1, z: 120 },  { x: 120, y: 1, z: 40 },
    { x: 80, y: 1, z: 80 },   { x: 20, y: 1, z: 60 },
    { x: 140, y: 1, z: 100 }, { x: 60, y: 1, z: 20 },
    { x: 100, y: 1, z: 140 }, { x: 30, y: 1, z: 130 },
    { x: 130, y: 1, z: 30 },  { x: 50, y: 1, z: 110 },
    { x: 110, y: 1, z: 50 },  { x: 70, y: 1, z: 90 },
    { x: 90, y: 1, z: 70 },   { x: 10, y: 1, z: 150 },
    { x: 150, y: 1, z: 10 },
  ]

  const agentDests = [
    { x: 155, y: 1, z: 155 }, { x: 5, y: 1, z: 155 },
    { x: 155, y: 1, z: 5 },   { x: 5, y: 1, z: 5 },
    { x: 80, y: 1, z: 155 },  { x: 80, y: 1, z: 5 },
    { x: 155, y: 1, z: 80 },  { x: 5, y: 1, z: 80 },
    { x: 120, y: 1, z: 120 }, { x: 40, y: 1, z: 40 },
    { x: 120, y: 1, z: 40 },  { x: 40, y: 1, z: 120 },
    { x: 80, y: 1, z: 5 },    { x: 140, y: 1, z: 100 },
    { x: 20, y: 1, z: 60 },   { x: 100, y: 1, z: 140 },
    { x: 60, y: 1, z: 20 },   { x: 130, y: 1, z: 30 },
    { x: 30, y: 1, z: 130 },  { x: 110, y: 1, z: 50 },
    { x: 50, y: 1, z: 110 },  { x: 90, y: 1, z: 70 },
    { x: 70, y: 1, z: 90 },   { x: 150, y: 1, z: 10 },
    { x: 10, y: 1, z: 150 },
  ]

  return {
    name: 'Large Swiss Cheese',
    worldSize: size,
    seed: 5555,
    totalTicks: 2000,
    setup: (engine) => {
      const grid = engine.grid

      // Build flat ground
      for (let x = 0; x < size; x++) {
        for (let z = 0; z < size; z++) {
          grid.setBlock({ x, y: 0, z }, BlockType.Solid)
        }
      }

      // Build pillars
      for (const pillar of pillarPositions) {
        for (let y = 1; y <= 3; y++) {
          grid.setBlock({ x: pillar.x, y, z: pillar.z }, BlockType.Solid)
        }
      }

      // Clear pillar blocks at agent positions
      for (const spawn of agentSpawns) {
        for (let y = 1; y <= 3; y++) {
          grid.setBlock({ x: spawn.x, y, z: spawn.z }, BlockType.Air)
        }
      }
      for (const dest of agentDests) {
        for (let y = 1; y <= 3; y++) {
          grid.setBlock({ x: dest.x, y, z: dest.z }, BlockType.Air)
        }
      }

      // Spawn 25 agents
      for (let i = 0; i < 25; i++) {
        if (isWalkable(grid, agentSpawns[i], 2)) {
          const agent = createAgent(agentSpawns[i])
          engine.agentManager.addAgent(agent)
          engine.agentManager.assignDestination(agent, agentDests[i])
        }
      }
    },
    tickScript,
    validate: (results) => {
      return results.finalMetrics.algorithmErrors === 0
    },
  }
}
