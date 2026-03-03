/**
 * Shared AI interface that all AI systems must implement.
 */

import type { SeededRNG } from '../../utils/seed.ts'
import type { Villager, VillagerAction, VillageStockpile, Position } from '../villager.ts'
import type { World } from '../world.ts'
import type { TimeOfDay } from '../actions.ts'

export interface AIDecision {
  action: VillagerAction
  /** Target tile for the action */
  targetPosition?: Position
  /** Reasoning string for inspector/debug display */
  reason: string
}

/** Read-only snapshot of world state visible to the AI */
export interface AIWorldView {
  world: World
  stockpile: Readonly<VillageStockpile>
  villagers: ReadonlyArray<Readonly<Villager>>
  tick: number
  timeOfDay: TimeOfDay
  campfirePosition: Position
}

export interface IAISystem {
  /** Unique identifier for this AI type */
  readonly name: string
  /** Choose an action for the given villager */
  decide(villager: Readonly<Villager>, worldView: AIWorldView, rng: SeededRNG): AIDecision
}
