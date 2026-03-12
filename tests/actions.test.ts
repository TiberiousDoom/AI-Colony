import { describe, it, expect } from 'vitest'
import { createRNG } from '../src/utils/seed.ts'
import {
  FORAGE_ACTION, EAT_ACTION, REST_ACTION, CHOP_WOOD_ACTION,
  HAUL_ACTION, FISH_ACTION, IDLE_ACTION,
  MINE_STONE_ACTION, BUILD_SHELTER_ACTION, BUILD_STORAGE_ACTION,
  WARM_UP_ACTION,
  getActionDefinition, getAllActions,
  DEFAULT_CTX,
  type TickContext,
} from '../src/simulation/actions.ts'
import { createVillager, getNeed, NeedType } from '../src/simulation/villager.ts'
import { World } from '../src/simulation/world.ts'

const worldConfig = { width: 64, height: 64, seed: 42 }

const dayCtx: TickContext = { ...DEFAULT_CTX, timeOfDay: 'day' }
const nightCtx: TickContext = { ...DEFAULT_CTX, timeOfDay: 'night' }
const winterCtx: TickContext = { ...DEFAULT_CTX, season: 'winter' }

describe('Actions', () => {
  describe('getEffectiveDuration', () => {
    it('returns base duration during day', () => {
      expect(FORAGE_ACTION.getEffectiveDuration(dayCtx)).toBe(3)
      expect(CHOP_WOOD_ACTION.getEffectiveDuration(dayCtx)).toBe(4)
      expect(FISH_ACTION.getEffectiveDuration(dayCtx)).toBe(4)
    })

    it('increases outdoor action duration at night (50%)', () => {
      expect(FORAGE_ACTION.getEffectiveDuration(nightCtx)).toBe(5) // ceil(3*1.5)
      expect(CHOP_WOOD_ACTION.getEffectiveDuration(nightCtx)).toBe(6) // ceil(4*1.5)
      expect(FISH_ACTION.getEffectiveDuration(nightCtx)).toBe(6) // ceil(4*1.5)
    })

    it('does not affect indoor actions at night', () => {
      expect(EAT_ACTION.getEffectiveDuration(nightCtx)).toBe(1)
      // REST varies by season: 2 in summer (default), 3 in spring/autumn, 4 in winter
      expect(REST_ACTION.getEffectiveDuration(nightCtx)).toBe(2)
      expect(IDLE_ACTION.getEffectiveDuration(nightCtx)).toBe(1)
    })

    it('increases outdoor action duration in winter (50%)', () => {
      expect(FORAGE_ACTION.getEffectiveDuration(winterCtx)).toBe(5) // ceil(3*1.5)
      expect(MINE_STONE_ACTION.getEffectiveDuration(winterCtx)).toBe(8) // ceil(5*1.5)
    })

    it('stacks night and winter penalties', () => {
      const winterNightCtx: TickContext = { ...DEFAULT_CTX, timeOfDay: 'night', season: 'winter' }
      expect(FORAGE_ACTION.getEffectiveDuration(winterNightCtx)).toBe(7) // ceil(3*1.5*1.5)
      expect(CHOP_WOOD_ACTION.getEffectiveDuration(winterNightCtx)).toBe(9) // ceil(4*1.5*1.5)
    })
  })

  describe('FORAGE_ACTION', () => {
    it('can perform near forest tiles', () => {
      const world = new World(worldConfig)
      // Place villager next to a forest tile
      let forestPos: { x: number; y: number } | null = null
      for (let y = 0; y < 64 && !forestPos; y++) {
        for (let x = 0; x < 64 && !forestPos; x++) {
          if (world.tiles[y][x].type === 'forest') {
            forestPos = { x, y }
          }
        }
      }
      expect(forestPos).not.toBeNull()
      const v = createVillager('t', 'T', forestPos!.x, forestPos!.y)
      expect(FORAGE_ACTION.canPerform(v, world, { food: 0, wood: 0, stone: 0 }, { x: 32, y: 32 }, dayCtx)).toBe(true)
    })

    it('gives food when completed', () => {
      const world = new World(worldConfig)
      const rng = createRNG(42)
      let forestPos: { x: number; y: number } | null = null
      for (let y = 0; y < 64 && !forestPos; y++) {
        for (let x = 0; x < 64 && !forestPos; x++) {
          if (world.tiles[y][x].type === 'forest') forestPos = { x, y }
        }
      }
      const v = createVillager('t', 'T', forestPos!.x, forestPos!.y)
      const stockpile = { food: 0, wood: 0, stone: 0 }
      FORAGE_ACTION.complete(v, world, stockpile, rng, { x: 32, y: 32 }, dayCtx)
      expect(v.carrying).not.toBeNull()
      expect(v.carrying!.type).toBe('food')
      expect(v.carrying!.amount).toBeGreaterThanOrEqual(10)
      expect(v.carrying!.amount).toBeLessThanOrEqual(15)
    })

    it('applies autumn yield bonus (+50%)', () => {
      const world = new World(worldConfig)
      let forestPos: { x: number; y: number } | null = null
      for (let y = 0; y < 64 && !forestPos; y++) {
        for (let x = 0; x < 64 && !forestPos; x++) {
          if (world.tiles[y][x].type === 'forest' && world.tiles[y][x].resourceAmount >= 20) forestPos = { x, y }
        }
      }
      expect(forestPos).not.toBeNull()
      const v = createVillager('t', 'T', forestPos!.x, forestPos!.y)
      const autumnCtx: TickContext = { ...DEFAULT_CTX, season: 'autumn' }
      FORAGE_ACTION.complete(v, world, { food: 0, wood: 0, stone: 0 }, createRNG(42), { x: 32, y: 32 }, autumnCtx)
      expect(v.carrying).not.toBeNull()
      // Autumn: floor(base * 1.5) — base is 10-15 so result is 15-22
      expect(v.carrying!.amount).toBeGreaterThanOrEqual(15)
    })
  })

  describe('EAT_ACTION', () => {
    it('can eat from stockpile at campfire', () => {
      const v = createVillager('t', 'T', 32, 32)
      expect(EAT_ACTION.canPerform(v, {} as World, { food: 5, wood: 0, stone: 0 }, { x: 32, y: 32 }, dayCtx)).toBe(true)
    })

    it('cannot eat when stockpile is empty and not carrying food', () => {
      const v = createVillager('t', 'T', 32, 32)
      expect(EAT_ACTION.canPerform(v, {} as World, { food: 0, wood: 0, stone: 0 }, { x: 32, y: 32 }, dayCtx)).toBe(false)
    })

    it('can eat from carried food', () => {
      const v = createVillager('t', 'T', 0, 0)
      v.carrying = { type: 'food', amount: 10 }
      expect(EAT_ACTION.canPerform(v, {} as World, { food: 0, wood: 0, stone: 0 }, { x: 32, y: 32 }, dayCtx)).toBe(true)
    })

    it('restores hunger and costs 5 food from stockpile', () => {
      const v = createVillager('t', 'T', 32, 32)
      getNeed(v, NeedType.Hunger).current = 30
      const stockpile = { food: 50, wood: 0, stone: 0 }
      EAT_ACTION.complete(v, {} as World, stockpile, createRNG(1), { x: 32, y: 32 }, dayCtx)
      expect(getNeed(v, NeedType.Hunger).current).toBe(60) // 30 + 30
      expect(stockpile.food).toBe(45) // 50 - 5
    })

    it('restores hunger and costs 5 food from carried food', () => {
      const v = createVillager('t', 'T', 0, 0)
      v.carrying = { type: 'food', amount: 10 }
      getNeed(v, NeedType.Hunger).current = 40
      EAT_ACTION.complete(v, {} as World, { food: 50, wood: 0, stone: 0 }, createRNG(1), { x: 32, y: 32 }, dayCtx)
      expect(getNeed(v, NeedType.Hunger).current).toBe(70)
      expect(v.carrying!.amount).toBe(5)
    })
  })

  describe('REST_ACTION', () => {
    it('can rest anywhere', () => {
      const v = createVillager('t', 'T', 0, 0)
      expect(REST_ACTION.canPerform(v, {} as World, { food: 0, wood: 0, stone: 0 }, { x: 32, y: 32 }, dayCtx)).toBe(true)
    })

    it('restores 15 energy when away from campfire', () => {
      const v = createVillager('t', 'T', 0, 0)
      getNeed(v, NeedType.Energy).current = 50
      REST_ACTION.complete(v, {} as World, { food: 0, wood: 0, stone: 0 }, createRNG(1), { x: 32, y: 32 }, dayCtx)
      expect(getNeed(v, NeedType.Energy).current).toBe(65)
    })

    it('restores 20 energy at campfire', () => {
      const v = createVillager('t', 'T', 32, 32)
      getNeed(v, NeedType.Energy).current = 50
      REST_ACTION.complete(v, {} as World, { food: 0, wood: 0, stone: 0 }, createRNG(1), { x: 32, y: 32 }, dayCtx)
      expect(getNeed(v, NeedType.Energy).current).toBe(70)
    })

    it('restores 30 energy at shelter', () => {
      const v = createVillager('t', 'T', 10, 10)
      getNeed(v, NeedType.Energy).current = 50
      const shelterCtx: TickContext = { ...DEFAULT_CTX, structures: [{ type: 'shelter', position: { x: 10, y: 10 } }] }
      REST_ACTION.complete(v, {} as World, { food: 0, wood: 0, stone: 0 }, createRNG(1), { x: 32, y: 32 }, shelterCtx)
      expect(getNeed(v, NeedType.Energy).current).toBe(80)
    })
  })

  describe('CHOP_WOOD_ACTION', () => {
    it('gives wood when completed near forest', () => {
      const world = new World(worldConfig)
      const rng = createRNG(42)
      let forestPos: { x: number; y: number } | null = null
      for (let y = 0; y < 64 && !forestPos; y++) {
        for (let x = 0; x < 64 && !forestPos; x++) {
          if (world.tiles[y][x].type === 'forest') forestPos = { x, y }
        }
      }
      const v = createVillager('t', 'T', forestPos!.x, forestPos!.y)
      CHOP_WOOD_ACTION.complete(v, world, { food: 0, wood: 0, stone: 0 }, rng, { x: 32, y: 32 }, dayCtx)
      expect(v.carrying).not.toBeNull()
      expect(v.carrying!.type).toBe('wood')
      expect(v.carrying!.amount).toBeGreaterThanOrEqual(8)
      expect(v.carrying!.amount).toBeLessThanOrEqual(12)
    })
  })

  describe('HAUL_ACTION', () => {
    it('can only haul when carrying and not at campfire', () => {
      const v = createVillager('t', 'T', 0, 0)
      v.carrying = { type: 'wood', amount: 10 }
      expect(HAUL_ACTION.canPerform(v, {} as World, { food: 0, wood: 0, stone: 0 }, { x: 32, y: 32 }, dayCtx)).toBe(true)
    })

    it('cannot haul when not carrying', () => {
      const v = createVillager('t', 'T', 0, 0)
      expect(HAUL_ACTION.canPerform(v, {} as World, { food: 0, wood: 0, stone: 0 }, { x: 32, y: 32 }, dayCtx)).toBe(false)
    })

    it('deposits carried resource to stockpile', () => {
      const v = createVillager('t', 'T', 0, 0)
      v.carrying = { type: 'wood', amount: 10 }
      const stockpile = { food: 0, wood: 5, stone: 0 }
      HAUL_ACTION.complete(v, {} as World, stockpile, createRNG(1), { x: 32, y: 32 }, dayCtx)
      expect(v.carrying).toBeNull()
      expect(stockpile.wood).toBe(15)
    })
  })

  describe('FISH_ACTION', () => {
    it('can fish adjacent to water', () => {
      const world = new World(worldConfig)
      // Find a water tile and place villager adjacent to it
      for (let y = 0; y < 64; y++) {
        for (let x = 0; x < 64; x++) {
          if (world.tiles[y][x].type === 'water') {
            // Try placing villager adjacent
            const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]]
            for (const [dx, dy] of dirs) {
              if (world.isPassable(x + dx, y + dy)) {
                const v = createVillager('t', 'T', x + dx, y + dy)
                expect(FISH_ACTION.canPerform(v, world, { food: 0, wood: 0, stone: 0 }, { x: 32, y: 32 }, dayCtx)).toBe(true)
                return
              }
            }
          }
        }
      }
    })

    it('gives food when completed', () => {
      const v = createVillager('t', 'T', 0, 0)
      FISH_ACTION.complete(v, {} as World, { food: 0, wood: 0, stone: 0 }, createRNG(42), { x: 32, y: 32 }, dayCtx)
      expect(v.carrying).not.toBeNull()
      expect(v.carrying!.type).toBe('food')
      expect(v.carrying!.amount).toBeGreaterThanOrEqual(8)
      expect(v.carrying!.amount).toBeLessThanOrEqual(12)
    })

    it('fish yield is NOT affected by winter', () => {
      const v = createVillager('t', 'T', 0, 0)
      FISH_ACTION.complete(v, {} as World, { food: 0, wood: 0, stone: 0 }, createRNG(42), { x: 32, y: 32 }, winterCtx)
      expect(v.carrying).not.toBeNull()
      expect(v.carrying!.amount).toBeGreaterThanOrEqual(8)
      expect(v.carrying!.amount).toBeLessThanOrEqual(12)
    })
  })

  describe('MINE_STONE_ACTION', () => {
    it('can mine near stone tiles', () => {
      const world = new World(worldConfig)
      let stonePos: { x: number; y: number } | null = null
      for (let y = 0; y < 64 && !stonePos; y++) {
        for (let x = 0; x < 64 && !stonePos; x++) {
          if (world.tiles[y][x].type === 'stone') stonePos = { x, y }
        }
      }
      if (stonePos) {
        const v = createVillager('t', 'T', stonePos.x, stonePos.y)
        expect(MINE_STONE_ACTION.canPerform(v, world, { food: 0, wood: 0, stone: 0 }, { x: 32, y: 32 }, dayCtx)).toBe(true)
      }
    })

    it('gives stone when completed', () => {
      const world = new World(worldConfig)
      let stonePos: { x: number; y: number } | null = null
      for (let y = 0; y < 64 && !stonePos; y++) {
        for (let x = 0; x < 64 && !stonePos; x++) {
          if (world.tiles[y][x].type === 'stone') stonePos = { x, y }
        }
      }
      if (stonePos) {
        const v = createVillager('t', 'T', stonePos.x, stonePos.y)
        MINE_STONE_ACTION.complete(v, world, { food: 0, wood: 0, stone: 0 }, createRNG(42), { x: 32, y: 32 }, dayCtx)
        expect(v.carrying).not.toBeNull()
        expect(v.carrying!.type).toBe('stone')
        expect(v.carrying!.amount).toBeGreaterThanOrEqual(6)
        expect(v.carrying!.amount).toBeLessThanOrEqual(10)
      }
    })
  })

  describe('BUILD_SHELTER_ACTION', () => {
    it('requires 20 wood and being at campfire', () => {
      const v = createVillager('t', 'T', 32, 32)
      expect(BUILD_SHELTER_ACTION.canPerform(v, {} as World, { food: 0, wood: 20, stone: 0 }, { x: 32, y: 32 }, dayCtx)).toBe(true)
      expect(BUILD_SHELTER_ACTION.canPerform(v, {} as World, { food: 0, wood: 19, stone: 0 }, { x: 32, y: 32 }, dayCtx)).toBe(false)
    })

    it('deducts wood and sets _builtStructure marker', () => {
      const v = createVillager('t', 'T', 32, 32)
      const stockpile = { food: 0, wood: 30, stone: 0 }
      BUILD_SHELTER_ACTION.complete(v, {} as World, stockpile, createRNG(1), { x: 32, y: 32 }, dayCtx)
      expect(stockpile.wood).toBe(10)
      const built = (v as any)._builtStructure
      expect(built).toBeDefined()
      expect(built.type).toBe('shelter')
    })
  })

  describe('BUILD_STORAGE_ACTION', () => {
    it('requires 15 wood + 10 stone and being at campfire', () => {
      const v = createVillager('t', 'T', 32, 32)
      expect(BUILD_STORAGE_ACTION.canPerform(v, {} as World, { food: 0, wood: 15, stone: 10 }, { x: 32, y: 32 }, dayCtx)).toBe(true)
      expect(BUILD_STORAGE_ACTION.canPerform(v, {} as World, { food: 0, wood: 14, stone: 10 }, { x: 32, y: 32 }, dayCtx)).toBe(false)
      expect(BUILD_STORAGE_ACTION.canPerform(v, {} as World, { food: 0, wood: 15, stone: 9 }, { x: 32, y: 32 }, dayCtx)).toBe(false)
    })
  })

  describe('WARM_UP_ACTION', () => {
    it('restores warmth at campfire', () => {
      const v = createVillager('t', 'T', 32, 32)
      getNeed(v, NeedType.Warmth).current = 30
      WARM_UP_ACTION.complete(v, {} as World, { food: 0, wood: 0, stone: 0 }, createRNG(1), { x: 32, y: 32 }, dayCtx)
      expect(getNeed(v, NeedType.Warmth).current).toBe(55) // 30 + 25
    })

    it('restores more warmth at shelter', () => {
      const v = createVillager('t', 'T', 10, 10)
      getNeed(v, NeedType.Warmth).current = 30
      const shelterCtx: TickContext = { ...DEFAULT_CTX, structures: [{ type: 'shelter', position: { x: 10, y: 10 } }] }
      WARM_UP_ACTION.complete(v, {} as World, { food: 0, wood: 0, stone: 0 }, createRNG(1), { x: 32, y: 32 }, shelterCtx)
      expect(getNeed(v, NeedType.Warmth).current).toBe(60) // 30 + 30
    })
  })

  describe('action registry', () => {
    it('getActionDefinition returns correct action', () => {
      expect(getActionDefinition('forage')).toBe(FORAGE_ACTION)
      expect(getActionDefinition('eat')).toBe(EAT_ACTION)
      expect(getActionDefinition('idle')).toBe(IDLE_ACTION)
    })

    it('getAllActions returns all 18 registered actions', () => {
      const actions = getAllActions()
      const types = actions.map(a => a.type)
      expect(types).toContain('forage')
      expect(types).toContain('eat')
      expect(types).toContain('rest')
      expect(types).toContain('chop_wood')
      expect(types).toContain('haul')
      expect(types).toContain('fish')
      expect(types).toContain('idle')
      expect(types).toContain('mine_stone')
      expect(types).toContain('build_shelter')
      expect(types).toContain('build_storage')
      expect(types).toContain('warm_up')
      expect(types).toContain('flee')
      expect(types).toContain('build_watchtower')
      expect(types).toContain('build_farm')
      expect(types).toContain('build_wall')
      expect(types).toContain('build_well')
      expect(types).toContain('cool_down')
      expect(types).toContain('attack')
      expect(actions.length).toBe(18)
    })
  })
})
