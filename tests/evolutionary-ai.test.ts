/**
 * Tests for the Evolutionary AI system.
 */
import { describe, it, expect } from 'vitest'
import { EvolutionaryAI } from '../src/simulation/ai/evolutionary-ai.ts'
import { createRandomGenome } from '../src/simulation/ai/genome.ts'
import { createRNG } from '../src/utils/seed.ts'
import { createVillager } from '../src/simulation/villager.ts'
import { World } from '../src/simulation/world.ts'
import type { AIWorldView } from '../src/simulation/ai/ai-interface.ts'

function makeTestContext(needCount = 4) {
  const rng = createRNG(42)
  const world = new World({ width: 32, height: 32, seed: 42 })
  const hasCooling = needCount === 5
  const villager = createVillager('test', 'Test', 16, 16, hasCooling)
  return { rng, world, villager }
}

function makeWorldView(world: World): AIWorldView {
  return {
    world,
    stockpile: { food: 50, wood: 50, stone: 20 },
    villagers: [],
    structures: [],
    season: 'summer',
    timeOfDay: 'day',
    tick: 0,
    campfirePosition: { x: 16, y: 16 },
    activeEvents: [],
    monsters: [],
    villageId: 'test',
  }
}

describe('EvolutionaryAI', () => {
  it('implements IAISystem with correct name', () => {
    const rng = createRNG(1)
    const genome = createRandomGenome(rng, 4, 'temperate')
    const ai = new EvolutionaryAI(genome)
    expect(ai.name).toBe('Evolutionary')
  })

  it('decides valid actions', () => {
    const rng = createRNG(1)
    const genome = createRandomGenome(rng, 4, 'temperate')
    const ai = new EvolutionaryAI(genome)
    const { villager, world } = makeTestContext()
    const aiRng = createRNG(99)

    const decision = ai.decide(villager, makeWorldView(world), aiRng)

    expect(decision).toBeDefined()
    expect(decision.action).toBeTypeOf('string')
    expect(decision.scores).toBeDefined()
    expect(decision.scores!.length).toBeGreaterThan(0)
  })

  it('different genomes produce different decisions', () => {
    const rng1 = createRNG(42)
    const rng2 = createRNG(12345)
    const genome1 = createRandomGenome(rng1, 4, 'temperate')
    const genome2 = createRandomGenome(rng2, 4, 'temperate')
    const ai1 = new EvolutionaryAI(genome1)
    const ai2 = new EvolutionaryAI(genome2)
    const { villager, world } = makeTestContext()
    const worldView = makeWorldView(world)

    const scores1: string[] = []
    const scores2: string[] = []
    for (let i = 0; i < 10; i++) {
      const d1 = ai1.decide(villager, worldView, createRNG(i))
      const d2 = ai2.decide(villager, worldView, createRNG(i))
      scores1.push(d1.action)
      scores2.push(d2.action)
    }
    // At least some decisions should differ
    const different = scores1.some((s, i) => s !== scores2[i])
    expect(different).toBe(true)
  })

  it('works with desert biome (5 needs)', () => {
    const rng = createRNG(1)
    const genome = createRandomGenome(rng, 5, 'desert')
    const ai = new EvolutionaryAI(genome)
    expect(genome.needCount).toBe(5)

    const { villager, world } = makeTestContext(5)
    const decision = ai.decide(villager, makeWorldView(world), createRNG(99))
    expect(decision.action).toBeTypeOf('string')
  })

  it('has no DOM dependencies', async () => {
    const mod = await import('../src/simulation/ai/evolutionary-ai.ts')
    expect(mod.EvolutionaryAI).toBeTypeOf('function')
  })

  it('getGenome returns the genome', () => {
    const rng = createRNG(1)
    const genome = createRandomGenome(rng, 4, 'temperate')
    const ai = new EvolutionaryAI(genome)
    expect(ai.getGenome()).toBe(genome)
  })
})
