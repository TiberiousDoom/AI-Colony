/**
 * Regression guard: verify centralized constants match expected values.
 * If any value changes, this test fails — forcing intentional review.
 */

import { describe, it, expect } from 'vitest'
import {
  TIMING, POPULATION, NEEDS, STOCKPILE,
  STRUCTURE_COSTS_MAP, STRUCTURES, SCORING,
  EVENTS, COMPETITION,
} from '../../src/colony/config/game-constants.ts'

describe('game-constants regression guard', () => {
  it('TIMING values match Phase 1-4 defaults', () => {
    expect(TIMING.TICKS_PER_DAY).toBe(30)
    expect(TIMING.DAY_TICKS).toBe(20)
    expect(TIMING.NIGHT_TICKS).toBe(10)
    expect(TIMING.DAYS_PER_SEASON).toBe(7)
  })

  it('POPULATION values match defaults', () => {
    expect(POPULATION.INITIAL_VILLAGERS).toBe(10)
    expect(POPULATION.GROWTH_FOOD_THRESHOLD).toBe(50)
    expect(POPULATION.GROWTH_TIMER_BASE).toBe(12)
    expect(POPULATION.GROWTH_TIMER_VARIANCE).toBe(3)
    expect(POPULATION.SPAWN_OFFSET).toBe(2)
    expect(POPULATION.INITIAL_SPAWN_OFFSET).toBe(3)
  })

  it('NEEDS values match defaults', () => {
    expect(NEEDS.INITIAL_VALUE).toBe(75)
    expect(NEEDS.MAX_VALUE).toBe(100)
    expect(NEEDS.HUNGER_DRAIN).toBe(1.0)
    expect(NEEDS.ENERGY_DRAIN).toBe(1.0)
    expect(NEEDS.HEALTH_DRAIN).toBe(0)
    expect(NEEDS.WARMTH_DRAIN).toBe(0)
    expect(NEEDS.WINTER_WARMTH_DRAIN).toBe(3)
    expect(NEEDS.ILLNESS_MULTIPLIER).toBe(2)
    expect(NEEDS.STARVATION_DAMAGE).toBe(1.0)
    expect(NEEDS.EXPOSURE_DAMAGE).toBe(1.0)
    expect(NEEDS.HEALTH_RECOVERY).toBe(0.8)
    expect(NEEDS.HEALTH_RECOVERY_HUNGER_THRESHOLD).toBe(50)
    expect(NEEDS.HEALTH_RECOVERY_ENERGY_THRESHOLD).toBe(30)
  })

  it('STOCKPILE values match defaults', () => {
    expect(STOCKPILE.BASE_CAP).toBe(200)
    expect(STOCKPILE.STORAGE_BONUS).toBe(100)
    expect(STOCKPILE.INITIAL_FOOD).toBe(50)
    expect(STOCKPILE.INITIAL_WOOD).toBe(30)
    expect(STOCKPILE.INITIAL_STONE).toBe(10)
  })

  it('STRUCTURE_COSTS_MAP matches Phase 1-4 costs', () => {
    expect(STRUCTURE_COSTS_MAP.shelter).toEqual({ wood: 20, stone: 0 })
    expect(STRUCTURE_COSTS_MAP.storage).toEqual({ wood: 15, stone: 10 })
    expect(STRUCTURE_COSTS_MAP.watchtower).toEqual({ wood: 10, stone: 15 })
    expect(STRUCTURE_COSTS_MAP.farm).toEqual({ wood: 15, stone: 0 })
    expect(STRUCTURE_COSTS_MAP.wall).toEqual({ wood: 0, stone: 12 })
    expect(STRUCTURE_COSTS_MAP.well).toEqual({ wood: 0, stone: 20 })
  })

  it('STRUCTURES values match defaults', () => {
    expect(STRUCTURES.SHELTER_CAPACITY).toBe(3)
    expect(STRUCTURES.STORAGE_BONUS).toBe(100)
    expect(STRUCTURES.WATCHTOWER_DETECTION_BONUS).toBe(8)
    expect(STRUCTURES.FARM_FOOD_PER_DAY).toBe(5)
    expect(STRUCTURES.BUILD_SITE_RADIUS).toBe(5)
    expect(STRUCTURES.AUTO_DEPOSIT_RANGE).toBe(1)
  })

  it('SCORING weights match Phase 1-4 formula', () => {
    expect(SCORING.POP_WEIGHT).toBe(5)
    expect(SCORING.HEALTH_WEIGHT).toBe(1.0)
    expect(SCORING.FOOD_WEIGHT).toBe(0.3)
    expect(SCORING.WOOD_WEIGHT).toBe(0.2)
    expect(SCORING.STONE_WEIGHT).toBe(0.2)
    expect(SCORING.STRUCTURE_WEIGHT).toBe(5)
    expect(SCORING.UNIQUE_TYPE_WEIGHT).toBe(5)
    expect(SCORING.DAYS_WEIGHT).toBe(1.0)
    expect(SCORING.EFFICIENCY_FACTOR).toBe(0.02)
  })

  it('EVENTS values match defaults', () => {
    expect(EVENTS.GRACE_PERIOD_DAYS).toBe(5)
    expect(EVENTS.MIN_INTERVAL).toBe(5)
    expect(EVENTS.INTERVAL_VARIANCE).toBe(5)
    expect(EVENTS.PREDATOR_OFFSET).toBe(8)
    expect(EVENTS.PREDATOR_SEVERITY_MIN).toBe(20)
    expect(EVENTS.PREDATOR_SEVERITY_MAX).toBe(40)
    expect(EVENTS.PREDATOR_RADIUS).toBe(5)
    expect(EVENTS.PREDATOR_DURATION).toBe(5)
    expect(EVENTS.BLIGHT_OFFSET).toBe(10)
    expect(EVENTS.BLIGHT_RADIUS).toBe(5)
    expect(EVENTS.BLIGHT_DURATION).toBe(90)
    expect(EVENTS.COLD_SNAP_RADIUS).toBe(999)
    expect(EVENTS.COLD_SNAP_DURATION).toBe(60)
    expect(EVENTS.COLD_SNAP_SEVERITY).toBe(3)
    expect(EVENTS.ILLNESS_DURATION).toBe(150)
    expect(EVENTS.ILLNESS_SEVERITY).toBe(2)
    expect(EVENTS.STORM_DURATION).toBe(30)
    expect(EVENTS.STORM_SEVERITY).toBe(1.5)
    expect(EVENTS.RESOURCE_DISCOVERY_OFFSET).toBe(6)
    expect(EVENTS.RESOURCE_DISCOVERY_RADIUS).toBe(3)
    expect(EVENTS.RESOURCE_DISCOVERY_DURATION).toBe(1)
    expect(EVENTS.WALL_DAMAGE_REDUCTION).toBe(0.5)
  })

  it('COMPETITION values match defaults', () => {
    expect(COMPETITION.VICTORY_LAP_DAYS).toBe(10)
    expect(COMPETITION.STAGNATION_WINDOW).toBe(30)
    expect(COMPETITION.STAGNATION_THRESHOLD).toBe(0.05)
    expect(COMPETITION.FLEE_SPEED_MULTIPLIER).toBe(2)
  })
})
