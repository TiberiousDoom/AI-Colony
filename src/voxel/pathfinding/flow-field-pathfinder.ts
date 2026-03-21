/**
 * Flow field pathfinder — third IPathfinder implementation.
 *
 * Uses a layer-based flow field architecture:
 * - Layer construction: walkable surfaces grouped by ±1 Y flood-fill
 * - Per-layer Dijkstra with cross-layer transitions
 * - Shared flow fields for destinations with multiple agents
 * - Falls back to A* for destinations with few agents
 */

import type { VoxelCoord } from './types.ts'
import { voxelKey, voxelEquals } from './types.ts'
import type {
  IPathfinder,
  NavigationHandle,
  TerrainChangeEvent,
  MemoryReport,
} from './pathfinder-interface.ts'
import type { VoxelWorldView } from './voxel-world-view.ts'
import { PriorityQueue } from './priority-queue.ts'
import {
  buildLayerSystem,
  updateLayerColumns,
  getLayerAt,
  getLayer,
  type LayerSystem,
} from './flow-field-layers.ts'
import {
  computeFlowField,
  getFlowDirection,
  isTransitionPoint,
  getTransitionTarget,
  tracePath,
  type FlowField,
} from './flow-field-dijkstra.ts'
import { FlowFieldCache, type FlowFieldCacheConfig } from './flow-field-cache.ts'

// ─── Fallback A* on layer graph ─────────────────────────────────────

function layerAStar(
  system: LayerSystem,
  startLayer: number,
  start: VoxelCoord,
  destLayer: number,
  dest: VoxelCoord,
): VoxelCoord[] | null {
  const size = system.worldSize
  const layer = getLayer(system, startLayer)
  if (!layer) return null

  interface Node { x: number; z: number; layerId: number; g: number; f: number; parent: Node | null }

  const h = (x: number, z: number, lid: number) => {
    const dy = lid === destLayer ? 0 : 5 // layer penalty
    return Math.abs(x - dest.x) + Math.abs(z - dest.z) + dy
  }

  const open = new PriorityQueue<Node>()
  const closed = new Set<string>()
  const key = (x: number, z: number, lid: number) => `${x},${z},${lid}`

  const startNode: Node = { x: start.x, z: start.z, layerId: startLayer, g: 0, f: h(start.x, start.z, startLayer), parent: null }
  open.push(startNode, startNode.f)
  const bestG = new Map<string, number>()
  bestG.set(key(start.x, start.z, startLayer), 0)

  const DIRS = [{ dx: 1, dz: 0 }, { dx: -1, dz: 0 }, { dx: 0, dz: 1 }, { dx: 0, dz: -1 }]

  while (open.size > 0) {
    const current = open.pop()!
    const ck = key(current.x, current.z, current.layerId)

    if (current.x === dest.x && current.z === dest.z && current.layerId === destLayer) {
      const path: VoxelCoord[] = []
      let n: Node | null = current
      while (n) {
        const l = getLayer(system, n.layerId)
        const y = l ? l.grid[n.x][n.z].y : 0
        path.unshift({ x: n.x, y, z: n.z })
        n = n.parent
      }
      return path
    }

    if (closed.has(ck)) continue
    closed.add(ck)

    const currentL = getLayer(system, current.layerId)
    if (!currentL) continue

    // Cardinal neighbors within the same layer
    for (const dir of DIRS) {
      const nx = current.x + dir.dx
      const nz = current.z + dir.dz
      if (nx < 0 || nx >= size || nz < 0 || nz >= size) continue

      const cell = currentL.grid[nx][nz]
      if (!cell.walkable) continue
      if (Math.abs(cell.y - currentL.grid[current.x][current.z].y) > 1) continue

      const ng = current.g + 1
      const nk = key(nx, nz, current.layerId)
      if ((bestG.get(nk) ?? Infinity) <= ng) continue

      bestG.set(nk, ng)
      const nf = ng + h(nx, nz, current.layerId)
      open.push({ x: nx, z: nz, layerId: current.layerId, g: ng, f: nf, parent: current }, nf)
    }

    // Vertical connections
    for (const conn of system.connections) {
      const isForward = conn.fromLayer === current.layerId && conn.x === current.x && conn.z === current.z
      const isReverse = conn.bidirectional && conn.toLayer === current.layerId && conn.x === current.x && conn.z === current.z
      if (!isForward && !isReverse) continue

      const targetLayerId = isForward ? conn.toLayer : conn.fromLayer
      const ng = current.g + conn.cost
      const nk = key(conn.x, conn.z, targetLayerId)
      if ((bestG.get(nk) ?? Infinity) <= ng) continue

      bestG.set(nk, ng)
      const nf = ng + h(conn.x, conn.z, targetLayerId)
      open.push({ x: conn.x, z: conn.z, layerId: targetLayerId, g: ng, f: nf, parent: current }, nf)
    }

    if (closed.size > 10000) break // safety limit
  }

  return null
}

