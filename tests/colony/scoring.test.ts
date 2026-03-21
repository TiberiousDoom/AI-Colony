import { describe, it, expect } from 'vitest'
import { calculateProsperity } from '../../src/colony/utils/scoring.ts'

describe('Prosperity Scoring', () => {
  it('returns 0 for all-zero inputs', () => {
    expect(calculateProsperity(0, 0, 0, 0, 0, 0, 0, 0, 0, 0)).toBe(0)
  })

  it('population contributes 5 per villager (base, no efficiency with 0 health/hunger/energy)', () => {
    const base = calculateProsperity(0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
    const with5 = calculateProsperity(5, 0, 0, 0, 0, 0, 0, 0, 0, 0)
    // base component: 5 * 5 = 25, efficiency: (0+0+0)/3 * 5 * 0.02 = 0
    expect(with5 - base).toBe(25)
  })

  it('days survived contributes 1.0 per day', () => {
    const base = calculateProsperity(0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
    const with10 = calculateProsperity(0, 0, 0, 0, 0, 0, 0, 10, 0, 0)
    expect(with10 - base).toBe(10)
  })

  it('all base components accumulate', () => {
    // pop=10, health=75, food=100, wood=50, stone=30, structs=0, types=0, days=20
    // base: 10*5 + 75*1.0 + 100*0.3 + 50*0.2 + 30*0.2 + 0 + 0 + 20*1.0
    // = 50 + 75 + 30 + 10 + 6 + 0 + 0 + 20 = 191
    // efficiency: (75+50+50)/3 * 10 * 0.02 = 58.333 * 0.2 = 11.667
    // total = 202.667
    const score = calculateProsperity(10, 75, 100, 50, 30, 0, 0, 20, 50, 50)
    expect(score).toBeCloseTo(202.667, 1)
  })

  it('efficiency bonus scales with population and wellbeing', () => {
    // Zero pop = no efficiency bonus
    const noPop = calculateProsperity(0, 75, 0, 0, 0, 0, 0, 0, 75, 75)
    const noPopBase = 0 + 75 * 1.0 + 0 + 0 + 0 + 0 + 0 + 0
    expect(noPop).toBeCloseTo(noPopBase) // efficiency = 0 when pop = 0

    // 10 pop with perfect health/hunger/energy
    const perfect = calculateProsperity(10, 100, 0, 0, 0, 0, 0, 0, 100, 100)
    // base: 50 + 100
    // efficiency: (100+100+100)/3 * 10 * 0.02 = 100 * 0.2 = 20
    expect(perfect).toBeCloseTo(170)
  })

  it('uses default avgHunger/avgEnergy of 50 when not provided', () => {
    const explicit = calculateProsperity(10, 75, 100, 50, 30, 0, 0, 20, 50, 50)
    const implicit = calculateProsperity(10, 75, 100, 50, 30, 0, 0, 20)
    expect(implicit).toBeCloseTo(explicit)
  })

  it('structure weights are correct', () => {
    const base = calculateProsperity(0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
    const withStructs = calculateProsperity(0, 0, 0, 0, 0, 3, 2, 0, 0, 0)
    // 3*5 + 2*5 = 25
    expect(withStructs - base).toBe(25)
  })
})
