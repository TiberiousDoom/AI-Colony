/**
 * Tests for genome structure, crossover, mutation, and serialization.
 */
import { describe, it, expect } from 'vitest'
import {
  createRandomGenome, crossover, mutate, cloneGenome,
  serializeGenome, deserializeGenome, getGenomeNeedCount, getGenomeSize,
  NUM_ACTIONS, NUM_ENV_WEIGHTS,
} from '../../src/colony/simulation/ai/genome.ts'
import { createRNG } from '../../src/shared/seed.ts'

describe('Genome', () => {
  it('creates genome with correct size for temperate (4 needs)', () => {
    const rng = createRNG(42)
    const genome = createRandomGenome(rng, 4, 'temperate')
    expect(genome.actionWeights.length).toBe(NUM_ACTIONS * 4)
    expect(genome.envWeights.length).toBe(NUM_ENV_WEIGHTS)
    expect(genome.needCount).toBe(4)
    expect(genome.trainedBiome).toBe('temperate')
  })

  it('creates genome with correct size for desert (5 needs)', () => {
    const rng = createRNG(42)
    const genome = createRandomGenome(rng, 5, 'desert')
    expect(genome.actionWeights.length).toBe(NUM_ACTIONS * 5)
    expect(genome.needCount).toBe(5)
    expect(genome.trainedBiome).toBe('desert')
  })

  it('getGenomeNeedCount returns 5 for desert, 4 for others', () => {
    expect(getGenomeNeedCount('desert')).toBe(5)
    expect(getGenomeNeedCount('temperate')).toBe(4)
    expect(getGenomeNeedCount('tundra')).toBe(4)
    expect(getGenomeNeedCount('island')).toBe(4)
    expect(getGenomeNeedCount('lush')).toBe(4)
  })

  it('getGenomeSize calculates correctly', () => {
    expect(getGenomeSize(4)).toBe(NUM_ACTIONS * 4 + NUM_ENV_WEIGHTS)
    expect(getGenomeSize(5)).toBe(NUM_ACTIONS * 5 + NUM_ENV_WEIGHTS)
  })

  it('genome weights are in [0, 1]', () => {
    const rng = createRNG(42)
    const genome = createRandomGenome(rng, 4, 'temperate')
    for (let i = 0; i < genome.actionWeights.length; i++) {
      expect(genome.actionWeights[i]).toBeGreaterThanOrEqual(0)
      expect(genome.actionWeights[i]).toBeLessThanOrEqual(1)
    }
    for (let i = 0; i < genome.envWeights.length; i++) {
      expect(genome.envWeights[i]).toBeGreaterThanOrEqual(0)
      expect(genome.envWeights[i]).toBeLessThanOrEqual(1)
    }
  })

  it('crossover produces child with mixed parent weights', () => {
    const rng = createRNG(42)
    const parentA = createRandomGenome(rng, 4, 'temperate')
    const parentB = createRandomGenome(rng, 4, 'temperate')
    const child = crossover(parentA, parentB, rng)

    expect(child.actionWeights.length).toBe(parentA.actionWeights.length)
    expect(child.generation).toBe(Math.max(parentA.generation, parentB.generation) + 1)

    // Child should have weights from both parents
    let fromA = 0, fromB = 0
    for (let i = 0; i < child.actionWeights.length; i++) {
      if (child.actionWeights[i] === parentA.actionWeights[i]) fromA++
      if (child.actionWeights[i] === parentB.actionWeights[i]) fromB++
    }
    expect(fromA).toBeGreaterThan(0)
    expect(fromB).toBeGreaterThan(0)
  })

  it('crossover rejects different needCounts', () => {
    const rng = createRNG(42)
    const g4 = createRandomGenome(rng, 4, 'temperate')
    const g5 = createRandomGenome(rng, 5, 'desert')
    expect(() => crossover(g4, g5, rng)).toThrow()
  })

  it('mutation perturbs weights within bounds', () => {
    const rng = createRNG(42)
    const genome = createRandomGenome(rng, 4, 'temperate')
    const mutated = mutate(genome, 1.0, rng) // 100% mutation rate

    let changed = 0
    for (let i = 0; i < mutated.actionWeights.length; i++) {
      if (mutated.actionWeights[i] !== genome.actionWeights[i]) changed++
      expect(mutated.actionWeights[i]).toBeGreaterThanOrEqual(0)
      expect(mutated.actionWeights[i]).toBeLessThanOrEqual(1)
    }
    expect(changed).toBeGreaterThan(0)
  })

  it('cloneGenome creates independent copy', () => {
    const rng = createRNG(42)
    const genome = createRandomGenome(rng, 4, 'temperate')
    const clone = cloneGenome(genome)
    expect(clone.actionWeights).not.toBe(genome.actionWeights)
    expect(clone.actionWeights).toEqual(genome.actionWeights)
    clone.actionWeights[0] = 999
    expect(genome.actionWeights[0]).not.toBe(999)
  })

  it('serialize/deserialize roundtrips', () => {
    const rng = createRNG(42)
    const genome = createRandomGenome(rng, 4, 'temperate')
    genome.fitness = 123.5
    genome.generation = 10

    const serialized = serializeGenome(genome)
    const restored = deserializeGenome(serialized as Record<string, unknown>)

    expect(restored.needCount).toBe(genome.needCount)
    expect(restored.generation).toBe(genome.generation)
    expect(restored.fitness).toBe(genome.fitness)
    expect(restored.id).toBe(genome.id)
    expect(restored.trainedBiome).toBe(genome.trainedBiome)
    expect(Array.from(restored.actionWeights)).toEqual(Array.from(genome.actionWeights))
    expect(Array.from(restored.envWeights)).toEqual(Array.from(genome.envWeights))
  })
})