// ─── Flow Field Handle ──────────────────────────────────────────────

class FlowFieldHandle implements NavigationHandle {
  private field: FlowField
  private system: LayerSystem
  private currentLayerId: number
  private _valid: boolean = true
  private cachedPath: VoxelCoord[] | null = null
  private cachedPathKey: string | null = null
  readonly agentId: number

  constructor(field: FlowField, system: LayerSystem, startLayerId: number, agentId: number) {
    this.field = field
    this.system = system
    this.currentLayerId = startLayerId
    this.agentId = agentId
  }

  getNextVoxel(currentPosition: VoxelCoord): VoxelCoord | null {
    if (!this._valid) return null

    const size = this.system.worldSize

    // Check if at destination
    if (voxelEquals(currentPosition, this.field.destination) && this.currentLayerId === this.field.destinationLayer) {
      return null
    }

    // Update current layer based on actual position
    const actualLayer = getLayerAt(this.system, currentPosition.x, currentPosition.z, currentPosition.y)
    if (actualLayer >= 0) this.currentLayerId = actualLayer

    // Check for transition
    if (isTransitionPoint(this.field, this.currentLayerId, currentPosition.x, currentPosition.z, size)) {
      const target = getTransitionTarget(this.field, this.currentLayerId, currentPosition.x, currentPosition.z)
      if (target) {
        this.currentLayerId = target.targetLayer
        return target.targetPos
      }
    }

    // Follow flow vector
    const dir = getFlowDirection(this.field, this.currentLayerId, currentPosition.x, currentPosition.z, size)
    if (!dir) return null

    const nx = currentPosition.x + dir.dx
    const nz = currentPosition.z + dir.dz
    const layer = getLayer(this.system, this.currentLayerId)
    if (!layer) return null

    const cell = layer.grid[nx]?.[nz]
    if (!cell || !cell.walkable) return null

    return { x: nx, y: cell.y, z: nz }
  }

  isValid(): boolean { return this._valid }
  isComputing(): boolean { return false }

  invalidate(): void {
    this._valid = false
    this.cachedPath = null
  }

  getPlannedPath(currentPosition: VoxelCoord): VoxelCoord[] | null {
    const pathKey = voxelKey(currentPosition) + ':' + this.currentLayerId
    if (this.cachedPath && this.cachedPathKey === pathKey) {
      return this.cachedPath
    }

    this.cachedPath = tracePath(this.field, this.system, this.currentLayerId, currentPosition)
    this.cachedPathKey = pathKey
    return this.cachedPath
  }

  invalidatePathCache(): void {
    this.cachedPath = null
    this.cachedPathKey = null
  }

  getDebugInfo(): Record<string, string | number> {
    return {
      algorithm: 'FlowField',
      layerId: this.currentLayerId,
      totalLayers: this.system.layers.length,
      valid: this._valid ? 1 : 0,
    }
  }

  getHandleMemory(): number {
    // Handle is just a reference to the shared flow field
    return 64 + (this.cachedPath ? this.cachedPath.length * 24 : 0)
  }
}

