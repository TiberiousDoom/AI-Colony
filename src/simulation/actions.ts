/**
 * Action system: definitions for all villager actions.
 */

import type { SeededRNG } from '../utils/seed.ts'
import type { Villager, VillagerAction, VillageStockpile, Position, Season } from './villager.ts'
import { getNeed, NeedType, clampNeed } from './villager.ts'
import type { World } from './world.ts'
import { TileType } from './world.ts'

export type TimeOfDay = 'day' | 'night'
export type { Season } from './villager.ts'

export interface StructureLike {
  type: string
  position: Position
}

/** Context threaded through every action call — supplements per-call params */
export interface TickContext {
  timeOfDay: TimeOfDay
  season: Season
  structures: StructureLike[]
}

/** Default TickContext for backward compatibility */
export const DEFAULT_CTX: TickContext = { timeOfDay: 'day', season: 'summer', structures: [] }

export interface ActionDefinition {
  type: VillagerAction
  /** Base ticks required to complete */
  duration: number
  /** Energy cost per tick */
  energyCostPerTick: number
  /** Returns effective duration accounting for night/winter penalties */
  getEffectiveDuration(ctx: TickContext): number
  /** Check if the villager can perform this action at its current position */
  canPerform(villager: Villager, world: World, stockpile: VillageStockpile, campfire: Position, ctx: TickContext): boolean
  /** Called when action completes */
  complete(villager: Villager, world: World, stockpile: VillageStockpile, rng: SeededRNG, campfire: Position, ctx: TickContext): void
}

/** Whether this action is an outdoor action affected by night/winter penalties */
function isOutdoor(type: VillagerAction): boolean {
  return type === 'forage' || type === 'chop_wood' || type === 'fish' || type === 'mine_stone'
}

function isAtStructureType(pos: Position, structures: StructureLike[], structureType: string): boolean {
  return structures.some(s => s.type === structureType &&
    Math.abs(s.position.x - pos.x) <= 1 && Math.abs(s.position.y - pos.y) <= 1)
}

function makeAction(
  type: VillagerAction,
  duration: number,
  energyCostPerTick: number,
  canPerform: (v: Villager, w: World, s: VillageStockpile, c: Position, ctx: TickContext) => boolean,
  complete: (v: Villager, w: World, s: VillageStockpile, rng: SeededRNG, c: Position, ctx: TickContext) => void,
): ActionDefinition {
  return {
    type,
    duration,
    energyCostPerTick,
    getEffectiveDuration(ctx: TickContext): number {
      if (!isOutdoor(type)) return duration
      let mult = 1
      if (ctx.timeOfDay === 'night') mult *= 1.5
      if (ctx.season === 'winter') mult *= 1.5
      return Math.ceil(duration * mult)
    },
    canPerform,
    complete,
  }
}

function isAtOrAdjacent(vx: number, vy: number, tx: number, ty: number): boolean {
  return Math.abs(vx - tx) <= 1 && Math.abs(vy - ty) <= 1
}

function isAdjacentToType(vx: number, vy: number, world: World, tileType: TileType): boolean {
  const dirs = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]
  for (const [dx, dy] of dirs) {
    const tile = world.getTile(vx + dx, vy + dy)
    if (tile && tile.type === tileType) return true
  }
  return false
}

function findAdjacentTileOfType(vx: number, vy: number, world: World, tileType: TileType, minResource = 0): { x: number; y: number } | null {
  const dirs = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]
  for (const [dx, dy] of dirs) {
    const tile = world.getTile(vx + dx, vy + dy)
    if (tile && tile.type === tileType && tile.resourceAmount > minResource) {
      return { x: vx + dx, y: vy + dy }
    }
  }
  return null
}

/** Apply seasonal yield modifier for forage (NOT fish — fish is season-immune) */
function applyForageYieldModifier(amount: number, season: Season): number {
  if (season === 'autumn') return Math.floor(amount * 1.5)
  if (season === 'winter') return Math.floor(amount * 0.75)
  return amount
}

// --- Action Definitions ---

