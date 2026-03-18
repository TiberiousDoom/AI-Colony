/**
 * Flow field layer construction system.
 *
 * A "layer" is a connected set of walkable surfaces. Flat terrain = 1 layer.
 * Multi-story buildings have one layer per floor. Hillsides with gradual
 * slopes merge into a single layer via ±1 Y flood-fill tolerance.
 *
 * Layers are stored as 2D grids (X, Z) with a Y value per cell.
 * Vertical connections (ladders, stairs, drops, step-ups) link layers.
 */

import type { VoxelCoord } from './types.ts'
import type { VoxelGrid } from '../world/voxel-grid.ts'
import { isWalkable, MAX_DROP_HEIGHT, LADDER_SPEED, STAIR_SPEED } from './movement-rules.ts'
import { isSolidBlock, isClimbable, isStair } from '../world/block-types.ts'

// ─── Types ──────────────────────────────────────────────────────────

export interface LayerCell {
  y: number
  walkable: boolean
}

export interface Layer {
  id: number
  /** 2D grid indexed [x][z]. Each cell stores the Y of the walkable surface. */
  grid: LayerCell[][]
  minY: number
  maxY: number
}

export type ConnectionType = 'ladder' | 'stair' | 'drop' | 'step'

export interface VerticalConnection {
  fromLayer: number
  toLayer: number
  x: number
  z: number
  fromY: number
  toY: number
  connectionType: ConnectionType
  cost: number
  bidirectional: boolean
}

export interface LayerSystem {
  layers: Layer[]
  connections: VerticalConnection[]
  worldSize: number
}

// ─── Candidate scanning ─────────────────────────────────────────────

interface WalkableCandidate {
  x: number
  y: number
  z: number
  layerId: number // -1 = unassigned
}

function scanWalkableSurfaces(grid: VoxelGrid, agentHeight: number): WalkableCandidate[] {
  const size = grid.worldSize
  const candidates: WalkableCandidate[] = []

  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      for (let y = 0; y < size; y++) {
        if (isWalkable(grid, { x, y, z }, agentHeight)) {
          candidates.push({ x, y, z, layerId: -1 })
        }
      }
    }
  }

  return candidates
}

// ─── Flood-fill layer assignment ────────────────────────────────────

/**
 * Assign candidates to layers using flood-fill with ±1 Y tolerance.
 * Two candidates are in the same layer if they are cardinal neighbors
 * on XZ and their Y values differ by at most 1.
 */
function assignLayers(candidates: WalkableCandidate[], worldSize: number): number {
  // Build spatial index: (x,z) -> sorted list of candidates at that column
  const index = new Map<string, WalkableCandidate[]>()
  for (const c of candidates) {
    const key = `${c.x},${c.z}`
    let list = index.get(key)
    if (!list) {
      list = []
      index.set(key, list)
    }
    list.push(c)
  }

  let nextLayerId = 0
  const dirs = [
    { dx: 1, dz: 0 },
    { dx: -1, dz: 0 },
    { dx: 0, dz: 1 },
    { dx: 0, dz: -1 },
  ]

  for (const c of candidates) {
    if (c.layerId >= 0) continue

    // BFS flood fill
    const layerId = nextLayerId++
    c.layerId = layerId
    const queue: WalkableCandidate[] = [c]

    while (queue.length > 0) {
      const current = queue.shift()!

      for (const dir of dirs) {
        const nx = current.x + dir.dx
        const nz = current.z + dir.dz
        if (nx < 0 || nx >= worldSize || nz < 0 || nz >= worldSize) continue

        const key = `${nx},${nz}`
        const neighbors = index.get(key)
        if (!neighbors) continue

        for (const nb of neighbors) {
          if (nb.layerId >= 0) continue
          if (Math.abs(nb.y - current.y) <= 1) {
            nb.layerId = layerId
            queue.push(nb)
          }
        }
      }
    }
  }

  return nextLayerId
}

// ─── Layer grid construction ────────────────────────────────────────