// ─── A* Fallback Handle ─────────────────────────────────────────────

class AStarFallbackHandle implements NavigationHandle {
  private path: VoxelCoord[]
  private pathIndex: number = 0
  private _valid: boolean = true
  private pathVoxelKeys: Set<string>
  readonly agentId: number

  constructor(path: VoxelCoord[], agentId: number) {
    this.path = path
    this.agentId = agentId
    this.pathVoxelKeys = new Set(path.map(voxelKey))
  }

  getNextVoxel(currentPosition: VoxelCoord): VoxelCoord | null {
    if (!this._valid) return null
    while (this.pathIndex < this.path.length && voxelEquals(this.path[this.pathIndex], currentPosition)) {
      this.pathIndex++
    }
    if (this.pathIndex >= this.path.length) return null
    return this.path[this.pathIndex]
  }

  isValid(): boolean { return this._valid }
  isComputing(): boolean { return false }
  invalidate(): void { this._valid = false }

  isAffectedBy(changedVoxels: VoxelCoord[]): boolean {
    for (const v of changedVoxels) {
      if (this.pathVoxelKeys.has(voxelKey(v))) return true
    }
    return false
  }

  getPlannedPath(): VoxelCoord[] | null {
    return this.path.slice(this.pathIndex)
  }

  getDebugInfo(): Record<string, string | number> {
    return { algorithm: 'FlowField-A*Fallback', pathLength: this.path.length, pathIndex: this.pathIndex, valid: this._valid ? 1 : 0 }
  }

  getHandleMemory(): number {
    return this.path.length * 24 + this.pathVoxelKeys.size * 20
  }
}

// ─── Flow Field Pathfinder ──────────────────────────────────────────

export class FlowFieldPathfinder implements IPathfinder {
  private worldView: VoxelWorldView
  private layerSystem: LayerSystem
  private cache: FlowFieldCache
  private activeHandles: Map<number, FlowFieldHandle | AStarFallbackHandle> = new Map()
  private agentDestinations: Map<string, Set<number>> = new Map() // destKey -> agentIds
  private peakBytes: number = 0
  private worldSize: number
  private agentHeight: number

  constructor(
    worldView: VoxelWorldView,
    worldSize: number,
    agentHeight: number = 2,
    cacheConfig?: Partial<FlowFieldCacheConfig>,
  ) {
    this.worldView = worldView
    this.worldSize = worldSize
    this.agentHeight = agentHeight
    this.cache = new FlowFieldCache(cacheConfig)
    this.layerSystem = buildLayerSystem(
      worldView.getGrid(),
      agentHeight,
    )
  }

  /** Rebuild layers after bulk terrain changes */
  rebuildLayers(): void {
    this.layerSystem = buildLayerSystem(
      this.worldView.getGrid(),
      this.agentHeight,
    )
    this.cache.clear()
  }

  requestNavigation(
    start: VoxelCoord,
    destination: VoxelCoord,
    agentHeight: number,
    agentId: number,
    _maxComputeMs?: number,
  ): NavigationHandle | null {
    // Release existing handle
    this.releaseHandleById(agentId)

    if (voxelEquals(start, destination)) {
      const handle = new AStarFallbackHandle([start], agentId)
      this.activeHandles.set(agentId, handle)
      return handle
    }

    if (!this.worldView.isWalkable(start, agentHeight)) return null
    if (!this.worldView.isWalkable(destination, agentHeight)) return null

    const startLayer = getLayerAt(this.layerSystem, start.x, start.z, start.y)
    const destLayer = getLayerAt(this.layerSystem, destination.x, destination.z, destination.y)
    if (startLayer < 0 || destLayer < 0) {
      // Destination not on any layer — try A* fallback
      return this.requestAStarFallback(start, destination, startLayer, destLayer, agentId)
    }

    // Track agent destination for sharing threshold
    const destKey = voxelKey(destination)
    if (!this.agentDestinations.has(destKey)) {
      this.agentDestinations.set(destKey, new Set())
    }
    this.agentDestinations.get(destKey)!.add(agentId)

    const agentCount = this.agentDestinations.get(destKey)!.size

    // Check sharing threshold
    if (!this.cache.shouldUseFlowField(agentCount)) {
      return this.requestAStarFallback(start, destination, startLayer, destLayer, agentId)
    }

    // Get or compute flow field
    const tick = 0 // will be updated by lastAccessedTick
    let field = this.cache.get(destKey, tick)
    if (!field) {
      field = computeFlowField(this.layerSystem, destination, destLayer, tick)
      this.cache.set(field)
    }

    const handle = new FlowFieldHandle(field, this.layerSystem, startLayer, agentId)
    this.activeHandles.set(agentId, handle)
    this.updatePeakMemory()
    return handle
  }

