/**
 * Action system: definitions for all Phase 1 villager actions.
 */

import type { SeededRNG } from '../utils/seed.ts'
import type { Villager, VillagerAction, VillageStockpile, Position } from './villager.ts'
import { getNeed, NeedType, clampNeed } from './villager.ts'
import type { World } from './world.ts'
import { TileType } from './world.ts'

export type TimeOfDay = 'day' | 'night'

export interface ActionDefinition {
  type: VillagerAction
  /** Base ticks required to complete */
  duration: number
  /** Energy cost per tick */
  energyCostPerTick: number
  /** Returns effective duration accounting for night penalty */
  getEffectiveDuration(timeOfDay: TimeOfDay): number
  /** Check if the villager can perform this action at its current position */
  canPerform(villager: Villager, world: World, stockpile: VillageStockpile, campfire: Position): boolean
  /** Called when action completes */
  complete(villager: Villager, world: World, stockpile: VillageStockpile, rng: SeededRNG, campfire: Position): void
}

/** Whether this action is an outdoor action affected by night penalty */
function isOutdoor(type: VillagerAction): boolean {
  return type === 'forage' || type === 'chop_wood' || type === 'fish'
}

function makeAction(
  type: VillagerAction,
  duration: number,
  energyCostPerTick: number,
  canPerform: (v: Villager, w: World, s: VillageStockpile, c: Position) => boolean,
  complete: (v: Villager, w: World, s: VillageStockpile, rng: SeededRNG, c: Position) => void,
): ActionDefinition {
  return {
    type,
    duration,
    energyCostPerTick,
    getEffectiveDuration(timeOfDay: TimeOfDay): number {
      if (timeOfDay === 'night' && isOutdoor(type)) {
        return Math.ceil(duration * 1.5)
      }
      return duration
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

// --- Action Definitions ---

export const FORAGE_ACTION = makeAction(
  'forage', 3, 1,
  (v, world) => {
    return findAdjacentTileOfType(v.position.x, v.position.y, world, TileType.Forest, 0) !== null
  },
  (v, world, _s, rng) => {
    const tile = findAdjacentTileOfType(v.position.x, v.position.y, world, TileType.Forest, 0)
    if (!tile) return
    const worldTile = world.getTile(tile.x, tile.y)!
    const amount = rng.nextInt(10, 15)
    const harvested = Math.min(amount, worldTile.resourceAmount)
    worldTile.resourceAmount -= harvested
    v.carrying = { type: 'food', amount: harvested }
  },
)

export const EAT_ACTION = makeAction(
  'eat', 1, 0,
  (v, _w, stockpile, campfire) => {
    // Can eat from carried food anywhere
    if (v.carrying && v.carrying.type === 'food' && v.carrying.amount >= 5) return true
    // Can eat from stockpile only at campfire
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
  () => true, // Can rest anywhere
  (v, _w, _s, _rng, campfire) => {
    const energy = getNeed(v, NeedType.Energy)
    const atCampfire = isAtOrAdjacent(v.position.x, v.position.y, campfire.x, campfire.y)
    energy.current += atCampfire ? 20 : 15
    clampNeed(energy)
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
    // Deposit carried resources into stockpile
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
    const amount = rng.nextInt(8, 12)
    v.carrying = { type: 'food', amount }
  },
)

export const IDLE_ACTION = makeAction(
  'idle', 1, 0,
  () => true,
  () => { /* no-op */ },
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
])

export function getActionDefinition(action: VillagerAction): ActionDefinition | undefined {
  return ACTION_MAP.get(action)
}

export function getAllActions(): ActionDefinition[] {
  return Array.from(ACTION_MAP.values())
}
