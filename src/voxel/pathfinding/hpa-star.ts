import type { VoxelCoord, ChunkCoord } from './types.ts'
import { voxelKey, voxelEquals, manhattanDistance3D } from './types.ts'
import { PriorityQueue } from './priority-queue.ts'
import type { VoxelWorldView } from './voxel-world-view.ts'
import type {
  IPathfinder,
  NavigationHandle,
  TerrainChangeEvent,
  MemoryReport,
} from './pathfinder-interface.ts'
import { CHUNK_SIZE, worldToChunk, chunkKey, chunkEquals } from '../world/chunk-utils.ts'
import { isClimbable, isStair } from '../world/block-types.ts'

// ─── Types ──────────────────────────────────────────────────────────

export type FaceDir = 'x+' | 'x-' | 'y+' | 'y-' | 'z+' | 'z-'

export interface BoundaryNode {
  pos: VoxelCoord
  face: FaceDir
}

interface CoarseEdge {
  to: string // voxelKey of target boundary node
  cost: number
}

interface CoarseNode {
  pos: VoxelCoord
  chunk: ChunkCoord
  edges: CoarseEdge[]
  temporary?: boolean
}

// ─── Boundary Scanner ───────────────────────────────────────────────

export function scanBoundaryNodes(
  worldView: VoxelWorldView,
  chunkCoord: ChunkCoord,
  agentHeight: number,
): BoundaryNode[] {
  const nodes: BoundaryNode[] = []
  const ox = chunkCoord.cx * CHUNK_SIZE
  const oy = chunkCoord.cy * CHUNK_SIZE
  const oz = chunkCoord.cz * CHUNK_SIZE

  const faces: { face: FaceDir; iter: (i: number, j: number) => [VoxelCoord, VoxelCoord] }[] = [
    {
      face: 'x+', iter: (i, j) => [
        { x: ox + CHUNK_SIZE - 1, y: oy + i, z: oz + j },
        { x: ox + CHUNK_SIZE, y: oy + i, z: oz + j },
      ],
    },
    {
      face: 'x-', iter: (i, j) => [
        { x: ox, y: oy + i, z: oz + j },
        { x: ox - 1, y: oy + i, z: oz + j },
      ],
    },
    {
      face: 'y+', iter: (i, j) => [
        { x: ox + i, y: oy + CHUNK_SIZE - 1, z: oz + j },
        { x: ox + i, y: oy + CHUNK_SIZE, z: oz + j },
      ],
    },
    {
      face: 'y-', iter: (i, j) => [
        { x: ox + i, y: oy, z: oz + j },
        { x: ox + i, y: oy - 1, z: oz + j },
      ],
    },
    {
      face: 'z+', iter: (i, j) => [
        { x: ox + i, y: oy + j, z: oz + CHUNK_SIZE - 1 },
        { x: ox + i, y: oy + j, z: oz + CHUNK_SIZE },
      ],
    },
    {
      face: 'z-', iter: (i, j) => [
        { x: ox + i, y: oy + j, z: oz },
        { x: ox + i, y: oy + j, z: oz - 1 },
      ],
    },
  ]

  for (const { face, iter } of faces) {
    for (let i = 0; i < CHUNK_SIZE; i++) {
      for (let j = 0; j < CHUNK_SIZE; j++) {
        const [inside, outside] = iter(i, j)
        // Standard walkable-to-walkable boundary
        if (
          worldView.isWalkable(inside, agentHeight) &&
          worldView.isWalkable(outside, agentHeight)
        ) {
          nodes.push({ pos: inside, face })
          continue
        }
        // Vertical ladder/stair boundary: climbable blocks crossing chunk faces
        if (face === 'y+' || face === 'y-') {
          const insideBlock = worldView.getBlockType(inside)
          const outsideBlock = worldView.getBlockType(outside)
          if (
            (isClimbable(insideBlock) || isStair(insideBlock)) &&
            (isClimbable(outsideBlock) || isStair(outsideBlock) || worldView.isWalkable(outside, agentHeight))
          ) {
            nodes.push({ pos: inside, face })
          }
        }
      }
    }
  }

  return nodes
}

