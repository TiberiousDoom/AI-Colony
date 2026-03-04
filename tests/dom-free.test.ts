/**
 * Verifies that simulation code has no DOM dependencies.
 * Imports all simulation modules and ensures no window/document access.
 */
import { describe, it, expect } from 'vitest'

describe('DOM-free simulation', () => {

  it('seed.ts has no DOM imports', async () => {
    const mod = await import('../src/utils/seed.ts')
    expect(mod.createRNG).toBeTypeOf('function')
  })

  it('noise.ts has no DOM imports', async () => {
    const mod = await import('../src/utils/noise.ts')
    expect(mod.createNoise2D).toBeTypeOf('function')
    expect(mod.fractalNoise).toBeTypeOf('function')
  })

  it('pathfinding.ts has no DOM imports', async () => {
    const mod = await import('../src/utils/pathfinding.ts')
    expect(mod.findPath).toBeTypeOf('function')
  })

  it('scoring.ts has no DOM imports', async () => {
    const mod = await import('../src/utils/scoring.ts')
    expect(mod.calculateProsperity).toBeTypeOf('function')
  })

  it('villager.ts has no DOM imports', async () => {
    const mod = await import('../src/simulation/villager.ts')
    expect(mod.createVillager).toBeTypeOf('function')
    expect(mod.tickNeeds).toBeTypeOf('function')
  })

  it('world.ts has no DOM imports', async () => {
    const mod = await import('../src/simulation/world.ts')
    expect(mod.World).toBeTypeOf('function')
  })

  it('actions.ts has no DOM imports', async () => {
    const mod = await import('../src/simulation/actions.ts')
    expect(mod.getActionDefinition).toBeTypeOf('function')
  })

  it('ai-interface.ts has no DOM imports', async () => {
    // Interface-only module, just verify it loads
    const mod = await import('../src/simulation/ai/ai-interface.ts')
    expect(mod).toBeDefined()
  })

  it('utility-ai.ts has no DOM imports', async () => {
    const mod = await import('../src/simulation/ai/utility-ai.ts')
    expect(mod.UtilityAI).toBeTypeOf('function')
  })

  it('simulation-engine.ts has no DOM imports', async () => {
    const mod = await import('../src/simulation/simulation-engine.ts')
    expect(mod.SimulationEngine).toBeTypeOf('function')
  })

  it('structures.ts has no DOM imports', async () => {
    const mod = await import('../src/simulation/structures.ts')
    expect(mod.canAfford).toBeTypeOf('function')
    expect(mod.createStructure).toBeTypeOf('function')
  })

  it('events.ts has no DOM imports', async () => {
    const mod = await import('../src/simulation/events.ts')
    expect(mod.EventScheduler).toBeTypeOf('function')
    expect(mod.resolveEventPosition).toBeTypeOf('function')
  })

  it('behavior-tree.ts has no DOM imports', async () => {
    const mod = await import('../src/simulation/ai/behavior-tree.ts')
    expect(mod.Selector).toBeTypeOf('function')
    expect(mod.Sequence).toBeTypeOf('function')
  })

  it('behavior-tree-ai.ts has no DOM imports', async () => {
    const mod = await import('../src/simulation/ai/behavior-tree-ai.ts')
    expect(mod.BehaviorTreeAI).toBeTypeOf('function')
  })

  it('competition-engine.ts has no DOM imports', async () => {
    const mod = await import('../src/simulation/competition-engine.ts')
    expect(mod.CompetitionEngine).toBeTypeOf('function')
  })

  it('serialization.ts has no DOM imports', async () => {
    const mod = await import('../src/utils/serialization.ts')
    expect(mod.serializeNeedsMap).toBeTypeOf('function')
    expect(mod.deserializeNeedsMap).toBeTypeOf('function')
  })

  it('full simulation can run without DOM', async () => {
    // This is the most important test: a full simulation run
    // If any simulation code touches DOM, this will fail
    const { SimulationEngine } = await import('../src/simulation/simulation-engine.ts')
    const { UtilityAI } = await import('../src/simulation/ai/utility-ai.ts')

    const engine = new SimulationEngine({
      seed: 42,
      worldWidth: 64,
      worldHeight: 64,
      aiSystem: new UtilityAI(),
      villagerCount: 5,
    })

    // Run 30 ticks (1 day)
    for (let i = 0; i < 30; i++) {
      engine.tick()
    }

    const state = engine.getState()
    expect(state.tick).toBe(30)
    expect(state.dayCount).toBe(1)
  })

  it('competition engine can run without DOM', async () => {
    const { CompetitionEngine } = await import('../src/simulation/competition-engine.ts')
    const { UtilityAI } = await import('../src/simulation/ai/utility-ai.ts')
    const { BehaviorTreeAI } = await import('../src/simulation/ai/behavior-tree-ai.ts')

    const engine = new CompetitionEngine({
      seed: 42,
      worldWidth: 64,
      worldHeight: 64,
      villages: [
        { id: 'a', name: 'Utility', aiSystem: new UtilityAI(), villagerCount: 5 },
        { id: 'b', name: 'BT', aiSystem: new BehaviorTreeAI(), villagerCount: 5 },
      ],
    })

    for (let i = 0; i < 30; i++) engine.tick()
    expect(engine.getState().tick).toBe(30)
  })
})
