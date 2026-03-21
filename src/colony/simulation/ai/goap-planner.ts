/**
 * GOAP A* backward search planner.
 *
 * Searches backward from the goal state: starts with unsatisfied goal predicates,
 * finds actions whose effects satisfy them, and adds those actions' preconditions
 * as new subgoals. Returns the cheapest action sequence.
 */

import type { Villager } from '../villager.ts'
import type { AIWorldView } from './ai-interface.ts'
import type { GOAPWorldState, GOAPAction, GOAPGoal, GOAPPlan } from './goap-types.ts'

const MAX_NODES = 20

interface PlanNode {
  /** Predicates still unsatisfied */
  unsatisfied: Partial<GOAPWorldState>
  /** Actions chosen so far (in reverse order — first action is last in array) */
  actions: GOAPAction[]
  /** Total cost */
  cost: number
}

/** Check if all predicates in `desired` match `current` */
function isStateSatisfied(current: GOAPWorldState, desired: Partial<GOAPWorldState>): boolean {
  for (const [key, value] of Object.entries(desired)) {
    if (current[key as keyof GOAPWorldState] !== value) return false
  }
  return true
}

/** Get the unsatisfied predicates from desired given current state */
function getUnsatisfied(current: GOAPWorldState, desired: Partial<GOAPWorldState>): Partial<GOAPWorldState> {
  const result: Partial<GOAPWorldState> = {}
  for (const [key, value] of Object.entries(desired)) {
    if (current[key as keyof GOAPWorldState] !== value) {
      (result as Record<string, boolean>)[key] = value as boolean
    }
  }
  return result
}

/** Check if an action's effects satisfy at least one unsatisfied predicate */
function actionSatisfiesAny(action: GOAPAction, unsatisfied: Partial<GOAPWorldState>): boolean {
  for (const [key, value] of Object.entries(unsatisfied)) {
    if (key in action.effects && action.effects[key as keyof GOAPWorldState] === value) {
      return true
    }
  }
  return false
}

/** Apply an action's effects and remove satisfied predicates, then add preconditions as new unsatisfied */
function applyActionBackward(
  unsatisfied: Partial<GOAPWorldState>,
  action: GOAPAction,
  currentState: GOAPWorldState,
): Partial<GOAPWorldState> {
  const next: Partial<GOAPWorldState> = { ...unsatisfied }

  // Remove predicates that this action's effects satisfy
  for (const [key, value] of Object.entries(action.effects)) {
    if (key in next && next[key as keyof GOAPWorldState] === value) {
      delete (next as Record<string, unknown>)[key]
    }
  }

  // Add action's preconditions as new unsatisfied (if not already satisfied by current state)
  for (const [key, value] of Object.entries(action.preconditions)) {
    if (currentState[key as keyof GOAPWorldState] !== value) {
      (next as Record<string, boolean>)[key] = value as boolean
    }
  }

  return next
}

function getActionCost(
  action: GOAPAction,
  state: GOAPWorldState,
  worldView: AIWorldView,
  villager: Readonly<Villager>,
): number {
  if (typeof action.cost === 'function') {
    return action.cost(state, worldView, villager)
  }
  return action.cost
}

/** Plan a sequence of actions to achieve a goal from the current state */
export function planActions(
  currentState: GOAPWorldState,
  goal: GOAPGoal,
  actions: GOAPAction[],
  villager: Readonly<Villager>,
  worldView: AIWorldView,
): GOAPPlan | null {
  // Check if goal is already satisfied
  if (isStateSatisfied(currentState, goal.desiredState)) {
    return null
  }

  const unsatisfied = getUnsatisfied(currentState, goal.desiredState)
  if (Object.keys(unsatisfied).length === 0) return null

  // BFS/A* with cost ordering
  const openList: PlanNode[] = [{
    unsatisfied,
    actions: [],
    cost: 0,
  }]

  let nodesExpanded = 0

  while (openList.length > 0 && nodesExpanded < MAX_NODES) {
    // Sort by cost (cheapest first)
    openList.sort((a, b) => a.cost - b.cost)
    const current = openList.shift()!
    nodesExpanded++

    // Check if all predicates are satisfied
    if (Object.keys(current.unsatisfied).length === 0) {
      // Plan found! Reverse the actions (they were added in backward order)
      const steps = current.actions.reverse()
      return {
        goal,
        steps,
        totalCost: current.cost,
        currentStep: 0,
      }
    }

    // Try each action
    for (const action of actions) {
      // Skip if action doesn't help
      if (!actionSatisfiesAny(action, current.unsatisfied)) continue

      // Skip if runtime check fails
      if (action.runtimeCheck && !action.runtimeCheck(villager, worldView)) continue

      // Apply action backward
      const nextUnsatisfied = applyActionBackward(current.unsatisfied, action, currentState)
      const actionCost = getActionCost(action, currentState, worldView, villager)

      // Avoid duplicate actions in a plan (simple cycle prevention)
      if (current.actions.some(a => a.name === action.name)) continue

      openList.push({
        unsatisfied: nextUnsatisfied,
        actions: [...current.actions, action],
        cost: current.cost + actionCost,
      })
    }
  }

  return null // No plan found within budget
}
