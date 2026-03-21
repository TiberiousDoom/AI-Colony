import { describe, it, expect } from 'vitest'
import { createRNG } from '../../src/shared/seed.ts'
import {
  createVillager,
  createStartingVillagers,
  createInitialStockpile,
  tickNeeds,
  getNeed,
  NeedType,
} from '../../src/colony/simulation/villager.ts'

describe('Villager', () => {
  describe('createVillager', () => {
    it('creates a villager with correct defaults', () => {
      const v = createVillager('test-1', 'Alice', 10, 20)
      expect(v.id).toBe('test-1')
      expect(v.name).toBe('Alice')
      expect(v.position).toEqual({ x: 10, y: 20 })
      expect(v.alive).toBe(true)
      expect(v.currentAction).toBe('idle')
      expect(v.actionTicksRemaining).toBe(0)
      expect(v.carrying).toBe(null)
      expect(v.path).toEqual([])
    })

    it('initializes needs correctly', () => {
      const v = createVillager('test-1', 'Alice', 0, 0)
      const hunger = getNeed(v, NeedType.Hunger)
      const energy = getNeed(v, NeedType.Energy)
      const health = getNeed(v, NeedType.Health)

      expect(hunger.current).toBe(75)
      expect(hunger.drainRate).toBe(1.0)
      expect(energy.current).toBe(75)
      expect(energy.drainRate).toBe(1.0)
      expect(health.current).toBe(75)
      expect(health.drainRate).toBe(0)
    })
  })

  describe('createStartingVillagers', () => {
    it('creates the correct number of villagers', () => {
      const rng = createRNG(42)
      const villagers = createStartingVillagers(10, 32, 32, rng)
      expect(villagers.length).toBe(10)
    })

    it('places villagers within 7x7 clearing', () => {
      const rng = createRNG(42)
      const villagers = createStartingVillagers(10, 32, 32, rng)
      for (const v of villagers) {
        expect(Math.abs(v.position.x - 32)).toBeLessThanOrEqual(3)
        expect(Math.abs(v.position.y - 32)).toBeLessThanOrEqual(3)
      }
    })

    it('assigns unique names (up to pool size)', () => {
      const rng = createRNG(42)
      const villagers = createStartingVillagers(10, 32, 32, rng)
      const names = villagers.map(v => v.name)
      expect(new Set(names).size).toBe(10)
    })

    it('is deterministic with same seed', () => {
      const v1 = createStartingVillagers(5, 32, 32, createRNG(42))
      const v2 = createStartingVillagers(5, 32, 32, createRNG(42))
      for (let i = 0; i < 5; i++) {
        expect(v1[i].name).toBe(v2[i].name)
        expect(v1[i].position).toEqual(v2[i].position)
      }
    })
  })

  describe('createInitialStockpile', () => {
    it('has correct starting resources', () => {
      const s = createInitialStockpile()
      expect(s.food).toBe(50)
      expect(s.wood).toBe(30)
      expect(s.stone).toBe(10)
    })
  })

  describe('tickNeeds', () => {
    it('drains hunger and energy each tick', () => {
      const v = createVillager('test', 'Bob', 0, 0)
      const hungerBefore = getNeed(v, NeedType.Hunger).current
      const energyBefore = getNeed(v, NeedType.Energy).current

      tickNeeds(v)

      expect(getNeed(v, NeedType.Hunger).current).toBe(hungerBefore - 1.0)
      expect(getNeed(v, NeedType.Energy).current).toBe(energyBefore - 1.0)
    })

    it('does not drain health normally', () => {
      const v = createVillager('test', 'Bob', 0, 0)
      tickNeeds(v)
      // Health recovers when hunger > 50 and energy > 30 (both true at 73/74)
      expect(getNeed(v, NeedType.Health).current).toBe(75.8)
    })

    it('causes starvation damage when hunger is 0', () => {
      const v = createVillager('test', 'Bob', 0, 0)
      const hunger = getNeed(v, NeedType.Hunger)
      hunger.current = 1 // Will drop to -1 -> 0

      tickNeeds(v)

      expect(hunger.current).toBe(0)
      // Health should have taken 1.0 damage
      expect(getNeed(v, NeedType.Health).current).toBe(74)
    })

    it('recovers health when well-fed and rested', () => {
      const v = createVillager('test', 'Bob', 0, 0)
      getNeed(v, NeedType.Hunger).current = 80
      getNeed(v, NeedType.Energy).current = 60
      const healthBefore = getNeed(v, NeedType.Health).current

      tickNeeds(v)

      // hunger after drain: 78 > 50, energy after drain: 59 > 30 → +0.8 health
      expect(getNeed(v, NeedType.Health).current).toBe(healthBefore + 0.8)
    })

    it('kills villager when health reaches 0', () => {
      const v = createVillager('test', 'Bob', 0, 0)
      getNeed(v, NeedType.Hunger).current = 0
      getNeed(v, NeedType.Health).current = 0.5

      tickNeeds(v)

      // Health takes starvation damage: 0.5 - 1.0 = -0.5 → clamped to 0 → death
      expect(v.alive).toBe(false)
    })

    it('does nothing when villager is dead', () => {
      const v = createVillager('test', 'Bob', 0, 0)
      v.alive = false
      const hungerBefore = getNeed(v, NeedType.Hunger).current

      tickNeeds(v)

      expect(getNeed(v, NeedType.Hunger).current).toBe(hungerBefore)
    })

    it('needs are clamped to [0, 100]', () => {
      const v = createVillager('test', 'Bob', 0, 0)
      getNeed(v, NeedType.Hunger).current = 100
      getNeed(v, NeedType.Energy).current = 100
      getNeed(v, NeedType.Health).current = 100

      tickNeeds(v)

      // Health recovery: hunger 98 > 50, energy 99 > 30 → +0.5, but max is 100
      expect(getNeed(v, NeedType.Health).current).toBe(100)
    })
  })
})