export const FORAGE_ACTION = makeAction(
  'forage', 3, 1,
  (v, world) => {
    return findAdjacentTileOfType(v.position.x, v.position.y, world, TileType.Forest, 0) !== null
  },
  (v, world, _s, rng, _c, ctx) => {
    const tile = findAdjacentTileOfType(v.position.x, v.position.y, world, TileType.Forest, 0)
    if (!tile) return
    const worldTile = world.getTile(tile.x, tile.y)!
    const baseAmount = rng.nextInt(10, 15)
    const amount = applyForageYieldModifier(baseAmount, ctx.season)
    const harvested = Math.min(amount, worldTile.resourceAmount)
    worldTile.resourceAmount -= harvested
    v.carrying = { type: 'food', amount: harvested }
  },
)

export const EAT_ACTION = makeAction(
  'eat', 1, 0,
  (v, _w, stockpile, campfire) => {
    if (v.carrying && v.carrying.type === 'food' && v.carrying.amount >= 5) return true
    return isAtOrAdjacent(v.position.x, v.position.y, campfire.x, campfire.y) && stockpile.food >= 5
  },
  (v, _w, stockpile, _rng, campfire) => {
    const hunger = getNeed(v, NeedType.Hunger)
    hunger.current += 30
    clampNeed(hunger)

    if (v.carrying && v.carrying.type === 'food' && v.carrying.amount >= 5) {
      v.carrying.amount -= 5
      if (v.carrying.amount <= 0) v.carrying = null
    } else if (isAtOrAdjacent(v.position.x, v.position.y, campfire.x, campfire.y)) {
      stockpile.food = Math.max(0, stockpile.food - 5)
    }
  },
)

export const REST_ACTION = makeAction(
  'rest', 3, 0,
  () => true,
  (v, _w, _s, _rng, campfire, ctx) => {
    const energy = getNeed(v, NeedType.Energy)
    const atCampfire = isAtOrAdjacent(v.position.x, v.position.y, campfire.x, campfire.y)
    const atShelter = isAtStructureType(v.position, ctx.structures, 'shelter')

    if (atShelter) {
      energy.current += 30
    } else if (atCampfire) {
      energy.current += 20
    } else {
      energy.current += 15
    }
    clampNeed(energy)

    // Passive warmth restoration in winter at campfire/shelter
    if (ctx.season === 'winter' && (atCampfire || atShelter)) {
      const warmth = v.needs.get(NeedType.Warmth)
      if (warmth) {
        warmth.current += 5
        clampNeed(warmth)
      }
    }
  },
)

export const CHOP_WOOD_ACTION = makeAction(
  'chop_wood', 4, 2,
  (v, world) => {
    return findAdjacentTileOfType(v.position.x, v.position.y, world, TileType.Forest, 0) !== null
  },
  (v, world, _s, rng) => {
    const tile = findAdjacentTileOfType(v.position.x, v.position.y, world, TileType.Forest, 0)
    if (!tile) return
    const worldTile = world.getTile(tile.x, tile.y)!
    const amount = rng.nextInt(8, 12)
    const harvested = Math.min(amount, worldTile.resourceAmount)
    worldTile.resourceAmount -= harvested
    v.carrying = { type: 'wood', amount: harvested }
  },
)

export const HAUL_ACTION = makeAction(
  'haul', 1, 1,
  (v, _w, _s, campfire) => {
    return v.carrying !== null && !isAtOrAdjacent(v.position.x, v.position.y, campfire.x, campfire.y)
  },
  (v, _w, stockpile) => {
    if (v.carrying) {
      switch (v.carrying.type) {
        case 'food': stockpile.food += v.carrying.amount; break
        case 'wood': stockpile.wood += v.carrying.amount; break
        case 'stone': stockpile.stone += v.carrying.amount; break
      }
      v.carrying = null
    }
  },
)

export const FISH_ACTION = makeAction(
  'fish', 4, 1,
  (v, world) => {
    return isAdjacentToType(v.position.x, v.position.y, world, TileType.Water)
  },
  (v, _w, _s, rng) => {
    // Fish yield is NOT affected by seasonal modifiers — critical winter survival resource
    const amount = rng.nextInt(8, 12)
    v.carrying = { type: 'food', amount }
  },
)

