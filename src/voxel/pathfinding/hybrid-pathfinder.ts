/**
 * Hybrid Pathfinder — fifth IPathfinder implementation.
 *
 * Composes HPA* (long range) + D* Lite (local) + Flow Fields (high traffic).
 * Routing decision: ≤2 chunks → D* Lite direct, >2 chunks → HPA* coarse + D* Lite local.
 * Flow field promotion at 3+ agents sharing destination in a chunk.
 * Intent integration via IntentWorldView cost elevation.
 */

import type { VoxelCoord } from './types.ts'
import { voxelKey, voxelEquals } from './types.ts'
import { worldToChunk, chunkKey } from '../world/chunk-utils.ts'
import type { VoxelWorldView } from './voxel-world-view.ts'
import type {
  IPathfinder,
  NavigationHandle,
  TerrainChangeEvent,
  MemoryReport,
} from './pathfinder-interface.ts'
import { HPAStarPathfinder } from './hpa-star.ts'
import { DStarLitePathfinder } from './dstar-lite.ts'
import { FlowFieldPathfinder } from './flow-field-pathfinder.ts'
import { GridAStarPathfinder } from './grid-astar.ts'
import { HybridHandle } from './hybrid-handle.ts'
import { IntentWorldView } from './intent-world-view.ts'
import { IntentRegistry } from './intent-registry.ts'

export interface HybridConfig {
  chunkDistanceThreshold: number
  flowFieldPromotionThreshold: number
  flowFieldDemotionTTL: number
  dstarTimeoutMs: number
  intentCostMultiplier: number
}

const DEFAULT_CONFIG: HybridConfig = {
  chunkDistanceThreshold: 2,
  flowFieldPromotionThreshold: 3,
  flowFieldDemotionTTL: 100,
  dstarTimeoutMs: 5,
  intentCostMultiplier: 3.0,
}

interface PromotedField {
  agentIds: Set<number>
  evictTick: number | null
}

export class HybridPathfinder implements IPathfinder {
  private worldView: VoxelWorldView
  private intentWorldView: VoxelWorldView
  private hpaStar: HPAStarPathfinder
  private flowField: FlowFieldPathfinder
  private gridAStarFallback: GridAStarPathfinder
  private activeHandles: Map<number, HybridHandle> = new Map()
  private destinationAgents: Map<string, Set<number>> = new Map() // destChunkKey → agentIds
  private promotedFields: Map<string, PromotedField> = new Map() // destChunkKey → field info
  private intentRegistry: IntentRegistry
  private config: HybridConfig
  private worldSize: number
  private peakBytes: number = 0
  private currentTick: number = 0

  constructor(
    worldView: VoxelWorldView,
    worldSize: number,
    intentRegistry?: IntentRegistry,
    config?: Partial<HybridConfig>,
  ) {
    this.worldView = worldView
    this.worldSize = worldSize
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.intentRegistry = intentRegistry ?? new IntentRegistry()
    this.intentWorldView = new IntentWorldView(worldView, this.intentRegistry, this.config.intentCostMultiplier)

    // Create owned sub-pathfinder instances
    this.hpaStar = new HPAStarPathfinder(worldView, worldSize)
    this.flowField = new FlowFieldPathfinder(worldView, worldSize, 2, { sharingThreshold: 1 })
    this.gridAStarFallback = new GridAStarPathfinder(worldView)
  }

  /** Get the intent registry (for external publish/cancel calls) */
  getIntentRegistry(): IntentRegistry {
    return this.intentRegistry
  }

  /** Update current tick (called before processTick routing) */
  setTick(tick: number): void {
    this.currentTick = tick
  }

  rebuildGraph(): void {
    this.hpaStar.rebuildGraph()
  }

  rebuildLayers(): void {
    this.flowField.rebuildLayers()
  }

