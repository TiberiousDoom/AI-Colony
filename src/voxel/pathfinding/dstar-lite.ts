/**
 * D* Lite pathfinder — incremental replanning for dynamic environments.
 *
 * Searches backward from goal to start. On terrain change, repairs the
 * search in-place rather than recomputing from scratch.
 */

import type { VoxelCoord } from './types.ts'
import { voxelKey, voxelEquals, manhattanDistance3D } from './types.ts'
import { DStarPriorityQueue, compareKeys, type DStarKey } from './dstar-priority-queue.ts'
import type { VoxelWorldView } from './voxel-world-view.ts'
import type {
  IPathfinder,
  NavigationHandle,
  TerrainChangeEvent,
  MemoryReport,
} from './pathfinder-interface.ts'
import { worldToChunk, CHUNK_SIZE, chunkKey } from '../world/chunk-utils.ts'

const MAX_ITERATIONS = 50_000
const MAX_PATH_TRACE = 500

function chunkScopeKeys(center: VoxelCoord): Set<string> {
  const cc = worldToChunk(center)
  const keys = new Set<string>()
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        keys.add(chunkKey({ cx: cc.cx + dx, cy: cc.cy + dy, cz: cc.cz + dz }))
      }
    }
  }
  return keys
}

class DStarLiteHandle implements NavigationHandle {
  readonly agentId: number
  private g: Map<string, number> = new Map()
  private rhs: Map<string, number> = new Map()
  private U: DStarPriorityQueue = new DStarPriorityQueue()
  private km: number = 0
  private sStart: VoxelCoord
  private sGoal: VoxelCoord
  private scopeChunks: Set<string> | null
  private worldView: VoxelWorldView
  private agentHeight: number
  private _released: boolean = false

  constructor(
    start: VoxelCoord,
    goal: VoxelCoord,
    agentId: number,
    worldView: VoxelWorldView,
    agentHeight: number,
    scopeChunks: Set<string> | null,
  ) {
    this.sStart = start
    this.sGoal = goal
    this.agentId = agentId
    this.worldView = worldView
    this.agentHeight = agentHeight
    this.scopeChunks = scopeChunks
  }

  initialize(): boolean {
    this.rhs.set(voxelKey(this.sGoal), 0)
    const k = this.calculateKey(this.sGoal)
    this.U.insert(voxelKey(this.sGoal), k)
    this.computeShortestPath()
    return this.getG(this.sStart) < Infinity
  }

  private getG(pos: VoxelCoord): number {
    return this.g.get(voxelKey(pos)) ?? Infinity
  }

  private getRhs(pos: VoxelCoord): number {
    return this.rhs.get(voxelKey(pos)) ?? Infinity
  }

  private setG(pos: VoxelCoord, val: number): void {
    const k = voxelKey(pos)
    if (val === Infinity) {
      this.g.delete(k)
    } else {
      this.g.set(k, val)
    }
  }

  private setRhs(pos: VoxelCoord, val: number): void {
    const k = voxelKey(pos)
    if (val === Infinity) {
      this.rhs.delete(k)
    } else {
      this.rhs.set(k, val)
    }
  }

  private calculateKey(pos: VoxelCoord): DStarKey {
    const g = this.getG(pos)
    const r = this.getRhs(pos)
    const minGR = Math.min(g, r)
    return [minGR + manhattanDistance3D(this.sStart, pos) + this.km, minGR]
  }

  private isInScope(pos: VoxelCoord): boolean {
    if (!this.scopeChunks) return true
    return this.scopeChunks.has(chunkKey(worldToChunk(pos)))
  }

  private getSuccessors(pos: VoxelCoord): Array<{ coord: VoxelCoord; cost: number }> {
    const neighbors = this.worldView.getNeighbors(pos, this.agentHeight)
    if (!this.scopeChunks) return neighbors
    return neighbors.filter(n => this.isInScope(n.coord))
  }

  private getPredecessors(pos: VoxelCoord): Array<{ coord: VoxelCoord; cost: number }> {
    // For each neighbor of pos, check if pos appears in that neighbor's successors
    // Optimization: in this grid, if B is a neighbor of A, then the cost A→B
    // is found by checking A's neighbors list. For predecessors of pos, we check
    // which adjacent cells have pos as a successor.
    const candidates = this.worldView.getNeighbors(pos, this.agentHeight)
    const result: Array<{ coord: VoxelCoord; cost: number }> = []
    for (const cand of candidates) {
      if (this.scopeChunks && !this.isInScope(cand.coord)) continue
      // Check if cand → pos is a valid edge
      const candNeighbors = this.worldView.getNeighbors(cand.coord, this.agentHeight)
      for (const cn of candNeighbors) {
        if (voxelEquals(cn.coord, pos)) {
          result.push({ coord: cand.coord, cost: cn.cost })
          break
        }
      }
    }
    return result
  }

