/**
 * Intent Broadcast System — predictive terrain change notifications.
 *
 * Miners publish "will remove block at X in N ticks". Nearby agents
 * treat those blocks as elevated cost, routing around them before
 * the block is actually removed. Intents are batched per tick to
 * prevent mid-tick cost recalculations.
 */

import type { VoxelCoord } from './types.ts'
import { voxelKey } from './types.ts'

export interface IntentEntry {
  blockPos: VoxelCoord
  publisherAgentId: number
  publishTick: number
  expectedCompletionTick: number
  cancelled: boolean
}

export class IntentRegistry {
  private intents: Map<string, IntentEntry> = new Map() // voxelKey → entry
  private agentIntents: Map<number, Set<string>> = new Map() // agentId → set of voxelKeys
  private pendingPublishes: IntentEntry[] = []
  private pendingCancels: string[] = [] // voxelKeys to cancel
  private _batchApplied: boolean = false

  /** Publish an intent (buffered until applyBatch) */
  publishIntent(blockPos: VoxelCoord, publisherAgentId: number, expectedCompletionTick: number, currentTick: number): void {
    this.pendingPublishes.push({
      blockPos,
      publisherAgentId,
      publishTick: currentTick,
      expectedCompletionTick,
      cancelled: false,
    })
  }

  /** Cancel all intents by a specific agent (e.g., miner died or stopped mining) */
  cancelIntent(publisherAgentId: number): void {
    const keys = this.agentIntents.get(publisherAgentId)
    if (keys) {
      for (const key of keys) {
        this.pendingCancels.push(key)
      }
    }
  }

  /** Cancel intent for a specific block (mining completed) */
  cancelIntentForBlock(blockPos: VoxelCoord): void {
    this.pendingCancels.push(voxelKey(blockPos))
  }

  /**
   * Apply all pending publishes, cancels, and expiries in one batch.
   * Called ONCE at end of tick to prevent mid-tick cost oscillation.
   */
  applyBatch(currentTick: number): void {
    this._batchApplied = true

    // Process cancels
    for (const key of this.pendingCancels) {
      const entry = this.intents.get(key)
      if (entry) {
        entry.cancelled = true
        this.intents.delete(key)
        const agentKeys = this.agentIntents.get(entry.publisherAgentId)
        if (agentKeys) {
          agentKeys.delete(key)
          if (agentKeys.size === 0) this.agentIntents.delete(entry.publisherAgentId)
        }
      }
    }
    this.pendingCancels = []

    // Process publishes
    for (const entry of this.pendingPublishes) {
      const key = voxelKey(entry.blockPos)
      this.intents.set(key, entry)
      let agentKeys = this.agentIntents.get(entry.publisherAgentId)
      if (!agentKeys) {
        agentKeys = new Set()
        this.agentIntents.set(entry.publisherAgentId, agentKeys)
      }
      agentKeys.add(key)
    }
    this.pendingPublishes = []

    // Expire intents past their expected completion tick
    for (const [key, entry] of this.intents) {
      if (entry.expectedCompletionTick <= currentTick) {
        this.intents.delete(key)
        const agentKeys = this.agentIntents.get(entry.publisherAgentId)
        if (agentKeys) {
          agentKeys.delete(key)
          if (agentKeys.size === 0) this.agentIntents.delete(entry.publisherAgentId)
        }
      }
    }
  }

  /** Check if a block has an active intent (only checks committed intents, not pending) */
  hasIntent(blockPos: VoxelCoord): boolean {
    return this.intents.has(voxelKey(blockPos))
  }

  /** Get all active intents near a position (Manhattan distance) */
  getIntentsNearby(pos: VoxelCoord, radius: number): IntentEntry[] {
    const results: IntentEntry[] = []
    for (const entry of this.intents.values()) {
      const dx = Math.abs(entry.blockPos.x - pos.x)
      const dy = Math.abs(entry.blockPos.y - pos.y)
      const dz = Math.abs(entry.blockPos.z - pos.z)
      if (dx + dy + dz <= radius) {
        results.push(entry)
      }
    }
    return results
  }

  /** Get traversal cost multiplier for a block position */
  getTraversalCostMultiplier(blockPos: VoxelCoord, multiplier: number = 3.0): number {
    return this.intents.has(voxelKey(blockPos)) ? multiplier : 1.0
  }

  /** Get number of active intents */
  get size(): number {
    return this.intents.size
  }

  /** Get number of pending publishes (for testing batch behavior) */
  get pendingCount(): number {
    return this.pendingPublishes.length
  }

  /** Whether applyBatch has been called at least once */
  get hasBatchApplied(): boolean {
    return this._batchApplied
  }

  clear(): void {
    this.intents.clear()
    this.agentIntents.clear()
    this.pendingPublishes = []
    this.pendingCancels = []
  }
}
