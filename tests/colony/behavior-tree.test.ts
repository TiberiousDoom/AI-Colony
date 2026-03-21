import { describe, it, expect } from 'vitest'
import { Selector, Sequence, Condition, ActionNode, type BTContext } from '../../src/colony/simulation/ai/behavior-tree.ts'
import { BehaviorTreeAI } from '../../src/colony/simulation/ai/behavior-tree-ai.ts'
import { createRNG } from '../../src/shared/seed.ts'
import { createVillager, getNeed, NeedType, createInitialStockpile } from '../../src/colony/simulation/villager.ts'
import { World } from '../../src/colony/simulation/world.ts'
import type { AIWorldView } from '../../src/colony/simulation/ai/ai-interface.ts'

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
    monsters: [],
    villageId: 'test',
    ...overrides,
  }
}

describe('Behavior Tree Nodes', () => {
  it('Selector returns first successful child', () => {
    const ctx: BTContext = { worldView: makeWorldView(), rng: createRNG(42), decision: null }
    const selector = new Selector([
      new Condition(() => false),
      new Condition(() => true),
      new Condition(() => true), // Should not be reached
    ])
    expect(selector.tick(ctx)).toBe('success')
  })

  it('Selector returns failure if all children fail', () => {
    const ctx: BTContext = { worldView: makeWorldView(), rng: createRNG(42), decision: null }
    const selector = new Selector([
      new Condition(() => false),
      new Condition(() => false),
    ])
    expect(selector.tick(ctx)).toBe('failure')
  })

  it('Sequence runs all children, succeeds if all succeed', () => {
    const ctx: BTContext = { worldView: makeWorldView(), rng: createRNG(42), decision: null }
    const sequence = new Sequence([
      new Condition(() => true),
      new Condition(() => true),
    ])
    expect(sequence.tick(ctx)).toBe('success')
  })

  it('Sequence fails on first failure', () => {
    const ctx: BTContext = { worldView: makeWorldView(), rng: createRNG(42), decision: null }
    let reached = false
    const sequence = new Sequence([
      new Condition(() => true),
      new Condition(() => false),
      new ActionNode(() => { reached = true; return { action: 'idle', reason: 'test' } }),
    ])
    expect(sequence.tick(ctx)).toBe('failure')
    expect(reached).toBe(false) // Third child should not be reached
  })

  it('Condition node checks predicate correctly', () => {
    const ctx: BTContext = { worldView: makeWorldView(), rng: createRNG(42), decision: null }
    const cond = new Condition(() => true)
    expect(cond.tick(ctx)).toBe('success')
    const cond2 = new Condition(() => false)
    expect(cond2.tick(ctx)).toBe('failure')
  })

  it('ActionNode sets decision on context', () => {
    const ctx: BTContext = { worldView: makeWorldView(), rng: createRNG(42), decision: null }
    const action = new ActionNode(() => ({ action: 'forage', reason: 'test' }))
    action.tick(ctx)
    expect(ctx.decision).not.toBeNull()
    expect(ctx.decision!.action).toBe('forage')
  })
})