  private updateVertex(u: VoxelCoord): void {
    const uk = voxelKey(u)
    if (!voxelEquals(u, this.sGoal)) {
      // rhs(u) = min over successors s' of { cost(u, s') + g(s') }
      let minVal = Infinity
      const succs = this.getSuccessors(u)
      for (const s of succs) {
        const val = s.cost + this.getG(s.coord)
        if (val < minVal) minVal = val
      }
      this.setRhs(u, minVal)
    }
    if (this.U.contains(uk)) {
      this.U.remove(uk)
    }
    const g = this.g.get(uk) ?? Infinity
    const r = this.rhs.get(uk) ?? Infinity
    if (g !== r) {
      this.U.insert(uk, this.calculateKey(u))
    }
  }

  private computeShortestPath(): void {
    const startKey = voxelKey(this.sStart)
    let iterations = 0

    while (!this.U.isEmpty() && iterations < MAX_ITERATIONS) {
      const topKey = this.U.topKey()
      const startCalcKey = this.calculateKey(this.sStart)
      const gStart = this.g.get(startKey) ?? Infinity
      const rhsStart = this.rhs.get(startKey) ?? Infinity

      if (compareKeys(topKey, startCalcKey) >= 0 && gStart === rhsStart) {
        break
      }

      const entry = this.U.pop()!
      iterations++

      const uKey = entry.voxelKey
      const parts = uKey.split(',')
      const u: VoxelCoord = { x: +parts[0], y: +parts[1], z: +parts[2] }

      const kOld = entry.key
      const kNew = this.calculateKey(u)

      const gU = this.g.get(uKey) ?? Infinity
      const rhsU = this.rhs.get(uKey) ?? Infinity

      if (compareKeys(kOld, kNew) < 0) {
        // Reinsert with updated key
        this.U.insert(uKey, kNew)
      } else if (gU > rhsU) {
        // Overconsistent — make consistent
        this.setG(u, rhsU)
        const preds = this.getPredecessors(u)
        for (const p of preds) {
          this.updateVertex(p.coord)
        }
      } else {
        // Underconsistent — reset g
        this.setG(u, Infinity)
        this.updateVertex(u)
        const preds = this.getPredecessors(u)
        for (const p of preds) {
          this.updateVertex(p.coord)
        }
      }
    }
  }

  invalidateEdges(changedVoxels: VoxelCoord[]): void {
    // For each changed voxel, update affected nodes
    const affected = new Set<string>()
    for (const v of changedVoxels) {
      // The changed voxel itself and its neighbors may have changed edges
      affected.add(voxelKey(v))
      const neighbors = this.worldView.getNeighbors(v, this.agentHeight)
      for (const n of neighbors) {
        if (!this.scopeChunks || this.isInScope(n.coord)) {
          affected.add(voxelKey(n.coord))
        }
      }
      // Also check 1-ring around changed voxel for affected predecessors
      const dx = [-1, 0, 1]
      for (const ddx of dx) {
        for (const ddy of dx) {
          for (const ddz of dx) {
            if (ddx === 0 && ddy === 0 && ddz === 0) continue
            const adj: VoxelCoord = { x: v.x + ddx, y: v.y + ddy, z: v.z + ddz }
            if (!this.scopeChunks || this.isInScope(adj)) {
              affected.add(voxelKey(adj))
            }
          }
        }
      }
    }

    this.km += manhattanDistance3D(this.sStart, this.sStart) // km stays same if agent hasn't moved

    for (const key of affected) {
      const parts = key.split(',')
      const pos: VoxelCoord = { x: +parts[0], y: +parts[1], z: +parts[2] }
      this.updateVertex(pos)
    }

    this.computeShortestPath()
  }

  /** Update start position (agent has moved) */
  updateStart(newStart: VoxelCoord): void {
    if (!voxelEquals(newStart, this.sStart)) {
      this.km += manhattanDistance3D(this.sStart, newStart)
      this.sStart = newStart
    }
  }

  getNextVoxel(currentPosition: VoxelCoord): VoxelCoord | null {
    this.updateStart(currentPosition)
    if (voxelEquals(currentPosition, this.sGoal)) return null
    if (this.getG(currentPosition) === Infinity) return null

    const succs = this.getSuccessors(currentPosition)
    let bestCost = Infinity
    let bestCoord: VoxelCoord | null = null

    for (const s of succs) {
      const val = s.cost + this.getG(s.coord)
      if (val < bestCost) {
        bestCost = val
        bestCoord = s.coord
      }
    }

    return bestCoord
  }

