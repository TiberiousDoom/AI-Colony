/**
 * Prosperity score calculation.
 * Composite score reflecting village health, wealth, and longevity.
 */

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
    population * 10 +
    avgHealth * 0.5 +
    food * 0.3 +
    wood * 0.2 +
    stone * 0.2 +
    structureCount * 5 +
    uniqueStructureTypes * 10 +
    daysSurvived * 0.5
  )
}
