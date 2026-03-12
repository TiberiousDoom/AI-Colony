/**
 * GOAP action definitions. Each maps 1:1 to a VillagerAction.
 * No separate "GoTo" actions — the engine handles pathfinding automatically.
 */

import type { Villager, Position } from '../villager.ts'
import { TileType } from '../world.ts'
import type { AIWorldView } from './ai-interface.ts'
import type { GOAPAction } from './goap-types.ts'
import { getNeed, NeedType } from '../villager.ts'
import { findNearestMonsterToVillager, countAlliesNearMonster } from '../monster.ts'

// --- Target finders (reusable) ---

function findNearestForest(villager: Readonly<Villager>, worldView: AIWorldView): Position | undefined {
  const tiles = worldView.world.findTilesInRadius(
    villager.position.x, villager.position.y, 15,
    t => t.type === TileType.Forest && t.resourceAmount > 0,
  )
  if (tiles.length === 0) return undefined
  tiles.sort((a, b) => {
    const da = Math.abs(a.x - villager.position.x) + Math.abs(a.y - villager.position.y)
    const db = Math.abs(b.x - villager.position.x) + Math.abs(b.y - villager.position.y)
    return da - db
  })
  return { x: tiles[0].x, y: tiles[0].y }
}

function findNearestStone(villager: Readonly<Villager>, worldView: AIWorldView): Position | undefined {
  const tiles = worldView.world.findTilesInRadius(
    villager.position.x, villager.position.y, 15,
    t => t.type === TileType.Stone && t.resourceAmount > 0,
  )
  if (tiles.length === 0) return undefined
  tiles.sort((a, b) => {
    const da = Math.abs(a.x - villager.position.x) + Math.abs(a.y - villager.position.y)
    const db = Math.abs(b.x - villager.position.x) + Math.abs(b.y - villager.position.y)
    return da - db
  })
  return { x: tiles[0].x, y: tiles[0].y }
}

function findNearestWaterAdjacent(villager: Readonly<Villager>, worldView: AIWorldView): Position | undefined {
  const tiles = worldView.world.findTilesInRadius(
    villager.position.x, villager.position.y, 15,
    t => t.type === TileType.Water,
  )
  const candidates: Position[] = []
  for (const waterTile of tiles) {
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]]
    for (const [dx, dy] of dirs) {
      if (worldView.world.isPassable(waterTile.x + dx, waterTile.y + dy)) {
        candidates.push({ x: waterTile.x + dx, y: waterTile.y + dy })
      }
    }
  }
  if (candidates.length === 0) return undefined
  candidates.sort((a, b) => {
    const da = Math.abs(a.x - villager.position.x) + Math.abs(a.y - villager.position.y)
    const db = Math.abs(b.x - villager.position.x) + Math.abs(b.y - villager.position.y)
    return da - db
  })
  return candidates[0]
}

function findNearestFertile(villager: Readonly<Villager>, worldView: AIWorldView): Position | undefined {
  const tiles = worldView.world.findTilesInRadius(
    villager.position.x, villager.position.y, 15,
    t => t.type === TileType.FertileSoil,
  )
  if (tiles.length === 0) return undefined
  tiles.sort((a, b) => {
    const da = Math.abs(a.x - villager.position.x) + Math.abs(a.y - villager.position.y)
    const db = Math.abs(b.x - villager.position.x) + Math.abs(b.y - villager.position.y)
    return da - db
  })
  return { x: tiles[0].x, y: tiles[0].y }
}

function campfireTarget(_v: Readonly<Villager>, wv: AIWorldView): Position | undefined {
  return { ...wv.campfirePosition }
}

function fleeTarget(villager: Readonly<Villager>, wv: AIWorldView): Position | undefined {
  const predator = wv.activeEvents.find(e => e.type === 'predator')
  if (predator) {
    const px = wv.campfirePosition.x + predator.relativePosition.dx
    const py = wv.campfirePosition.y + predator.relativePosition.dy
    const dx = villager.position.x - px
    const dy = villager.position.y - py
    const targetX = Math.max(0, Math.min(wv.world.width - 1, villager.position.x + Math.sign(dx) * 8))
    const targetY = Math.max(0, Math.min(wv.world.height - 1, villager.position.y + Math.sign(dy) * 8))
    return { x: targetX, y: targetY }
  }
  return { ...wv.campfirePosition }
}

// --- Action Definitions ---

