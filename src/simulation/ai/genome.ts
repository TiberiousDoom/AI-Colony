/**
 * Genome structure and genetic operators for the Evolutionary AI.
 * Genome size is dynamic based on the number of active needs (biome-dependent).
 */

import type { SeededRNG } from '../../utils/seed.ts'
import type { VillagerAction } from '../villager.ts'

export type BiomeType = 'temperate' | 'desert' | 'tundra' | 'island' | 'lush'

/** All possible villager actions in scoring order */
export const ACTION_LIST: VillagerAction[] = [
  'idle', 'forage', 'eat', 'rest', 'chop_wood', 'mine_stone',
  'haul', 'fish', 'flee', 'build_shelter', 'build_storage',
  'warm_up', 'build_watchtower', 'build_farm', 'build_wall', 'build_well',
  'cool_down',
]

export const NUM_ACTIONS = ACTION_LIST.length // 17
export const NUM_ENV_WEIGHTS = 6 // night, carrying, lowFood, emergency, seasonal, social

export interface Genome {
  /** Need weights per action: length = NUM_ACTIONS * needCount */
  actionWeights: Float32Array
  /** Environmental modifier weights: length = NUM_ENV_WEIGHTS */
  envWeights: Float32Array
  /** How many needs this genome was trained with (4 default, 5 for desert) */
  needCount: number
  generation: number
  fitness: number
  id: string
  trainedBiome: BiomeType
}

/** Get the number of active needs for a given biome */
export function getGenomeNeedCount(biome: BiomeType): number {
  return biome === 'desert' ? 5 : 4
}

/** Total number of weights in a genome */
export function getGenomeSize(needCount: number): number {
  return NUM_ACTIONS * needCount + NUM_ENV_WEIGHTS
}

/** Create a random genome with weights in [0, 1].
 *  Survival-critical actions (eat, rest) get a minimum floor so random
 *  genomes don't starve before evolution can select for survival. */
export function createRandomGenome(rng: SeededRNG, needCount: number, biome: BiomeType): Genome {
  const actionWeights = new Float32Array(NUM_ACTIONS * needCount)
  const envWeights = new Float32Array(NUM_ENV_WEIGHTS)

  // Indices of survival-critical actions in ACTION_LIST
  const eatIdx = ACTION_LIST.indexOf('eat')       // 2
  const restIdx = ACTION_LIST.indexOf('rest')      // 3
  const forageIdx = ACTION_LIST.indexOf('forage')  // 1

  for (let i = 0; i < actionWeights.length; i++) {
    const actionIdx = Math.floor(i / needCount)
    let w = rng.next()
    // Ensure eat/rest/forage weights have a minimum floor for the hunger need (index 0)
    const needIdx = i % needCount
    if (actionIdx === eatIdx && needIdx === 0) {
      w = Math.max(0.6, w) // eat × hunger weight always >= 0.6
    } else if (actionIdx === restIdx && needIdx === 1) {
      w = Math.max(0.5, w) // rest × energy weight always >= 0.5
    } else if (actionIdx === forageIdx && needIdx === 0) {
      w = Math.max(0.4, w) // forage × hunger weight always >= 0.4
    }
    actionWeights[i] = w
  }
  for (let i = 0; i < envWeights.length; i++) {
    envWeights[i] = rng.next()
  }

  return {
    actionWeights,
    envWeights,
    needCount,
    generation: 0,
    fitness: 0,
    id: `genome-${rng.nextInt(0, 999999)}`,
    trainedBiome: biome,
  }
}

/** Single-point crossover. Parents must have the same needCount. */
export function crossover(parentA: Genome, parentB: Genome, rng: SeededRNG): Genome {
  if (parentA.needCount !== parentB.needCount) {
    throw new Error('Cannot crossover genomes with different needCounts')
  }

  const needCount = parentA.needCount
  const actionWeights = new Float32Array(NUM_ACTIONS * needCount)
  const envWeights = new Float32Array(NUM_ENV_WEIGHTS)

  // Single-point crossover on action weights
  const crossPoint = rng.nextInt(0, actionWeights.length - 1)
  for (let i = 0; i < actionWeights.length; i++) {
    actionWeights[i] = i < crossPoint ? parentA.actionWeights[i] : parentB.actionWeights[i]
  }

  // Single-point crossover on env weights
  const envCrossPoint = rng.nextInt(0, envWeights.length - 1)
  for (let i = 0; i < envWeights.length; i++) {
    envWeights[i] = i < envCrossPoint ? parentA.envWeights[i] : parentB.envWeights[i]
  }

  return {
    actionWeights,
    envWeights,
    needCount,
    generation: Math.max(parentA.generation, parentB.generation) + 1,
    fitness: 0,
    id: `genome-${rng.nextInt(0, 999999)}`,
    trainedBiome: parentA.trainedBiome,
  }
}

/** Mutate genome weights in-place style (returns new genome). */
export function mutate(genome: Genome, mutationRate: number, rng: SeededRNG): Genome {
  const actionWeights = new Float32Array(genome.actionWeights)
  const envWeights = new Float32Array(genome.envWeights)

  for (let i = 0; i < actionWeights.length; i++) {
    if (rng.next() < mutationRate) {
      actionWeights[i] = Math.max(0, Math.min(1, actionWeights[i] + (rng.next() - 0.5) * 0.4))
    }
  }
  for (let i = 0; i < envWeights.length; i++) {
    if (rng.next() < mutationRate) {
      envWeights[i] = Math.max(0, Math.min(1, envWeights[i] + (rng.next() - 0.5) * 0.4))
    }
  }

  return {
    actionWeights,
    envWeights,
    needCount: genome.needCount,
    generation: genome.generation,
    fitness: genome.fitness,
    id: genome.id,
    trainedBiome: genome.trainedBiome,
  }
}

/** Deep clone a genome */
export function cloneGenome(genome: Genome): Genome {
  return {
    actionWeights: new Float32Array(genome.actionWeights),
    envWeights: new Float32Array(genome.envWeights),
    needCount: genome.needCount,
    generation: genome.generation,
    fitness: genome.fitness,
    id: genome.id,
    trainedBiome: genome.trainedBiome,
  }
}

/** Serialize genome to a plain object (for JSON storage) */
export function serializeGenome(genome: Genome): object {
  return {
    actionWeights: Array.from(genome.actionWeights),
    envWeights: Array.from(genome.envWeights),
    needCount: genome.needCount,
    generation: genome.generation,
    fitness: genome.fitness,
    id: genome.id,
    trainedBiome: genome.trainedBiome,
  }
}

/** Deserialize genome from a plain object */
export function deserializeGenome(data: Record<string, unknown>): Genome {
  return {
    actionWeights: new Float32Array(data.actionWeights as number[]),
    envWeights: new Float32Array(data.envWeights as number[]),
    needCount: data.needCount as number,
    generation: data.generation as number,
    fitness: data.fitness as number,
    id: data.id as string,
    trainedBiome: data.trainedBiome as BiomeType,
  }
}
