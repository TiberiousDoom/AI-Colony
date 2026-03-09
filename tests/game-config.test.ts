/**
 * Tests for GameConfig type and buildCompetitionConfig builder.
 */

import { describe, it, expect } from 'vitest'
import {
  getDefaultGameConfig,
  validateAISelection,
  buildCompetitionConfig,
  encodeConfigString,
  decodeConfigString,
  WORLD_SIZE_MAP,
  RESOURCE_MULTIPLIER,
  EVENT_FREQUENCY_MULTIPLIER,
} from '../src/config/game-config.ts'

describe('getDefaultGameConfig', () => {
  it('returns valid defaults', () => {
    const gc = getDefaultGameConfig()
    expect(gc.worldSize).toBe('medium')
    expect(gc.startingVillagers).toBe(10)
    expect(gc.startingResources).toBe('normal')
    expect(gc.eventFrequency).toBe('normal')
    expect(gc.timeLimit).toBeNull()
    expect(gc.aiSelection.utility).toBe(true)
    expect(gc.aiSelection.bt).toBe(true)
    expect(gc.aiSelection.goap).toBe(true)
  })
})

describe('validateAISelection', () => {
  it('requires at least 2 AIs', () => {
    expect(validateAISelection({ utility: true, bt: true, goap: false, evolutionary: false })).toBe(true)
    expect(validateAISelection({ utility: true, bt: true, goap: true, evolutionary: false })).toBe(true)
    expect(validateAISelection({ utility: true, bt: false, goap: false, evolutionary: false })).toBe(false)
    expect(validateAISelection({ utility: false, bt: false, goap: false, evolutionary: false })).toBe(false)
  })
})

describe('buildCompetitionConfig', () => {
  it('maps default config to competition config', () => {
    const gc = getDefaultGameConfig()
    gc.seed = 42
    const cc = buildCompetitionConfig(gc)
    expect(cc.seed).toBe(42)
    expect(cc.worldWidth).toBe(64)
    expect(cc.worldHeight).toBe(64)
    expect(cc.villages).toHaveLength(3)
    expect(cc.villages.map(v => v.id)).toEqual(['utility', 'bt', 'goap'])
  })

  it('respects world size', () => {
    const gc = getDefaultGameConfig()
    gc.worldSize = 'small'
    const cc = buildCompetitionConfig(gc)
    expect(cc.worldWidth).toBe(48)
    expect(cc.worldHeight).toBe(48)
  })

  it('respects large world size', () => {
    const gc = getDefaultGameConfig()
    gc.worldSize = 'large'
    const cc = buildCompetitionConfig(gc)
    expect(cc.worldWidth).toBe(80)
  })

  it('filters out disabled AIs', () => {
    const gc = getDefaultGameConfig()
    gc.aiSelection = { utility: true, bt: false, goap: true, evolutionary: false }
    const cc = buildCompetitionConfig(gc)
    expect(cc.villages).toHaveLength(2)
    expect(cc.villages.map(v => v.id)).toEqual(['utility', 'goap'])
  })

  it('passes resource multiplier', () => {
    const gc = getDefaultGameConfig()
    gc.startingResources = 'scarce'
    const cc = buildCompetitionConfig(gc)
    expect(cc.resourceMultiplier).toBe(0.5)
  })

  it('passes event frequency multiplier', () => {
    const gc = getDefaultGameConfig()
    gc.eventFrequency = 'intense'
    const cc = buildCompetitionConfig(gc)
    expect(cc.eventFrequencyMultiplier).toBe(0.6)
  })

  it('passes time limit', () => {
    const gc = getDefaultGameConfig()
    gc.timeLimit = 60
    const cc = buildCompetitionConfig(gc)
    expect(cc.timeLimit).toBe(60)
  })

  it('sets villager count from config', () => {
    const gc = getDefaultGameConfig()
    gc.startingVillagers = 5
    const cc = buildCompetitionConfig(gc)
    expect(cc.villages[0].villagerCount).toBe(5)
  })
})

describe('encodeConfigString / decodeConfigString', () => {
  it('round-trips a config', () => {
    const gc = getDefaultGameConfig()
    gc.seed = 12345
    gc.worldSize = 'small'
    gc.aiSelection = { utility: true, bt: false, goap: true, evolutionary: false }
    gc.startingVillagers = 15
    gc.startingResources = 'abundant'
    gc.eventFrequency = 'calm'
    gc.timeLimit = 90

    const str = encodeConfigString(gc)
    const decoded = decodeConfigString(str)

    expect(decoded.seed).toBe(12345)
    expect(decoded.worldSize).toBe('small')
    expect(decoded.aiSelection).toEqual({ utility: true, bt: false, goap: true, evolutionary: false })
    expect(decoded.startingVillagers).toBe(15)
    expect(decoded.startingResources).toBe('abundant')
    expect(decoded.eventFrequency).toBe('calm')
    expect(decoded.timeLimit).toBe(90)
  })

  it('handles unlimited time limit', () => {
    const gc = getDefaultGameConfig()
    gc.timeLimit = null
    const str = encodeConfigString(gc)
    const decoded = decodeConfigString(str)
    expect(decoded.timeLimit).toBeUndefined() // null timeLimit not encoded
  })
})

describe('constant maps', () => {
  it('WORLD_SIZE_MAP has expected values', () => {
    expect(WORLD_SIZE_MAP.small).toEqual({ width: 48, height: 48 })
    expect(WORLD_SIZE_MAP.medium).toEqual({ width: 64, height: 64 })
    expect(WORLD_SIZE_MAP.large).toEqual({ width: 80, height: 80 })
  })

  it('RESOURCE_MULTIPLIER values', () => {
    expect(RESOURCE_MULTIPLIER.scarce).toBe(0.5)
    expect(RESOURCE_MULTIPLIER.normal).toBe(1.0)
    expect(RESOURCE_MULTIPLIER.abundant).toBe(2.0)
  })

  it('EVENT_FREQUENCY_MULTIPLIER values', () => {
    expect(EVENT_FREQUENCY_MULTIPLIER.calm).toBe(1.5)
    expect(EVENT_FREQUENCY_MULTIPLIER.normal).toBe(1.0)
    expect(EVENT_FREQUENCY_MULTIPLIER.intense).toBe(0.6)
  })
})
