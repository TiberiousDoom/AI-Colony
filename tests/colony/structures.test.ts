import { describe, it, expect } from 'vitest'
import {
  canAfford, deductCost, createStructure, findBuildSite,
  getShelterCapacity, getStorageBonus, getStockpileCap, BASE_STOCKPILE_CAP,
} from '../../src/colony/simulation/structures.ts'
import { BUILD_SHELTER_ACTION, BUILD_STORAGE_ACTION, REST_ACTION, DEFAULT_CTX, type TickContext } from '../../src/colony/simulation/actions.ts'
import { createVillager, getNeed, NeedType } from '../../src/colony/simulation/villager.ts'
import { World } from '../../src/colony/simulation/world.ts'
import { createRNG } from '../../src/shared/seed.ts'

describe('Structures', () => {
  describe('canAfford', () => {
    it('correctly checks shelter cost (20 wood)', () => {
      expect(canAfford({ food: 0, wood: 20, stone: 0 }, 'shelter')).toBe(true)
      expect(canAfford({ food: 0, wood: 19, stone: 0 }, 'shelter')).toBe(false)
    })

    it('correctly checks storage cost (15 wood + 10 stone)', () => {
      expect(canAfford({ food: 0, wood: 15, stone: 10 }, 'storage')).toBe(true)
      expect(canAfford({ food: 0, wood: 14, stone: 10 }, 'storage')).toBe(false)
      expect(canAfford({ food: 0, wood: 15, stone: 9 }, 'storage')).toBe(false)
    })
  })

  describe('deductCost', () => {
    it('removes resources from stockpile', () => {
      const s = { food: 50, wood: 30, stone: 20 }
      deductCost(s, 'shelter')
      expect(s.wood).toBe(10)
      expect(s.stone).toBe(20) // No stone cost for shelter
    })
  })

  describe('findBuildSite', () => {
    it('returns valid passable tile near campfire', () => {
      const world = new World({ width: 64, height: 64, seed: 42 })
      const site = findBuildSite(world, world.campfirePosition, [])
      expect(site).not.toBeNull()
      if (site) {
        expect(world.isPassable(site.x, site.y)).toBe(true)
        const dist = Math.abs(site.x - world.campfirePosition.x) + Math.abs(site.y - world.campfirePosition.y)
        expect(dist).toBeLessThanOrEqual(5)
        expect(dist).toBeGreaterThan(0) // Not on campfire itself
      }
    })
  })

  describe('capacity calculations', () => {
    it('getShelterCapacity returns 3 per shelter', () => {
      const structures = [
        createStructure('shelter', { x: 0, y: 0 }, 0),
        createStructure('shelter', { x: 1, y: 1 }, 10),
      ]
      expect(getShelterCapacity(structures)).toBe(6)
    })

    it('getStorageBonus returns 100 per storage', () => {
      const structures = [createStructure('storage', { x: 0, y: 0 }, 0)]
      expect(getStorageBonus(structures)).toBe(100)
    })

    it('getStockpileCap = base + storage bonus', () => {
      expect(getStockpileCap([])).toBe(BASE_STOCKPILE_CAP)
      const structures = [createStructure('storage', { x: 0, y: 0 }, 0)]
      expect(getStockpileCap(structures)).toBe(BASE_STOCKPILE_CAP + 100)
    })
  })

  describe('build actions', () => {
    it('build shelter deducts 20 wood and sets _builtStructure', () => {
      const v = createVillager('t', 'T', 32, 32)
      const stockpile = { food: 0, wood: 30, stone: 0 }
      BUILD_SHELTER_ACTION.complete(v, {} as World, stockpile, createRNG(1), { x: 32, y: 32 }, DEFAULT_CTX)
      expect(stockpile.wood).toBe(10)
      expect((v as any)._builtStructure).toBeDefined()
      expect((v as any)._builtStructure.type).toBe('shelter')
    })

    it('build storage deducts 15 wood + 10 stone', () => {
      const v = createVillager('t', 'T', 32, 32)
      const stockpile = { food: 0, wood: 25, stone: 15 }
      BUILD_STORAGE_ACTION.complete(v, {} as World, stockpile, createRNG(1), { x: 32, y: 32 }, DEFAULT_CTX)
      expect(stockpile.wood).toBe(10)
      expect(stockpile.stone).toBe(5)
    })
  })

  describe('REST at shelter', () => {
    it('gives +30 energy at shelter vs +20 at campfire', () => {
      const v1 = createVillager('t1', 'T1', 10, 10)
      getNeed(v1, NeedType.Energy).current = 50
      const shelterCtx: TickContext = { ...DEFAULT_CTX, structures: [{ type: 'shelter', position: { x: 10, y: 10 } }] }
      REST_ACTION.complete(v1, {} as World, { food: 0, wood: 0, stone: 0 }, createRNG(1), { x: 32, y: 32 }, shelterCtx)
      expect(getNeed(v1, NeedType.Energy).current).toBe(80) // +30

      const v2 = createVillager('t2', 'T2', 32, 32)
      getNeed(v2, NeedType.Energy).current = 50
      REST_ACTION.complete(v2, {} as World, { food: 0, wood: 0, stone: 0 }, createRNG(1), { x: 32, y: 32 }, DEFAULT_CTX)
      expect(getNeed(v2, NeedType.Energy).current).toBe(70) // +20 at campfire
    })
  })
})
