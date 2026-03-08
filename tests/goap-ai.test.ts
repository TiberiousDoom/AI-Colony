/**
 * GOAP AI tests: world state snapshot, planner, and full AI class.
 */

import { describe, it, expect } from 'vitest'
import { createRNG } from '../src/utils/seed.ts'
import { createVillager, NeedType, getNeed } from '../src/simulation/villager.ts'
import { World } from '../src/simulation/world.ts'
import type { AIWorldView } from '../src/simulation/ai/ai-interface.ts'
import { snapshotWorldState } from '../src/simulation/ai/goap-world-state.ts'
import { GOAP_ACTIONS } from '../src/simulation/ai/goap-actions.ts'
import { GOAP_GOALS, selectGoal } from '../src/simulation/ai/goap-goals.ts'
import { planActions } from '../src/simulation/ai/goap-planner.ts'
import { GOAPAI } from '../src/simulation/ai/goap-ai.ts'

function createTestWorld(): World {
  return new World({ width: 60, height: 60, seed: 42 })
}

function createTestWorldView(world: World, overrides?: Partial<AIWorldView>): AIWorldView {
  return {
    world,
    stockpile: { food: 50, wood: 30, stone: 10 },
    villagers: [],
    tick: 0,
    timeOfDay: 'day',
    campfirePosition: world.campfirePosition,
    season: 'summer',
    structures: [],
    activeEvents: [],
    villageId: 'test',
    ...overrides,
  }
}

