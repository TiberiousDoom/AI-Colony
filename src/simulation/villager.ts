/**
 * Villager entity, needs system, and village stockpile.
 */

import type { SeededRNG } from '../utils/seed.ts'
import { NEEDS, STOCKPILE, POPULATION } from '../config/game-constants.ts'

// --- Position ---

export interface Position {
  x: number
  y: number
}

// --- Needs ---

export enum NeedType {
  Hunger = 'hunger',
  Energy = 'energy',
  Health = 'health',
  Warmth = 'warmth',
  Cooling = 'cooling',
}

export interface NeedState {
  current: number   // 0–100
  drainRate: number  // Points lost per tick (base rate)
  min: number        // Always 0
  max: number        // Always 100
}

export type NeedsMap = Map<NeedType, NeedState>

// --- Season type (re-exported here to avoid circular dep) ---

export type Season = 'spring' | 'summer' | 'autumn' | 'winter'

// --- Actions ---

export type VillagerAction =
  | 'idle'
  | 'forage'
  | 'eat'
  | 'rest'
  | 'chop_wood'
  | 'mine_stone'
  | 'haul'
  | 'fish'
  | 'flee'
  | 'build_shelter'
  | 'build_storage'
  | 'warm_up'
  | 'build_watchtower'
  | 'build_farm'
  | 'build_wall'
  | 'build_well'
  | 'cool_down'

// --- Villager ---

export interface Villager {
  id: string
  name: string
  position: Position
  needs: NeedsMap
  currentAction: VillagerAction
  /** Ticks remaining on current action (0 = idle/ready for new action) */
  actionTicksRemaining: number
  /** Target position for movement */
  targetPosition: Position | null
  /** Current movement path */
  path: Array<{ x: number; y: number }>
  /** Whether the villager is alive */
  alive: boolean
  /** Carried resource (for hauling) */
  carrying: { type: 'food' | 'wood' | 'stone'; amount: number } | null
  /** Active status effects (illness, etc.) */
  statusEffects: Array<{ type: 'illness'; ticksRemaining: number }>
  /** Last AI decision (for inspector display) */
  lastDecision?: {
    reason: string
    scores?: Array<{ action: string; score: number; reason: string }>
    goapPlan?: {
      goal: string
      steps: Array<{ action: string; cost: number; completed: boolean }>
      totalCost: number
      currentStepIndex: number
    }
  }
}

// --- Stockpile ---

export interface VillageStockpile {
  food: number
  wood: number
  stone: number
}

// --- Name Pool ---

const VILLAGER_NAMES = [
  'Anya', 'Bjorn', 'Calla', 'Doran', 'Elke',
  'Finn', 'Greta', 'Hale', 'Ivy', 'Joss',
  'Kira', 'Leif', 'Mira', 'Nils', 'Opal',
  'Per', 'Quinn', 'Runa', 'Sven', 'Tova',
]

// --- Factory ---

function createDefaultNeeds(hasCoolingNeed?: boolean): NeedsMap {
  const needs: NeedsMap = new Map()
  needs.set(NeedType.Hunger, { current: NEEDS.INITIAL_VALUE, drainRate: NEEDS.HUNGER_DRAIN, min: 0, max: NEEDS.MAX_VALUE })
  needs.set(NeedType.Energy, { current: NEEDS.INITIAL_VALUE, drainRate: NEEDS.ENERGY_DRAIN, min: 0, max: NEEDS.MAX_VALUE })
  needs.set(NeedType.Health, { current: NEEDS.INITIAL_VALUE, drainRate: NEEDS.HEALTH_DRAIN, min: 0, max: NEEDS.MAX_VALUE })
  needs.set(NeedType.Warmth, { current: NEEDS.INITIAL_VALUE, drainRate: NEEDS.WARMTH_DRAIN, min: 0, max: NEEDS.MAX_VALUE })
  if (hasCoolingNeed) {
    needs.set(NeedType.Cooling, { current: NEEDS.COOLING_INITIAL, drainRate: NEEDS.COOLING_DRAIN, min: 0, max: NEEDS.MAX_VALUE })
  }
  return needs
}

export function createVillager(id: string, name: string, x: number, y: number, hasCoolingNeed?: boolean): Villager {
  return {
    id,
    name,
    position: { x, y },
    needs: createDefaultNeeds(hasCoolingNeed),
    currentAction: 'idle',
    actionTicksRemaining: 0,
    targetPosition: null,
    path: [],
    alive: true,
    carrying: null,
    statusEffects: [],
  }
}

/**
 * Generate N villagers with seeded names placed around (cx, cy).
 */