  private requestAStarFallback(
    start: VoxelCoord,
    destination: VoxelCoord,
    startLayer: number,
    destLayer: number,
    agentId: number,
  ): NavigationHandle | null {
    if (startLayer < 0 || destLayer < 0) return null

    const path = layerAStar(this.layerSystem, startLayer, start, destLayer, destination)
    if (!path) return null

    const handle = new AStarFallbackHandle(path, agentId)
    this.activeHandles.set(agentId, handle)
    return handle
  }

  invalidateRegion(event: TerrainChangeEvent): void {
    // Rebuild layers for changed voxels
    const affectedLayers = updateLayerColumns(this.layerSystem, this.worldView.getGrid(), event.changedVoxels, this.agentHeight)

    // Invalidate cached flow fields whose layers overlap the affected set
    if (affectedLayers.size > 0) {
      for (const field of this.cache.getAllFields()) {
        for (const layerId of field.layers.keys()) {
          if (affectedLayers.has(layerId)) {
            this.cache.remove(field.destinationKey)
            break
          }
        }
      }
    }

    // Invalidate handles
    for (const handle of this.activeHandles.values()) {
      if (handle instanceof FlowFieldHandle) {
        handle.invalidate()
      } else if (handle instanceof AStarFallbackHandle) {
        if (handle.isAffectedBy(event.changedVoxels)) {
          handle.invalidate()
        }
      }
    }
  }

  releaseNavigation(handle: NavigationHandle): void {
    if ('agentId' in handle) {
      const agentId = (handle as FlowFieldHandle | AStarFallbackHandle).agentId
      this.releaseHandleById(agentId)
    }
  }

  private releaseHandleById(agentId: number): void {
    this.activeHandles.delete(agentId)
    // Clean up destination tracking
    for (const [key, agents] of this.agentDestinations) {
      agents.delete(agentId)
      if (agents.size === 0) this.agentDestinations.delete(key)
    }
  }

  getMemoryUsage(): MemoryReport {
    let sharedBytes = 0
    for (const field of this.cache.getAllFields()) {
      for (const [, layer] of field.layers) {
        sharedBytes += layer.costGrid.byteLength + layer.flowGrid.byteLength
        sharedBytes += layer.transitionTargets.size * 60
      }
    }
    // Layer system overhead
    sharedBytes += this.layerSystem.layers.length * this.worldSize * this.worldSize * 5
    sharedBytes += this.layerSystem.connections.length * 40

    const total = sharedBytes
    if (total > this.peakBytes) this.peakBytes = total

    return { sharedBytes, peakBytes: this.peakBytes }
  }

  sweepLeakedHandles(activeAgentIds: Set<number>): number {
    let count = 0
    for (const [agentId] of this.activeHandles) {
      if (!activeAgentIds.has(agentId)) {
        this.releaseHandleById(agentId)
        count++
      }
    }
    return count
  }

  private updatePeakMemory(): void {
    const report = this.getMemoryUsage()
    if (report.sharedBytes > this.peakBytes) {
      this.peakBytes = report.sharedBytes
    }
  }
}