// ─── Intra-Chunk A* ──────────────────────────────────────────────────

export function findIntraChunkPath(
  worldView: VoxelWorldView,
  start: VoxelCoord,
  dest: VoxelCoord,
  agentHeight: number,
  chunkCoord: ChunkCoord,
): VoxelCoord[] | null {
  if (voxelEquals(start, dest)) return [start]

  const ox = chunkCoord.cx * CHUNK_SIZE
  const oy = chunkCoord.cy * CHUNK_SIZE
  const oz = chunkCoord.cz * CHUNK_SIZE

  function inChunk(p: VoxelCoord): boolean {
    return (
      p.x >= ox && p.x < ox + CHUNK_SIZE &&
      p.y >= oy && p.y < oy + CHUNK_SIZE &&
      p.z >= oz && p.z < oz + CHUNK_SIZE
    )
  }

  interface Node { pos: VoxelCoord; g: number; f: number; parent: Node | null }

  const open = new PriorityQueue<Node>()
  const openSet = new Map<string, Node>()
  const closed = new Set<string>()

  const startNode: Node = { pos: start, g: 0, f: manhattanDistance3D(start, dest), parent: null }
  open.push(startNode, startNode.f)
  openSet.set(voxelKey(start), startNode)

  while (open.size > 0) {
    const current = open.pop()!
    const ck = voxelKey(current.pos)
    openSet.delete(ck)

    if (voxelEquals(current.pos, dest)) {
      const path: VoxelCoord[] = []
      let n: Node | null = current
      while (n) { path.unshift(n.pos); n = n.parent }
      return path
    }

    closed.add(ck)

    const neighbors = worldView.getNeighbors(current.pos, agentHeight)
    for (const nb of neighbors) {
      if (!inChunk(nb.coord)) continue
      const nk = voxelKey(nb.coord)
      if (closed.has(nk)) continue

      const ng = current.g + nb.cost
      const existing = openSet.get(nk)
      if (existing) {
        if (ng >= existing.g) continue
        existing.g = ng
        existing.f = ng + manhattanDistance3D(nb.coord, dest)
        existing.parent = current
      } else {
        const nf = ng + manhattanDistance3D(nb.coord, dest)
        const node: Node = { pos: nb.coord, g: ng, f: nf, parent: current }
        open.push(node, nf)
        openSet.set(nk, node)
      }
    }
  }

  return null
}

// ─── Coarse Graph ────────────────────────────────────────────────────

export class CoarseGraph {
  private nodes: Map<string, CoarseNode> = new Map() // voxelKey → CoarseNode
  private chunkBoundaryKeys: Map<string, Set<string>> = new Map() // chunkKey → set of voxelKeys

  build(worldView: VoxelWorldView, worldSize: number, agentHeight: number): void {
    this.nodes.clear()
    this.chunkBoundaryKeys.clear()
    const chunksPerAxis = Math.ceil(worldSize / CHUNK_SIZE)

    // Scan all chunks
    for (let cx = 0; cx < chunksPerAxis; cx++) {
      for (let cy = 0; cy < chunksPerAxis; cy++) {
        for (let cz = 0; cz < chunksPerAxis; cz++) {
          const cc: ChunkCoord = { cx, cy, cz }
          this.buildChunk(worldView, cc, agentHeight)
        }
      }
    }
  }