  requestNavigation(
    start: VoxelCoord,
    destination: VoxelCoord,
    agentHeight: number,
    agentId: number,
    _maxComputeMs?: number,
  ): NavigationHandle | null {
    // Release existing handle
    const existing = this.activeHandles.get(agentId)
    if (existing) {
      this.untrackDestination(agentId)
      existing.release()
      this.activeHandles.delete(agentId)
    }

    if (voxelEquals(start, destination)) {
      // Trivial — use D* Lite directly
      const dstar = new DStarLitePathfinder(this.intentWorldView, this.worldSize, true)
      const sub = dstar.requestNavigation(start, destination, agentHeight, agentId)
      if (!sub) return null
      const handle = new HybridHandle(sub, 'dstar', agentId, start)
      this.activeHandles.set(agentId, handle)
      return handle
    }

    if (!this.worldView.isWalkable(start, agentHeight)) return null

    // Compute chessboard chunk distance
    const startChunk = worldToChunk(start)
    const destChunk = worldToChunk(destination)
    const chunkDist = Math.max(
      Math.abs(startChunk.cx - destChunk.cx),
      Math.abs(startChunk.cy - destChunk.cy),
      Math.abs(startChunk.cz - destChunk.cz),
    )

    let handle: HybridHandle | null = null

    if (chunkDist <= this.config.chunkDistanceThreshold) {
      // Short path: D* Lite direct
      handle = this.createDStarHandle(start, destination, agentHeight, agentId)
    } else {
      // Long path: HPA* coarse + D* Lite local
      handle = this.createHPADStarHandle(start, destination, agentHeight, agentId)
    }

    if (!handle) {
      // Fallback: Grid A*
      handle = this.createFallbackHandle(start, destination, agentHeight, agentId)
    }

    if (!handle) return null

    this.activeHandles.set(agentId, handle)
    this.trackDestination(agentId, destination)
    this.checkPromotion(destination)
    this.updatePeakMemory()
    return handle
  }

  private createDStarHandle(
    start: VoxelCoord, dest: VoxelCoord, agentHeight: number, agentId: number,
  ): HybridHandle | null {
    const dstar = new DStarLitePathfinder(this.intentWorldView, this.worldSize, false)
    const sub = dstar.requestNavigation(start, dest, agentHeight, agentId, this.config.dstarTimeoutMs)
    if (!sub) {
      // D* Lite failed — try full-grid mode
      const dstarFull = new DStarLitePathfinder(this.intentWorldView, this.worldSize, true)
      const subFull = dstarFull.requestNavigation(start, dest, agentHeight, agentId, this.config.dstarTimeoutMs)
      if (!subFull) return null
      return new HybridHandle(subFull, 'dstar', agentId, start)
    }
    return new HybridHandle(sub, 'dstar', agentId, start)
  }

  private createHPADStarHandle(
    start: VoxelCoord, dest: VoxelCoord, agentHeight: number, agentId: number,
  ): HybridHandle | null {
    // Get HPA* coarse route
    const hpaHandle = this.hpaStar.requestNavigation(start, dest, agentHeight, agentId)
    if (!hpaHandle) return null

    const coarsePath = hpaHandle.getPlannedPath(start)
    this.hpaStar.releaseNavigation(hpaHandle)

    if (!coarsePath || coarsePath.length === 0) return null

    // Create D* Lite for first segment (start to first waypoint or full path)
    const dstar = new DStarLitePathfinder(this.intentWorldView, this.worldSize, false)
    const segmentDest = coarsePath.length > 1 ? coarsePath[Math.min(coarsePath.length - 1, 10)] : dest
    const sub = dstar.requestNavigation(start, segmentDest, agentHeight, agentId)

    if (!sub) {
      // D* Lite failed for segment — try full grid A* for full path
      return this.createFallbackHandle(start, dest, agentHeight, agentId)
    }

    const handle = new HybridHandle(sub, 'hpastar-dstar', agentId, start, coarsePath)

    // Set up segment transition callback
    handle.onSegmentTransition = (currentPos: VoxelCoord, nextWaypoint: VoxelCoord) => {
      const newDstar = new DStarLitePathfinder(this.intentWorldView, this.worldSize, false)
      return newDstar.requestNavigation(currentPos, nextWaypoint, agentHeight, agentId)
    }

    return handle
  }

  private createFallbackHandle(
    start: VoxelCoord, dest: VoxelCoord, agentHeight: number, agentId: number,
  ): HybridHandle | null {
    const sub = this.gridAStarFallback.requestNavigation(start, dest, agentHeight, agentId)
    if (!sub) return null
    return new HybridHandle(sub, 'dstar', agentId, start) // label as dstar for congestion purposes
  }

  // ─── Flow Field Promotion/Demotion ──────────────────────────────────

  private destChunkKey(dest: VoxelCoord): string {
    return voxelKey(dest) + ':' + chunkKey(worldToChunk(dest))
  }

  private trackDestination(agentId: number, dest: VoxelCoord): void {
    const key = this.destChunkKey(dest)
    let agents = this.destinationAgents.get(key)
    if (!agents) {
      agents = new Set()
      this.destinationAgents.set(key, agents)
    }
    agents.add(agentId)
  }