function buildLayerGrids(candidates: WalkableCandidate[], layerCount: number, worldSize: number): Layer[] {
  const layers: Layer[] = []

  for (let id = 0; id < layerCount; id++) {
    const grid: LayerCell[][] = Array.from({ length: worldSize }, () =>
      Array.from({ length: worldSize }, () => ({ y: 0, walkable: false })),
    )
    let minY = Infinity
    let maxY = -Infinity

    for (const c of candidates) {
      if (c.layerId !== id) continue
      // If multiple walkable surfaces at same (x,z) in same layer, keep the one
      // that's closest to existing cells (prefer continuity). For simplicity,
      // keep the first one found (lowest Y due to scan order).
      if (!grid[c.x][c.z].walkable) {
        grid[c.x][c.z] = { y: c.y, walkable: true }
        if (c.y < minY) minY = c.y
        if (c.y > maxY) maxY = c.y
      }
    }

    if (minY === Infinity) continue // empty layer (shouldn't happen)
    layers.push({ id, grid, minY, maxY })
  }

  return layers
}

// ─── Vertical connection scanning ───────────────────────────────────

function findLayerAt(layers: Layer[], x: number, z: number, y: number): number {
  for (const layer of layers) {
    const cell = layer.grid[x][z]
    if (cell.walkable && cell.y === y) return layer.id
  }
  return -1
}

function scanVerticalConnections(
  grid: VoxelGrid,
  layers: Layer[],
  agentHeight: number,
): VerticalConnection[] {
  const connections: VerticalConnection[] = []
  const size = grid.worldSize
  const seen = new Set<string>()

  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      // Ladder connections: scan for ladder columns connecting two layers
      for (let y = 0; y < size; y++) {
        const pos: VoxelCoord = { x, y, z }
        if (!isClimbable(grid.getBlock(pos))) continue

        // Find the bottom: walkable surface below the ladder
        if (y > 0 && isWalkable(grid, { x, y: y, z }, agentHeight)) {
          // This is a walkable cell on a ladder — look for the top
          let topY = y
          while (topY + 1 < size && isClimbable(grid.getBlock({ x, y: topY + 1, z }))) {
            topY++
          }
          // Check if the cell above the top ladder is walkable
          const exitY = topY + 1
          if (exitY < size && isWalkable(grid, { x, y: exitY, z }, agentHeight)) {
            const bottomLayer = findLayerAt(layers, x, z, y)
            const topLayer = findLayerAt(layers, x, z, exitY)
            if (bottomLayer >= 0 && topLayer >= 0 && bottomLayer !== topLayer) {
              const key = `ladder:${bottomLayer}:${topLayer}:${x}:${z}`
              if (!seen.has(key)) {
                seen.add(key)
                const height = exitY - y
                connections.push({
                  fromLayer: bottomLayer,
                  toLayer: topLayer,
                  x, z,
                  fromY: y,
                  toY: exitY,
                  connectionType: 'ladder',
                  cost: height / LADDER_SPEED,
                  bidirectional: true,
                })
              }
            }
          }
        }
      }

      // Stair connections: check each walkable cell for adjacent stair blocks
      for (const layer of layers) {
        const cell = layer.grid[x][z]
        if (!cell.walkable) continue

        const dirs = [
          { dx: 1, dz: 0 },
          { dx: -1, dz: 0 },
          { dx: 0, dz: 1 },
          { dx: 0, dz: -1 },
        ]

        for (const dir of dirs) {
          const nx = x + dir.dx
          const nz = z + dir.dz
          if (nx < 0 || nx >= size || nz < 0 || nz >= size) continue

          const stairPos: VoxelCoord = { x: nx, y: cell.y, z: nz }
          if (!isStair(grid.getBlock(stairPos))) continue

          // Stair takes agent up to (nx, cell.y + 1, nz)
          const destY = cell.y + 1
          const destLayer = findLayerAt(layers, nx, nz, destY)
          if (destLayer >= 0 && destLayer !== layer.id) {
            const key = `stair:${layer.id}:${destLayer}:${x}:${z}:${nx}:${nz}`
            if (!seen.has(key)) {
              seen.add(key)
              connections.push({
                fromLayer: layer.id,
                toLayer: destLayer,
                x: nx, z: nz,
                fromY: cell.y,
                toY: destY,
                connectionType: 'stair',
                cost: 1 / STAIR_SPEED,
                bidirectional: true,
              })
            }
          }
        }
      }

      // Drop connections: check if an agent can drop from one layer to another
      for (const layer of layers) {
        const cell = layer.grid[x][z]
        if (!cell.walkable) continue

        for (const dir of [
          { dx: 1, dz: 0 }, { dx: -1, dz: 0 },
          { dx: 0, dz: 1 }, { dx: 0, dz: -1 },
        ]) {
          const nx = x + dir.dx
          const nz = z + dir.dz
          if (nx < 0 || nx >= size || nz < 0 || nz >= size) continue

          for (let dropDist = 2; dropDist <= MAX_DROP_HEIGHT; dropDist++) {
            const destY = cell.y - dropDist
            if (destY < 0) break
            if (!isWalkable(grid, { x: nx, y: destY, z: nz }, agentHeight)) continue

            // Check clearance at the edge (at original height, in the destination column)
            let clearance = true
            for (let dy = 0; dy < agentHeight; dy++) {
              if (isSolidBlock(grid.getBlock({ x: nx, y: cell.y + dy, z: nz }))) {
                clearance = false
                break
              }
            }
            if (!clearance) continue

            const destLayer = findLayerAt(layers, nx, nz, destY)
            if (destLayer >= 0 && destLayer !== layer.id) {
              const key = `drop:${layer.id}:${destLayer}:${x}:${z}:${nx}:${nz}`
              if (!seen.has(key)) {
                seen.add(key)
                connections.push({
                  fromLayer: layer.id,
                  toLayer: destLayer,
                  x: nx, z: nz,
                  fromY: cell.y,
                  toY: destY,
                  connectionType: 'drop',
                  cost: 1 + dropDist * 0.5,
                  bidirectional: false, // down only
                })
              }
            }
            break // only shortest drop in this direction
          }
        }
      }
    }
  }

  return connections
}