export const IDLE_ACTION = makeAction(
  'idle', 1, 0,
  () => true,
  () => { /* no-op */ },
)

export const MINE_STONE_ACTION = makeAction(
  'mine_stone', 5, 2,
  (v, world) => {
    return findAdjacentTileOfType(v.position.x, v.position.y, world, TileType.Stone, 0) !== null
  },
  (v, world, _s, rng) => {
    const tile = findAdjacentTileOfType(v.position.x, v.position.y, world, TileType.Stone, 0)
    if (!tile) return
    const worldTile = world.getTile(tile.x, tile.y)!
    const amount = rng.nextInt(6, 10)
    const harvested = Math.min(amount, worldTile.resourceAmount)
    worldTile.resourceAmount -= harvested
    v.carrying = { type: 'stone', amount: harvested }
  },
)

export const BUILD_SHELTER_ACTION = makeAction(
  'build_shelter', 6, 2,
  (v, _w, stockpile, campfire, _ctx) => {
    if (stockpile.wood < 20) return false
    return isAtOrAdjacent(v.position.x, v.position.y, campfire.x, campfire.y)
  },
  (v, _w, stockpile, _rng, _campfire, _ctx) => {
    if (stockpile.wood < 20) return
    stockpile.wood -= 20
    // Engine picks up the _builtStructure marker
    ;(v as Villager & { _builtStructure?: { type: string; position: Position } })._builtStructure = {
      type: 'shelter',
      position: { ...v.position },
    }
  },
)

export const BUILD_STORAGE_ACTION = makeAction(
  'build_storage', 6, 2,
  (v, _w, stockpile, campfire, _ctx) => {
    if (stockpile.wood < 15 || stockpile.stone < 10) return false
    return isAtOrAdjacent(v.position.x, v.position.y, campfire.x, campfire.y)
  },
  (v, _w, stockpile, _rng, _campfire, _ctx) => {
    if (stockpile.wood < 15 || stockpile.stone < 10) return
    stockpile.wood -= 15
    stockpile.stone -= 10
    ;(v as Villager & { _builtStructure?: { type: string; position: Position } })._builtStructure = {
      type: 'storage',
      position: { ...v.position },
    }
  },
)

export const WARM_UP_ACTION = makeAction(
  'warm_up', 2, 0,
  () => true,
  (v, _w, _s, _rng, campfire, ctx) => {
    const warmth = v.needs.get(NeedType.Warmth)
    if (!warmth) return

    const atCampfire = isAtOrAdjacent(v.position.x, v.position.y, campfire.x, campfire.y)
    const atShelter = isAtStructureType(v.position, ctx.structures, 'shelter')

    if (atShelter) {
      warmth.current += 30
    } else if (atCampfire) {
      warmth.current += 25
    } else {
      warmth.current += 20
    }
    clampNeed(warmth)
  },
)

export const FLEE_ACTION = makeAction(
  'flee', 0, 2,
  () => true,
  () => { /* Movement handled by engine — no resource yield */ },
)

// --- Action Registry ---

const ACTION_MAP = new Map<VillagerAction, ActionDefinition>([
  ['forage', FORAGE_ACTION],
  ['eat', EAT_ACTION],
  ['rest', REST_ACTION],
  ['chop_wood', CHOP_WOOD_ACTION],
  ['haul', HAUL_ACTION],
  ['fish', FISH_ACTION],
  ['idle', IDLE_ACTION],
  ['mine_stone', MINE_STONE_ACTION],
  ['build_shelter', BUILD_SHELTER_ACTION],
  ['build_storage', BUILD_STORAGE_ACTION],
  ['warm_up', WARM_UP_ACTION],
  ['flee', FLEE_ACTION],
])

export function getActionDefinition(action: VillagerAction): ActionDefinition | undefined {
  return ACTION_MAP.get(action)
}

export function getAllActions(): ActionDefinition[] {
  return Array.from(ACTION_MAP.values())
}
