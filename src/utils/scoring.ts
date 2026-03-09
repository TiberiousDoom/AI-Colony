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
): number {
  return (
    population * SCORING.POP_WEIGHT +
    avgHealth * SCORING.HEALTH_WEIGHT +
    food * SCORING.FOOD_WEIGHT +
    wood * SCORING.WOOD_WEIGHT +
    stone * SCORING.STONE_WEIGHT +
    structureCount * SCORING.STRUCTURE_WEIGHT +
    uniqueStructureTypes * SCORING.UNIQUE_TYPE_WEIGHT +
    daysSurvived * SCORING.DAYS_WEIGHT
  )
}
