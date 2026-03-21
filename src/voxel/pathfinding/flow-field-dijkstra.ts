/**
 * Per-layer Dijkstra computation and flow vector generation.
 *
 * Each flow field stores a cost grid and direction grid per layer.
 * Dijkstra runs from the destination outward, crossing layers at
 * vertical connections.
 */

import { PriorityQueue } from './priority-queue.ts'
import { voxelKey } from './types.ts'
import type { VoxelCoord } from './types.ts'
import type { LayerSystem } from './flow-field-layers.ts'
import { getLayer, getConnectionsFrom } from './flow-field-layers.ts'

// ─── Types ──────────────────────────────────────────────────────────

export interface FlowFieldLayer {
  layerId: number
  /** Cost to reach destination from each cell. Index: x * worldSize + z. Infinity = unreachable. */
  costGrid: Float32Array
  /** Flow direction per cell. Pairs of (dx, dz) as Int8. Index: (x * worldSize + z) * 2 for dx, +1 for dz.
   *  (0,0) = at destination or unreachable. (127,127) = transition marker. */
  flowGrid: Int8Array
  /** Transition targets: "x,z" -> { targetLayer, targetPos } */
  transitionTargets: Map<string, { targetLayer: number; targetPos: VoxelCoord }>
}

export interface FlowField {
  destinationKey: string
  destination: VoxelCoord
  destinationLayer: number
  createdTick: number
  lastAccessedTick: number
  layers: Map<number, FlowFieldLayer>
}

// ─── Index helpers ──────────────────────────────────────────────────

function idx(x: number, z: number, size: number): number {
  return x * size + z
}

function flowIdx(x: number, z: number, size: number): number {
  return (x * size + z) * 2
}

// ─── Cardinal directions ────────────────────────────────────────────

const DIRS = [
  { dx: 1, dz: 0 },
  { dx: -1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: 0, dz: -1 },
]

// ─── Dijkstra ───────────────────────────────────────────────────────

interface DijkstraNode {
  layerId: number
  x: number
  z: number
  cost: number
}

/**
 * Compute a flow field from a destination across the layer system.
 * Dijkstra expands from the destination outward, crossing layers at vertical connections.
 */
export function computeFlowField(
  system: LayerSystem,
  destination: VoxelCoord,
  destinationLayer: number,
  currentTick: number,
): FlowField {
  const size = system.worldSize
  const fieldLayers = new Map<number, FlowFieldLayer>()

  // Initialize cost grids for all layers
  for (const layer of system.layers) {
    const costGrid = new Float32Array(size * size)
    costGrid.fill(Infinity)
    const flowGrid = new Int8Array(size * size * 2)
    fieldLayers.set(layer.id, {
      layerId: layer.id,
      costGrid,
      flowGrid,
      transitionTargets: new Map(),
    })
  }

  // Seed: destination cell has cost 0
  const destField = fieldLayers.get(destinationLayer)
  if (!destField) {
    return {
      destinationKey: voxelKey(destination),
      destination,
      destinationLayer,
      createdTick: currentTick,
      lastAccessedTick: currentTick,
      layers: fieldLayers,
    }
  }
  destField.costGrid[idx(destination.x, destination.z, size)] = 0

  // Dijkstra priority queue
  const pq = new PriorityQueue<DijkstraNode>()
  pq.push({ layerId: destinationLayer, x: destination.x, z: destination.z, cost: 0 }, 0)

  while (pq.size > 0) {
    const current = pq.pop()!
    const currentLayer = getLayer(system, current.layerId)
    const currentField = fieldLayers.get(current.layerId)
    if (!currentLayer || !currentField) continue

    const currentCost = currentField.costGrid[idx(current.x, current.z, size)]
    // Skip if we already found a better path
    if (current.cost > currentCost) continue

    // Expand to cardinal neighbors within the same layer
    for (const dir of DIRS) {
      const nx = current.x + dir.dx
      const nz = current.z + dir.dz
      if (nx < 0 || nx >= size || nz < 0 || nz >= size) continue

      const neighborCell = currentLayer.grid[nx][nz]
      if (!neighborCell.walkable) continue

      // Check Y tolerance: neighbor must be within ±1 Y of current cell
      const currentCell = currentLayer.grid[current.x][current.z]
      if (Math.abs(neighborCell.y - currentCell.y) > 1) continue

      const moveCost = 1.0 // base walk cost
      const newCost = currentCost + moveCost
      const ni = idx(nx, nz, size)

      if (newCost < currentField.costGrid[ni]) {
        currentField.costGrid[ni] = newCost
        pq.push({ layerId: current.layerId, x: nx, z: nz, cost: newCost }, newCost)
      }
    }

    // Expand through vertical connections
    const connections = getConnectionsFrom(system, current.layerId)
    for (const conn of connections) {
      // Check if this connection originates from our current cell
      const isForward = conn.fromLayer === current.layerId
      const isReverse = conn.bidirectional && conn.toLayer === current.layerId

      if (!isForward && !isReverse) continue

      // Connection position on the current layer side
      const connX = conn.x
      const connZ = conn.z

      // Only cross if we're at the connection point
      if (current.x !== connX || current.z !== connZ) continue

      const targetLayerId = isForward ? conn.toLayer : conn.fromLayer
      const targetField = fieldLayers.get(targetLayerId)
      if (!targetField) continue

      const newCost = currentCost + conn.cost
      const ti = idx(connX, connZ, size)

      if (newCost < targetField.costGrid[ti]) {
        targetField.costGrid[ti] = newCost
        pq.push({ layerId: targetLayerId, x: connX, z: connZ, cost: newCost }, newCost)

        // Record transition in the TARGET layer pointing back
        const targetLayer = getLayer(system, targetLayerId)
        if (targetLayer) {
          const cell = targetLayer.grid[connX][connZ]
          if (cell.walkable) {
            targetField.transitionTargets.set(`${connX},${connZ}`, {
              targetLayer: current.layerId,
              targetPos: { x: connX, y: currentLayer.grid[connX][connZ].y, z: connZ },
            })
          }
        }
      }
    }
  }

  // Compute flow vectors from cost grids
  for (const [layerId, field] of fieldLayers) {
    const layer = getLayer(system, layerId)
    if (!layer) continue

    for (let x = 0; x < size; x++) {
      for (let z = 0; z < size; z++) {
        const cell = layer.grid[x][z]
        if (!cell.walkable) continue

        const ci = idx(x, z, size)
        const currentCost = field.costGrid[ci]
        if (!isFinite(currentCost)) continue

        // Check if this is a transition point — flow should go to the transition
        if (field.transitionTargets.has(`${x},${z}`)) {
          const fi = flowIdx(x, z, size)
          field.flowGrid[fi] = 127     // transition marker dx
          field.flowGrid[fi + 1] = 127 // transition marker dz
          continue
        }

        // Find the neighbor with lowest cost
        let bestDx = 0
        let bestDz = 0
        let bestCost = currentCost

        for (const dir of DIRS) {
          const nx = x + dir.dx
          const nz = z + dir.dz
          if (nx < 0 || nx >= size || nz < 0 || nz >= size) continue

          const ni = idx(nx, nz, size)
          if (field.costGrid[ni] < bestCost) {
            bestCost = field.costGrid[ni]
            bestDx = dir.dx
            bestDz = dir.dz
          }
        }

        const fi = flowIdx(x, z, size)
        field.flowGrid[fi] = bestDx
        field.flowGrid[fi + 1] = bestDz
      }
    }
  }

  return {
    destinationKey: voxelKey(destination),
    destination,
    destinationLayer,
    createdTick: currentTick,
    lastAccessedTick: currentTick,
    layers: fieldLayers,
  }
}

