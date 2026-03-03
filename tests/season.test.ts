import { describe, it, expect } from 'vitest'
import { SimulationEngine, TICKS_PER_DAY, DAYS_PER_SEASON } from '../src/simulation/simulation-engine.ts'
import { UtilityAI } from '../src/simulation/ai/utility-ai.ts'
import { FORAGE_ACTION, DEFAULT_CTX, type TickContext } from '../src/simulation/actions.ts'
import { createVillager } from '../src/simulation/villager.ts'
import { createRNG } from '../src/utils/seed.ts'
import { World } from '../src/simulation/world.ts'

function makeEngine(seed = 42) {
  return new SimulationEngine({
    seed,
    worldWidth: 64,
    worldHeight: 64,
    aiSystem: new UtilityAI(),
    villagerCount: 5,
  })
}

function advanceDays(engine: SimulationEngine, days: number) {
  for (let i = 0; i < days * TICKS_PER_DAY; i++) engine.tick()
}

describe('Seasonal Cycle', () => {
  it('starts at spring', () => {
    const engine = makeEngine()
    expect(engine.getState().season).toBe('spring')
  })

  it('transitions to summer after 7 days', () => {
    const engine = makeEngine()
    advanceDays(engine, DAYS_PER_SEASON)
    expect(engine.getState().season).toBe('summer')
  })

  it('all four seasons are visited in a full cycle', () => {
    const engine = makeEngine()
    const seasons = new Set<string>()
    seasons.add(engine.getState().season)
    // Advance day-by-day, keeping first villager alive to prevent game over
    // so the season cycling logic can be fully exercised
    for (let d = 0; d < DAYS_PER_SEASON * 4 + 1; d++) {
      const state = engine.getState() as Record<string, unknown>
      state.isOver = false
      const villagers = state.villagers as Array<{ alive: boolean; needs: Map<unknown, { current: number }> }>
      villagers[0].alive = true
      for (const need of villagers[0].needs.values()) {
        need.current = Math.max(need.current, 50)
      }
      advanceDays(engine, 1)
      seasons.add(engine.getState().season)
      if (seasons.size === 4) break
    }
    expect(seasons).toContain('spring')
    expect(seasons).toContain('summer')
    expect(seasons).toContain('autumn')
    expect(seasons).toContain('winter')
  })

  it('records season in daily snapshot', () => {
    const engine = makeEngine()
    advanceDays(engine, DAYS_PER_SEASON + 1)
    const daily = engine.getState().history.daily
    const summerSnap = daily.find(s => s.season === 'summer')
    expect(summerSnap).toBeDefined()
  })

  it('logs season change events', () => {
    const engine = makeEngine()
    advanceDays(engine, DAYS_PER_SEASON)
    const events = engine.getState().events
    const seasonEvent = events.find(e => e.type === 'season_change')
    expect(seasonEvent).toBeDefined()
    expect(seasonEvent!.message).toContain('Summer')
  })

  it('applies spring 2x forest regeneration', () => {
    const world = new World({ width: 64, height: 64, seed: 42 })
    // Deplete a forest tile
    const forest = world.findTilesInRadius(32, 32, 15, t => t.type === 'forest')[0]
    if (forest) {
      const orig = forest.resourceAmount
      forest.resourceAmount = 50
      world.tickRegeneration('spring')
      // Spring: 2x regen
      expect(forest.resourceAmount).toBe(50 + forest.regenRate * 2)
    }
  })

  it('applies zero regeneration in winter', () => {
    const world = new World({ width: 64, height: 64, seed: 42 })
    const forest = world.findTilesInRadius(32, 32, 15, t => t.type === 'forest')[0]
    if (forest) {
      forest.resourceAmount = 50
      world.tickRegeneration('winter')
      expect(forest.resourceAmount).toBe(50) // No regen
    }
  })

  it('applies +50% forage yield in autumn', () => {
    const world = new World({ width: 64, height: 64, seed: 42 })
    let forestPos: { x: number; y: number } | null = null
    for (let y = 0; y < 64 && !forestPos; y++) {
      for (let x = 0; x < 64 && !forestPos; x++) {
        if (world.tiles[y][x].type === 'forest' && world.tiles[y][x].resourceAmount >= 20) forestPos = { x, y }
      }
    }
    if (forestPos) {
      const v = createVillager('t', 'T', forestPos.x, forestPos.y)
      const autumnCtx: TickContext = { ...DEFAULT_CTX, season: 'autumn' }
      FORAGE_ACTION.complete(v, world, { food: 0, wood: 0, stone: 0 }, createRNG(42), { x: 32, y: 32 }, autumnCtx)
      // Autumn: floor(base * 1.5) — base is 10-15
      expect(v.carrying!.amount).toBeGreaterThanOrEqual(15)
    }
  })

  it('applies outdoor duration penalty in winter', () => {
    const winterCtx: TickContext = { ...DEFAULT_CTX, season: 'winter' }
    expect(FORAGE_ACTION.getEffectiveDuration(winterCtx)).toBe(5) // ceil(3*1.5)
  })

  it('stacks night and winter duration penalties', () => {
    const winterNightCtx: TickContext = { ...DEFAULT_CTX, timeOfDay: 'night', season: 'winter' }
    expect(FORAGE_ACTION.getEffectiveDuration(winterNightCtx)).toBe(7) // ceil(3*1.5*1.5) = ceil(6.75)
  })
})