  private buildChunk(worldView: VoxelWorldView, cc: ChunkCoord, agentHeight: number): void {
    const ck = chunkKey(cc)
    // Remove old nodes for this chunk
    const oldKeys = this.chunkBoundaryKeys.get(ck)
    if (oldKeys) {
      for (const k of oldKeys) this.nodes.delete(k)
    }

    const boundaryNodes = scanBoundaryNodes(worldView, cc, agentHeight)
    const newKeys = new Set<string>()

    // Create coarse nodes
    for (const bn of boundaryNodes) {
      const k = voxelKey(bn.pos)
      newKeys.add(k)
      this.nodes.set(k, { pos: bn.pos, chunk: cc, edges: [] })
    }
    this.chunkBoundaryKeys.set(ck, newKeys)

    // Intra-chunk edges: pair-wise connectivity within this chunk
    const keys = Array.from(newKeys)
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const a = this.nodes.get(keys[i])!
        const b = this.nodes.get(keys[j])!
        const path = findIntraChunkPath(worldView, a.pos, b.pos, agentHeight, cc)
        if (path) {
          const cost = path.length - 1 // path includes start
          a.edges.push({ to: keys[j], cost })
          b.edges.push({ to: keys[i], cost })
        }
      }
    }

    // Cross-chunk edges: connect to adjacent chunk boundary nodes
    for (const bn of boundaryNodes) {
      const k = voxelKey(bn.pos)
      const node = this.nodes.get(k)!
      const adj = this.getAdjacentPos(bn)
      if (!adj) continue
      const adjKey = voxelKey(adj)
      const adjNode = this.nodes.get(adjKey)
      if (adjNode) {
        // Cross-chunk edge cost = 1
        if (!node.edges.some(e => e.to === adjKey)) {
          node.edges.push({ to: adjKey, cost: 1 })
        }
        if (!adjNode.edges.some(e => e.to === k)) {
          adjNode.edges.push({ to: k, cost: 1 })
        }
      }
    }
  }

  private getAdjacentPos(bn: BoundaryNode): VoxelCoord | null {
    const p = bn.pos
    switch (bn.face) {
      case 'x+': return { x: p.x + 1, y: p.y, z: p.z }
      case 'x-': return { x: p.x - 1, y: p.y, z: p.z }
      case 'y+': return { x: p.x, y: p.y + 1, z: p.z }
      case 'y-': return { x: p.x, y: p.y - 1, z: p.z }
      case 'z+': return { x: p.x, y: p.y, z: p.z + 1 }
      case 'z-': return { x: p.x, y: p.y, z: p.z - 1 }
    }
  }

  updateChunk(worldView: VoxelWorldView, cc: ChunkCoord, agentHeight: number): void {
    // Remove cross-chunk edges pointing INTO this chunk from neighbors
    const ck = chunkKey(cc)
    const oldKeys = this.chunkBoundaryKeys.get(ck)
    if (oldKeys) {
      for (const [, node] of this.nodes) {
        if (chunkKey(node.chunk) !== ck) {
          node.edges = node.edges.filter(e => !oldKeys.has(e.to))
        }
      }
    }
    this.buildChunk(worldView, cc, agentHeight)
  }

  getNode(key: string): CoarseNode | undefined {
    return this.nodes.get(key)
  }

  /** Insert a temporary node into the graph for start/dest that aren't on boundaries */
  insertTempNode(
    worldView: VoxelWorldView,
    pos: VoxelCoord,
    agentHeight: number,
  ): string {
    const key = voxelKey(pos)
    const existing = this.nodes.get(key)
    if (existing && !existing.temporary) return key

    const cc = worldToChunk(pos)
    const node: CoarseNode = { pos, chunk: cc, edges: [], temporary: true }

    // Connect to all boundary nodes in the same chunk
    const ck = chunkKey(cc)
    const chunkNodeKeys = this.chunkBoundaryKeys.get(ck)
    if (chunkNodeKeys) {
      for (const bnk of chunkNodeKeys) {
        const bn = this.nodes.get(bnk)!
        const path = findIntraChunkPath(worldView, pos, bn.pos, agentHeight, cc)
        if (path) {
          const cost = path.length - 1
          node.edges.push({ to: bnk, cost })
          bn.edges.push({ to: key, cost })
        }
      }
    }

    this.nodes.set(key, node)
    return key
  }

  removeTempNode(key: string): void {
    const node = this.nodes.get(key)
    if (!node || !node.temporary) return
    // Remove edges pointing to this node
    for (const edge of node.edges) {
      const target = this.nodes.get(edge.to)
      if (target) {
        target.edges = target.edges.filter(e => e.to !== key)
      }
    }
    this.nodes.delete(key)
  }

  /** A* on the coarse graph */
  findCoarsePath(startKey: string, destKey: string): string[] | null {
    const startNode = this.nodes.get(startKey)
    const destNode = this.nodes.get(destKey)
    if (!startNode || !destNode) return null

    interface ANode { key: string; g: number; f: number; parent: ANode | null }

    const open = new PriorityQueue<ANode>()
    const openSet = new Map<string, ANode>()
    const closed = new Set<string>()

    const h0 = manhattanDistance3D(startNode.pos, destNode.pos)
    const a0: ANode = { key: startKey, g: 0, f: h0, parent: null }
    open.push(a0, h0)
    openSet.set(startKey, a0)

    while (open.size > 0) {
      const current = open.pop()!
      openSet.delete(current.key)

      if (current.key === destKey) {
        const path: string[] = []
        let n: ANode | null = current
        while (n) { path.unshift(n.key); n = n.parent }
        return path
      }

      closed.add(current.key)

      const cn = this.nodes.get(current.key)!
      for (const edge of cn.edges) {
        if (closed.has(edge.to)) continue
        const ng = current.g + edge.cost
        const existing = openSet.get(edge.to)
        if (existing) {
          if (ng >= existing.g) continue
          existing.g = ng
          existing.f = ng + manhattanDistance3D(this.nodes.get(edge.to)!.pos, destNode.pos)
          existing.parent = current
        } else {
          const target = this.nodes.get(edge.to)!
          const nf = ng + manhattanDistance3D(target.pos, destNode.pos)
          const node: ANode = { key: edge.to, g: ng, f: nf, parent: current }
          open.push(node, nf)
          openSet.set(edge.to, node)
        }
      }
    }

    return null
  }

  get nodeCount(): number {
    return this.nodes.size
  }
}