/**
 * Get the flow direction at a position on a given layer.
 * Returns { dx, dz } or null if unreachable/not on layer.
 */
export function getFlowDirection(
  field: FlowField,
  layerId: number,
  x: number,
  z: number,
  worldSize: number,
): { dx: number; dz: number } | null {
  const layer = field.layers.get(layerId)
  if (!layer) return null

  const fi = flowIdx(x, z, worldSize)
  const dx = layer.flowGrid[fi]
  const dz = layer.flowGrid[fi + 1]

  if (dx === 0 && dz === 0) return null // at destination or unreachable
  return { dx, dz }
}

/**
 * Check if a position is a transition point.
 */
export function isTransitionPoint(
  field: FlowField,
  layerId: number,
  x: number,
  z: number,
  worldSize: number,
): boolean {
  const layer = field.layers.get(layerId)
  if (!layer) return false

  const fi = flowIdx(x, z, worldSize)
  return layer.flowGrid[fi] === 127 && layer.flowGrid[fi + 1] === 127
}

/**
 * Get the transition target at a position.
 */
export function getTransitionTarget(
  field: FlowField,
  layerId: number,
  x: number,
  z: number,
): { targetLayer: number; targetPos: VoxelCoord } | null {
  const layer = field.layers.get(layerId)
  if (!layer) return null
  return layer.transitionTargets.get(`${x},${z}`) ?? null
}

/**
 * Get the cost at a position on a given layer.
 */
export function getCost(
  field: FlowField,
  layerId: number,
  x: number,
  z: number,
  worldSize: number,
): number {
  const layer = field.layers.get(layerId)
  if (!layer) return Infinity
  return layer.costGrid[idx(x, z, worldSize)]
}

/**
 * Trace a path from a start position to the destination by following flow vectors.
 * Returns null if the destination is unreachable.
 */
export function tracePath(
  field: FlowField,
  system: LayerSystem,
  startLayerId: number,
  start: VoxelCoord,
  maxSteps: number = 1000,
): VoxelCoord[] | null {
  const size = system.worldSize
  const path: VoxelCoord[] = [start]
  let currentLayer = startLayerId
  let cx = start.x
  let cz = start.z

  for (let step = 0; step < maxSteps; step++) {
    // Check if we arrived
    if (cx === field.destination.x && cz === field.destination.z && currentLayer === field.destinationLayer) {
      return path
    }

    // Check for transition
    if (isTransitionPoint(field, currentLayer, cx, cz, size)) {
      const target = getTransitionTarget(field, currentLayer, cx, cz)
      if (!target) return null
      currentLayer = target.targetLayer
      const layer = getLayer(system, currentLayer)
      if (!layer) return null
      const cell = layer.grid[cx][cz]
      if (!cell.walkable) return null
      path.push({ x: cx, y: cell.y, z: cz })
      continue
    }

    // Follow flow vector
    const dir = getFlowDirection(field, currentLayer, cx, cz, size)
    if (!dir) return path.length > 1 ? path : null

    cx += dir.dx
    cz += dir.dz

    const layer = getLayer(system, currentLayer)
    if (!layer) return null
    const cell = layer.grid[cx][cz]
    if (!cell.walkable) return null

    path.push({ x: cx, y: cell.y, z: cz })
  }

  // Exceeded max steps — return partial path
  return path.length > 1 ? path : null
}
