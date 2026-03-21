/**
 * Phase 5 Gate Tests — Final Polish & Configurability
 *
 * Verifies: centralized constants, game config, setup screen config builder,
 * scoring rebalance, event difficulty scaling, keyboard shortcuts hook,
 * save/load serialization, config string encode/decode, acceptance checks.
 */

import { describe, it, expect } from 'vitest'

// ─── Block 1: Centralized Constants ──────────────────────────────────

import {
  TIMING, POPULATION, NEEDS, STOCKPILE,
  STRUCTURE_COSTS_MAP, STRUCTURES, SCORING,
  EVENTS, COMPETITION, MONSTERS, CRAFTING,
} from '../../src/colony/config/game-constants.ts'

describe('Centralized Constants', () => {
  it('1. all constant groups are exported', () => {
    expect(TIMING).toBeDefined()
    expect(POPULATION).toBeDefined()
    expect(NEEDS).toBeDefined()
    expect(STOCKPILE).toBeDefined()
    expect(STRUCTURE_COSTS_MAP).toBeDefined()
    expect(STRUCTURES).toBeDefined()
    expect(SCORING).toBeDefined()
    expect(EVENTS).toBeDefined()
    expect(COMPETITION).toBeDefined()
    expect(MONSTERS).toBeDefined()
    expect(CRAFTING).toBeDefined()
  })

  it('2. TIMING has tick/day/season values', () => {
    expect(TIMING.TICKS_PER_DAY).toBeGreaterThan(0)
    expect(TIMING.DAY_TICKS + TIMING.NIGHT_TICKS).toBe(TIMING.TICKS_PER_DAY)
    expect(TIMING.DAYS_PER_SEASON).toBeGreaterThan(0)
  })

  it('3. SCORING includes efficiency factor', () => {
    expect(SCORING.EFFICIENCY_FACTOR).toBeDefined()
    expect(SCORING.EFFICIENCY_FACTOR).toBeGreaterThan(0)
    expect(SCORING.POP_WEIGHT).toBe(5)
    expect(SCORING.DAYS_WEIGHT).toBe(1.0)
  })

  it('4. STRUCTURE_COSTS_MAP covers all 6 structure types', () => {
    const types = Object.keys(STRUCTURE_COSTS_MAP)
    expect(types).toContain('shelter')
    expect(types).toContain('storage')
    expect(types).toContain('watchtower')
    expect(types).toContain('farm')
    expect(types).toContain('wall')
    expect(types).toContain('well')
    expect(types.length).toBe(6)
  })

  it('5. MONSTERS has type stats for all monster types', () => {
    expect(MONSTERS.TYPES.wolf).toBeDefined()
    expect(MONSTERS.TYPES.bear).toBeDefined()
    expect(MONSTERS.TYPES.goblin).toBeDefined()
    expect(MONSTERS.TYPES.snake).toBeDefined()
    expect(MONSTERS.TYPES.wolf.hp).toBeGreaterThan(0)
  })

  it('6. CRAFTING has equipment definitions', () => {
    const equipment = CRAFTING.EQUIPMENT
    expect(equipment.wooden_spear).toBeDefined()
    expect(equipment.stone_sword).toBeDefined()
    expect(equipment.leather_tunic).toBeDefined()
    expect(equipment.stone_mail).toBeDefined()
    expect(equipment.wooden_spear.slot).toBe('weapon')
    expect(equipment.leather_tunic.slot).toBe('armor')
  })
})

// ─── Block 2: GameConfig & Builder ───────────────────────────────────

import {
  getDefaultGameConfig,
  validateAISelection,
  buildCompetitionConfig,
  encodeConfigString,
  decodeConfigString,
  WORLD_SIZE_MAP,
  RESOURCE_MULTIPLIER,
  EVENT_FREQUENCY_MULTIPLIER,
} from '../../src/colony/config/game-config.ts'

