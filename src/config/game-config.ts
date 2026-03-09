/**
 * GameConfig: user-facing configuration for matchups, world size, and difficulty.
 */

import type { CompetitionConfig, VillageConfig } from '../simulation/competition-engine.ts'
import { UtilityAI } from '../simulation/ai/utility-ai.ts'
import { BehaviorTreeAI } from '../simulation/ai/behavior-tree-ai.ts'
import { GOAPAI } from '../simulation/ai/goap-ai.ts'
import { POPULATION, STOCKPILE } from './game-constants.ts'

export type WorldSize = 'small' | 'medium' | 'large'
export type ResourceLevel = 'scarce' | 'normal' | 'abundant'
export type EventFrequency = 'calm' | 'normal' | 'intense'

export interface GameConfig {
  seed: number
  worldSize: WorldSize
  aiSelection: { utility: boolean; bt: boolean; goap: boolean }
  startingVillagers: 5 | 10 | 15
  startingResources: ResourceLevel
  eventFrequency: EventFrequency
  timeLimit: number | null
}

export const WORLD_SIZE_MAP: Record<WorldSize, { width: number; height: number }> = {
  small: { width: 48, height: 48 },
  medium: { width: 64, height: 64 },
  large: { width: 80, height: 80 },
}

export const RESOURCE_MULTIPLIER: Record<ResourceLevel, number> = {
  scarce: 0.5,
  normal: 1.0,
  abundant: 2.0,
}

export const EVENT_FREQUENCY_MULTIPLIER: Record<EventFrequency, number> = {
  calm: 1.5,
  normal: 1.0,
  intense: 0.6,
}

export function getDefaultGameConfig(): GameConfig {
  return {
    seed: Math.floor(Math.random() * 1000000),
    worldSize: 'medium',
    aiSelection: { utility: true, bt: true, goap: true },
    startingVillagers: POPULATION.INITIAL_VILLAGERS as 10,
    startingResources: 'normal',
    eventFrequency: 'normal',
    timeLimit: null,
  }
}

export function validateAISelection(selection: GameConfig['aiSelection']): boolean {
  const count = [selection.utility, selection.bt, selection.goap].filter(Boolean).length
  return count >= 2
}

export function buildCompetitionConfig(gc: GameConfig): CompetitionConfig {
  const worldDims = WORLD_SIZE_MAP[gc.worldSize]
  const villages: VillageConfig[] = []

  if (gc.aiSelection.utility) {
    villages.push({
      id: 'utility',
      name: 'Utility AI',
      aiSystem: new UtilityAI(),
      villagerCount: gc.startingVillagers,
    })
  }
  if (gc.aiSelection.bt) {
    villages.push({
      id: 'bt',
      name: 'Behavior Tree',
      aiSystem: new BehaviorTreeAI(),
      villagerCount: gc.startingVillagers,
    })
  }
  if (gc.aiSelection.goap) {
    villages.push({
      id: 'goap',
      name: 'GOAP',
      aiSystem: new GOAPAI(),
      villagerCount: gc.startingVillagers,
    })
  }

  return {
    seed: gc.seed,
    worldWidth: worldDims.width,
    worldHeight: worldDims.height,
    villages,
    timeLimit: gc.timeLimit ?? undefined,
    resourceMultiplier: RESOURCE_MULTIPLIER[gc.startingResources],
    eventFrequencyMultiplier: EVENT_FREQUENCY_MULTIPLIER[gc.eventFrequency],
  }
}

export function encodeConfigString(gc: GameConfig): string {
  const ais = [
    gc.aiSelection.utility && 'utility',
    gc.aiSelection.bt && 'bt',
    gc.aiSelection.goap && 'goap',
  ].filter(Boolean).join(',')

  const params = new URLSearchParams()
  params.set('seed', String(gc.seed))
  params.set('size', gc.worldSize)
  params.set('ais', ais)
  params.set('villagers', String(gc.startingVillagers))
  params.set('resources', gc.startingResources)
  params.set('events', gc.eventFrequency)
  if (gc.timeLimit) params.set('limit', String(gc.timeLimit))
  return params.toString()
}

export function decodeConfigString(str: string): Partial<GameConfig> {
  const params = new URLSearchParams(str)
  const result: Partial<GameConfig> = {}

  const seed = params.get('seed')
  if (seed) result.seed = parseInt(seed, 10)

  const size = params.get('size')
  if (size === 'small' || size === 'medium' || size === 'large') result.worldSize = size

  const ais = params.get('ais')
  if (ais) {
    const parts = ais.split(',')
    result.aiSelection = {
      utility: parts.includes('utility'),
      bt: parts.includes('bt'),
      goap: parts.includes('goap'),
    }
  }

  const villagers = params.get('villagers')
  if (villagers === '5' || villagers === '10' || villagers === '15') {
    result.startingVillagers = parseInt(villagers, 10) as 5 | 10 | 15
  }

  const resources = params.get('resources')
  if (resources === 'scarce' || resources === 'normal' || resources === 'abundant') {
    result.startingResources = resources
  }

  const events = params.get('events')
  if (events === 'calm' || events === 'normal' || events === 'intense') {
    result.eventFrequency = events
  }

  const limit = params.get('limit')
  if (limit) result.timeLimit = parseInt(limit, 10)

  return result
}
