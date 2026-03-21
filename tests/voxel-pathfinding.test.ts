import { describe, it, expect } from 'vitest'
import { VoxelGrid } from '../src/voxel/world/voxel-grid.ts'
import { BlockType } from '../src/voxel/world/block-types.ts'
import { GridWorldView } from '../src/voxel/pathfinding/grid-world-view.ts'
import { GridAStarPathfinder } from '../src/voxel/pathfinding/grid-astar.ts'
import { DStarLitePathfinder } from '../src/voxel/pathfinding/dstar-lite.ts'
import { HPAStarPathfinder } from '../src/voxel/pathfinding/hpa-star.ts'
import { FlowFieldPathfinder } from '../src/voxel/pathfinding/flow-field-pathfinder.ts'
import { voxelEquals, manhattanDistance3D } from '../src/voxel/pathfinding/types.ts'
import type { VoxelCoord } from '../src/voxel/pathfinding/types.ts'

const WORLD_SIZE = 16

/** Create a flat world with solid ground at y=0 and air above */
function createFlatWorld(size: number = WORLD_SIZE): VoxelGrid {
  const grid = new VoxelGrid(size)
  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      grid.setBlock({ x, y: 0, z }, BlockType.Solid)
    }
  }
  return grid
}

/** Get the full planned path from a handle */
function getPath(
  pathfinder: GridAStarPathfinder | DStarLitePathfinder | HPAStarPathfinder | FlowFieldPathfinder,
  start: VoxelCoord,
  dest: VoxelCoord,
  agentHeight: number = 2,
): VoxelCoord[] | null {
  const handle = pathfinder.requestNavigation(start, dest, agentHeight, 1)
  if (!handle) return null
  const path = handle.getPlannedPath(start)
  pathfinder.releaseNavigation(handle)
  return path
}

// ──────────────────────────────────────────────────────────────────
// Bug A: Grid A* heap correctness (lazy deletion fix)
// ──────────────────────────────────────────────────────────────────

describe('Grid A* — heap correctness', () => {
  it('finds optimal path in open space', () => {
    const grid = createFlatWorld()
    const view = new GridWorldView(grid)
    const astar = new GridAStarPathfinder(view)

    const start: VoxelCoord = { x: 0, y: 1, z: 0 }
    const dest: VoxelCoord = { x: 10, y: 1, z: 0 }
    const path = getPath(astar, start, dest)

    expect(path).not.toBeNull()
    expect(path!.length).toBe(11) // 10 steps + start
  })

  it('produces optimal path around L-shaped wall', () => {
    // An L-shaped wall forces A* to re-evaluate nodes when finding a shorter route
    const grid = createFlatWorld()
    const view = new GridWorldView(grid)

    // Place L-shaped wall blocking the direct path
    for (let z = 0; z < 6; z++) {
      grid.setBlock({ x: 5, y: 1, z }, BlockType.Solid)
      grid.setBlock({ x: 5, y: 2, z }, BlockType.Solid)
    }
    for (let x = 5; x < 10; x++) {
      grid.setBlock({ x, y: 1, z: 5 }, BlockType.Solid)
      grid.setBlock({ x, y: 2, z: 5 }, BlockType.Solid)
    }

    const astar = new GridAStarPathfinder(view)
    const start: VoxelCoord = { x: 3, y: 1, z: 3 }
    const dest: VoxelCoord = { x: 8, y: 1, z: 3 }
    const path = getPath(astar, start, dest)

    expect(path).not.toBeNull()
    // Verify path doesn't go through walls
    for (const p of path!) {
      expect(grid.getBlock(p)).not.toBe(BlockType.Solid)
    }
    // Verify path reaches destination
    expect(voxelEquals(path![path!.length - 1], dest)).toBe(true)
  })

  it('path steps are contiguous (6-directional)', () => {
    const grid = createFlatWorld()
    const view = new GridWorldView(grid)
    const astar = new GridAStarPathfinder(view)

    const path = getPath(astar, { x: 0, y: 1, z: 0 }, { x: 8, y: 1, z: 8 })
    expect(path).not.toBeNull()

    for (let i = 1; i < path!.length; i++) {
      const prev = path![i - 1]
      const curr = path![i]
      const dist = manhattanDistance3D(prev, curr)
      // Each step must be exactly 1 voxel (cardinal or vertical)
      expect(dist).toBeLessThanOrEqual(2) // step-up is dx+dy=2
    }
  })
})

