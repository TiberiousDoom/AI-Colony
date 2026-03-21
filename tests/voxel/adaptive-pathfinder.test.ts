import { describe, it, expect } from 'vitest'
import { VoxelGrid } from '../../src/voxel/world/voxel-grid.ts'
import { BlockType } from '../../src/voxel/world/block-types.ts'
import { GridWorldView } from '../../src/voxel/pathfinding/grid-world-view.ts'
import { AdaptivePathfinder } from '../../src/voxel/pathfinding/adaptive-pathfinder.ts'
import { analyzeGrid, isVerticallyComplex } from '../../src/voxel/pathfinding/terrain-analyzer.ts'

const WORLD_SIZE = 16

function createFlatWorld(): VoxelGrid {
  const grid = new VoxelGrid(WORLD_SIZE)
  for (let x = 0; x < WORLD_SIZE; x++)
    for (let z = 0; z < WORLD_SIZE; z++)
      grid.setBlock({ x, y: 0, z }, BlockType.Solid)
  return grid
}

function createMultiFloorWorld(): VoxelGrid {
  const grid = new VoxelGrid(WORLD_SIZE)
  // 3 floors at y=0, y=4, y=8
  for (const floorY of [0, 4, 8]) {
    for (let x = 0; x < WORLD_SIZE; x++)
      for (let z = 0; z < WORLD_SIZE; z++)
        grid.setBlock({ x, y: floorY, z }, BlockType.Solid)
  }
  // Ladder column connecting floors
  for (let y = 1; y <= 9; y++)
    grid.setBlock({ x: 2, y, z: 2 }, BlockType.Ladder)
  return grid
}

describe('TerrainAnalyzer', () => {
  it('flat world is not vertically complex', () => {
    const grid = createFlatWorld()
    const profile = analyzeGrid(grid)
    expect(profile.verticalBlockCount).toBe(0)
    expect(profile.distinctWalkableYLevels).toBe(1)
    expect(isVerticallyComplex(profile)).toBe(false)
  })

  it('multi-floor world with ladders is vertically complex', () => {
    const grid = createMultiFloorWorld()
    const profile = analyzeGrid(grid)
    expect(profile.verticalBlockCount).toBeGreaterThan(0)
    expect(profile.distinctWalkableYLevels).toBeGreaterThanOrEqual(3)
    expect(isVerticallyComplex(profile)).toBe(true)
  })
})

describe('AdaptivePathfinder selection', () => {
  it('selects D* Lite for flat terrain', () => {
    const grid = createFlatWorld()
    const view = new GridWorldView(grid)
    const adaptive = new AdaptivePathfinder(view, WORLD_SIZE)
    adaptive.rebuildLayers()
    expect(adaptive.getSelectedAlgorithm()).toBe('D* Lite')
  })

  it('selects FlowField for multi-floor terrain with ladders', () => {
    const grid = createMultiFloorWorld()
    const view = new GridWorldView(grid)
    const adaptive = new AdaptivePathfinder(view, WORLD_SIZE)
    adaptive.rebuildLayers()
    expect(adaptive.getSelectedAlgorithm()).toBe('FlowField')
  })
})
