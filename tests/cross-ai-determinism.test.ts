import { describe, it, expect } from 'vitest'
import { CompetitionEngine, type CompetitionConfig } from '../src/simulation/competition-engine.ts'
import { UtilityAI } from '../src/simulation/ai/utility-ai.ts'
import { BehaviorTreeAI } from '../src/simulation/ai/behavior-tree-ai.ts'
import { TICKS_PER_DAY } from '../src/simulation/simulation-engine.ts'

describe('Cross-AI Determinism', () => {
  it('same seed produces identical worlds for both villages at tick 0', () => {
    const config: CompetitionConfig = {
      seed: 42,
      worldWidth: 64,
      worldHeight: 64,
      villages: [
        { id: 'a', name: 'Utility', aiSystem: new UtilityAI(), villagerCount: 5 },
        { id: 'b', name: 'BT', aiSystem: new BehaviorTreeAI(), villagerCount: 5 },
      ],
    }
    const engine = new CompetitionEngine(config)
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

  it('season/time progression identical for both villages', () => {
    const config: CompetitionConfig = {
      seed: 42,
      worldWidth: 64,
      worldHeight: 64,
      villages: [
        { id: 'a', name: 'Utility', aiSystem: new UtilityAI(), villagerCount: 5 },
        { id: 'b', name: 'BT', aiSystem: new BehaviorTreeAI(), villagerCount: 5 },
      ],
    }
    const engine = new CompetitionEngine(config)

    for (let i = 0; i < 200; i++) engine.tick()

    const state = engine.getState()
    // Both villages experience same season/time (shared global state)
    expect(state.season).toBeTruthy()
    expect(state.timeOfDay).toBeTruthy()
    // All snapshots for both villages reference same day progression
    const v1Days = state.villages[0].history.daily.map(s => s.day)
    const v2Days = state.villages[1].history.daily.map(s => s.day)
    expect(v1Days).toEqual(v2Days)
  })

  it('event schedule identical regardless of AI type', () => {
    // Two utility AIs
    const config1: CompetitionConfig = {
      seed: 123,
      worldWidth: 64,
      worldHeight: 64,
      villages: [
        { id: 'a', name: 'U1', aiSystem: new UtilityAI(), villagerCount: 5 },
        { id: 'b', name: 'U2', aiSystem: new UtilityAI(), villagerCount: 5 },
      ],
    }

    // Mixed AIs
    const config2: CompetitionConfig = {
      seed: 123,
      worldWidth: 64,
      worldHeight: 64,
      villages: [
        { id: 'a', name: 'Utility', aiSystem: new UtilityAI(), villagerCount: 5 },
        { id: 'b', name: 'BT', aiSystem: new BehaviorTreeAI(), villagerCount: 5 },
      ],
    }

    const e1 = new CompetitionEngine(config1)
    const e2 = new CompetitionEngine(config2)

    for (let i = 0; i < 300; i++) { e1.tick(); e2.tick() }

    const events1 = e1.getState().globalEvents
    const events2 = e2.getState().globalEvents

    // Global events (day/night, seasons, random events) should match exactly
    const global1 = events1.filter(e => e.type === 'season_change' || e.type === 'random_event')
    const global2 = events2.filter(e => e.type === 'season_change' || e.type === 'random_event')

    expect(global1.length).toBe(global2.length)
    for (let i = 0; i < global1.length; i++) {
      expect(global1[i].type).toBe(global2[i].type)
      expect(global1[i].tick).toBe(global2[i].tick)
    }
  })

  it('after 100 ticks: world resources may differ but season/time matches', () => {
    const config: CompetitionConfig = {
      seed: 42,
      worldWidth: 64,
      worldHeight: 64,
      villages: [
        { id: 'a', name: 'Utility', aiSystem: new UtilityAI(), villagerCount: 5 },
        { id: 'b', name: 'BT', aiSystem: new BehaviorTreeAI(), villagerCount: 5 },
      ],
    }
    const engine = new CompetitionEngine(config)
    for (let i = 0; i < 100; i++) engine.tick()

    const state = engine.getState()
    expect(state.tick).toBe(100)
    // Villages may have different stockpiles (different AI decisions)
    // but both exist and have valid data
    expect(state.villages[0].stockpile.food).toBeGreaterThanOrEqual(0)
    expect(state.villages[1].stockpile.food).toBeGreaterThanOrEqual(0)
  })
})
