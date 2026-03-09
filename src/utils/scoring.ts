/**
 * Prosperity score calculation.
 * Composite score reflecting village health, wealth, and longevity.
 */

import { SCORING } from '../config/game-constants.ts'

export function calculateProsperity(
  population: number,
  avgHealth: number,
  food: number,
  wood: number,
  stone: number,
  structureCount: number,
  uniqueStructureTypes: number,
  daysSurvived: number,
  avgHunger: number = 50,
  avgEnergy: number = 50,
): number {
  const base =
    population * SCORING.POP_WEIGHT +
    avgHealth * SCORING.HEALTH_WEIGHT +
    food * SCORING.FOOD_WEIGHT +
    wood * SCORING.WOOD_WEIGHT +
    stone * SCORING.STONE_WEIGHT +
    structureCount * SCORING.STRUCTURE_WEIGHT +
    uniqueStructureTypes * SCORING.UNIQUE_TYPE_WEIGHT +
    daysSurvived * SCORING.DAYS_WEIGHT

  // Efficiency bonus: rewards well-fed, rested, healthy villages
  const avgWellbeing = (avgHealth + avgHunger + avgEnergy) / 3
  const efficiencyBonus = avgWellbeing * population * SCORING.EFFICIENCY_FACTOR

  return base + efficiencyBonus
}