  isValid(): boolean {
    return !this._released
  }

  isComputing(): boolean {
    return false
  }

  getPlannedPath(currentPosition: VoxelCoord): VoxelCoord[] | null {
    this.updateStart(currentPosition)
    if (this.getG(currentPosition) === Infinity) return null

    const path: VoxelCoord[] = [currentPosition]
    let current = currentPosition

    for (let i = 0; i < MAX_PATH_TRACE; i++) {
      if (voxelEquals(current, this.sGoal)) break

      const succs = this.getSuccessors(current)
      let bestCost = Infinity
      let bestCoord: VoxelCoord | null = null

      for (const s of succs) {
        const val = s.cost + this.getG(s.coord)
        if (val < bestCost) {
          bestCost = val
          bestCoord = s.coord
        }
      }

      if (!bestCoord || bestCost >= Infinity) break
      path.push(bestCoord)
      current = bestCoord
    }

    return path.length > 1 ? path : null
  }

  getDebugInfo(): Record<string, string | number> {
    return {
      gSize: this.g.size,
      rhsSize: this.rhs.size,
      uSize: this.U.size,
      km: this.km,
      gStart: this.getG(this.sStart),
      rhsStart: this.getRhs(this.sStart),
    }
  }

  getHandleMemory(): number {
    return (this.g.size + this.rhs.size) * 30 + this.U.size * 40
  }

  release(): void {
    this._released = true
    this.g.clear()
    this.rhs.clear()
    this.U.clear()
  }

  /** Expose g/rhs for testing */
  getGValue(pos: VoxelCoord): number { return this.getG(pos) }
  getRhsValue(pos: VoxelCoord): number { return this.getRhs(pos) }
  getGMapSize(): number { return this.g.size }
  getGMapKeys(): string[] { return [...this.g.keys()] }

  /** Check if a changed voxel set affects this handle's scope */
  isAffectedByVoxels(changedVoxels: VoxelCoord[]): boolean {
    if (!this.scopeChunks) return true
    for (const v of changedVoxels) {
      if (this.isInScope(v)) return true
    }
    return false
  }

  getGoal(): VoxelCoord { return this.sGoal }
}

export class DStarLitePathfinder implements IPathfinder {
  private worldView: VoxelWorldView
  private activeHandles: Map<number, DStarLiteHandle> = new Map()
  private peakBytes: number = 0
  private fullGridMode: boolean

  constructor(worldView: VoxelWorldView, _worldSize?: number, fullGridMode: boolean = false) {
    this.worldView = worldView
    this.fullGridMode = fullGridMode
  }

  requestNavigation(
    start: VoxelCoord,
    destination: VoxelCoord,
    agentHeight: number,
    agentId: number,
    _maxComputeMs?: number,
  ): NavigationHandle | null {
    // Release existing handle for this agent
    const existing = this.activeHandles.get(agentId)
    if (existing) {
      existing.release()
      this.activeHandles.delete(agentId)
    }

    if (voxelEquals(start, destination)) {
      const handle = new DStarLiteHandle(start, destination, agentId, this.worldView, agentHeight, null)
      handle.initialize()
      this.activeHandles.set(agentId, handle)
      return handle
    }

    if (!this.worldView.isWalkable(start, agentHeight)) {
      return null
    }

    const scopeChunks = this.fullGridMode ? null : chunkScopeKeys(start)
    const handle = new DStarLiteHandle(start, destination, agentId, this.worldView, agentHeight, scopeChunks)
    const reachable = handle.initialize()

    if (!reachable) {
      handle.release()
      return null
    }

    this.activeHandles.set(agentId, handle)
    this.updatePeakMemory()
    return handle
  }

  invalidateRegion(event: TerrainChangeEvent): void {
    for (const handle of this.activeHandles.values()) {
      if (handle.isValid() && handle.isAffectedByVoxels(event.changedVoxels)) {
        handle.invalidateEdges(event.changedVoxels)
      }
    }
  }

  releaseNavigation(handle: NavigationHandle): void {
    if (handle instanceof DStarLiteHandle) {
      handle.release()
      this.activeHandles.delete(handle.agentId)
    }
  }

  getMemoryUsage(): MemoryReport {
    let total = 0
    for (const handle of this.activeHandles.values()) {
      total += handle.getHandleMemory()
    }
    if (total > this.peakBytes) this.peakBytes = total
    return {
      sharedBytes: 0,
      peakBytes: this.peakBytes,
    }
  }

  sweepLeakedHandles(activeAgentIds: Set<number>): number {
    let count = 0
    for (const [agentId, handle] of this.activeHandles) {
      if (!activeAgentIds.has(agentId)) {
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
    if (total > this.peakBytes) this.peakBytes = total
  }
}
