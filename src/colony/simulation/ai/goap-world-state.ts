/**
 * GOAP world state snapshot: reads actual game state into boolean predicates.
 */

import type { Villager } from '../villager.ts'
import { NeedType, getNeed } from '../villager.ts'
import { TileType } from '../world.ts'
import type { AIWorldView } from './ai-interface.ts'
import type { GOAPWorldState } from './goap-types.ts'

function isAtOrAdjacent(vx: number, vy: number, tx: number, ty: number): boolean {
  return Math.abs(vx - tx) <= 1 && Math.abs(vy - ty) <= 1
}

function isAdjacentToTileType(vx: number, vy: number, worldView: AIWorldView, tileType: TileType): boolean {
  const dirs = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]
  for (const [dx, dy] of dirs) {
    const tile = worldView.world.getTile(vx + dx, vy + dy)
    if (tile && tile.type === tileType) return true
  }
  return false
}

export function snapshotWorldState(villager: Readonly<Villager>, worldView: AIWorldView): GOAPWorldState {
  const vx = villager.position.x
  const vy = villager.position.y
  const camp = worldView.campfirePosition

  const hunger = getNeed(villager as Villager, NeedType.Hunger)
  const energy = getNeed(villager as Villager, NeedType.Energy)
  const health = getNeed(villager as Villager, NeedType.Health)
  const warmth = getNeed(villager as Villager, NeedType.Warmth)

  // Check for nearby predator
  let predatorNearby = false
  for (const event of worldView.activeEvents) {
    if (event.type === 'predator') {
      const px = camp.x + event.relativePosition.dx
      const py = camp.y + event.relativePosition.dy
      const dist = Math.abs(vx - px) + Math.abs(vy - py)
      if (dist <= 8) {
        predatorNearby = true
        break
      }
    }
  }

  return {
    at_campfire: isAtOrAdjacent(vx, vy, camp.x, camp.y),
    at_forest: isAdjacentToTileType(vx, vy, worldView, TileType.Forest),
    at_stone: isAdjacentToTileType(vx, vy, worldView, TileType.Stone),
    at_water: isAdjacentToTileType(vx, vy, worldView, TileType.Water),
    at_fertile: isAdjacentToTileType(vx, vy, worldView, TileType.FertileSoil),

    has_food: villager.carrying?.type === 'food',
    has_wood: villager.carrying?.type === 'wood',
    has_stone: villager.carrying?.type === 'stone',
    carrying_any: villager.carrying !== null,

    stockpile_has_food: worldView.stockpile.food >= 5,
    stockpile_has_wood: worldView.stockpile.wood > 0,
    stockpile_has_stone: worldView.stockpile.stone > 0,
    stockpile_food_low: worldView.stockpile.food < 30,
    stockpile_wood_low: worldView.stockpile.wood < 20,

    hunger_satisfied: hunger.current > 50,
    energy_satisfied: energy.current > 50,
    health_satisfied: health.current > 50,
    warmth_satisfied: worldView.season !== 'winter' || warmth.current > 50,

    needs_building: (() => {
      const pop = worldView.villagers.filter(v => v.alive).length
      const shelterCount = worldView.structures.filter(s => s.type === 'shelter').length
      if (pop > shelterCount * 3) return true
      if (!worldView.structures.some(s => s.type === 'storage')) return true
      return false
    })(),

    has_weapon: villager.equipment.weapon !== null,
    has_armor: villager.equipment.armor !== null,
    predator_nearby: predatorNearby,
    monster_nearby: (worldView.monsters ?? []).some(m => {
      const dist = Math.abs(vx - m.position.x) + Math.abs(vy - m.position.y)
      return dist <= 6 && m.behaviorState !== 'dead'
    }),
    monster_threatening: (worldView.monsters ?? []).some(m =>
      m.behaviorState === 'chasing' || m.behaviorState === 'attacking',
    ),
    is_sick: (villager as Villager).statusEffects?.some(e => e.type === 'illness') ?? false,
  }
}
