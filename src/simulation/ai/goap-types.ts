/**
 * GOAP (Goal-Oriented Action Planning) type definitions.
 */

import type { Villager, VillagerAction, Position } from '../villager.ts'
import type { AIWorldView } from './ai-interface.ts'

/** Boolean predicate world state for GOAP planning */
export interface GOAPWorldState {
  // Location
  at_campfire: boolean
  at_forest: boolean
  at_stone: boolean
  at_water: boolean
  at_fertile: boolean

  // Inventory
  has_food: boolean
  has_wood: boolean
  has_stone: boolean
  carrying_any: boolean

  // Village stockpile thresholds
  stockpile_has_food: boolean
  stockpile_has_wood: boolean
  stockpile_has_stone: boolean
  stockpile_food_low: boolean
  stockpile_wood_low: boolean

  // Need thresholds (satisfied = above 50)
  hunger_satisfied: boolean
  energy_satisfied: boolean
  health_satisfied: boolean
  warmth_satisfied: boolean

  // Situational
  predator_nearby: boolean
  is_sick: boolean
}

/** A GOAP action that maps to a single VillagerAction */
export interface GOAPAction {
  name: string
  /** Partial world state that must be true for this action */
  preconditions: Partial<GOAPWorldState>
  /** Partial world state changes caused by this action */
  effects: Partial<GOAPWorldState>
  /** Static or dynamic cost */
  cost: number | ((state: GOAPWorldState, worldView: AIWorldView, villager: Readonly<Villager>) => number)
  /** The engine-level action to emit */
  villagerAction: VillagerAction
  /** Compute the target position for pathfinding */
  targetFinder: (villager: Readonly<Villager>, worldView: AIWorldView) => Position | undefined
  /** Optional runtime check for conditions not in world state (e.g., affordability) */
  runtimeCheck?: (villager: Readonly<Villager>, worldView: AIWorldView) => boolean
}

/** A GOAP goal with a desired state and priority function */
export interface GOAPGoal {
  name: string
  /** The desired world state predicates */
  desiredState: Partial<GOAPWorldState>
  /** Priority function: higher = more urgent (0-2 range typically) */
  priority: (villager: Readonly<Villager>, worldView: AIWorldView, state: GOAPWorldState) => number
}

/** A computed plan: sequence of actions to achieve a goal */
export interface GOAPPlan {
  goal: GOAPGoal
  steps: GOAPAction[]
  totalCost: number
  currentStep: number
}