export const GOAP_ACTIONS: GOAPAction[] = [
  // Gathering — no location preconditions; engine handles pathfinding via targetFinder
  {
    name: 'Forage',
    preconditions: {},
    effects: { has_food: true, carrying_any: true },
    cost: 4,
    villagerAction: 'forage',
    targetFinder: findNearestForest,
    runtimeCheck: (v, wv) => findNearestForest(v, wv) !== undefined,
  },
  {
    name: 'ChopWood',
    preconditions: {},
    effects: { has_wood: true, carrying_any: true },
    cost: 5,
    villagerAction: 'chop_wood',
    targetFinder: findNearestForest,
    runtimeCheck: (v, wv) => findNearestForest(v, wv) !== undefined,
  },
  {
    name: 'MineStone',
    preconditions: {},
    effects: { has_stone: true, carrying_any: true },
    cost: 6,
    villagerAction: 'mine_stone',
    targetFinder: findNearestStone,
    runtimeCheck: (v, wv) => findNearestStone(v, wv) !== undefined,
  },
  {
    name: 'Fish',
    preconditions: {},
    effects: { has_food: true, carrying_any: true },
    cost: 5,
    villagerAction: 'fish',
    targetFinder: findNearestWaterAdjacent,
    runtimeCheck: (v, wv) => findNearestWaterAdjacent(v, wv) !== undefined,
  },

  // Logistics
  {
    name: 'Haul',
    preconditions: { carrying_any: true },
    effects: {
      carrying_any: false,
      stockpile_has_food: true,
      stockpile_has_wood: true,
      stockpile_has_stone: true,
      stockpile_food_low: false,
      stockpile_wood_low: false,
    },
    cost: 2,
    villagerAction: 'haul',
    targetFinder: campfireTarget,
  },

  // Survival
  {
    name: 'Eat',
    preconditions: { stockpile_has_food: true },
    effects: { hunger_satisfied: true },
    cost: 1,
    villagerAction: 'eat',
    targetFinder: campfireTarget,
  },
  {
    name: 'Rest',
    preconditions: {},
    effects: { energy_satisfied: true },
    cost: 3,
    villagerAction: 'rest',
    targetFinder: campfireTarget,
  },
  {
    name: 'WarmUp',
    preconditions: {},
    effects: { warmth_satisfied: true },
    cost: 2,
    villagerAction: 'warm_up',
    targetFinder: campfireTarget,
  },
  {
    name: 'Flee',
    preconditions: {},
    effects: { predator_nearby: false, monster_nearby: false },
    cost: 0,
    villagerAction: 'flee',
    targetFinder: (villager, wv) => {
      // Flee from nearest monster first, then predator events
      const monster = findNearestMonsterToVillager(villager, wv.monsters)
      if (monster) {
        const dx = villager.position.x - monster.position.x
        const dy = villager.position.y - monster.position.y
        const targetX = Math.max(0, Math.min(wv.world.width - 1, villager.position.x + Math.sign(dx) * 8))
        const targetY = Math.max(0, Math.min(wv.world.height - 1, villager.position.y + Math.sign(dy) * 8))
        return { x: targetX, y: targetY }
      }
      return fleeTarget(villager, wv)
    },
    runtimeCheck: (_v, wv) => (wv.monsters ?? []).some(m => m.behaviorState !== 'dead') || wv.activeEvents.some(e => e.type === 'predator'),
  },
  {
    name: 'AttackMonster',
    preconditions: { monster_nearby: true },
    effects: { monster_threatening: false },
    cost: (_state, wv, villager) => {
      const health = getNeed(villager as Villager, NeedType.Health)
      const monster = findNearestMonsterToVillager(villager, wv.monsters)
      if (!monster) return 20
      const allies = countAlliesNearMonster(monster.position, wv.villagers)
      if (health.current > 40 && allies >= 2) return 2
      if (health.current < 30) return 20
      return 8
    },
    villagerAction: 'attack',
    targetFinder: (villager, wv) => {
      const monster = findNearestMonsterToVillager(villager, wv.monsters)
      return monster ? { x: monster.position.x, y: monster.position.y } : undefined
    },
    runtimeCheck: (_v, wv) => (wv.monsters ?? []).some(m => m.behaviorState !== 'dead'),
  },

  // Building
  {
    name: 'BuildShelter',
    preconditions: {},
    effects: { needs_building: false },
    cost: 7,
    villagerAction: 'build_shelter',
    targetFinder: campfireTarget,
    runtimeCheck: (_v, wv) => wv.stockpile.wood >= 20,
  },
  {
    name: 'BuildStorage',
    preconditions: {},
    effects: { needs_building: false },
    cost: 7,
    villagerAction: 'build_storage',
    targetFinder: campfireTarget,
    runtimeCheck: (_v, wv) => wv.stockpile.wood >= 15 && wv.stockpile.stone >= 10,
  },
  {
    name: 'BuildWatchtower',
    preconditions: {},
    effects: { needs_building: false },
    cost: 9,
    villagerAction: 'build_watchtower',
    targetFinder: campfireTarget,
    runtimeCheck: (_v, wv) => wv.stockpile.wood >= 10 && wv.stockpile.stone >= 15,
  },
  {
    name: 'BuildFarm',
    preconditions: {},
    effects: { needs_building: false },
    cost: 7,
    villagerAction: 'build_farm',
    targetFinder: findNearestFertile,
    runtimeCheck: (_v, wv) => wv.stockpile.wood >= 15,
  },
  {
    name: 'BuildWall',
    preconditions: {},
    effects: { needs_building: false },
    cost: 5,
    villagerAction: 'build_wall',
    targetFinder: campfireTarget,
    runtimeCheck: (_v, wv) => wv.stockpile.stone >= 12,
  },
  {
    name: 'BuildWell',
    preconditions: {},
    effects: { needs_building: false },
    cost: 9,
    villagerAction: 'build_well',
    targetFinder: campfireTarget,
    runtimeCheck: (_v, wv) => wv.stockpile.stone >= 20,
  },
]