// ─── HPA* Handle ─────────────────────────────────────────────────────

class HPAStarHandle implements NavigationHandle {
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
    while (
      this.pathIndex < this.path.length &&
      voxelEquals(this.path[this.pathIndex], currentPosition)
    ) {
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

  getAffectedChunks(): Set<string> {
    const chunks = new Set<string>()
    for (const p of this.path) {
      chunks.add(chunkKey(worldToChunk(p)))
    }
    return chunks
  }

  getPlannedPath(): VoxelCoord[] | null {
    return this.path.slice(this.pathIndex)
  }

  getDebugInfo(): Record<string, string | number> {
    return {
      pathLength: this.path.length,
      pathIndex: this.pathIndex,
      valid: this._valid ? 1 : 0,
      algorithm: 'HPA*',
    }
  }

  getHandleMemory(): number {
    return this.path.length * 32 + this.pathVoxelKeys.size * 20
  }
}

// ─── HPA* Pathfinder ─────────────────────────────────────────────────

export class HPAStarPathfinder implements IPathfinder {
  private worldView: VoxelWorldView
  private coarseGraph: CoarseGraph
  private activeHandles: Map<number, HPAStarHandle> = new Map()
  private peakBytes: number = 0
  private worldSize: number
  private agentHeightForGraph: number

  constructor(worldView: VoxelWorldView, worldSize: number, agentHeight: number = 2) {
    this.worldView = worldView
    this.worldSize = worldSize
    this.agentHeightForGraph = agentHeight
    this.coarseGraph = new CoarseGraph()
    this.coarseGraph.build(worldView, worldSize, agentHeight)
  }

  /** Rebuild the entire coarse graph (call after bulk terrain changes) */
  rebuildGraph(): void {
    this.coarseGraph.build(this.worldView, this.worldSize, this.agentHeightForGraph)
  }

