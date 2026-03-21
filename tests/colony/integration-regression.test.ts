/**
 * Integration regression tests: multi-seed stability tests for all AI types.
 * Skipped by default as they're slow — run with `npx vitest run tests/integration-regression.test.ts`.
 */

import { describe, it, expect } from 'vitest'
import { SimulationEngine } from '../../src/colony/simulation/simulation-engine.ts'
import { UtilityAI } from '../../src/colony/simulation/ai/utility-ai.ts'
import { BehaviorTreeAI } from '../../src/colony/simulation/ai/behavior-tree-ai.ts'
import { GOAPAI } from '../../src/colony/simulation/ai/goap-ai.ts'

const AI_SYSTEMS = [
  { name: 'Utility AI', factory: () => new UtilityAI() },
  { name: 'Behavior Tree', factory: () => new BehaviorTreeAI() },
  { name: 'GOAP', factory: () => new GOAPAI() },
]

describe.skip('Integration Regression (100 seeds x 300 ticks)', () => {
  for (const ai of AI_SYSTEMS) {
    describe(ai.name, () => {
      it('survives 100 seeds without crashes, NaN, or OOB', () => {
        for (let seed = 1; seed <= 100; seed++) {
          const engine = new SimulationEngine({
            seed,
            worldWidth: 64,
            worldHeight: 64,
            aiSystem: ai.factory(),
            villagerCount: 10,
          })

          for (let tick = 0; tick < 300; tick++) {
            engine.tick()
            if (engine.getState().isOver) break

            const state = engine.getState()
            for (const v of state.villagers) {
              if (!v.alive) continue
              // No NaN in needs
              for (const [, need] of v.needs) {
                expect(isNaN(need.current)).toBe(false)
              }
              // No out-of-bounds
              expect(v.position.x).toBeGreaterThanOrEqual(0)
              expect(v.position.x).toBeLessThan(64)
              expect(v.position.y).toBeGreaterThanOrEqual(0)
              expect(v.position.y).toBeLessThan(64)
            }
            // No negative stockpile
            expect(state.stockpile.food).toBeGreaterThanOrEqual(0)
            expect(state.stockpile.wood).toBeGreaterThanOrEqual(0)
            expect(state.stockpile.stone).toBeGreaterThanOrEqual(0)
          }
        }
      })
    })
  }
})
