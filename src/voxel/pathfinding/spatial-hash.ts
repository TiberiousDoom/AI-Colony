/**
 * Spatial hash grid for fast agent proximity queries.
 * Used by density congestion and group scatter checks.
 */

import type { VoxelCoord } from './types.ts'

export class SpatialHash {
  private cellSize: number
  private cells: Map<string, Set<number>> = new Map()
  private agentCells: Map<number, string> = new Map()

  constructor(cellSize: number = 4) {
    this.cellSize = cellSize
  }

  private cellKey(pos: VoxelCoord): string {
    const cx = Math.floor(pos.x / this.cellSize)
    const cy = Math.floor(pos.y / this.cellSize)
    const cz = Math.floor(pos.z / this.cellSize)
    return `${cx},${cy},${cz}`
  }

  insert(agentId: number, pos: VoxelCoord): void {
    // Remove from old cell if moved
    this.remove(agentId)

    const key = this.cellKey(pos)
    let cell = this.cells.get(key)
    if (!cell) {
      cell = new Set()
      this.cells.set(key, cell)
    }
    cell.add(agentId)
    this.agentCells.set(agentId, key)
  }

  remove(agentId: number): void {
    const oldKey = this.agentCells.get(agentId)
    if (oldKey) {
      const cell = this.cells.get(oldKey)
      if (cell) {
        cell.delete(agentId)
        if (cell.size === 0) this.cells.delete(oldKey)
      }
      this.agentCells.delete(agentId)
    }
  }

  /** Query all agent IDs within `radius` Manhattan distance of `pos` */
  query(pos: VoxelCoord, radius: number): number[] {
    const results: number[] = []
    const minCx = Math.floor((pos.x - radius) / this.cellSize)
    const maxCx = Math.floor((pos.x + radius) / this.cellSize)
    const minCy = Math.floor((pos.y - radius) / this.cellSize)
    const maxCy = Math.floor((pos.y + radius) / this.cellSize)
    const minCz = Math.floor((pos.z - radius) / this.cellSize)
    const maxCz = Math.floor((pos.z + radius) / this.cellSize)

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        for (let cz = minCz; cz <= maxCz; cz++) {
          const cell = this.cells.get(`${cx},${cy},${cz}`)
          if (cell) {
            for (const id of cell) {
              results.push(id)
            }
          }
        }
      }
    }

    return results
  }

  clear(): void {
    this.cells.clear()
    this.agentCells.clear()
  }

  get size(): number {
    return this.agentCells.size
  }
}