  requestNavigation(
    start: VoxelCoord,
    destination: VoxelCoord,
    agentHeight: number,
    agentId: number,
    _maxComputeMs?: number,
  ): NavigationHandle | null {
    // Release existing handle
    this.activeHandles.delete(agentId)

    if (voxelEquals(start, destination)) {
      const handle = new HPAStarHandle([start], agentId)
      this.activeHandles.set(agentId, handle)
      return handle
    }

    if (!this.worldView.isWalkable(start, agentHeight)) return null
    if (!this.worldView.isWalkable(destination, agentHeight)) return null

    // Insert temp nodes for start and dest
    const startKey = this.coarseGraph.insertTempNode(this.worldView, start, agentHeight)
    const destKey = this.coarseGraph.insertTempNode(this.worldView, destination, agentHeight)

    // Coarse path
    const coarsePath = this.coarseGraph.findCoarsePath(startKey, destKey)

    // Clean up temp nodes
    this.coarseGraph.removeTempNode(startKey)
    this.coarseGraph.removeTempNode(destKey)

    if (!coarsePath || coarsePath.length === 0) return null

    // Stitch detailed paths
    const detailedPath = this.stitchDetailedPath(coarsePath, agentHeight)
    if (!detailedPath || detailedPath.length === 0) return null

    const handle = new HPAStarHandle(detailedPath, agentId)
    this.activeHandles.set(agentId, handle)
    this.updatePeakMemory()
    return handle
  }

  private stitchDetailedPath(coarsePathKeys: string[], agentHeight: number): VoxelCoord[] | null {
    if (coarsePathKeys.length === 0) return null

    // Parse keys back to coords
    const waypoints: VoxelCoord[] = coarsePathKeys.map(k => {
      const [x, y, z] = k.split(',').map(Number)
      return { x, y, z }
    })

    if (waypoints.length === 1) return [waypoints[0]]

    const fullPath: VoxelCoord[] = [waypoints[0]]

    for (let i = 0; i < waypoints.length - 1; i++) {
      const from = waypoints[i]
      const to = waypoints[i + 1]
      const fromChunk = worldToChunk(from)
      const toChunk = worldToChunk(to)

      let segment: VoxelCoord[] | null

      if (chunkEquals(fromChunk, toChunk)) {
        segment = findIntraChunkPath(this.worldView, from, to, agentHeight, fromChunk)
      } else {
        // Cross-chunk: just do a direct step (they should be adjacent)
        segment = [from, to]
      }

      if (!segment) return null

      // Append segment (skip first since it's already in path)
      for (let j = 1; j < segment.length; j++) {
        fullPath.push(segment[j])
      }
    }

    return fullPath
  }

  invalidateRegion(event: TerrainChangeEvent): void {
    // Update affected chunks in coarse graph
    for (const cc of event.chunkCoords) {
      this.coarseGraph.updateChunk(this.worldView, cc, this.agentHeightForGraph)
    }

    // Invalidate handles with paths through affected voxels
    for (const handle of this.activeHandles.values()) {
      if (handle.isValid()) {
        if (handle.isAffectedBy(event.changedVoxels)) {
          handle.invalidate()
        }
      }
    }
  }

  releaseNavigation(handle: NavigationHandle): void {
    if (handle instanceof HPAStarHandle) {
      this.activeHandles.delete(handle.agentId)
    }
  }

  getMemoryUsage(): MemoryReport {
    let total = 0
    for (const handle of this.activeHandles.values()) {
      total += handle.getHandleMemory()
    }
    // Include coarse graph overhead estimate
    total += this.coarseGraph.nodeCount * 100
    if (total > this.peakBytes) this.peakBytes = total
    return { sharedBytes: this.coarseGraph.nodeCount * 100, peakBytes: this.peakBytes }
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
    total += this.coarseGraph.nodeCount * 100
    if (total > this.peakBytes) this.peakBytes = total
  }
}
