import type { VoxelCoord } from './types.ts'
import { voxelKey, voxelEquals, manhattanDistance3D } from './types.ts'
import { PriorityQueue } from './priority-queue.ts'
import type { VoxelWorldView } from './voxel-world-view.ts'
import type {
  IPathfinder,
  NavigationHandle,
  TerrainChangeEvent,
  MemoryReport,
} from './pathfinder-interface.ts'

export const DEFAULT_MAX_OPEN_SET = 10_000

interface AStarNode {
  pos: VoxelCoord
  g: number
  f: number
  parent: AStarNode | null
}

interface SearchState {
  open: PriorityQueue<AStarNode>
  openSet: Map<string, AStarNode>
  closed: Map<string, AStarNode>
  closestNode: AStarNode
  closestH: number
  destination: VoxelCoord
  agentHeight: number
  agentId: number
  maxOpenSet: number
}

class GridAStarHandle implements NavigationHandle {
  private path: VoxelCoord[]
  private pathIndex: number = 0
  private _valid: boolean = true
  private _computing: boolean
  private pathVoxelKeys: Set<string>
  private _partial: boolean
  private searchState: SearchState | null

  readonly agentId: number

  constructor(
    path: VoxelCoord[],
    agentId: number,
    partial: boolean,
    searchState: SearchState | null = null,
  ) {
    this.path = path
    this.agentId = agentId
    this._partial = partial
    this._computing = searchState !== null && path.length === 0
    this.searchState = searchState
    this.pathVoxelKeys = new Set(path.map(voxelKey))
  }

  getNextVoxel(currentPosition: VoxelCoord): VoxelCoord | null {
    if (this._computing || !this._valid) return null
    if (this.pathIndex >= this.path.length) return null

    // Advance past current position
    while (
      this.pathIndex < this.path.length &&
      voxelEquals(this.path[this.pathIndex], currentPosition)
    ) {
      this.pathIndex++
    }

    if (this.pathIndex >= this.path.length) return null
    return this.path[this.pathIndex]
  }

  isValid(): boolean {
    return this._valid
  }

  isComputing(): boolean {
    return this._computing
  }

  invalidate(): void {
    this._valid = false
  }

  /** Resume time-sliced computation. Returns true if finished. */
  resumeComputation(worldView: VoxelWorldView, maxComputeMs: number): boolean {
    if (!this._computing || !this.searchState) return true

    const result = runAStarSearch(
      this.searchState,
      worldView,
      maxComputeMs,
    )

    if (result.done) {
      this.path = result.path
      this._partial = result.partial
      this.pathVoxelKeys = new Set(this.path.map(voxelKey))
      this._computing = false
      this.searchState = null
      this.pathIndex = 0
    }

    return result.done
  }

  isAffectedBy(changedVoxels: VoxelCoord[]): boolean {
    for (const v of changedVoxels) {
      if (this.pathVoxelKeys.has(voxelKey(v))) return true
    }
    return false
  }

  getPlannedPath(): VoxelCoord[] | null {
    if (this._computing) return null
    return this.path.slice(this.pathIndex)
  }

  getDebugInfo(): Record<string, string | number> {
    return {
      pathLength: this.path.length,
      pathIndex: this.pathIndex,
      partial: this._partial ? 1 : 0,
      valid: this._valid ? 1 : 0,
      computing: this._computing ? 1 : 0,
    }
  }

  getHandleMemory(): number {
    // Approximate: each VoxelCoord is 3 ints (24 bytes), plus key string overhead
    return this.path.length * 32 + this.pathVoxelKeys.size * 20
  }
}

interface SearchResult {
  path: VoxelCoord[]
  partial: boolean
  done: boolean
}

