/**
 * Serialization: save/load simulation snapshots to localStorage.
 */

import type { NeedType, NeedState } from '../simulation/villager.ts'

const STORAGE_KEY_PREFIX = 'ai-colony-snapshot-'
const STORAGE_CAP_BYTES = 5 * 1024 * 1024 // 5 MB

export interface SimulationSnapshot {
  version: number
  label: string
  timestamp: number
  seed: number
  competitionState: SerializedCompetitionState
  rngState: number[]
  aiState?: Record<string, unknown>
}

export interface SerializedCompetitionState {
  villages: SerializedVillageState[]
  tick: number
  dayCount: number
  timeOfDay: string
  season: string
  seasonDay: number
  activeEvents: unknown[]
  globalEvents: unknown[]
  isOver: boolean
  winner: string | null
  victoryLapRemaining: number
}

export interface SerializedVillageState {
  id: string
  name: string
  villagers: SerializedVillager[]
  stockpile: { food: number; wood: number; stone: number }
  structures: unknown[]
  campfirePosition: { x: number; y: number }
  history: { daily: unknown[] }
  events: unknown[]
  isEliminated: boolean
  eliminationTick: number | null
  eliminationCause: string | null
  growthTimer: number
  aiSystemName: string
}

export interface SerializedVillager {
  id: string
  name: string
  position: { x: number; y: number }
  needs: Array<[string, NeedState]>
  currentAction: string
  actionTicksRemaining: number
  targetPosition: { x: number; y: number } | null
  path: Array<{ x: number; y: number }>
  alive: boolean
  carrying: { type: string; amount: number } | null
}

/** Serialize a NeedsMap (Map) to an array of [key, value] pairs */
export function serializeNeedsMap(needs: Map<NeedType, NeedState>): Array<[string, NeedState]> {
  return Array.from(needs.entries()).map(([k, v]) => [k as string, { ...v }])
}

/** Deserialize a [key, value] array back to a NeedsMap */
export function deserializeNeedsMap(entries: Array<[string, NeedState]>): Map<NeedType, NeedState> {
  return new Map(entries.map(([k, v]) => [k as NeedType, { ...v }]))
}

// --- localStorage management ---

export function saveSnapshot(snapshot: SimulationSnapshot): boolean {
  const json = JSON.stringify(snapshot)
  const sizeBytes = new Blob([json]).size

  // Check storage cap
  const usage = getStorageUsage()
  if (usage.usedBytes + sizeBytes > STORAGE_CAP_BYTES) {
    return false
  }

  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + snapshot.label, json)
    return true
  } catch {
    return false
  }
}

export function loadSnapshot(label: string): SimulationSnapshot | null {
  try {
    const json = localStorage.getItem(STORAGE_KEY_PREFIX + label)
    if (!json) return null
    return JSON.parse(json) as SimulationSnapshot
  } catch {
    return null
  }
}

export function listSnapshots(): Array<{ label: string; timestamp: number; sizeBytes: number }> {
  const results: Array<{ label: string; timestamp: number; sizeBytes: number }> = []

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key || !key.startsWith(STORAGE_KEY_PREFIX)) continue

    const json = localStorage.getItem(key)
    if (!json) continue

    try {
      const snapshot = JSON.parse(json) as SimulationSnapshot
      results.push({
        label: snapshot.label,
        timestamp: snapshot.timestamp,
        sizeBytes: new Blob([json]).size,
      })
    } catch {
      // Skip corrupt entries
    }
  }

  return results.sort((a, b) => b.timestamp - a.timestamp)
}

export function deleteSnapshot(label: string): void {
  localStorage.removeItem(STORAGE_KEY_PREFIX + label)
}

export function getStorageUsage(): { usedBytes: number; capBytes: number } {
  let usedBytes = 0

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key || !key.startsWith(STORAGE_KEY_PREFIX)) continue
    const val = localStorage.getItem(key)
    if (val) usedBytes += new Blob([val]).size
  }

  return { usedBytes, capBytes: STORAGE_CAP_BYTES }
}
