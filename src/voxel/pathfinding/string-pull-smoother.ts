import type { VoxelCoord, SmoothedWaypoint, MoveType } from './types.ts'
import type { VoxelWorldView } from './voxel-world-view.ts'
import type { IPathSmoother } from './pathfinder-interface.ts'

/**
 * Determines if a waypoint represents a vertical transition (climb/drop/stair).
 * These segments should never be smoothed away.
 */
function isVerticalTransition(from: VoxelCoord, to: VoxelCoord): boolean {
  return from.y !== to.y
}

/**
 * Bresenham-style 3D line-of-sight check.
 * Returns true if all intermediate voxels are walkable (floor + agentHeight clearance).
 */
function hasLineOfSight(
  worldView: VoxelWorldView,
  from: VoxelCoord,
  to: VoxelCoord,
  agentHeight: number,
): boolean {
  // Only smooth horizontal segments
  if (from.y !== to.y) return false

  const dx = Math.abs(to.x - from.x)
  const dz = Math.abs(to.z - from.z)
  const sx = from.x < to.x ? 1 : -1
  const sz = from.z < to.z ? 1 : -1

  let err = dx - dz
  let x = from.x
  let z = from.z

  while (true) {
    // Check walkability at every intermediate voxel
    const pos: VoxelCoord = { x, y: from.y, z }
    if (!worldView.isWalkable(pos, agentHeight)) return false

    if (x === to.x && z === to.z) break

    const e2 = 2 * err
    if (e2 > -dz) {
      err -= dz
      x += sx
    }
    if (e2 < dx) {
      err += dx
      z += sz
    }
  }

  return true
}

/**
 * Determines the moveType for a transition between two waypoints.
 */
function getMoveType(from: VoxelCoord, to: VoxelCoord): MoveType {
  if (to.y > from.y) {
    const dy = to.y - from.y
    if (from.x === to.x && from.z === to.z) return 'climb'
    if (dy === 1) return 'stair'
    return 'climb'
  }
  if (to.y < from.y) return 'drop'
  return 'walk'
}

export class StringPullSmoother implements IPathSmoother {
  private worldView: VoxelWorldView

  constructor(worldView: VoxelWorldView) {
    this.worldView = worldView
  }

  smooth(rawPath: VoxelCoord[], agentHeight: number): SmoothedWaypoint[] {
    if (rawPath.length <= 2) {
      return rawPath.map((p, i) => ({
        x: p.x,
        y: p.y,
        z: p.z,
        moveType: i === 0 ? 'walk' as MoveType : getMoveType(rawPath[i - 1], p),
      }))
    }

    const result: SmoothedWaypoint[] = [{
      x: rawPath[0].x,
      y: rawPath[0].y,
      z: rawPath[0].z,
      moveType: 'walk' as MoveType,
    }]

    let anchor = 0

    while (anchor < rawPath.length - 1) {
      // Find the farthest point we can see from anchor
      let farthest = anchor + 1

      // Don't smooth past vertical transitions
      for (let test = anchor + 2; test < rawPath.length; test++) {
        // Check if any intermediate segment involves elevation change
        let hasVertical = false
        for (let k = anchor + 1; k <= test; k++) {
          if (isVerticalTransition(rawPath[k - 1], rawPath[k])) {
            hasVertical = true
            break
          }
        }
        if (hasVertical) break

        if (hasLineOfSight(this.worldView, rawPath[anchor], rawPath[test], agentHeight)) {
          farthest = test
        }
      }

      const from = rawPath[anchor]
      const to = rawPath[farthest]
      result.push({
        x: to.x,
        y: to.y,
        z: to.z,
        moveType: getMoveType(from, to),
      })

      anchor = farthest
    }

    return result
  }

  isValid(smoothedPath: SmoothedWaypoint[], agentHeight: number): boolean {
    for (let i = 0; i < smoothedPath.length - 1; i++) {
      const from: VoxelCoord = { x: smoothedPath[i].x, y: smoothedPath[i].y, z: smoothedPath[i].z }
      const to: VoxelCoord = { x: smoothedPath[i + 1].x, y: smoothedPath[i + 1].y, z: smoothedPath[i + 1].z }

      if (from.y !== to.y) {
        // Vertical — just check both endpoints walkable
        if (!this.worldView.isWalkable(from, agentHeight)) return false
        if (!this.worldView.isWalkable(to, agentHeight)) return false
      } else {
        if (!hasLineOfSight(this.worldView, from, to, agentHeight)) return false
      }
    }
    return true
  }
}
