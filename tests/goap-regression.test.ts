/**
 * GOAP regression tests: determinism and plan behavior over long runs.
 */

import { describe, it, expect } from 'vitest'
import { createRNG } from '../src/utils/seed.ts'
import { createVillager, NeedType, getNeed } from '../src/simulation/villager.ts'
import { World } from '../src/simulation/world.ts'
import type { AIWorldView } from '../src/simulation/ai/ai-interface.ts'
import { GOAPAI } from '../src/simulation/ai/goap-ai.ts'

function createTestWorld(): World {
  return new World({ width: 60, height: 60, seed: 42 })
}

function createTestWorldView(world: World, overrides?: Partial<AIWorldView>): AIWorldView {
  return {
    world,
    stockpile: { food: 50, wood: 30, stone: 10 },
    villagers: [],
    tick: 0,
    timeOfDay: 'day',
    campfirePosition: world.campfirePosition,
    season: 'summer',
    structures: [],
    activeEvents: [],
    villageId: 'test',
    ...overrides,
  }
}

describe('GOAP Regression', () => {
  it('produces deterministic decisions over 1000 ticks', () => {
    const world = createTestWorld()
    const ai1 = new GOAPAI()
    const ai2 = new GOAPAI()

    const v1 = createVillager('v1', 'Test', world.campfirePosition.x, world.campfirePosition.y)
    const v2 = createVillager('v1', 'Test', world.campfirePosition.x, world.campfirePosition.y)

    for (let tick = 0; tick < 1000; tick++) {
      const wv1 = createTestWorldView(world, { villagers: [v1], tick })
      const wv2 = createTestWorldView(world, { villagers: [v2], tick })

      const d1 = ai1.decide(v1, wv1, createRNG(tick + 1))
      const d2 = ai2.decide(v2, wv2, createRNG(tick + 1))

      expect(d1.action).toBe(d2.action)
      expect(d1.reason).toBe(d2.reason)

      // Simulate need drain
      getNeed(v1, NeedType.Hunger).current = Math.max(0, getNeed(v1, NeedType.Hunger).current - 0.5)
      getNeed(v1, NeedType.Energy).current = Math.max(0, getNeed(v1, NeedType.Energy).current - 0.3)
      getNeed(v2, NeedType.Hunger).current = Math.max(0, getNeed(v2, NeedType.Hunger).current - 0.5)
      getNeed(v2, NeedType.Energy).current = Math.max(0, getNeed(v2, NeedType.Energy).current - 0.3)

      // Periodically reset needs to avoid death spiral
      if (tick % 50 === 0) {
        getNeed(v1, NeedType.Hunger).current = 75
        getNeed(v1, NeedType.Energy).current = 75
        getNeed(v2, NeedType.Hunger).current = 75
        getNeed(v2, NeedType.Energy).current = 75
      }
    }
  })

  it('GOAP AI survives varied conditions without crash', () => {
    const ai = new GOAPAI()
    const world = createTestWorld()
    const villager = createVillager('v1', 'Test', world.campfirePosition.x, world.campfirePosition.y)

    const scenarios = [
      { food: 0, wood: 0, stone: 0 },
      { food: 100, wood: 100, stone: 100 },
      { food: 0, wood: 50, stone: 50 },
    ]

    for (const stockpile of scenarios) {
      for (let tick = 0; tick < 100; tick++) {
        const wv = createTestWorldView(world, {
          villagers: [villager],
          stockpile,
          tick,
        })
        const decision = ai.decide(villager, wv, createRNG(tick))
        expect(decision.action).toBeTruthy()
      }
    }
  })
})
