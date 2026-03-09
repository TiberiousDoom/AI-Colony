/**
 * Fitness evaluation for evolutionary AI training.
 * Extends base prosperity with bonuses for population growth and structure variety.
 */

import { calculateProsperity } from '../utils/scoring.ts'
import type { VillageStockpile } from '../simulation/villager.ts'
import type { Structure } from '../simulation/structures.ts'

export interface FitnessInput {
  population: number
  avgHealth: number
  food: number
  wood: number
  stone: number
  structures: Structure[]
  daysSurvived: number
  startingVillagerCount: number
  avgHunger?: number
  avgEnergy?: number
}

/** Count unique structure types in a list */
function countUniqueStructureTypes(structures: Structure[]): number {
  const types = new Set(structures.map(s => s.type))
  return types.size
}

/**
 * Evaluate fitness for a village state.
 * Fitness = prosperity + population growth bonus + structure variety bonus
 */
export function evaluateFitness(input: FitnessInput): number {
  const uniqueTypes = countUniqueStructureTypes(input.structures)
  const prosperity = calculateProsperity(
    input.population,
    input.avgHealth,
    input.food,
    input.wood,
    input.stone,
    input.structures.length,
    uniqueTypes,
    input.daysSurvived,
    input.avgHunger,
    input.avgEnergy,
  )

  // Bonus for population growth (reward growing the village)
  const popGrowthBonus = Math.max(0, input.population - input.startingVillagerCount) * 2

  // Bonus for structure variety (reward building different types)
  const structureVarietyBonus = uniqueTypes * 3

  return prosperity + popGrowthBonus + structureVarietyBonus
}
