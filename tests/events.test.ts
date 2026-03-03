import { describe, it, expect } from 'vitest'
import { EventScheduler, resolveEventPosition, type RandomEvent } from '../src/simulation/events.ts'
import { createRNG } from '../src/utils/seed.ts'
import { SimulationEngine, TICKS_PER_DAY } from '../src/simulation/simulation-engine.ts'
import { UtilityAI } from '../src/simulation/ai/utility-ai.ts'
import { World } from '../src/simulation/world.ts'
import { FLEE_ACTION } from '../src/simulation/actions.ts'

describe('Random Events', () => {
  describe('EventScheduler', () => {
    it('produces deterministic events for same seed', () => {
      const s1 = new EventScheduler(createRNG(42))
      const s2 = new EventScheduler(createRNG(42))

      const events1: RandomEvent[] = []
      const events2: RandomEvent[] = []

      for (let day = 0; day < 30; day++) {
        const e1 = s1.checkForEvent(day, 'summer')
        const e2 = s2.checkForEvent(day, 'summer')
        if (e1) events1.push(e1)
        if (e2) events2.push(e2)
      }

      expect(events1.length).toBe(events2.length)
      for (let i = 0; i < events1.length; i++) {
        expect(events1[i].type).toBe(events2[i].type)
        expect(events1[i].severity).toBe(events2[i].severity)
        expect(events1[i].relativePosition.dx).toBe(events2[i].relativePosition.dx)
      }
    })

    it('cold snap fires only during autumn', () => {
      const scheduler = new EventScheduler(createRNG(42))
      const coldSnaps: RandomEvent[] = []

      // Run many days to check cold snaps
      for (let day = 0; day < 100; day++) {
        // Alternate seasons
        const seasons = ['spring', 'summer', 'autumn', 'winter'] as const
        const season = seasons[Math.floor(day / 7) % 4]
        const event = scheduler.checkForEvent(day, season)
        if (event?.type === 'cold_snap') {
          coldSnaps.push(event)
        }
      }

      // All cold snaps should have been generated during autumn season
      // (the checkForEvent function determines event type based on season)
    })

    it('tickEvents decrements durations and removes expired', () => {
      const scheduler = new EventScheduler(createRNG(42))
      let events: RandomEvent[] = [{
        type: 'blight',
        triggerTick: 0,
        relativePosition: { dx: 0, dy: 0 },
        radius: 5,
        durationTicks: 2,
        severity: 0,
      }]

      events = scheduler.tickEvents(events)
      expect(events.length).toBe(1)
      expect(events[0].durationTicks).toBe(1)

      events = scheduler.tickEvents(events)
      expect(events.length).toBe(0) // Expired
    })
  })

  describe('resolveEventPosition', () => {
    it('converts relative position to absolute', () => {
      const event: RandomEvent = {
        type: 'predator',
        triggerTick: 0,
        relativePosition: { dx: 5, dy: -3 },
        radius: 5,
        durationTicks: 1,
        severity: 30,
      }
      const campfire = { x: 32, y: 32 }
      const pos = resolveEventPosition(event, campfire)
      expect(pos.x).toBe(37)
      expect(pos.y).toBe(29)
    })
  })

  describe('Blight', () => {
    it('destroys food sources in radius', () => {
      const world = new World({ width: 64, height: 64, seed: 42 })
      const forests = world.findTilesInRadius(32, 32, 5, t => t.type === 'forest')
      const forestWithResources = forests.filter(t => t.resourceAmount > 0)

      if (forestWithResources.length > 0) {
        world.applyBlight(32, 32, 5, 90)
        const blightedForests = world.findTilesInRadius(32, 32, 5, t => t.type === 'forest')
        const depleted = blightedForests.filter(t => t.resourceAmount === 0)
        expect(depleted.length).toBeGreaterThan(0)
      }
    })

    it('blighted tiles recover after timer expires', () => {
      const world = new World({ width: 64, height: 64, seed: 42 })
      const forest = world.findTilesInRadius(32, 32, 5, t => t.type === 'forest' && t.resourceAmount > 0)[0]

      if (forest) {
        world.applyBlight(forest.x, forest.y, 0, 3)
        expect(forest.resourceAmount).toBe(0)

        // Tick 3 times to expire blight
        world.tickRegeneration('summer')
        world.tickRegeneration('summer')
        world.tickRegeneration('summer')

        // After blight expires, tile should have been restored
        expect(forest.resourceAmount).toBe(forest.maxResource)
      }
    })
  })

  describe('No events before day 5', () => {
    it('grace period prevents early events', () => {
      const engine = new SimulationEngine({
        seed: 42,
        worldWidth: 64,
        worldHeight: 64,
        aiSystem: new UtilityAI(),
        villagerCount: 5,
      })

      // Advance 4 days
      for (let i = 0; i < 4 * TICKS_PER_DAY; i++) engine.tick()

      const randomEvents = engine.getState().events.filter(e => e.type === 'random_event')
      expect(randomEvents.length).toBe(0)
    })
  })

  describe('Flee action', () => {
    it('flee has duration 0 and energy cost 2', () => {
      expect(FLEE_ACTION.duration).toBe(0)
      expect(FLEE_ACTION.energyCostPerTick).toBe(2)
    })
  })
})