describe('GOAP AI', () => {
  describe('World State Snapshot', () => {
    it('produces correct boolean predicates for a fresh villager near campfire', () => {
      const world = createTestWorld()
      const villager = createVillager('v1', 'Test', world.campfirePosition.x, world.campfirePosition.y)
      const wv = createTestWorldView(world, { villagers: [villager] })

      const state = snapshotWorldState(villager, wv)

      expect(state.at_campfire).toBe(true)
      expect(state.carrying_any).toBe(false)
      expect(state.has_food).toBe(false)
      expect(state.stockpile_has_food).toBe(true)
      expect(state.hunger_satisfied).toBe(true) // starts at 75
      expect(state.energy_satisfied).toBe(true)
      expect(state.predator_nearby).toBe(false)
      expect(state.is_sick).toBe(false)
    })

    it('detects low hunger', () => {
      const world = createTestWorld()
      const villager = createVillager('v1', 'Test', world.campfirePosition.x, world.campfirePosition.y)
      getNeed(villager, NeedType.Hunger).current = 20
      const wv = createTestWorldView(world, { villagers: [villager] })

      const state = snapshotWorldState(villager, wv)
      expect(state.hunger_satisfied).toBe(false)
    })

    it('detects predator nearby', () => {
      const world = createTestWorld()
      const villager = createVillager('v1', 'Test', world.campfirePosition.x, world.campfirePosition.y)
      const wv = createTestWorldView(world, {
        villagers: [villager],
        activeEvents: [{
          type: 'predator',
          relativePosition: { dx: 0, dy: 0 },
          radius: 5,
          durationTicks: 1,
          severity: 20,
        }],
      })

      const state = snapshotWorldState(villager, wv)
      expect(state.predator_nearby).toBe(true)
    })

    it('detects illness', () => {
      const world = createTestWorld()
      const villager = createVillager('v1', 'Test', world.campfirePosition.x, world.campfirePosition.y)
      villager.statusEffects.push({ type: 'illness', ticksRemaining: 100 })
      const wv = createTestWorldView(world, { villagers: [villager] })

      const state = snapshotWorldState(villager, wv)
      expect(state.is_sick).toBe(true)
    })

    it('detects carrying resources', () => {
      const world = createTestWorld()
      const villager = createVillager('v1', 'Test', world.campfirePosition.x, world.campfirePosition.y)
      villager.carrying = { type: 'food', amount: 10 }
      const wv = createTestWorldView(world, { villagers: [villager] })

      const state = snapshotWorldState(villager, wv)
      expect(state.carrying_any).toBe(true)
      expect(state.has_food).toBe(true)
      expect(state.has_wood).toBe(false)
    })
  })

  describe('Goal Selection', () => {
    it('selects flee when predator nearby', () => {
      const world = createTestWorld()
      const villager = createVillager('v1', 'Test', world.campfirePosition.x, world.campfirePosition.y)
      const wv = createTestWorldView(world, {
        villagers: [villager],
        activeEvents: [{
          type: 'predator',
          relativePosition: { dx: 0, dy: 0 },
          radius: 5,
          durationTicks: 1,
          severity: 20,
        }],
      })

      const state = snapshotWorldState(villager, wv)
      const goal = selectGoal(villager, wv, state)
      expect(goal.name).toBe('FleeFromDanger')
    })

    it('selects hunger goal when very hungry', () => {
      const world = createTestWorld()
      const villager = createVillager('v1', 'Test', world.campfirePosition.x, world.campfirePosition.y)
      getNeed(villager, NeedType.Hunger).current = 10
      const wv = createTestWorldView(world, { villagers: [villager] })

      const state = snapshotWorldState(villager, wv)
      const goal = selectGoal(villager, wv, state)
      expect(goal.name).toBe('SurviveHunger')
    })

    it('selects energy goal when very tired', () => {
      const world = createTestWorld()
      const villager = createVillager('v1', 'Test', world.campfirePosition.x, world.campfirePosition.y)
      getNeed(villager, NeedType.Energy).current = 5
      getNeed(villager, NeedType.Hunger).current = 90 // not hungry
      const wv = createTestWorldView(world, { villagers: [villager] })

      const state = snapshotWorldState(villager, wv)
      const goal = selectGoal(villager, wv, state)
      expect(goal.name).toBe('SurviveEnergy')
    })
  })

  describe('Planner', () => {
    it('finds a simple plan: eat from stockpile when at campfire', () => {
      const world = createTestWorld()
      const villager = createVillager('v1', 'Test', world.campfirePosition.x, world.campfirePosition.y)
      getNeed(villager, NeedType.Hunger).current = 20
      const wv = createTestWorldView(world, { villagers: [villager] })

      const state = snapshotWorldState(villager, wv)
      const hungerGoal = GOAP_GOALS.find(g => g.name === 'SurviveHunger')!
      const plan = planActions(state, hungerGoal, GOAP_ACTIONS, villager, wv)

      expect(plan).not.toBeNull()
      expect(plan!.steps.length).toBeGreaterThan(0)
      expect(plan!.steps.some(s => s.villagerAction === 'eat')).toBe(true)
    })

    it('finds a multi-step plan when food stockpile is empty', () => {
      const world = createTestWorld()
      const villager = createVillager('v1', 'Test', world.campfirePosition.x, world.campfirePosition.y)
      getNeed(villager, NeedType.Hunger).current = 20
      const wv = createTestWorldView(world, {
        villagers: [villager],
        stockpile: { food: 0, wood: 30, stone: 10 },
      })

      const state = snapshotWorldState(villager, wv)
      const hungerGoal = GOAP_GOALS.find(g => g.name === 'SurviveHunger')!
      const plan = planActions(state, hungerGoal, GOAP_ACTIONS, villager, wv)

      // Should need to forage or fish first, then possibly haul, then eat
      expect(plan).not.toBeNull()
      expect(plan!.steps.length).toBeGreaterThanOrEqual(1)
    })

    it('returns null when goal is already satisfied', () => {
      const world = createTestWorld()
      const villager = createVillager('v1', 'Test', world.campfirePosition.x, world.campfirePosition.y)
      // Hunger is 75 (satisfied > 50)
      const wv = createTestWorldView(world, { villagers: [villager] })

      const state = snapshotWorldState(villager, wv)
      const hungerGoal = GOAP_GOALS.find(g => g.name === 'SurviveHunger')!
      const plan = planActions(state, hungerGoal, GOAP_ACTIONS, villager, wv)

      expect(plan).toBeNull()
    })

    it('finds a flee plan when predator is nearby', () => {
      const world = createTestWorld()
      const villager = createVillager('v1', 'Test', world.campfirePosition.x, world.campfirePosition.y)
      const wv = createTestWorldView(world, {
        villagers: [villager],
        activeEvents: [{
          type: 'predator',
          relativePosition: { dx: 0, dy: 0 },
          radius: 5,
          durationTicks: 1,
          severity: 20,
        }],
      })

      const state = snapshotWorldState(villager, wv)
      const fleeGoal = GOAP_GOALS.find(g => g.name === 'FleeFromDanger')!
      const plan = planActions(state, fleeGoal, GOAP_ACTIONS, villager, wv)

      expect(plan).not.toBeNull()
      expect(plan!.steps[0].villagerAction).toBe('flee')
    })
  })

  describe('GOAP AI Class', () => {
    it('implements IAISystem interface', () => {
      const ai = new GOAPAI()
      expect(ai.name).toBe('GOAP')
      expect(typeof ai.decide).toBe('function')
    })

    it('returns a valid AIDecision', () => {
      const ai = new GOAPAI()
      const world = createTestWorld()
      const villager = createVillager('v1', 'Test', world.campfirePosition.x, world.campfirePosition.y)
      const wv = createTestWorldView(world, { villagers: [villager] })
      const rng = createRNG(42)

      const decision = ai.decide(villager, wv, rng)

      expect(decision.action).toBeTruthy()
      expect(decision.reason).toBeTruthy()
      expect(decision.reason.startsWith('GOAP:')).toBe(true)
    })

    it('includes goapPlan in decision', () => {
      const ai = new GOAPAI()
      const world = createTestWorld()
      const villager = createVillager('v1', 'Test', world.campfirePosition.x, world.campfirePosition.y)
      getNeed(villager, NeedType.Hunger).current = 20 // Make hungry to force a plan
      const wv = createTestWorldView(world, { villagers: [villager] })
      const rng = createRNG(42)

      const decision = ai.decide(villager, wv, rng)

      expect(decision.goapPlan).toBeDefined()
      expect(decision.goapPlan!.goal).toBeTruthy()
    })

    it('produces deterministic results with same seed', () => {
      const ai1 = new GOAPAI()
      const ai2 = new GOAPAI()
      const world = createTestWorld()
      const v1 = createVillager('v1', 'Test', world.campfirePosition.x, world.campfirePosition.y)
      const v2 = createVillager('v1', 'Test', world.campfirePosition.x, world.campfirePosition.y)
      getNeed(v1, NeedType.Hunger).current = 20
      getNeed(v2, NeedType.Hunger).current = 20
      const wv1 = createTestWorldView(world, { villagers: [v1] })
      const wv2 = createTestWorldView(world, { villagers: [v2] })

      const d1 = ai1.decide(v1, wv1, createRNG(42))
      const d2 = ai2.decide(v2, wv2, createRNG(42))

      expect(d1.action).toBe(d2.action)
      expect(d1.reason).toBe(d2.reason)
    })

    it('survives 100 ticks without crash', () => {
      const ai = new GOAPAI()
      const world = createTestWorld()
      const villager = createVillager('v1', 'Test', world.campfirePosition.x, world.campfirePosition.y)
      const rng = createRNG(42)

      for (let i = 0; i < 100; i++) {
        const wv = createTestWorldView(world, {
          villagers: [villager],
          tick: i,
        })

        const decision = ai.decide(villager, wv, rng)
        expect(decision.action).toBeTruthy()

        // Simulate some need drain
        getNeed(villager, NeedType.Hunger).current = Math.max(0, getNeed(villager, NeedType.Hunger).current - 1)
        getNeed(villager, NeedType.Energy).current = Math.max(0, getNeed(villager, NeedType.Energy).current - 0.5)
      }
    })
  })
})