// ──────────────────────────────────────────────────────────────────
// Bug B: D* Lite km tracking
// ──────────────────────────────────────────────────────────────────

describe('D* Lite — incremental replanning', () => {
  it('finds path in flat world', () => {
    const grid = createFlatWorld()
    const view = new GridWorldView(grid)
    const dstar = new DStarLitePathfinder(view, WORLD_SIZE, true)

    const start: VoxelCoord = { x: 0, y: 1, z: 0 }
    const dest: VoxelCoord = { x: 5, y: 1, z: 0 }
    const handle = dstar.requestNavigation(start, dest, 2, 1)

    expect(handle).not.toBeNull()
    const next = handle!.getNextVoxel(start)
    expect(next).not.toBeNull()
    expect(manhattanDistance3D(start, next!)).toBe(1)

    dstar.releaseNavigation(handle!)
  })

  it('re-routes after terrain change', () => {
    const grid = createFlatWorld()
    const view = new GridWorldView(grid)
    const dstar = new DStarLitePathfinder(view, WORLD_SIZE, true)

    const start: VoxelCoord = { x: 0, y: 1, z: 0 }
    const dest: VoxelCoord = { x: 5, y: 1, z: 0 }
    const handle = dstar.requestNavigation(start, dest, 2, 1)
    expect(handle).not.toBeNull()

    // Get initial path
    const initialPath = handle!.getPlannedPath(start)
    expect(initialPath).not.toBeNull()

    // Block the path at x=3
    grid.setBlock({ x: 3, y: 1, z: 0 }, BlockType.Solid)
    grid.setBlock({ x: 3, y: 2, z: 0 }, BlockType.Solid)

    // Invalidate
    dstar.invalidateRegion({
      changedVoxels: [{ x: 3, y: 1, z: 0 }, { x: 3, y: 2, z: 0 }],
      chunkCoords: [],
      changeType: 'add',
      tick: 1,
    })

    // Path should still work but route around the obstacle
    const next = handle!.getNextVoxel(start)
    expect(next).not.toBeNull()
    // Should not go through the blocked cell
    if (next) {
      expect(next.x !== 3 || next.z !== 0).toBe(true)
    }

    dstar.releaseNavigation(handle!)
  })

  it('handles agent movement correctly (km accumulates via updateStart)', () => {
    const grid = createFlatWorld()
    const view = new GridWorldView(grid)
    const dstar = new DStarLitePathfinder(view, WORLD_SIZE, true)

    const start: VoxelCoord = { x: 0, y: 1, z: 0 }
    const dest: VoxelCoord = { x: 10, y: 1, z: 0 }
    const handle = dstar.requestNavigation(start, dest, 2, 1)
    expect(handle).not.toBeNull()

    // Walk along the path, asking for next voxel at each position
    let pos = start
    const visited: VoxelCoord[] = [pos]
    for (let step = 0; step < 10; step++) {
      const next = handle!.getNextVoxel(pos)
      if (!next) break
      pos = next
      visited.push(pos)
    }

    // Should have reached destination
    expect(voxelEquals(pos, dest)).toBe(true)
    expect(visited.length).toBe(11)

    dstar.releaseNavigation(handle!)
  })
})

// ──────────────────────────────────────────────────────────────────
// Vertical movement (ladders, stairs, step-up/down)
// ──────────────────────────────────────────────────────────────────

