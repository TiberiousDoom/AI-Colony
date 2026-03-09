/**
 * Tests for the training system and fitness evaluation.
 */
import { describe, it, expect } from 'vitest'
import { evaluateFitness } from '../src/training/fitness.ts'
import { runGeneration } from '../src/training/trainer.ts'
import { createRandomGenome, getGenomeNeedCount } from '../src/simulation/ai/genome.ts'
import { createRNG } from '../src/utils/seed.ts'

function makeFitnessInput(overrides: Partial<Parameters<typeof evaluateFitness>[0]> = {}) {
  return {
    population: 10,
    avgHealth: 75,
    food: 50,
    wood: 30,
    stone: 10,
    structures: [],
    daysSurvived: 5,
    startingVillagerCount: 10,
    avgHunger: 50,
    avgEnergy: 50,
    ...overrides,
  }
}

describe('Fitness evaluation', () => {
  it('returns positive value for healthy village', () => {
    const fitness = evaluateFitness(makeFitnessInput())
    expect(fitness).toBeGreaterThan(0)
  })

  it('includes population growth bonus', () => {
    const base = evaluateFitness(makeFitnessInput({ population: 10, startingVillagerCount: 10 }))
    const withGrowth = evaluateFitness(makeFitnessInput({ population: 15, startingVillagerCount: 10 }))
    expect(withGrowth).toBeGreaterThan(base)
  })

  it('includes structure variety bonus', () => {
    const base = evaluateFitness(makeFitnessInput({ structures: [] }))
    const withStructures = evaluateFitness(makeFitnessInput({
      structures: [
        { type: 'shelter', position: { x: 0, y: 0 }, builtAtTick: 0 },
        { type: 'storage', position: { x: 1, y: 0 }, builtAtTick: 0 },
        { type: 'farm', position: { x: 2, y: 0 }, builtAtTick: 0 },
      ] as any,
    }))
    expect(withStructures).toBeGreaterThan(base)
  })

  it('negative population delta gives no bonus', () => {
    const base = evaluateFitness(makeFitnessInput({ population: 10, startingVillagerCount: 10 }))
    const withLoss = evaluateFitness(makeFitnessInput({ population: 7, startingVillagerCount: 10 }))
    // withLoss has lower population (less base score) but no negative pop bonus
    // The key check: pop growth bonus is max(0, ...) so losing pop gives 0 bonus
    expect(withLoss).toBeLessThanOrEqual(base)
  })
})

describe('Trainer', () => {
  it('runGeneration completes without error', () => {
    const rng = createRNG(42)
    const needCount = getGenomeNeedCount('temperate')
    const population = Array.from({ length: 4 }, () =>
      createRandomGenome(rng, needCount, 'temperate')
    )

    const result = runGeneration(population, {
      populationSize: 4,
      generationsMax: 1,
      ticksPerEvaluation: 30,
      mutationRate: 0.05,
      elitePercent: 0.5,
      seed: 42,
      worldSize: 'small',
      biome: 'temperate',
    }, rng)

    expect(result.nextPopulation.length).toBe(4)
    expect(result.bestFitness).toBeTypeOf('number')
  })

  it('returns population with updated fitness scores', () => {
    const rng = createRNG(42)
    const needCount = getGenomeNeedCount('temperate')
    const population = Array.from({ length: 4 }, () =>
      createRandomGenome(rng, needCount, 'temperate')
    )

    const result = runGeneration(population, {
      populationSize: 4,
      generationsMax: 1,
      ticksPerEvaluation: 60,
      mutationRate: 0.05,
      elitePercent: 0.5,
      seed: 42,
      worldSize: 'small',
      biome: 'temperate',
    }, rng)

    expect(result.bestFitness).toBeGreaterThanOrEqual(0)
  })
})