describe('GameConfig & Setup', () => {
  it('7. default config has all required fields', () => {
    const gc = getDefaultGameConfig()
    expect(gc.seed).toBeTypeOf('number')
    expect(gc.worldSize).toBe('medium')
    expect(gc.aiSelection).toBeDefined()
    expect(gc.startingVillagers).toBe(10)
    expect(gc.startingResources).toBe('normal')
    expect(gc.eventFrequency).toBe('normal')
    expect(gc.timeLimit).toBeNull()
    expect(gc.biome).toBe('temperate')
  })

  it('8. min-2 AI validation rejects 0 and 1 AI', () => {
    expect(validateAISelection({ utility: false, bt: false, goap: false, evolutionary: false })).toBe(false)
    expect(validateAISelection({ utility: true, bt: false, goap: false, evolutionary: false })).toBe(false)
    expect(validateAISelection({ utility: true, bt: true, goap: false, evolutionary: false })).toBe(true)
    expect(validateAISelection({ utility: true, bt: true, goap: true, evolutionary: true })).toBe(true)
  })

  it('9. buildCompetitionConfig maps world sizes correctly', () => {
    for (const size of ['small', 'medium', 'large'] as const) {
      const gc = { ...getDefaultGameConfig(), worldSize: size, seed: 42 }
      const cc = buildCompetitionConfig(gc)
      expect(cc.worldWidth).toBe(WORLD_SIZE_MAP[size].width)
      expect(cc.worldHeight).toBe(WORLD_SIZE_MAP[size].height)
    }
  })

  it('10. buildCompetitionConfig passes resource and event multipliers', () => {
    const gc = { ...getDefaultGameConfig(), startingResources: 'scarce' as const, eventFrequency: 'intense' as const, seed: 42 }
    const cc = buildCompetitionConfig(gc)
    expect(cc.resourceMultiplier).toBe(RESOURCE_MULTIPLIER.scarce)
    expect(cc.eventFrequencyMultiplier).toBe(EVENT_FREQUENCY_MULTIPLIER.intense)
  })

  it('11. buildCompetitionConfig filters disabled AIs', () => {
    const gc = { ...getDefaultGameConfig(), seed: 42, aiSelection: { utility: true, bt: false, goap: true, evolutionary: false } }
    const cc = buildCompetitionConfig(gc)
    expect(cc.villages).toHaveLength(2)
    expect(cc.villages.map(v => v.id)).toEqual(['utility', 'goap'])
  })

  it('12. config string round-trips all fields', () => {
    const gc = getDefaultGameConfig()
    gc.seed = 99999
    gc.worldSize = 'large'
    gc.aiSelection = { utility: true, bt: false, goap: true, evolutionary: false }
    gc.startingVillagers = 15
    gc.startingResources = 'abundant'
    gc.eventFrequency = 'calm'
    gc.timeLimit = 60

    const str = encodeConfigString(gc)
    const decoded = decodeConfigString(str)

    expect(decoded.seed).toBe(99999)
    expect(decoded.worldSize).toBe('large')
    expect(decoded.aiSelection).toEqual({ utility: true, bt: false, goap: true, evolutionary: false })
    expect(decoded.startingVillagers).toBe(15)
    expect(decoded.startingResources).toBe('abundant')
    expect(decoded.eventFrequency).toBe('calm')
    expect(decoded.timeLimit).toBe(60)
  })
})

// ─── Block 3: Scoring Rebalance ──────────────────────────────────────

import { calculateProsperity, perCapitaProsperity } from '../../src/colony/utils/scoring.ts'

describe('Scoring Rebalance', () => {
  it('13. efficiency bonus increases score with higher wellbeing', () => {
    const low = calculateProsperity(10, 50, 0, 0, 0, 0, 0, 0, 20, 20)
    const high = calculateProsperity(10, 50, 0, 0, 0, 0, 0, 0, 90, 90)
    expect(high).toBeGreaterThan(low)
  })

  it('14. zero population produces zero efficiency bonus', () => {
    const score = calculateProsperity(0, 100, 0, 0, 0, 0, 0, 0, 100, 100)
    // Only avgHealth*1.0 = 100 (no pop bonus, no efficiency)
    expect(score).toBe(100)
  })

  it('15. perCapitaProsperity handles edge cases', () => {
    expect(perCapitaProsperity(1000, 10)).toBe(100)
    expect(perCapitaProsperity(1000, 0)).toBe(0)
    expect(perCapitaProsperity(0, 5)).toBe(0)
  })
})

// ─── Block 3B: Event Difficulty Scaling ──────────────────────────────

import { getDifficultyMultiplier } from '../../src/colony/simulation/events.ts'

describe('Event Difficulty Scaling', () => {
  it('16. difficulty increases over time', () => {
    const early = getDifficultyMultiplier(5)
    const mid = getDifficultyMultiplier(20)
    const late = getDifficultyMultiplier(40)
    const endgame = getDifficultyMultiplier(60)

    expect(early).toBe(1.0)
    expect(mid).toBeGreaterThan(early)
    expect(late).toBeGreaterThan(mid)
    expect(endgame).toBeGreaterThan(late)
  })

  it('17. scaling matches plan spec values', () => {
    expect(getDifficultyMultiplier(10)).toBe(1.0)
    expect(getDifficultyMultiplier(25)).toBe(1.2)
    expect(getDifficultyMultiplier(45)).toBe(1.5)
    expect(getDifficultyMultiplier(55)).toBe(1.8)
  })
})

// ─── Block 4B: Keyboard Shortcuts ────────────────────────────────────