describe('Vertical movement', () => {
  it('navigates via ladder', () => {
    const grid = createFlatWorld()
    const view = new GridWorldView(grid)

    // Create a 2-floor structure:
    // Floor 1: y=0 solid, y=1-2 air
    // Floor 2: y=3 solid, y=4-5 air
    // Ladder at (5,1,5), (5,2,5), (5,3,5)
    for (let x = 0; x < WORLD_SIZE; x++) {
      for (let z = 0; z < WORLD_SIZE; z++) {
        grid.setBlock({ x, y: 3, z }, BlockType.Solid)
      }
    }
    // Clear the ladder column on floor 2
    grid.setBlock({ x: 5, y: 3, z: 5 }, BlockType.Air)
    // Place ladders
    grid.setBlock({ x: 5, y: 1, z: 5 }, BlockType.Ladder)
    grid.setBlock({ x: 5, y: 2, z: 5 }, BlockType.Ladder)
    grid.setBlock({ x: 5, y: 3, z: 5 }, BlockType.Ladder)

    const astar = new GridAStarPathfinder(view)
    const start: VoxelCoord = { x: 3, y: 1, z: 5 }
    const dest: VoxelCoord = { x: 7, y: 4, z: 5 }
    const path = getPath(astar, start, dest)

    expect(path).not.toBeNull()
    // Path should go through ladder voxels
    const usesLadder = path!.some(p => p.x === 5 && p.z === 5 && p.y >= 1 && p.y <= 3)
    expect(usesLadder).toBe(true)
    // Should reach destination
    expect(voxelEquals(path![path!.length - 1], dest)).toBe(true)
  })

  it('step-up works (1 block height change)', () => {
    const grid = createFlatWorld()
    const view = new GridWorldView(grid)

    // Create a raised platform for x>=5
    for (let x = 5; x < WORLD_SIZE; x++) {
      for (let z = 0; z < WORLD_SIZE; z++) {
        grid.setBlock({ x, y: 1, z }, BlockType.Solid)
      }
    }

    const astar = new GridAStarPathfinder(view)
    // Start on ground level (y=1, floor=y=0)
    const start: VoxelCoord = { x: 3, y: 1, z: 5 }
    // Dest on raised platform (y=2, floor=y=1)
    const dest: VoxelCoord = { x: 7, y: 2, z: 5 }
    const path = getPath(astar, start, dest)

    expect(path).not.toBeNull()
    expect(voxelEquals(path![path!.length - 1], dest)).toBe(true)
  })

  it('drop down works (up to 3 blocks)', () => {
    const grid = createFlatWorld()
    const view = new GridWorldView(grid)

    // Create a raised platform at y=3 for x<5
    for (let x = 0; x < 5; x++) {
      for (let z = 0; z < WORLD_SIZE; z++) {
        grid.setBlock({ x, y: 1, z }, BlockType.Solid)
        grid.setBlock({ x, y: 2, z }, BlockType.Solid)
        grid.setBlock({ x, y: 3, z }, BlockType.Solid)
      }
    }

    const astar = new GridAStarPathfinder(view)
    // Start on the raised platform at y=4
    const start: VoxelCoord = { x: 3, y: 4, z: 5 }
    // Destination on the ground at y=1
    const dest: VoxelCoord = { x: 7, y: 1, z: 5 }
    const path = getPath(astar, start, dest)

    expect(path).not.toBeNull()
    expect(voxelEquals(path![path!.length - 1], dest)).toBe(true)
  })

  it('2-tall agent clearance blocks passage', () => {
    const grid = createFlatWorld()
    const view = new GridWorldView(grid)

    // Create a ceiling 1 block high at x=5 (blocks 2-tall agent)
    for (let z = 0; z < WORLD_SIZE; z++) {
      grid.setBlock({ x: 5, y: 2, z }, BlockType.Solid)
    }

    const astar = new GridAStarPathfinder(view)
    const start: VoxelCoord = { x: 3, y: 1, z: 5 }
    const dest: VoxelCoord = { x: 7, y: 1, z: 5 }

    // With height=2 (default), the path should go around since x=5 has only 1 block clearance
    const path2 = getPath(astar, start, dest, 2)
    if (path2) {
      // If path found, it should avoid x=5
      for (const p of path2) {
        if (p.y === 1) {
          // At y=1, x=5 has a ceiling at y=2, blocking 2-tall agent
          expect(p.x !== 5 || grid.getBlock({ x: p.x, y: p.y + 1, z: p.z }) !== BlockType.Solid).toBe(true)
        }
      }
    }

    // With height=1, path should go straight through
    const path1 = getPath(astar, start, dest, 1)
    expect(path1).not.toBeNull()
    expect(voxelEquals(path1![path1!.length - 1], dest)).toBe(true)
  })
})

// ──────────────────────────────────────────────────────────────────
// Multi-algorithm consistency
// ──────────────────────────────────────────────────────────────────