  private untrackDestination(agentId: number): void {
    for (const [key, agents] of this.destinationAgents) {
      if (agents.has(agentId)) {
        agents.delete(agentId)
        if (agents.size === 0) {
          this.destinationAgents.delete(key)
          // Schedule demotion
          const promoted = this.promotedFields.get(key)
          if (promoted && promoted.evictTick === null) {
            promoted.evictTick = this.currentTick + this.config.flowFieldDemotionTTL
          }
        }
        break
      }
    }
  }

  private checkPromotion(dest: VoxelCoord): void {
    const key = this.destChunkKey(dest)
    const agents = this.destinationAgents.get(key)
    if (!agents || agents.size < this.config.flowFieldPromotionThreshold) return

    // Already promoted?
    const existing = this.promotedFields.get(key)
    if (existing) {
      existing.evictTick = null // cancel pending eviction
      existing.agentIds = new Set(agents)
      return
    }

    // Promote: create flow field for this destination
    this.promotedFields.set(key, {
      agentIds: new Set(agents),
      evictTick: null,
    })

    // Switch all affected handles to flow field
    for (const agentId of agents) {
      const handle = this.activeHandles.get(agentId)
      if (handle && handle.getActiveSubType() !== 'flowfield') {
        const ffHandle = this.flowField.requestNavigation(
          handle.lastKnownGoodPos, dest, 2, agentId,
        )
        if (ffHandle) {
          handle.switchToFlowField(ffHandle)
        }
      }
    }
  }

  /** Evict flow fields that have passed their TTL (call periodically) */
  private evictExpiredFields(): void {
    for (const [key, field] of this.promotedFields) {
      if (field.evictTick !== null && this.currentTick >= field.evictTick) {
        this.promotedFields.delete(key)
      }
    }
  }

  // ─── IPathfinder Interface ──────────────────────────────────────────

  invalidateRegion(event: TerrainChangeEvent): void {
    // Forward to HPA* (chunk graph updates)
    this.hpaStar.invalidateRegion(event)

    // Forward to flow field
    this.flowField.invalidateRegion(event)

    // For active hybrid handles: D* Lite sub-handles self-repair via their
    // own invalidateRegion. But since we create fresh D* Lite instances per handle,
    // we need to handle this differently — the DStarLitePathfinder that created
    // the sub-handle is ephemeral. Instead, we invalidate hybrid handles whose
    // paths pass through changed voxels and let AgentManager re-route.
    for (const handle of this.activeHandles.values()) {
      if (handle.isValid()) {
        const path = handle.getPlannedPath(handle.lastKnownGoodPos)
        if (path) {
          const changedSet = new Set(event.changedVoxels.map(voxelKey))
          for (const p of path) {
            if (changedSet.has(voxelKey(p))) {
              handle.invalidate()
              break
            }
          }
        }
      }
    }
  }

  releaseNavigation(handle: NavigationHandle): void {
    if (handle instanceof HybridHandle) {
      this.untrackDestination(handle.agentId)
      handle.release()
      this.activeHandles.delete(handle.agentId)
      this.evictExpiredFields()
    }
  }

  getMemoryUsage(): MemoryReport {
    let total = 0
    for (const handle of this.activeHandles.values()) {
      total += handle.getHandleMemory()
    }
    // Include sub-pathfinder overhead
    total += this.hpaStar.getMemoryUsage().sharedBytes
    total += this.flowField.getMemoryUsage().sharedBytes
    if (total > this.peakBytes) this.peakBytes = total
    return { sharedBytes: total, peakBytes: this.peakBytes }
  }

  sweepLeakedHandles(activeAgentIds: Set<number>): number {
    let count = 0
    for (const [agentId, handle] of this.activeHandles) {
      if (!activeAgentIds.has(agentId)) {
        this.untrackDestination(agentId)
        handle.release()
        this.activeHandles.delete(agentId)
        count++
      }
    }
    return count
  }

  private updatePeakMemory(): void {
    let total = 0
    for (const handle of this.activeHandles.values()) {
      total += handle.getHandleMemory()
    }
    total += this.hpaStar.getMemoryUsage().sharedBytes
    if (total > this.peakBytes) this.peakBytes = total
  }

  /** Check if a handle is a HybridHandle (for congestion strategy detection) */
  static isHybridHandle(handle: NavigationHandle): handle is HybridHandle {
    return handle instanceof HybridHandle
  }
}
