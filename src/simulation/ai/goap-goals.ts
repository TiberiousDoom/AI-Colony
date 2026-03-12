/**
 * GOAP goal definitions with utility-style priority scoring.
 */

import type { Villager } from '../villager.ts'
import { NeedType, getNeed } from '../villager.ts'
import type { AIWorldView } from './ai-interface.ts'
import type { GOAPGoal, GOAPWorldState } from './goap-types.ts'
import { findNearestMonsterToVillager, countAlliesNearMonster, shouldFight } from '../monster.ts'

export const GOAP_GOALS: GOAPGoal[] = [
  {
    name: 'FleeFromDanger',
    desiredState: { predator_nearby: false, monster_nearby: false },
    priority: (villager, wv, state) => {
      if (state.monster_nearby) {
        const health = getNeed(villager as Villager, NeedType.Health)
        const monster = findNearestMonsterToVillager(villager, wv.monsters)
        if (monster) {
          const allies = countAlliesNearMonster(monster.position, wv.villagers)
          if (!shouldFight(health.current, monster, allies)) return 2.0
        }
      }
      return state.predator_nearby ? 2.0 : 0
    },
  },
  {
    name: 'DefendVillage',
    desiredState: { monster_threatening: false },
    priority: (villager, wv, state) => {
      if (!state.monster_nearby) return 0
      const health = getNeed(villager as Villager, NeedType.Health)
      const monster = findNearestMonsterToVillager(villager, wv.monsters)
      if (!monster) return 0
      const allies = countAlliesNearMonster(monster.position, wv.villagers)
      if (shouldFight(health.current, monster, allies)) return 1.8
      return 0
    },
  },
  {
    name: 'SurviveHunger',
    desiredState: { hunger_satisfied: true },
    priority: (villager) => {
      const hunger = getNeed(villager as Villager, NeedType.Hunger)
      const normalized = 1 - hunger.current / 100
      return normalized * normalized * 1.0
    },
  },
  {
    name: 'SurviveEnergy',
    desiredState: { energy_satisfied: true },
    priority: (villager) => {
      const energy = getNeed(villager as Villager, NeedType.Energy)
      const normalized = 1 - energy.current / 100
      return normalized * normalized * 0.8
    },
  },
  {
    name: 'SurviveWarmth',
    desiredState: { warmth_satisfied: true },
    priority: (villager, worldView) => {
      if (worldView.season !== 'winter') return 0
      const warmth = getNeed(villager as Villager, NeedType.Warmth)
      const normalized = 1 - warmth.current / 100
      return normalized * normalized * 0.9
    },
  },
  {
    name: 'StockpileFood',
    desiredState: { stockpile_food_low: false },
    priority: (_v, wv, state) => {
      if (!state.stockpile_food_low) return 0
      return wv.stockpile.food < 10 ? 0.6 : 0.3
    },
  },
  {
    name: 'StockpileWood',
    desiredState: { stockpile_wood_low: false },
    priority: (_v, wv, state) => {
      if (!state.stockpile_wood_low) return 0
      return wv.stockpile.wood < 5 ? 0.4 : 0.2
    },
  },
  {
    name: 'BuildInfrastructure',
    desiredState: { needs_building: false },
    priority: (_v, wv) => {
      // Low priority: only when basic needs met and resources available
      const pop = wv.villagers.filter(v => v.alive).length
      const shelterCount = wv.structures.filter(s => s.type === 'shelter').length
      if (pop > shelterCount * 3 && wv.stockpile.wood >= 20) return 0.25
      const hasStorage = wv.structures.some(s => s.type === 'storage')
      if (!hasStorage && wv.stockpile.wood >= 15 && wv.stockpile.stone >= 10) return 0.2
      return 0.05
    },
  },
]

/** Select the highest-priority goal given the current state */
export function selectGoal(
  villager: Readonly<Villager>,
  worldView: AIWorldView,
  state: GOAPWorldState,
): GOAPGoal {
  let bestGoal = GOAP_GOALS[GOAP_GOALS.length - 1]
  let bestPriority = -Infinity

  for (const goal of GOAP_GOALS) {
    // Skip goals already satisfied
    const satisfied = Object.entries(goal.desiredState).every(
      ([key, value]) => state[key as keyof GOAPWorldState] === value,
    )
    if (satisfied && Object.keys(goal.desiredState).length > 0) continue

    const priority = goal.priority(villager, worldView, state)
    if (priority > bestPriority) {
      bestPriority = priority
      bestGoal = goal
    }
  }

  return bestGoal
}