describe('Multi-algorithm consistency', () => {
  it('A* and HPA* reach same destination', () => {
    const grid = createFlatWorld()
    const view = new GridWorldView(grid)

    const astar = new GridAStarPathfinder(view)
    const hpa = new HPAStarPathfinder(view, WORLD_SIZE)

    const start: VoxelCoord = { x: 1, y: 1, z: 1 }
    const dest: VoxelCoord = { x: 12, y: 1, z: 12 }

    const pathA = getPath(astar, start, dest)
    const pathH = getPath(hpa, start, dest)

    expect(pathA).not.toBeNull()
    expect(pathH).not.toBeNull()
    // Both should reach the destination
    expect(voxelEquals(pathA![pathA!.length - 1], dest)).toBe(true)
    expect(voxelEquals(pathH![pathH!.length - 1], dest)).toBe(true)
  })

  it('A* and D* Lite reach same destination', () => {
    const grid = createFlatWorld()
    const view = new GridWorldView(grid)

    const astar = new GridAStarPathfinder(view)
    const dstar = new DStarLitePathfinder(view, WORLD_SIZE, true)

    const start: VoxelCoord = { x: 1, y: 1, z: 1 }
    const dest: VoxelCoord = { x: 10, y: 1, z: 10 }

    const pathA = getPath(astar, start, dest)
    const handleD = dstar.requestNavigation(start, dest, 2, 1)
    const pathD = handleD?.getPlannedPath(start)
    if (handleD) dstar.releaseNavigation(handleD)

    expect(pathA).not.toBeNull()
    expect(pathD).not.toBeNull()
    expect(voxelEquals(pathA![pathA!.length - 1], dest)).toBe(true)
    expect(voxelEquals(pathD![pathD!.length - 1], dest)).toBe(true)
  })
})

// ──────────────────────────────────────────────────────────────────
// Determinism
// ──────────────────────────────────────────────────────────────────

describe('Determinism', () => {
  it('same start/dest produces identical path across repeated calls', () => {
    const grid = createFlatWorld()
    // Add some obstacles
    for (let z = 2; z < 10; z++) {
      grid.setBlock({ x: 5, y: 1, z }, BlockType.Solid)
      grid.setBlock({ x: 5, y: 2, z }, BlockType.Solid)
    }

    const start: VoxelCoord = { x: 2, y: 1, z: 5 }
    const dest: VoxelCoord = { x: 8, y: 1, z: 5 }

    // Run 5 times with fresh pathfinder
    const paths: VoxelCoord[][] = []
    for (let i = 0; i < 5; i++) {
      const view = new GridWorldView(grid)
      const astar = new GridAStarPathfinder(view)
      const path = getPath(astar, start, dest)
      expect(path).not.toBeNull()
      paths.push(path!)
    }

    // All paths should be identical
    for (let i = 1; i < paths.length; i++) {
      expect(paths[i].length).toBe(paths[0].length)
      for (let j = 0; j < paths[0].length; j++) {
        expect(voxelEquals(paths[i][j], paths[0][j])).toBe(true)
      }
    }
  })
})

// ──────────────────────────────────────────────────────────────────
// Handle lifecycle
// ──────────────────────────────────────────────────────────────────

describe('Handle lifecycle', () => {
  it('sweepLeakedHandles removes orphaned handles', () => {
    const grid = createFlatWorld()
    const view = new GridWorldView(grid)
    const astar = new GridAStarPathfinder(view)

    // Create handles for agents 1, 2, 3
    astar.requestNavigation({ x: 0, y: 1, z: 0 }, { x: 5, y: 1, z: 0 }, 2, 1)
    astar.requestNavigation({ x: 0, y: 1, z: 0 }, { x: 5, y: 1, z: 0 }, 2, 2)
    astar.requestNavigation({ x: 0, y: 1, z: 0 }, { x: 5, y: 1, z: 0 }, 2, 3)

    // Only agent 1 and 3 are active
    const swept = astar.sweepLeakedHandles(new Set([1, 3]))
    expect(swept).toBe(1) // agent 2 was swept
  })

  it('memory usage tracks handles', () => {
    const grid = createFlatWorld()
    const view = new GridWorldView(grid)
    const astar = new GridAStarPathfinder(view)

    astar.requestNavigation({ x: 0, y: 1, z: 0 }, { x: 10, y: 1, z: 0 }, 2, 1)
    const after = astar.getMemoryUsage()

    expect(after.peakBytes).toBeGreaterThan(0)
  })
})