export function createStartingVillagers(
  count: number,
  cx: number,
  cy: number,
  rng: SeededRNG,
  hasCoolingNeed?: boolean,
): Villager[] {
  const names = [...VILLAGER_NAMES]
  rng.shuffle(names)

  const villagers: Villager[] = []
  for (let i = 0; i < count; i++) {
    const offsetX = rng.nextInt(-POPULATION.INITIAL_SPAWN_OFFSET, POPULATION.INITIAL_SPAWN_OFFSET)
    const offsetY = rng.nextInt(-POPULATION.INITIAL_SPAWN_OFFSET, POPULATION.INITIAL_SPAWN_OFFSET)
    villagers.push(
      createVillager(
        `villager-${i}`,
        names[i % names.length],
        cx + offsetX,
        cy + offsetY,
        hasCoolingNeed,
      ),
    )
  }
  return villagers
}

export function createInitialStockpile(resourceMultiplier: number = 1): VillageStockpile {
  return {
    food: Math.round(STOCKPILE.INITIAL_FOOD * resourceMultiplier),
    wood: Math.round(STOCKPILE.INITIAL_WOOD * resourceMultiplier),
    stone: Math.round(STOCKPILE.INITIAL_STONE * resourceMultiplier),
  }
}

// --- Need Helpers ---

export function getNeed(villager: Villager, type: NeedType): NeedState {
  const need = villager.needs.get(type)
  if (!need) throw new Error(`Villager ${villager.id} missing need: ${type}`)
  return need
}

export function clampNeed(need: NeedState): void {
  need.current = Math.max(need.min, Math.min(need.max, need.current))
}

/**
 * Apply base need drain for one tick and handle starvation/exposure/recovery.
 * Season defaults to 'summer' for backward compatibility with Phase 1 tests.
 */
export interface TickNeedsOptions {
  permanentWinter?: boolean
  hasCoolingNeed?: boolean
  isDaytime?: boolean
}

export function tickNeeds(villager: Villager, season: Season = 'summer', opts?: TickNeedsOptions): void {
  if (!villager.alive) return

  const hunger = getNeed(villager, NeedType.Hunger)
  const energy = getNeed(villager, NeedType.Energy)
  const health = getNeed(villager, NeedType.Health)
  const warmth = getNeed(villager, NeedType.Warmth)

  // Illness doubles drain rates
  const illnessMultiplier = villager.statusEffects.some(e => e.type === 'illness') ? NEEDS.ILLNESS_MULTIPLIER : 1

  // Base drain
  hunger.current -= hunger.drainRate * illnessMultiplier
  energy.current -= energy.drainRate * illnessMultiplier

  // Warmth drain in winter (or always for tundra permanent winter)
  const coldActive = season === 'winter' || opts?.permanentWinter
  if (coldActive) {
    warmth.current -= NEEDS.WINTER_WARMTH_DRAIN * illnessMultiplier
  }

  // Desert cooling: drains during daytime, replenished by shade/well/shelter
  if (opts?.hasCoolingNeed) {
    const cooling = villager.needs.get(NeedType.Cooling)
    if (cooling) {
      if (opts.isDaytime !== false) {
        cooling.current -= NEEDS.COOLING_DRAIN * illnessMultiplier
      }
      // Heat stroke damage when cooling depleted
      if (cooling.current <= 0) {
        cooling.current = 0
        health.current -= NEEDS.HEAT_STROKE_DAMAGE
      }
      clampNeed(cooling)
    }
  }

  // Starvation damage
  if (hunger.current <= 0) {
    hunger.current = 0
    health.current -= NEEDS.STARVATION_DAMAGE
  }

  // Energy collapse: at 0 energy, force villager to stop and rest
  if (energy.current <= 0) {
    energy.current = 0
    villager.currentAction = 'idle'
    villager.actionTicksRemaining = 0
    villager.path = []
  }

  // Exposure damage (warmth depleted during cold)
  if (warmth.current <= 0 && coldActive) {
    warmth.current = 0
    health.current -= NEEDS.EXPOSURE_DAMAGE
  }

  // Health recovery: only when well-fed and rested
  if (hunger.current > NEEDS.HEALTH_RECOVERY_HUNGER_THRESHOLD && energy.current > NEEDS.HEALTH_RECOVERY_ENERGY_THRESHOLD) {
    health.current += NEEDS.HEALTH_RECOVERY
  }

  clampNeed(hunger)
  clampNeed(energy)
  clampNeed(health)
  clampNeed(warmth)

  // Death check
  if (health.current <= 0) {
    villager.alive = false
  }
}
