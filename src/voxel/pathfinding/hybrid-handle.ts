/**
 * Hybrid NavigationHandle — composite handle that delegates to the
 * appropriate sub-handle based on current navigation segment.
 *
 * Wraps a single active sub-handle at any time. On chunk boundary
 * crossings with a coarse route, releases old D* Lite and creates
 * new one for next segment. On flow field promotion, swaps sub-handle.
 */

import type { VoxelCoord } from './types.ts'
import { voxelKey, voxelEquals } from './types.ts'
import type { NavigationHandle } from './pathfinder-interface.ts'

export type SubHandleType = 'dstar' | 'hpastar-dstar' | 'flowfield'

export class HybridHandle implements NavigationHandle {
  readonly agentId: number
  private subHandle: NavigationHandle
  private _subType: SubHandleType
  private coarseRoute: VoxelCoord[] | null
  private coarseRouteIndex: number = 0
  private _lastKnownGoodPos: VoxelCoord
  private _valid: boolean = true
  private _released: boolean = false

  /** Callback to create a new D* Lite sub-handle for the next coarse segment */
  onSegmentTransition: ((start: VoxelCoord, nextWaypoint: VoxelCoord) => NavigationHandle | null) | null = null

  constructor(
    subHandle: NavigationHandle,
    subType: SubHandleType,
    agentId: number,
    startPos: VoxelCoord,
    coarseRoute: VoxelCoord[] | null = null,
  ) {
    this.subHandle = subHandle
    this._subType = subType
    this.agentId = agentId
    this._lastKnownGoodPos = startPos
    this.coarseRoute = coarseRoute
    this.coarseRouteIndex = 0
  }

  getNextVoxel(currentPosition: VoxelCoord): VoxelCoord | null {
    if (this._released || !this._valid) return null

    const next = this.subHandle.getNextVoxel(currentPosition)

    if (next !== null) {
      this._lastKnownGoodPos = currentPosition
      return next
    }

    // Sub-handle exhausted — check if we have more coarse route segments
    if (this.coarseRoute && this.coarseRouteIndex < this.coarseRoute.length - 1) {
      this.coarseRouteIndex++
      const nextWaypoint = this.coarseRoute[this.coarseRouteIndex]

      if (this.onSegmentTransition) {
        const newHandle = this.onSegmentTransition(currentPosition, nextWaypoint)
        if (newHandle) {
          this.subHandle = newHandle
          return this.subHandle.getNextVoxel(currentPosition)
        }
      }
    }

    return null
  }

  isValid(): boolean {
    if (this._released) return false
    if (!this._valid) return false
    // For D* Lite sub-handles, they self-repair (always valid)
    // For HPA* sub-handles, check their validity
    return this.subHandle.isValid()
  }

  isComputing(): boolean {
    return this.subHandle.isComputing()
  }

  /** Switch sub-handle to a flow field (promotion) */
  switchToFlowField(flowFieldHandle: NavigationHandle): void {
    this.subHandle = flowFieldHandle
    this._subType = 'flowfield'
  }

  /** Switch sub-handle back to D* Lite (demotion) */
  switchToDStar(dstarHandle: NavigationHandle): void {
    this.subHandle = dstarHandle
    this._subType = this.coarseRoute ? 'hpastar-dstar' : 'dstar'
  }

  /** Get the active sub-algorithm type (used for congestion strategy) */
  getActiveSubType(): SubHandleType {
    return this._subType
  }

  get lastKnownGoodPos(): VoxelCoord {
    return this._lastKnownGoodPos
  }

  invalidate(): void {
    this._valid = false
  }

  release(): void {
    this._released = true
  }

  getPlannedPath(currentPosition: VoxelCoord): VoxelCoord[] | null {
    return this.subHandle.getPlannedPath(currentPosition)
  }

  getDebugInfo(): Record<string, string | number> {
    const subInfo = this.subHandle.getDebugInfo()
    return {
      ...subInfo,
      algorithm: 'Hybrid',
      subAlgorithm: this._subType,
      coarseRouteLength: this.coarseRoute?.length ?? 0,
      coarseRouteIndex: this.coarseRouteIndex,
      lastKnownGood: voxelKey(this._lastKnownGoodPos),
    }
  }

  getHandleMemory(): number {
    const subMem = this.subHandle.getHandleMemory()
    const coarseMem = (this.coarseRoute?.length ?? 0) * 24
    return subMem + coarseMem + 64 // overhead
  }
}