// ─── Public API ─────────────────────────────────────────────────────

export function buildLayerSystem(grid: VoxelGrid, agentHeight: number): LayerSystem {
  const candidates = scanWalkableSurfaces(grid, agentHeight)
  const layerCount = assignLayers(candidates, grid.worldSize)
  const layers = buildLayerGrids(candidates, layerCount, grid.worldSize)
  const connections = scanVerticalConnections(grid, layers, agentHeight)

  return { layers, connections, worldSize: grid.worldSize }
}

/**
 * Incrementally update layers after terrain changes.
 * Rescans only the affected columns and their cardinal neighbors.
 * Returns the set of affected layer IDs.
 */
export function updateLayerColumns(
  system: LayerSystem,
  grid: VoxelGrid,
  changedVoxels: VoxelCoord[],
  agentHeight: number,
): Set<number> {
  // For correctness, rebuild the entire system when terrain changes.
  // A truly incremental approach (rescan only affected columns + re-merge)
  // is complex and error-prone for the initial implementation.
  // Optimize to column-only rescans in Step 8.
  const newSystem = buildLayerSystem(grid, agentHeight)
  const affectedIds = new Set<number>()

  // All old layer IDs are potentially affected
  for (const layer of system.layers) {
    affectedIds.add(layer.id)
  }

  // Replace system contents
  system.layers = newSystem.layers
  system.connections = newSystem.connections
  system.worldSize = newSystem.worldSize

  // Also include new layer IDs
  for (const layer of newSystem.layers) {
    affectedIds.add(layer.id)
  }

  return affectedIds
}

/**
 * Find which layer a position belongs to.
 * Returns the layer ID or -1 if not on any layer.
 */
export function getLayerAt(system: LayerSystem, x: number, z: number, y: number): number {
  for (const layer of system.layers) {
    if (x < 0 || x >= system.worldSize || z < 0 || z >= system.worldSize) return -1
    const cell = layer.grid[x][z]
    if (cell.walkable && cell.y === y) return layer.id
  }
  return -1
}

/**
 * Get a layer by ID.
 */
export function getLayer(system: LayerSystem, id: number): Layer | undefined {
  return system.layers.find(l => l.id === id)
}

/**
 * Get all connections from a given layer.
 */
export function getConnectionsFrom(system: LayerSystem, layerId: number): VerticalConnection[] {
  return system.connections.filter(
    c => c.fromLayer === layerId || (c.bidirectional && c.toLayer === layerId),
  )
}