function runAStarSearch(
  state: SearchState,
  worldView: VoxelWorldView,
  maxComputeMs: number,
): SearchResult {
  const startTime = performance.now()
  const { open, openSet, closed, destination, agentHeight, maxOpenSet } = state

  while (open.size > 0) {
    // Time check every 64 iterations
    if ((closed.size & 63) === 0 && maxComputeMs > 0) {
      if (performance.now() - startTime >= maxComputeMs) {
        return { path: [], partial: false, done: false }
      }
    }

    const current = open.pop()!
    const ck = voxelKey(current.pos)

    // Skip stale entries (lazy deletion: node was re-pushed with better priority)
    if (closed.has(ck)) continue
    // Skip if this is an outdated heap entry (a newer version exists with lower g)
    const latest = openSet.get(ck)
    if (latest && latest !== current && latest.g < current.g) continue

    openSet.delete(ck)

    if (voxelEquals(current.pos, destination)) {
      return { path: reconstructPath(current), partial: false, done: true }
    }

    closed.set(ck, current)

    const h = manhattanDistance3D(current.pos, destination)
    if (h < state.closestH) {
      state.closestH = h
      state.closestNode = current
    }

    if (closed.size >= maxOpenSet) {
      break
    }

    const neighbors = worldView.getNeighbors(current.pos, agentHeight)
    for (const neighbor of neighbors) {
      const nk = voxelKey(neighbor.coord)
      if (closed.has(nk)) continue

      const ng = current.g + neighbor.cost
      const existing = openSet.get(nk)

      if (existing) {
        if (ng >= existing.g) continue
        existing.g = ng
        existing.f = ng + manhattanDistance3D(neighbor.coord, destination)
        existing.parent = current
        // Re-push with updated priority (lazy deletion — stale entries skipped on pop)
        const tiebreak = existing.f + (neighbor.coord.x * 0.00001 + neighbor.coord.y * 0.0000001 + neighbor.coord.z * 0.000000001)
        open.push(existing, tiebreak)
      } else {
        const nf = ng + manhattanDistance3D(neighbor.coord, destination)
        const node: AStarNode = { pos: neighbor.coord, g: ng, f: nf, parent: current }
        // Deterministic tiebreaking: use f + small epsilon based on coord lexicographic order
        const tiebreak = nf + (neighbor.coord.x * 0.00001 + neighbor.coord.y * 0.0000001 + neighbor.coord.z * 0.000000001)
        open.push(node, tiebreak)
        openSet.set(nk, node)
      }
    }
  }

  // No complete path — return partial
  if (state.closestNode.parent !== null) {
    return { path: reconstructPath(state.closestNode), partial: true, done: true }
  }

  return { path: [], partial: true, done: true }
}

function reconstructPath(node: AStarNode): VoxelCoord[] {
  const path: VoxelCoord[] = []
  let current: AStarNode | null = node
  while (current !== null) {
    path.unshift(current.pos)
    current = current.parent
  }
  return path
}

export class GridAStarPathfinder implements IPathfinder {
  private worldView: VoxelWorldView
  private activeHandles: Map<number, GridAStarHandle> = new Map() // agentId -> handle
  private maxOpenSet: number
  private peakBytes: number = 0

  constructor(worldView: VoxelWorldView, maxOpenSet: number = DEFAULT_MAX_OPEN_SET) {
    this.worldView = worldView
    this.maxOpenSet = maxOpenSet
  }

  requestNavigation(
    start: VoxelCoord,
    destination: VoxelCoord,
    agentHeight: number,
    agentId: number,
    maxComputeMs: number = 0,
  ): NavigationHandle | null {
    // Release any existing handle for this agent
    const existing = this.activeHandles.get(agentId)
    if (existing) {
      this.activeHandles.delete(agentId)
    }

    if (voxelEquals(start, destination)) {
      const handle = new GridAStarHandle([start], agentId, false)
      this.activeHandles.set(agentId, handle)
      return handle
    }

    if (!this.worldView.isWalkable(start, agentHeight)) {
      return null
    }

    const startNode: AStarNode = {
      pos: start,
      g: 0,
      f: manhattanDistance3D(start, destination),
      parent: null,
    }

    const searchState: SearchState = {
      open: new PriorityQueue<AStarNode>(),
      openSet: new Map<string, AStarNode>(),
      closed: new Map<string, AStarNode>(),
      closestNode: startNode,
      closestH: manhattanDistance3D(start, destination),
      destination,
      agentHeight,
      agentId,
      maxOpenSet: this.maxOpenSet,
    }

    searchState.open.push(startNode, startNode.f)
    searchState.openSet.set(voxelKey(start), startNode)

    const result = runAStarSearch(searchState, this.worldView, maxComputeMs)

    if (result.done) {
      if (result.path.length === 0) return null
      const handle = new GridAStarHandle(result.path, agentId, result.partial)
      this.activeHandles.set(agentId, handle)
      this.updatePeakMemory()
      return handle
    }

    // Time-sliced: return computing handle
    const handle = new GridAStarHandle([], agentId, false, searchState)
    this.activeHandles.set(agentId, handle)
    return handle
  }

  /** Called by budget manager to resume time-sliced handles */
  resumeComputing(maxComputeMs: number): void {
    for (const handle of this.activeHandles.values()) {
      if (handle.isComputing()) {
        handle.resumeComputation(this.worldView, maxComputeMs)
      }
    }
  }

  invalidateRegion(event: TerrainChangeEvent): void {
    for (const handle of this.activeHandles.values()) {
      if (handle.isValid() && !handle.isComputing()) {
        if (handle.isAffectedBy(event.changedVoxels)) {
          handle.invalidate()
        }
      }
    }
  }

  releaseNavigation(handle: NavigationHandle): void {
    if (handle instanceof GridAStarHandle) {
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
    for (const [agentId] of this.activeHandles) {
      if (!activeAgentIds.has(agentId)) {
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
