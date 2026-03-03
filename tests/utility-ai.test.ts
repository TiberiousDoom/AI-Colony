import { describe, it, expect } from 'vitest'
import { createRNG } from '../src/utils/seed.ts'
import { UtilityAI } from '../src/simulation/ai/utility-ai.ts'
import { createVillager, getNeed, NeedType, createInitialStockpile } from '../src/simulation/villager.ts'
import { World } from '../src/simulation/world.ts'
import type { AIWorldView } from '../src/simulation/ai/ai-interface.ts'

function makeWorldView(overrides?: Partial<AIWorldView>): AIWorldView {
  const world = new World({ width: 64, height: 64, seed: 42 })
  return {
    world,
    stockpile: createInitialStockpile(),
    villagers: [],
    tick: 0,
    timeOfDay: 'day' as const,
    campfirePosition: world.campfirePosition,
    season: 'summer',
    structures: [],
    activeEvents: [],
    villageId: 'test',
    ...overrides,
  }
}

describe('UtilityAI', () => {
  const ai = new UtilityAI()

  it('has a name', () => {
    expect(ai.name).toBe('Utility AI')
  })

  it('returns a valid action', () => {
    const rng = createRNG(42)
    const v = createVillager('t', 'T', 32, 32)
    const wv = makeWorldView()
    const decision = ai.decide(v, wv, rng)

    expect(decision.action).toBeTruthy()
    expect(decision.reason).toBeTruthy()
  })

  it('prioritizes eating when very hungry', () => {
    const rng = createRNG(42)
    const v = createVillager('t', 'T', 32, 32) // at campfire
    getNeed(v, NeedType.Hunger).current = 5
    getNeed(v, NeedType.Energy).current = 80
    const wv = makeWorldView({ stockpile: { food: 50, wood: 30, stone: 10 } })

    const decision = ai.decide(v, wv, rng)
    expect(decision.action).toBe('eat')
  })

  it('prioritizes rest when energy is critical', () => {
    const rng = createRNG(42)
    const v = createVillager('t', 'T', 32, 32)
    getNeed(v, NeedType.Hunger).current = 80
    getNeed(v, NeedType.Energy).current = 5

    const decision = ai.decide(v, makeWorldView(), rng)
    expect(decision.action).toBe('rest')
  })

  it('provides target position for resource actions', () => {
    const rng = createRNG(42)
    const v = createVillager('t', 'T', 32, 32)
    getNeed(v, NeedType.Hunger).current = 10
    getNeed(v, NeedType.Energy).current = 80

    const decision = ai.decide(v, makeWorldView(), rng)
    // Should want food (eat or forage)
    if (decision.action === 'forage' || decision.action === 'fish') {
      expect(decision.targetPosition).toBeDefined()
    }
  })

  it('is deterministic with same seed', () => {
    const v = createVillager('t', 'T', 32, 32)
    getNeed(v, NeedType.Hunger).current = 40
    getNeed(v, NeedType.Energy).current = 40
    const wv = makeWorldView()

    const d1 = ai.decide(v, wv, createRNG(123))
    // Reset villager needs (decide doesn't mutate them, but to be safe)
    getNeed(v, NeedType.Hunger).current = 40
    getNeed(v, NeedType.Energy).current = 40
    const d2 = ai.decide(v, wv, createRNG(123))

    expect(d1.action).toBe(d2.action)
    expect(d1.reason).toBe(d2.reason)
  })

  it('prioritizes hauling when carrying resources', () => {
    const rng = createRNG(42)
    const v = createVillager('t', 'T', 10, 10) // away from campfire
    v.carrying = { type: 'wood', amount: 10 }
    getNeed(v, NeedType.Hunger).current = 60
    getNeed(v, NeedType.Energy).current = 60

    const decision = ai.decide(v, makeWorldView(), rng)
    expect(decision.action).toBe('haul')
    expect(decision.targetPosition).toBeDefined()
  })
})
