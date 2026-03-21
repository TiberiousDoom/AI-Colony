/**
 * Intent-aware VoxelWorldView decorator.
 *
 * Wraps an existing VoxelWorldView to inject elevated traversal costs
 * for blocks with active mining intents. Only the Hybrid pathfinder
 * uses this — existing algorithms are unaffected.
 */

import type { BlockType } from '../world/block-types.ts'
import type { VoxelGrid } from '../world/voxel-grid.ts'
import type { VoxelCoord } from './types.ts'
import type { Neighbor } from './movement-rules.ts'
import type { VoxelWorldView } from './voxel-world-view.ts'
import type { IntentRegistry } from './intent-registry.ts'

export class IntentWorldView implements VoxelWorldView {
  private inner: VoxelWorldView
  private intentRegistry: IntentRegistry
  private costMultiplier: number

  constructor(inner: VoxelWorldView, intentRegistry: IntentRegistry, costMultiplier: number = 3.0) {
    this.inner = inner
    this.intentRegistry = intentRegistry
    this.costMultiplier = costMultiplier
  }

  isWalkable(pos: VoxelCoord, agentHeight: number): boolean {
    return this.inner.isWalkable(pos, agentHeight)
  }

  isSolid(pos: VoxelCoord): boolean {
    return this.inner.isSolid(pos)
  }

  getBlockType(pos: VoxelCoord): BlockType {
    return this.inner.getBlockType(pos)
  }

  getNeighbors(pos: VoxelCoord, agentHeight: number): Neighbor[] {
    const neighbors = this.inner.getNeighbors(pos, agentHeight)
    for (const n of neighbors) {
      if (this.intentRegistry.hasIntent(n.coord)) {
        n.cost *= this.costMultiplier
      }
    }
    return neighbors
  }

  getGrid(): VoxelGrid {
    return this.inner.getGrid()
  }
}
