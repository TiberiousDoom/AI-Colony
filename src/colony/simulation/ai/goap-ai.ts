/**
 * GOAP AI: Goal-Oriented Action Planning implementation of IAISystem.
 *
 * Plans multi-step action sequences, executes them step by step,
 * and replans when conditions change or higher-priority goals emerge.
 */

import type { SeededRNG } from '../../../shared/seed.ts'
import type { IAISystem, AIDecision, AIWorldView } from './ai-interface.ts'
import type { Villager } from '../villager.ts'
import type { GOAPPlan, GOAPWorldState } from './goap-types.ts'
import { snapshotWorldState } from './goap-world-state.ts'
import { GOAP_ACTIONS } from './goap-actions.ts'
import { selectGoal } from './goap-goals.ts'
import { planActions } from './goap-planner.ts'

export class GOAPAI implements IAISystem {
  readonly name = 'GOAP'

  /** Per-villager plan state */
  private plans: Map<string, GOAPPlan> = new Map()
  /** Per-villager replan cooldown (ticks remaining) */
  private replanCooldowns: Map<string, number> = new Map()

  decide(villager: Readonly<Villager>, worldView: AIWorldView, _rng: SeededRNG): AIDecision {
    const currentState = snapshotWorldState(villager, worldView)

    // Clean up dead villagers
    if (!villager.alive) {
      this.plans.delete(villager.id)
      this.replanCooldowns.delete(villager.id)
      return { action: 'idle', reason: 'GOAP: dead' }
    }

    const existingPlan = this.plans.get(villager.id)
    const cooldown = this.replanCooldowns.get(villager.id) ?? 0

    // Check if existing plan is still valid
    if (existingPlan && existingPlan.currentStep < existingPlan.steps.length) {
      const currentStepAction = existingPlan.steps[existingPlan.currentStep]

      // Check if a higher-priority goal has emerged
      const shouldReplan = this.shouldReplan(villager, worldView, currentState, existingPlan, cooldown)

      if (!shouldReplan) {
        // Check preconditions of current step
        const precsValid = this.checkPreconditions(currentStepAction.preconditions, currentState)
        const runtimeValid = !currentStepAction.runtimeCheck || currentStepAction.runtimeCheck(villager, worldView)

        if (precsValid && runtimeValid) {
          // Current step is valid — execute it
          const target = currentStepAction.targetFinder(villager, worldView)

          // Advance step if villager is idle (meaning previous step completed)
          if (villager.currentAction === 'idle' && existingPlan.currentStep > 0) {
            // Previous step completed, advance
          }

          return this.buildDecision(existingPlan, currentStepAction, target)
        }

        // Preconditions failed — try to advance to next step or replan
        existingPlan.currentStep++
        if (existingPlan.currentStep < existingPlan.steps.length) {
          const nextStep = existingPlan.steps[existingPlan.currentStep]
          const nextPrecsValid = this.checkPreconditions(nextStep.preconditions, currentState)
          const nextRuntimeValid = !nextStep.runtimeCheck || nextStep.runtimeCheck(villager, worldView)
          if (nextPrecsValid && nextRuntimeValid) {
            const target = nextStep.targetFinder(villager, worldView)
            return this.buildDecision(existingPlan, nextStep, target)
          }
        }
      }
    }

    // Decrement cooldown
    if (cooldown > 0) {
      this.replanCooldowns.set(villager.id, cooldown - 1)
    }

    // Need a new plan
    const goal = selectGoal(villager, worldView, currentState)
    const plan = planActions(currentState, goal, GOAP_ACTIONS, villager, worldView)

    if (plan && plan.steps.length > 0) {
      this.plans.set(villager.id, plan)
      this.replanCooldowns.set(villager.id, 2)

      const firstStep = plan.steps[0]
      const target = firstStep.targetFinder(villager, worldView)
      return this.buildDecision(plan, firstStep, target)
    }

    // No plan found — idle
    this.plans.delete(villager.id)
    return {
      action: 'idle',
      reason: `GOAP: no plan for ${goal.name}`,
      goapPlan: {
        goal: goal.name,
        steps: [],
        totalCost: 0,
        currentStepIndex: 0,
      },
    }
  }

  private shouldReplan(
    villager: Readonly<Villager>,
    worldView: AIWorldView,
    currentState: GOAPWorldState,
    plan: GOAPPlan,
    cooldown: number,
  ): boolean {
    if (cooldown > 0) return false

    // Check if a much higher-priority goal has emerged
    const currentGoalPriority = plan.goal.priority(villager, worldView, currentState)
    const newGoal = selectGoal(villager, worldView, currentState)
    const newGoalPriority = newGoal.priority(villager, worldView, currentState)

    // Replan if new goal is significantly more urgent (> 0.3 higher priority)
    if (newGoal.name !== plan.goal.name && newGoalPriority > currentGoalPriority + 0.3) {
      return true
    }

    return false
  }

  private checkPreconditions(preconditions: Partial<GOAPWorldState>, state: GOAPWorldState): boolean {
    for (const [key, value] of Object.entries(preconditions)) {
      if (state[key as keyof GOAPWorldState] !== value) return false
    }
    return true
  }

  private buildDecision(
    plan: GOAPPlan,
    step: (typeof GOAP_ACTIONS)[number],
    target: { x: number; y: number } | undefined,
  ): AIDecision {
    // Advance currentStep for next call
    plan.currentStep = Math.max(plan.currentStep, plan.steps.indexOf(step) + 1)

    return {
      action: step.villagerAction,
      targetPosition: target,
      reason: `GOAP: ${plan.goal.name} → ${step.name}`,
      goapPlan: {
        goal: plan.goal.name,
        steps: plan.steps.map((s, i) => ({
          action: s.name,
          cost: typeof s.cost === 'number' ? s.cost : 0,
          completed: i < plan.currentStep - 1,
        })),
        totalCost: plan.totalCost,
        currentStepIndex: plan.currentStep - 1,
      },
    }
  }
}
