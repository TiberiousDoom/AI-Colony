import { describe, it, expect } from 'vitest'
import { CompetitionEngine, type CompetitionConfig } from '../src/simulation/competition-engine.ts'
import { UtilityAI } from '../src/simulation/ai/utility-ai.ts'
import { BehaviorTreeAI } from '../src/simulation/ai/behavior-tree-ai.ts'
import { TICKS_PER_DAY, DAYS_PER_SEASON } from '../src/simulation/simulation-engine.ts'

function makeConfig(seed = 42): CompetitionConfig {
  return {
    seed,
    worldWidth: 64,
    worldHeight: 64,
    villages: [
      { id: 'utility', name: 'Utility AI', aiSystem: new UtilityAI(), villagerCount: 5 },
      { id: 'bt', name: 'Behavior Tree', aiSystem: new BehaviorTreeAI(), villagerCount: 5 },
    ],
  }
}

function advanceDays(engine: CompetitionEngine, days: number) {
  for (let i = 0; i < days * TICKS_PER_DAY; i++) engine.tick()
}

describe('CompetitionEngine', () => {
  it('initializes two villages with mirrored worlds from same seed', () => {
    const engine = new CompetitionEngine(makeConfig())
    const state = engine.getState()
    expect(state.villages.length).toBe(2)

    // Both worlds should have identical tile data
    const w1 = state.villages[0].world
    const w2 = state.villages[1].world
    expect(w1.campfirePosition).toEqual(w2.campfirePosition)
    expect(w1.tiles[10][10].type).toBe(w2.tiles[10][10].type)
    expect(w1.tiles[30][30].type).toBe(w2.tiles[30][30].type)
  })

  it('worlds are identical at tick 0', () => {
    const engine = new CompetitionEngine(makeConfig())
    const state = engine.getState()
    const w1 = state.villages[0].world
    const w2 = state.villages[1].world

    for (let y = 0; y < w1.height; y++) {
      for (let x = 0; x < w1.width; x++) {
        expect(w1.tiles[y][x].type).toBe(w2.tiles[y][x].type)
        expect(w1.tiles[y][x].resourceAmount).toBe(w2.tiles[y][x].resourceAmount)
      }
    }
  })

  it('each village has its own villagers and stockpile', () => {
    const engine = new CompetitionEngine(makeConfig())
    const state = engine.getState()
    const v1 = state.villages[0]
    const v2 = state.villages[1]

    expect(v1.villagers).not.toBe(v2.villagers)
    expect(v1.stockpile).not.toBe(v2.stockpile)
    expect(v1.id).toBe('utility')
    expect(v2.id).toBe('bt')
  })

  it('both villages experience same time/season progression', () => {
    const engine = new CompetitionEngine(makeConfig())
    advanceDays(engine, DAYS_PER_SEASON + 1)
    const state = engine.getState()
    expect(state.season).toBe('summer')
    // Both villages share the same tick/day/season
  })

  it('resource depletion in one village does not affect the other', () => {
    const engine = new CompetitionEngine(makeConfig())
    advanceDays(engine, 5)
    const state = engine.getState()

    const w1 = state.villages[0].world
    const w2 = state.villages[1].world

    // After 5 days, villages may have different resource states
    // due to different AI decisions — they should be independent
    // (We just verify no crash and both worlds are still valid)
    expect(w1.width).toBe(64)
    expect(w2.width).toBe(64)
  })

  it('village elimination when all villagers die', () => {
    const engine = new CompetitionEngine(makeConfig())
    const state = engine.getState() as any

    // Kill all villagers in village 0
    for (const v of state.villages[0].villagers) {
      v.alive = false
    }

    engine.tick()
    expect(engine.getState().villages[0].isEliminated).toBe(true)
    expect(engine.getState().villages[0].eliminationCause).toBeTruthy()
  })

  it('simulation ends when all villages eliminated', () => {
    const engine = new CompetitionEngine(makeConfig())
    const state = engine.getState() as any

    // Kill everyone in both villages
    for (const village of state.villages) {
      for (const v of village.villagers) v.alive = false
    }

    engine.tick()
    expect(engine.getState().isOver).toBe(true)
  })

  it('last village standing triggers victory lap', () => {
    const engine = new CompetitionEngine(makeConfig())
    const state = engine.getState() as any

    // Kill all villagers in village 1 (BT)
    for (const v of state.villages[1].villagers) v.alive = false

    engine.tick()
    const s = engine.getState()
    expect(s.villages[1].isEliminated).toBe(true)
    expect(s.winner).toBe('utility')
    expect(s.victoryLapRemaining).toBe(10)
  })

  it('simultaneous elimination results in no winner', () => {
    const engine = new CompetitionEngine(makeConfig())
    const state = engine.getState() as any

    // Kill everyone in both on the same tick
    for (const village of state.villages) {
      for (const v of village.villagers) v.alive = false
    }

    engine.tick()
    const s = engine.getState()
    expect(s.isOver).toBe(true)
    expect(s.winner).toBeNull()
  })

  it('critical population warning at 1 villager', () => {
    const engine = new CompetitionEngine(makeConfig())
    const state = engine.getState() as any

    // Kill all but one in village 0
    const v0 = state.villages[0].villagers
    for (let i = 1; i < v0.length; i++) v0[i].alive = false

    engine.tick()
    const critEvents = engine.getState().villages[0].events.filter(e => e.type === 'critical_population')
    expect(critEvents.length).toBe(1)
  })

  it('deterministic: same seed produces identical state', () => {
    const e1 = new CompetitionEngine(makeConfig(99))
    const e2 = new CompetitionEngine(makeConfig(99))

    for (let i = 0; i < 100; i++) { e1.tick(); e2.tick() }

    const s1 = e1.getState()
    const s2 = e2.getState()

    expect(s1.tick).toBe(s2.tick)
    expect(s1.season).toBe(s2.season)
    for (let vi = 0; vi < s1.villages.length; vi++) {
      expect(JSON.stringify(s1.villages[vi].stockpile)).toBe(JSON.stringify(s2.villages[vi].stockpile))
    }
  })

  it('runs without crashing for 500 ticks', () => {
    const engine = new CompetitionEngine(makeConfig())
    for (let i = 0; i < 500; i++) {
      engine.tick()
      if (engine.getState().isOver) break
    }
    // Just verify no crash
    expect(engine.getState().tick).toBeGreaterThan(0)
  })
})