describe('Keyboard Shortcuts', () => {
  it('18. useKeyboardShortcuts module exports correctly', async () => {
    const mod = await import('../../src/colony/hooks/useKeyboardShortcuts.ts')
    expect(mod.useKeyboardShortcuts).toBeTypeOf('function')
  })
})

// ─── Block 5: Config Encode/Decode ───────────────────────────────────

describe('Config Sharing', () => {
  it('19. encode omits null timeLimit', () => {
    const gc = { ...getDefaultGameConfig(), timeLimit: null }
    const str = encodeConfigString(gc)
    expect(str).not.toContain('limit=')
  })

  it('20. decode handles partial/malformed input gracefully', () => {
    const partial = decodeConfigString('seed=42&size=small')
    expect(partial.seed).toBe(42)
    expect(partial.worldSize).toBe('small')
    expect(partial.aiSelection).toBeUndefined()

    const empty = decodeConfigString('')
    expect(empty.seed).toBeUndefined()
  })

  it('21. biome field round-trips through config string', () => {
    const gc = { ...getDefaultGameConfig(), biome: 'desert' as const, seed: 1 }
    const str = encodeConfigString(gc)
    const decoded = decodeConfigString(str)
    expect(decoded.biome).toBe('desert')
  })
})

// ─── Block 6: Save/Load Serialization ────────────────────────────────

describe('Serialization', () => {
  it('22. serialization module exports save/load functions', async () => {
    const mod = await import('../../src/colony/utils/serialization.ts')
    expect(mod.saveSnapshot).toBeTypeOf('function')
    expect(mod.loadSnapshot).toBeTypeOf('function')
    expect(mod.listSnapshots).toBeTypeOf('function')
    expect(mod.deleteSnapshot).toBeTypeOf('function')
  })
})

// ─── Block 7: Acceptance Checks ──────────────────────────────────────

import { ALL_CHECKS, CATEGORIES } from '../../src/colony/utils/acceptance-checks.ts'
import type { Phase } from '../../src/colony/utils/acceptance-checks.ts'

describe('Acceptance Checks', () => {
  it('23. Phase 5 checks registered in ALL_CHECKS', () => {
    const p5Checks = ALL_CHECKS.filter(c => c.phase === 5)
    expect(p5Checks.length).toBeGreaterThanOrEqual(8)
  })

  it('24. Phase type includes 5', () => {
    const phases = new Set(ALL_CHECKS.map(c => c.phase))
    expect(phases.has(5 as Phase)).toBe(true)
  })

  it('25. configuration and polish categories exist', () => {
    const categoryKeys = CATEGORIES.map(c => c.key)
    expect(categoryKeys).toContain('configuration')
    expect(categoryKeys).toContain('polish')
  })

  it('26. all 5 phases have at least 1 check', () => {
    for (const phase of [1, 2, 3, 4, 5] as Phase[]) {
      const count = ALL_CHECKS.filter(c => c.phase === phase).length
      expect(count).toBeGreaterThan(0)
    }
  })
})

// ─── Integration: Full Config → Competition Pipeline ─────────────────

describe('Config-to-Competition Integration', () => {
  it('27. all world sizes produce valid competition configs', () => {
    for (const size of ['small', 'medium', 'large'] as const) {
      const gc = { ...getDefaultGameConfig(), worldSize: size, seed: 42 }
      const cc = buildCompetitionConfig(gc)
      expect(cc.villages.length).toBeGreaterThanOrEqual(2)
      expect(cc.worldWidth).toBeGreaterThan(0)
      expect(cc.worldHeight).toBeGreaterThan(0)
      expect(cc.seed).toBe(42)
    }
  })

  it('28. resource multipliers span 0.5x to 2.0x', () => {
    expect(RESOURCE_MULTIPLIER.scarce).toBe(0.5)
    expect(RESOURCE_MULTIPLIER.normal).toBe(1.0)
    expect(RESOURCE_MULTIPLIER.abundant).toBe(2.0)
  })

  it('29. event frequency multipliers span calm to intense', () => {
    expect(EVENT_FREQUENCY_MULTIPLIER.calm).toBeGreaterThan(EVENT_FREQUENCY_MULTIPLIER.normal)
    expect(EVENT_FREQUENCY_MULTIPLIER.normal).toBeGreaterThan(EVENT_FREQUENCY_MULTIPLIER.intense)
  })

  it('30. time limit passes through to competition config', () => {
    const gc = { ...getDefaultGameConfig(), seed: 42, timeLimit: 90 }
    const cc = buildCompetitionConfig(gc)
    expect(cc.timeLimit).toBe(90)

    const gcUnlimited = { ...getDefaultGameConfig(), seed: 42, timeLimit: null }
    const ccUnlimited = buildCompetitionConfig(gcUnlimited)
    expect(ccUnlimited.timeLimit).toBeUndefined()
  })
})
