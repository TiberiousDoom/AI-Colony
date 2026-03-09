/**
 * Headless training loop for evolutionary AI genomes.
 * Runs N generations, selecting and breeding the best performers.
 */

import { createRNG } from '../utils/seed.ts'
import {
  type Genome,
  type BiomeType,
  createRandomGenome,
  crossover,
  mutate,
  cloneGenome,
  getGenomeNeedCount,
} from '../simulation/ai/genome.ts'
import { EvolutionaryAI } from '../simulation/ai/evolutionary-ai.ts'
import { SimulationEngine } from '../simulation/simulation-engine.ts'
import { evaluateFitness } from './fitness.ts'
import { getNeed, NeedType } from '../simulation/villager.ts'

export interface TrainingConfig {
  populationSize: number
  generationsMax: number
  ticksPerEvaluation: number
  mutationRate: number
  elitePercent: number
  seed: number
  worldSize: 'small' | 'medium' | 'large'
  biome: BiomeType
}

export interface TrainingState {
  generation: number
  bestFitness: number
  fitnessHistory: number[]
  bestGenome: Genome
  isComplete: boolean
  isPaused: boolean
  isPlateaued: boolean
}

const WORLD_SIZES: Record<string, number> = {
  small: 32,
  medium: 64,
  large: 128,
}

export function getDefaultTrainingConfig(): TrainingConfig {
  return {
    populationSize: 20,
    generationsMax: 50,
    ticksPerEvaluation: 900,
    mutationRate: 0.05,
    elitePercent: 0.3,
    seed: 42,
    worldSize: 'medium',
    biome: 'temperate',
  }
}

/** Evaluate a single genome by running a headless simulation */
function evaluateGenome(genome: Genome, config: TrainingConfig, genSeed: number): number {
  const ai = new EvolutionaryAI(genome)
  const worldDim = WORLD_SIZES[config.worldSize] ?? 64

  const engine = new SimulationEngine({
    seed: genSeed,
    worldWidth: worldDim,
    worldHeight: worldDim,
    aiSystem: ai,
    villagerCount: 10,
  })

  // Run for ticksPerEvaluation ticks
  for (let t = 0; t < config.ticksPerEvaluation; t++) {
    engine.tick()
  }

  const state = engine.getState()
  const alive = state.villagers.filter(v => v.alive)

  const avgHealth = alive.length > 0
    ? alive.reduce((sum, v) => sum + getNeed(v, NeedType.Health).current, 0) / alive.length
    : 0
  const avgHunger = alive.length > 0
    ? alive.reduce((sum, v) => sum + getNeed(v, NeedType.Hunger).current, 0) / alive.length
    : 0
  const avgEnergy = alive.length > 0
    ? alive.reduce((sum, v) => sum + getNeed(v, NeedType.Energy).current, 0) / alive.length
    : 0

  return evaluateFitness({
    population: alive.length,
    avgHealth,
    food: state.stockpile.food,
    wood: state.stockpile.wood,
    stone: state.stockpile.stone,
    structures: state.structures,
    daysSurvived: state.dayCount,
    startingVillagerCount: 10,
    avgHunger,
    avgEnergy,
  })
}

/** Run a single generation: evaluate, select, crossover, mutate */
export function runGeneration(
  population: Genome[],
  config: TrainingConfig,
  generationSeed: number,
): { nextPopulation: Genome[]; bestFitness: number; bestGenome: Genome } {
  const rng = createRNG(generationSeed)

  // Evaluate each genome
  const evaluated = population.map((genome, i) => {
    const fitness = evaluateGenome(genome, config, generationSeed + i * 1000)
    const g = cloneGenome(genome)
    g.fitness = fitness
    return g
  })

  // Sort by fitness (descending)
  evaluated.sort((a, b) => b.fitness - a.fitness)

  const bestGenome = cloneGenome(evaluated[0])
  const bestFitness = bestGenome.fitness

  // Select elite
  const eliteCount = Math.max(2, Math.floor(population.length * config.elitePercent))
  const elites = evaluated.slice(0, eliteCount)

  // Generate new population
  const nextPopulation: Genome[] = []

  // Keep best genome unchanged
  nextPopulation.push(cloneGenome(bestGenome))

  // Fill rest with crossover + mutation
  while (nextPopulation.length < config.populationSize) {
    const parentA = elites[rng.nextInt(0, elites.length - 1)]
    const parentB = elites[rng.nextInt(0, elites.length - 1)]
    let child = crossover(parentA, parentB, rng)
    child = mutate(child, config.mutationRate, rng)
    nextPopulation.push(child)
  }

  return { nextPopulation, bestFitness, bestGenome }
}

/** Run the full training loop synchronously. Calls onProgress after each generation. */
export function trainSync(
  config: TrainingConfig,
  onProgress?: (state: TrainingState) => void,
  shouldStop?: () => boolean,
): Genome {
  const rng = createRNG(config.seed)
  const needCount = getGenomeNeedCount(config.biome)

  // Initialize random population
  let population: Genome[] = []
  for (let i = 0; i < config.populationSize; i++) {
    population.push(createRandomGenome(rng, needCount, config.biome))
  }

  let bestGenome = population[0]
  let bestFitness = 0
  const fitnessHistory: number[] = []
  let plateauCount = 0

  for (let gen = 0; gen < config.generationsMax; gen++) {
    if (shouldStop?.()) break

    const genSeed = config.seed + gen * 10000
    const result = runGeneration(population, config, genSeed)

    population = result.nextPopulation
    bestGenome = result.bestGenome
    bestFitness = result.bestFitness
    fitnessHistory.push(bestFitness)

    // Convergence detection
    if (fitnessHistory.length >= 10) {
      const recent = fitnessHistory.slice(-10)
      const maxRecent = Math.max(...recent)
      const minRecent = Math.min(...recent)
      if (maxRecent > 0 && (maxRecent - minRecent) / maxRecent < 0.01) {
        plateauCount++
      } else {
        plateauCount = 0
      }
    }

    const state: TrainingState = {
      generation: gen + 1,
      bestFitness,
      fitnessHistory: [...fitnessHistory],
      bestGenome: cloneGenome(bestGenome),
      isComplete: gen === config.generationsMax - 1,
      isPaused: false,
      isPlateaued: plateauCount >= 1,
    }

    onProgress?.(state)
  }

  return bestGenome
}
