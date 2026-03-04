import { describe, it, expect } from 'vitest'
import { createVillager, getNeed, NeedType, tickNeeds } from '../src/simulation/villager.ts'
import { WARM_UP_ACTION, REST_ACTION, DEFAULT_CTX, type TickContext } from '../src/simulation/actions.ts'
import { createRNG } from '../src/utils/seed.ts'
import { World } from '../src/simulation/world.ts'

describe('Warmth System', () => {
  it('warmth exists as a 4th need', () => {
    const v = createVillager('t', 'T', 0, 0)
    expect(v.needs.size).toBe(4)
    expect(getNeed(v, NeedType.Warmth).current).toBe(75)
  })

  it('warmth does not drain outside winter', () => {
    const v = createVillager('t', 'T', 0, 0)
    tickNeeds(v, 'summer')
    expect(getNeed(v, NeedType.Warmth).current).toBe(75)
  })

  it('warmth drains 3/tick in winter', () => {
    const v = createVillager('t', 'T', 0, 0)
    tickNeeds(v, 'winter')
    expect(getNeed(v, NeedType.Warmth).current).toBe(72)
  })

  it('applies health damage when warmth reaches 0', () => {
    const v = createVillager('t', 'T', 0, 0)
    getNeed(v, NeedType.Warmth).current = 2
    getNeed(v, NeedType.Hunger).current = 80 // Keep hunger high to avoid starvation confounding
    const healthBefore = getNeed(v, NeedType.Health).current
    tickNeeds(v, 'winter')
    expect(getNeed(v, NeedType.Warmth).current).toBe(0)
    expect(getNeed(v, NeedType.Health).current).toBeLessThan(healthBefore)
  })

  it('warm_up restores 25 warmth at campfire', () => {
    const v = createVillager('t', 'T', 32, 32)
    getNeed(v, NeedType.Warmth).current = 30
    WARM_UP_ACTION.complete(v, {} as World, { food: 0, wood: 0, stone: 0 }, createRNG(1), { x: 32, y: 32 }, DEFAULT_CTX)
    expect(getNeed(v, NeedType.Warmth).current).toBe(55)
  })

  it('warm_up restores 30 warmth at shelter', () => {
    const v = createVillager('t', 'T', 10, 10)
    getNeed(v, NeedType.Warmth).current = 30
    const shelterCtx: TickContext = { ...DEFAULT_CTX, structures: [{ type: 'shelter', position: { x: 10, y: 10 } }] }
    WARM_UP_ACTION.complete(v, {} as World, { food: 0, wood: 0, stone: 0 }, createRNG(1), { x: 32, y: 32 }, shelterCtx)
    expect(getNeed(v, NeedType.Warmth).current).toBe(60)
  })

  it('warm_up restores 20 warmth elsewhere', () => {
    const v = createVillager('t', 'T', 0, 0)
    getNeed(v, NeedType.Warmth).current = 30
    WARM_UP_ACTION.complete(v, {} as World, { food: 0, wood: 0, stone: 0 }, createRNG(1), { x: 32, y: 32 }, DEFAULT_CTX)
    expect(getNeed(v, NeedType.Warmth).current).toBe(50)
  })

  it('rest at campfire in winter gives +5 warmth', () => {
    const v = createVillager('t', 'T', 32, 32)
    getNeed(v, NeedType.Warmth).current = 30
    const winterCtx: TickContext = { ...DEFAULT_CTX, season: 'winter' }
    REST_ACTION.complete(v, {} as World, { food: 0, wood: 0, stone: 0 }, createRNG(1), { x: 32, y: 32 }, winterCtx)
    expect(getNeed(v, NeedType.Warmth).current).toBe(35) // +5
  })

  it('villager dies from exposure (warmth → health → death)', () => {
    const v = createVillager('t', 'T', 0, 0)
    getNeed(v, NeedType.Warmth).current = 0
    getNeed(v, NeedType.Health).current = 1
    // Set hunger low so starvation also contributes, and energy low to prevent health recovery
    getNeed(v, NeedType.Hunger).current = 0
    getNeed(v, NeedType.Energy).current = 10
    tickNeeds(v, 'winter')
    expect(v.alive).toBe(false)
  })
})
