import type { ScenarioDefinition } from '../scenario-runner.ts'
import { BlockType } from '../../world/block-types.ts'
import { createAgent } from '../../agents/agent.ts'
import { isWalkable } from '../../pathfinding/movement-rules.ts'

/**
 * Swiss Cheese: Flat terrain with random solid pillars at ~30% coverage.
 * Every 3 ticks, one random pillar block is removed.
 * Every 5 ticks, one random solid block is added on the ground.
 * 10 agents with random destinations, reassigned on arrival.
 * 1000 ticks total.
 */
export function createSwissCheeseScenario(): ScenarioDefinition {
  const tickScript = new Map<number, (engine: Parameters<ScenarioDefinition['setup']>[0]) => void>()

  const size = 32

  // Deterministic pillar positions based on seed-derived pattern (~30% of 32x32 = ~307 pillars)
  // Use a simple LCG seeded with 5555 to pick pillar positions at setup time
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

  // Pre-compute removal and addition sequences using the same LCG
  // Removal: every 3 ticks pick a pillar to remove
  // Addition: every 5 ticks pick a ground position to add a block
  const removalOrder: number[] = []
  for (let i = 0; i < Math.ceil(1000 / 3); i++) {
    removalOrder.push(rng() % pillarPositions.length)
  }

  const addPositions: Array<{ x: number; z: number }> = []
  for (let i = 0; i < Math.ceil(1000 / 5); i++) {
    addPositions.push({ x: rng() % size, z: rng() % size })
  }

  // Set up tick scripts for pillar removal (every 3 ticks)
  let removalIdx = 0
  for (let t = 3; t <= 1000; t += 3) {
    const idx = removalOrder[removalIdx++]
    tickScript.set(t, (engine) => {
      const pillar = pillarPositions[idx]
      if (pillar) {
        // Remove a random y-level of the pillar (pick y=1 for simplicity)
        const removeY = 1 + (engine.tick % 3) // varies between y=1,2,3
        engine.queueTerrainChange({ x: pillar.x, y: removeY, z: pillar.z }, BlockType.Air)
      }
    })
  }

  // Overlay addition tick scripts (every 5 ticks) onto existing entries
  let addIdx = 0
  for (let t = 5; t <= 1000; t += 5) {
    const pos = addPositions[addIdx++]
    const existing = tickScript.get(t)
    if (existing) {
      // Wrap existing script to also run addition
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
  for (let t = 10; t <= 1000; t += 10) {
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

  // Deterministic agent spawn positions (spread across the map, avoiding pillar-heavy areas)
  const agentSpawns = [
    { x: 1, y: 1, z: 1 },
    { x: 30, y: 1, z: 1 },
    { x: 1, y: 1, z: 30 },
    { x: 30, y: 1, z: 30 },
    { x: 15, y: 1, z: 1 },
    { x: 15, y: 1, z: 30 },
    { x: 1, y: 1, z: 15 },
    { x: 30, y: 1, z: 15 },
    { x: 8, y: 1, z: 8 },
    { x: 24, y: 1, z: 24 },
  ]

  const agentDests = [
    { x: 30, y: 1, z: 30 },
    { x: 1, y: 1, z: 30 },
    { x: 30, y: 1, z: 1 },
    { x: 1, y: 1, z: 1 },
    { x: 15, y: 1, z: 30 },
    { x: 15, y: 1, z: 1 },
    { x: 30, y: 1, z: 15 },
    { x: 1, y: 1, z: 15 },
    { x: 24, y: 1, z: 24 },
    { x: 8, y: 1, z: 8 },
  ]

  return {
    name: 'Swiss Cheese',
    worldSize: size,
    seed: 5555,
    totalTicks: 1000,
    setup: (engine) => {
      const grid = engine.grid

      // Build flat ground
      for (let x = 0; x < size; x++) {
        for (let z = 0; z < size; z++) {
          grid.setBlock({ x, y: 0, z }, BlockType.Solid)
        }
      }

      // Build pillars (y=1..3) at pre-computed positions
      for (const pillar of pillarPositions) {
        for (let y = 1; y <= 3; y++) {
          grid.setBlock({ x: pillar.x, y, z: pillar.z }, BlockType.Solid)
        }
      }

      // Clear pillar blocks at agent spawn positions to ensure walkability
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

      // Spawn 10 agents
      for (let i = 0; i < 10; i++) {
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
