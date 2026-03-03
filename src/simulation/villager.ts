/**
 * Villager entity, needs system, and village stockpile.
 */

import type { SeededRNG } from '../utils/seed.ts'

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
  // Warmth = 'warmth',    // Phase 2
  // Cooling = 'cooling',  // Phase 5
}

export interface NeedState {
  current: number   // 0–100
  drainRate: number  // Points lost per tick (base rate)
  min: number        // Always 0
  max: number        // Always 100
}

export type NeedsMap = Map<NeedType, NeedState>

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
  | 'build'
  | 'warm_up'

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

function createDefaultNeeds(): NeedsMap {
  const needs: NeedsMap = new Map()
  needs.set(NeedType.Hunger, { current: 75, drainRate: 2.0, min: 0, max: 100 })
  needs.set(NeedType.Energy, { current: 75, drainRate: 1.0, min: 0, max: 100 })
  needs.set(NeedType.Health, { current: 75, drainRate: 0, min: 0, max: 100 })
  return needs
}

export function createVillager(id: string, name: string, x: number, y: number): Villager {
  return {
    id,
    name,
    position: { x, y },
    needs: createDefaultNeeds(),
    currentAction: 'idle',
    actionTicksRemaining: 0,
    targetPosition: null,
    path: [],
    alive: true,
    carrying: null,
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
): Villager[] {
  const names = [...VILLAGER_NAMES]
  rng.shuffle(names)

  const villagers: Villager[] = []
  for (let i = 0; i < count; i++) {
    // Spread villagers within the 7×7 starting clearing
    const offsetX = rng.nextInt(-3, 3)
    const offsetY = rng.nextInt(-3, 3)
    villagers.push(
      createVillager(
        `villager-${i}`,
        names[i % names.length],
        cx + offsetX,
        cy + offsetY,
      ),
    )
  }
  return villagers
}

export function createInitialStockpile(): VillageStockpile {
  return { food: 50, wood: 30, stone: 10 }
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
 * Apply base need drain for one tick and handle starvation/recovery.
 */
export function tickNeeds(villager: Villager): void {
  if (!villager.alive) return

  const hunger = getNeed(villager, NeedType.Hunger)
  const energy = getNeed(villager, NeedType.Energy)
  const health = getNeed(villager, NeedType.Health)

  // Base drain
  hunger.current -= hunger.drainRate
  energy.current -= energy.drainRate

  // Starvation damage
  if (hunger.current <= 0) {
    hunger.current = 0
    health.current -= 1.0
  }

  // Health recovery: only when well-fed and rested
  if (hunger.current > 50 && energy.current > 30) {
    health.current += 0.5
  }

  clampNeed(hunger)
  clampNeed(energy)
  clampNeed(health)

  // Death check
  if (health.current <= 0) {
    villager.alive = false
  }
}