describe('BehaviorTreeAI', () => {
  const ai = new BehaviorTreeAI()

  it('has a name', () => {
    expect(ai.name).toBe('Behavior Tree')
  })

  it('returns a valid action', () => {
    const v = createVillager('t', 'T', 32, 32)
    const decision = ai.decide(v, makeWorldView(), createRNG(42))
    expect(decision.action).toBeTruthy()
    expect(decision.reason).toBeTruthy()
  })

  it('prioritizes health emergency (health < 20)', () => {
    const v = createVillager('t', 'T', 32, 32)
    getNeed(v, NeedType.Health).current = 10
    getNeed(v, NeedType.Hunger).current = 80
    getNeed(v, NeedType.Energy).current = 80
    const wv = makeWorldView({ stockpile: { food: 50, wood: 30, stone: 10 } })
    const decision = ai.decide(v, wv, createRNG(42))
    expect(['eat', 'rest']).toContain(decision.action)
    expect(decision.reason).toContain('health emergency')
  })

  it('prioritizes hunger when < 25', () => {
    const v = createVillager('t', 'T', 32, 32)
    getNeed(v, NeedType.Hunger).current = 15
    getNeed(v, NeedType.Energy).current = 80
    getNeed(v, NeedType.Health).current = 80
    const wv = makeWorldView({ stockpile: { food: 50, wood: 30, stone: 10 } })
    const decision = ai.decide(v, wv, createRNG(42))
    expect(decision.action).toBe('eat')
  })

  it('prioritizes energy when < 20', () => {
    const v = createVillager('t', 'T', 32, 32)
    getNeed(v, NeedType.Hunger).current = 80
    getNeed(v, NeedType.Energy).current = 10
    getNeed(v, NeedType.Health).current = 80
    const decision = ai.decide(v, makeWorldView(), createRNG(42))
    expect(decision.action).toBe('rest')
  })

  it('triggers forage when food stockpile < 30', () => {
    const v = createVillager('t', 'T', 32, 32)
    getNeed(v, NeedType.Hunger).current = 80
    getNeed(v, NeedType.Energy).current = 80
    getNeed(v, NeedType.Health).current = 80
    const wv = makeWorldView({ stockpile: { food: 10, wood: 30, stone: 10 } })
    const decision = ai.decide(v, wv, createRNG(42))
    expect(['forage', 'fish']).toContain(decision.action)
  })

  it('triggers chop when wood stockpile < 20', () => {
    const v = createVillager('t', 'T', 32, 32)
    getNeed(v, NeedType.Hunger).current = 80
    getNeed(v, NeedType.Energy).current = 80
    getNeed(v, NeedType.Health).current = 80
    const wv = makeWorldView({ stockpile: { food: 50, wood: 5, stone: 10 } })
    const decision = ai.decide(v, wv, createRNG(42))
    expect(decision.action).toBe('chop_wood')
  })

  it('hauls when carrying resources', () => {
    const v = createVillager('t', 'T', 10, 10)
    v.carrying = { type: 'wood', amount: 10 }
    getNeed(v, NeedType.Hunger).current = 80
    getNeed(v, NeedType.Energy).current = 80
    getNeed(v, NeedType.Health).current = 80
    const decision = ai.decide(v, makeWorldView(), createRNG(42))
    expect(decision.action).toBe('haul')
  })

  it('is deterministic with same seed', () => {
    const v = createVillager('t', 'T', 32, 32)
    getNeed(v, NeedType.Hunger).current = 50
    getNeed(v, NeedType.Energy).current = 50
    const wv = makeWorldView()

    const d1 = ai.decide(v, wv, createRNG(123))
    getNeed(v, NeedType.Hunger).current = 50
    getNeed(v, NeedType.Energy).current = 50
    const d2 = ai.decide(v, wv, createRNG(123))

    expect(d1.action).toBe(d2.action)
  })

  it('triggers warmth behavior in winter with low warmth', () => {
    const v = createVillager('t', 'T', 32, 32)
    getNeed(v, NeedType.Warmth).current = 15
    getNeed(v, NeedType.Hunger).current = 80
    getNeed(v, NeedType.Energy).current = 80
    getNeed(v, NeedType.Health).current = 80
    const wv = makeWorldView({ season: 'winter' })
    const decision = ai.decide(v, wv, createRNG(42))
    expect(decision.action).toBe('warm_up')
  })

  it('biases stockpiling thresholds in autumn', () => {
    const v = createVillager('t', 'T', 32, 32)
    getNeed(v, NeedType.Hunger).current = 80
    getNeed(v, NeedType.Energy).current = 80
    getNeed(v, NeedType.Health).current = 80
    // In autumn, food threshold is 50 instead of 30
    const wv = makeWorldView({
      season: 'autumn',
      stockpile: { food: 35, wood: 30, stone: 10 },
    })
    const decision = ai.decide(v, wv, createRNG(42))
    // Should want to forage because food (35) < autumn threshold (50)
    expect(['forage', 'fish']).toContain(decision.action)
  })
})
