/**
 * Flow field cache with TTL-based eviction and destination-sharing threshold.
 */

import type { FlowField } from './flow-field-dijkstra.ts'

export interface FlowFieldCacheConfig {
  /** Ticks before an unused flow field is evicted (default: 200) */
  ttl: number
  /** Maximum cached flow fields (default: 32) */
  maxFields: number
  /** Minimum agents sharing a destination before a flow field is computed (default: 2) */
  sharingThreshold: number
}

const DEFAULT_CONFIG: FlowFieldCacheConfig = {
  ttl: 200,
  maxFields: 32,
  sharingThreshold: 2,
}

export class FlowFieldCache {
  private fields: Map<string, FlowField> = new Map()
  private config: FlowFieldCacheConfig

  constructor(config?: Partial<FlowFieldCacheConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  get(destinationKey: string, currentTick: number): FlowField | null {
    const field = this.fields.get(destinationKey)
    if (!field) return null
    field.lastAccessedTick = currentTick
    return field
  }

  set(field: FlowField): void {
    // Evict if at capacity
    if (this.fields.size >= this.config.maxFields && !this.fields.has(field.destinationKey)) {
      this.evictOldest()
    }
    this.fields.set(field.destinationKey, field)
  }

  remove(destinationKey: string): void {
    this.fields.delete(destinationKey)
  }

  /** Returns true if a flow field should be computed (vs A* fallback) */
  shouldUseFlowField(agentCount: number): boolean {
    return agentCount >= this.config.sharingThreshold
  }

  /** Evict flow fields not accessed within TTL ticks */
  sweep(currentTick: number): number {
    let evicted = 0
    for (const [key, field] of this.fields) {
      if (currentTick - field.lastAccessedTick > this.config.ttl) {
        this.fields.delete(key)
        evicted++
      }
    }
    return evicted
  }

  private evictOldest(): void {
    let oldestKey: string | null = null
    let oldestTick = Infinity
    for (const [key, field] of this.fields) {
      if (field.lastAccessedTick < oldestTick) {
        oldestTick = field.lastAccessedTick
        oldestKey = key
      }
    }
    if (oldestKey) this.fields.delete(oldestKey)
  }

  get size(): number {
    return this.fields.size
  }

  clear(): void {
    this.fields.clear()
  }

  /** Get all cached fields (for memory reporting) */
  getAllFields(): IterableIterator<FlowField> {
    return this.fields.values()
  }
}
