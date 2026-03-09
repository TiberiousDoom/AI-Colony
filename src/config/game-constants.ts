/**
 * Centralized game constants — all tunable numeric values in one place.
 * Import from here instead of using magic numbers in simulation code.
 */

import type { StructureType } from '../simulation/structures.ts'

// --- Timing ---

export const TIMING = {
  TICKS_PER_DAY: 30,
  DAY_TICKS: 20,
  NIGHT_TICKS: 10,
  DAYS_PER_SEASON: 7,
} as const

// --- Population ---

export const POPULATION = {
  INITIAL_VILLAGERS: 10,
  GROWTH_FOOD_THRESHOLD: 50,
  GROWTH_TIMER_BASE: 12,
  GROWTH_TIMER_VARIANCE: 3,
  SPAWN_OFFSET: 2,
  INITIAL_SPAWN_OFFSET: 3,
} as const

// --- Needs ---

export const NEEDS = {
  INITIAL_VALUE: 75,
  MAX_VALUE: 100,
  HUNGER_DRAIN: 2.0,
  ENERGY_DRAIN: 1.0,
  HEALTH_DRAIN: 0,
  WARMTH_DRAIN: 0,
  WINTER_WARMTH_DRAIN: 3,
  ILLNESS_MULTIPLIER: 2,
  STARVATION_DAMAGE: 1.0,
  EXPOSURE_DAMAGE: 1.0,
  HEALTH_RECOVERY: 0.5,
  HEALTH_RECOVERY_HUNGER_THRESHOLD: 50,
  HEALTH_RECOVERY_ENERGY_THRESHOLD: 30,
} as const

// --- Stockpile ---

export const STOCKPILE = {
  BASE_CAP: 200,
  STORAGE_BONUS: 100,
  INITIAL_FOOD: 50,
  INITIAL_WOOD: 30,
  INITIAL_STONE: 10,
} as const

// --- Structures ---

export const STRUCTURE_COSTS_MAP: Record<StructureType, { wood: number; stone: number }> = {
  shelter: { wood: 20, stone: 0 },
  storage: { wood: 15, stone: 10 },
  watchtower: { wood: 10, stone: 15 },
  farm: { wood: 15, stone: 0 },
  wall: { wood: 0, stone: 12 },
  well: { wood: 0, stone: 20 },
}

export const STRUCTURES = {
  SHELTER_CAPACITY: 3,
  STORAGE_BONUS: 100,
  WATCHTOWER_DETECTION_BONUS: 8,
  FARM_FOOD_PER_DAY: 5,
  BUILD_SITE_RADIUS: 5,
  AUTO_DEPOSIT_RANGE: 1,
} as const

// --- Scoring ---

export const SCORING = {
  POP_WEIGHT: 5,
  HEALTH_WEIGHT: 1.0,
  FOOD_WEIGHT: 0.3,
  WOOD_WEIGHT: 0.2,
  STONE_WEIGHT: 0.2,
  STRUCTURE_WEIGHT: 5,
  UNIQUE_TYPE_WEIGHT: 5,
  DAYS_WEIGHT: 1.0,
  EFFICIENCY_FACTOR: 0.02,
} as const

// --- Events ---

export const EVENTS = {
  GRACE_PERIOD_DAYS: 5,
  MIN_INTERVAL: 5,
  INTERVAL_VARIANCE: 5,
  PREDATOR_OFFSET: 8,
  PREDATOR_SEVERITY_MIN: 20,
  PREDATOR_SEVERITY_MAX: 40,
  PREDATOR_RADIUS: 5,
  PREDATOR_DURATION: 1,
  BLIGHT_OFFSET: 10,
  BLIGHT_RADIUS: 5,
  BLIGHT_DURATION: 90,
  COLD_SNAP_RADIUS: 999,
  COLD_SNAP_DURATION: 60,
  COLD_SNAP_SEVERITY: 3,
  ILLNESS_DURATION: 150,
  ILLNESS_SEVERITY: 2,
  STORM_DURATION: 30,
  STORM_SEVERITY: 1.5,
  RESOURCE_DISCOVERY_OFFSET: 6,
  RESOURCE_DISCOVERY_RADIUS: 3,
  RESOURCE_DISCOVERY_DURATION: 1,
  WALL_DAMAGE_REDUCTION: 0.5,
} as const

// --- Competition ---

export const COMPETITION = {
  VICTORY_LAP_DAYS: 10,
  STAGNATION_WINDOW: 30,
  STAGNATION_THRESHOLD: 0.05,
  FLEE_SPEED_MULTIPLIER: 2,
} as const
