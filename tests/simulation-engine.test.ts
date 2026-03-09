import { describe, it, expect } from 'vitest'
import { SimulationEngine, TICKS_PER_DAY, DAY_TICKS, SNAPSHOT_INTERVAL } from '../src/simulation/simulation-engine.ts'
import { UtilityAI } from '../src/simulation/ai/utility-ai.ts'
import type { SimulationConfig } from '../src/simulation/simulation-engine.ts'

function makeConfig(overrides?: Partial<SimulationConfig>): SimulationConfig {
  return {
    seed: 42,
    worldWidth: 64,
    worldHeight: 64,
    aiSystem: new UtilityAI(),
    villagerCount: 10,
    ...overrides,
  }
}

describe('SimulationEngine', () => {
  describe('initialization', () => {
    it('starts at tick 0, day 0', () => {
      const engine = new SimulationEngine(makeConfig())
      const state = engine.getState()
      expect(state.tick).toBe(0)
      expect(state.dayCount).toBe(0)
      expect(state.timeOfDay).toBe('day')
      expect(state.isOver).toBe(false)
    })

    it('creates the correct number of villagers', () => {
      const engine = new SimulationEngine(makeConfig({ villagerCount: 8 }))
      expect(engine.getState().villagers.length).toBe(8)
    })

    it('initializes stockpile', () => {
      const engine = new SimulationEngine(makeConfig())
      const { stockpile } = engine.getState()
      expect(stockpile.food).toBe(50)
      expect(stockpile.wood).toBe(30)
      expect(stockpile.stone).toBe(10)
    })

    it('records initial snapshot at tick 0', () => {
      const engine = new SimulationEngine(makeConfig())
      expect(engine.getState().history.daily.length).toBe(1)
      expect(engine.getState().history.daily[0].day).toBe(0)
      expect(engine.getState().history.daily[0].population).toBe(10)
    })

    it('records day_start event', () => {
      const engine = new SimulationEngine(makeConfig())
      expect(engine.getState().events.length).toBe(1)
      expect(engine.getState().events[0].type).toBe('day_start')
      expect(engine.getState().events[0].message).toBe('Day 1 begins')
    })
  })

  describe('tick progression', () => {
    it('increments tick counter', () => {
      const engine = new SimulationEngine(makeConfig())
      engine.tick()
      expect(engine.getState().tick).toBe(1)
      engine.tick()
      expect(engine.getState().tick).toBe(2)
    })

    it('transitions to night after DAY_TICKS', () => {
      const engine = new SimulationEngine(makeConfig())
      for (let i = 0; i < DAY_TICKS; i++) {
        engine.tick()
      }
      expect(engine.getState().timeOfDay).toBe('night')
    })

    it('transitions back to day after TICKS_PER_DAY', () => {
      const engine = new SimulationEngine(makeConfig())
      for (let i = 0; i < TICKS_PER_DAY; i++) {
        engine.tick()
      }
      expect(engine.getState().timeOfDay).toBe('day')
      expect(engine.getState().dayCount).toBe(1)
    })

    it('records snapshot on day boundary', () => {
      const engine = new SimulationEngine(makeConfig())
      for (let i = 0; i < TICKS_PER_DAY; i++) {
        engine.tick()
      }
      // Initial + snapshots during 1 day (every SNAPSHOT_INTERVAL ticks)
      const expectedSnapshots = 1 + Math.floor(TICKS_PER_DAY / SNAPSHOT_INTERVAL)
      expect(engine.getState().history.daily.length).toBe(expectedSnapshots)
    })
  })

  describe('determinism', () => {
    it('two engines with same seed produce identical state after N ticks', () => {
      const e1 = new SimulationEngine(makeConfig({ seed: 12345 }))
      const e2 = new SimulationEngine(makeConfig({ seed: 12345 }))

      for (let i = 0; i < 100; i++) {
        e1.tick()
        e2.tick()
      }

      const s1 = e1.getState()
      const s2 = e2.getState()

      expect(s1.tick).toBe(s2.tick)
      expect(s1.dayCount).toBe(s2.dayCount)
      expect(s1.stockpile).toEqual(s2.stockpile)
      expect(s1.villagers.length).toBe(s2.villagers.length)

      for (let i = 0; i < s1.villagers.length; i++) {
        expect(s1.villagers[i].alive).toBe(s2.villagers[i].alive)
        expect(s1.villagers[i].position).toEqual(s2.villagers[i].position)
        expect(s1.villagers[i].currentAction).toBe(s2.villagers[i].currentAction)
      }

      // History should match
      expect(s1.history.daily.length).toBe(s2.history.daily.length)
      for (let i = 0; i < s1.history.daily.length; i++) {
        expect(s1.history.daily[i].population).toBe(s2.history.daily[i].population)
        expect(s1.history.daily[i].prosperityScore).toBe(s2.history.daily[i].prosperityScore)
      }
    })

    it('different seeds produce different outcomes', () => {
      const e1 = new SimulationEngine(makeConfig({ seed: 1 }))
      const e2 = new SimulationEngine(makeConfig({ seed: 999 }))

      for (let i = 0; i < 100; i++) {
        e1.tick()
        e2.tick()
      }

      // At least some villager positions should differ
      const positions1 = e1.getState().villagers.map(v => `${v.position.x},${v.position.y}`)
      const positions2 = e2.getState().villagers.map(v => `${v.position.x},${v.position.y}`)
      expect(positions1).not.toEqual(positions2)
    })
  })

  describe('simulation lifecycle', () => {
    it('game ends when all villagers die', () => {
      const engine = new SimulationEngine(makeConfig({ villagerCount: 10 }))

      // Run enough ticks for starvation to occur
      let ticks = 0
      while (!engine.getState().isOver && ticks < 3000) {
        engine.tick()
        ticks++
      }

      // With 10 villagers and limited food (50 initial), they should eventually starve
      expect(engine.getState().isOver).toBe(true)
      expect(engine.getState().villagers.filter(v => v.alive).length).toBe(0)
    })

    it('does not tick after game over', () => {
      const engine = new SimulationEngine(makeConfig({ villagerCount: 10 }))

      // Run until game ends
      let ticks = 0
      while (!engine.getState().isOver && ticks < 3000) {
        engine.tick()
        ticks++
      }

      // Ensure game actually ended
      expect(engine.getState().isOver).toBe(true)

      const tickBefore = engine.getState().tick
      engine.tick()
      expect(engine.getState().tick).toBe(tickBefore) // no change
    }, 15000)
  })

  describe('reset', () => {
    it('resets to initial state', () => {
      const engine = new SimulationEngine(makeConfig())
      for (let i = 0; i < 50; i++) engine.tick()

      engine.reset()

      const state = engine.getState()
      expect(state.tick).toBe(0)
      expect(state.dayCount).toBe(0)
      expect(state.isOver).toBe(false)
      expect(state.stockpile.food).toBe(50)
      expect(state.history.daily.length).toBe(1)
      expect(state.events.length).toBe(1)
    })
  })

  describe('stress test', () => {
    it('runs 300 ticks (10 days) without crashing', () => {
      const engine = new SimulationEngine(makeConfig())

      for (let i = 0; i < 300; i++) {
        engine.tick()
      }

      const state = engine.getState()
      expect(state.tick).toBe(300)
      expect(state.dayCount).toBe(10)
      const expectedSnapshots = 1 + Math.floor(300 / SNAPSHOT_INTERVAL) // initial + every SNAPSHOT_INTERVAL ticks
      expect(state.history.daily.length).toBe(expectedSnapshots)
    })

    it('runs 900 ticks (30 days) without crashing (may end early if all die)', () => {
      const engine = new SimulationEngine(makeConfig())

      for (let i = 0; i < 900; i++) {
        engine.tick()
        if (engine.getState().isOver) break
      }

      const state = engine.getState()
      // Tick should have advanced (even if game ended early)
      expect(state.tick).toBeGreaterThan(0)
      // History should have at least some snapshots
      expect(state.history.daily.length).toBeGreaterThanOrEqual(2)
    })
  })
})
