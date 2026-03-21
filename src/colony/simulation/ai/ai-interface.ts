/**
 * Shared AI interface that all AI systems must implement.
 */

import type { SeededRNG } from '../../../shared/seed.ts'
import type { Villager, VillagerAction, VillageStockpile, Position, Season } from '../villager.ts'
import type { World } from '../world.ts'
import type { TimeOfDay, StructureLike } from '../actions.ts'

export interface MonsterLike {
  id: string
  type: string
  hp: number
  maxHp: number
  damage: number
  position: { x: number; y: number }
  behaviorState: string
  targetVillagerId: string | null
}

export interface RandomEventLike {
  type: string
  relativePosition: { dx: number; dy: number }
  radius: number
  durationTicks: number
  severity: number
}

export interface AIDecision {
  action: VillagerAction
  /** Target tile for the action */
  targetPosition?: Position
  /** Reasoning string for inspector/debug display */
  reason: string
  /** Optional: scoring breakdown for inspector display (Utility AI populates this, BT AI omits it) */
  scores?: Array<{ action: string; score: number; reason: string }>
  /** Optional: GOAP plan visualization data */
  goapPlan?: {
    goal: string
    steps: Array<{ action: string; cost: number; completed: boolean }>
    totalCost: number
    currentStepIndex: number
  }
}

/** Read-only snapshot of world state visible to the AI */
export interface AIWorldView {
  world: World
  stockpile: Readonly<VillageStockpile>
  villagers: ReadonlyArray<Readonly<Villager>>
  tick: number
  timeOfDay: TimeOfDay
  campfirePosition: Position
  season: Season
  structures: ReadonlyArray<Readonly<StructureLike>>
  activeEvents: ReadonlyArray<Readonly<RandomEventLike>>
  monsters: ReadonlyArray<Readonly<MonsterLike>>
  villageId: string
}

export interface IAISystem {
  /** Unique identifier for this AI type */
  readonly name: string
  /** Choose an action for the given villager */
  decide(villager: Readonly<Villager>, worldView: AIWorldView, rng: SeededRNG): AIDecision
}
