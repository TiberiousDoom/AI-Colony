/**
 * Adaptive pathfinder — selects the best algorithm based on terrain analysis.
 *
 * Selection rules (from benchmark data):
 * - Vertically complex terrain (ladders/stairs, 3+ walkable floors) → FlowField
 * - Everything else → D* Lite (best all-around performer)
 *
 * Uses lazy initialization: the delegate is created on the first
 * rebuildLayers()/rebuildGraph() call, after terrain has been populated.
 */

import type { VoxelCoord } from './types.ts'
import type {
  IPathfinder,
  NavigationHandle,
  TerrainChangeEvent,
  MemoryReport,
} from './pathfinder-interface.ts'
import type { VoxelWorldView } from './voxel-world-view.ts'
import { FlowFieldPathfinder } from './flow-field-pathfinder.ts'
import { DStarLitePathfinder } from './dstar-lite.ts'
import { analyzeGrid, isVerticallyComplex } from './terrain-analyzer.ts'

export class AdaptivePathfinder implements IPathfinder {
  private delegate: IPathfinder | null = null
  private selectedName: string = ''
  private readonly worldView: VoxelWorldView
  private readonly worldSize: number

  constructor(worldView: VoxelWorldView, worldSize: number) {
    this.worldView = worldView
    this.worldSize = worldSize
  }

  getSelectedAlgorithm(): string {
    return this.selectedName
  }

  /** Duck-typed hook called by ScenarioRunner after terrain setup. */
  rebuildLayers(): void {
    this.selectDelegate()
    const d = this.delegate as unknown as Record<string, unknown>
    if (typeof d.rebuildLayers === 'function') {
      (d.rebuildLayers as () => void)()
    }
  }

  /** Duck-typed hook called by ScenarioRunner after terrain setup. */
  rebuildGraph(): void {
    this.selectDelegate()
    const d = this.delegate as unknown as Record<string, unknown>
    if (typeof d.rebuildGraph === 'function') {
      (d.rebuildGraph as () => void)()
    }
  }

  private selectDelegate(): void {
    if (this.delegate) return
    const grid = this.worldView.getGrid()
    const profile = analyzeGrid(grid)

    if (isVerticallyComplex(profile)) {
      this.delegate = new FlowFieldPathfinder(this.worldView, this.worldSize)
      this.selectedName = 'FlowField'
    } else {
      this.delegate = new DStarLitePathfinder(this.worldView, this.worldSize)
      this.selectedName = 'D* Lite'
    }
  }

  private ensureDelegate(): IPathfinder {
    if (!this.delegate) {
      this.selectDelegate()
    }
    return this.delegate!
  }

  requestNavigation(
    start: VoxelCoord,
    destination: VoxelCoord,
    agentHeight: number,
    agentId: number,
    maxComputeMs?: number,
  ): NavigationHandle | null {
    return this.ensureDelegate().requestNavigation(start, destination, agentHeight, agentId, maxComputeMs)
  }

  invalidateRegion(event: TerrainChangeEvent): void {
    this.ensureDelegate().invalidateRegion(event)
  }

  releaseNavigation(handle: NavigationHandle): void {
    this.ensureDelegate().releaseNavigation(handle)
  }

  getMemoryUsage(): MemoryReport {
    if (!this.delegate) return { sharedBytes: 0, peakBytes: 0 }
    return this.delegate.getMemoryUsage()
  }

  sweepLeakedHandles(activeAgentIds: Set<number>): number {
    if (!this.delegate) return 0
    return this.delegate.sweepLeakedHandles(activeAgentIds)
  }
}
