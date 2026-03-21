/**
 * A* pathfinding on a 2D tile grid.
 * 4-directional movement, Manhattan heuristic, binary heap priority queue.
 */

export interface PathResult {
  /** Ordered list of (x, y) tile coordinates from start to goal, inclusive */
  path: Array<{ x: number; y: number }>
  /** Total path cost (number of tiles traversed) */
  cost: number
  /** Whether a complete path to the goal was found */
  found: boolean
}

interface Node {
  x: number
  y: number
  g: number
  f: number
  parent: Node | null
}

const DIRECTIONS = [
  { dx: 0, dy: -1 }, // up
  { dx: 0, dy: 1 },  // down
  { dx: -1, dy: 0 }, // left
  { dx: 1, dy: 0 },  // right
]

const MAX_OPEN_SET = 2000

function manhattan(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by)
}

/**
 * Find a path from (startX, startY) to (goalX, goalY) on a tile grid.
 *
 * If no complete path exists or the search limit is reached, returns a partial
 * path to the closest reachable tile (lowest heuristic to goal in the closed set).
 */
export function findPath(
  startX: number,
  startY: number,
  goalX: number,
  goalY: number,
  isPassable: (x: number, y: number) => boolean,
  width: number,
  height: number,
): PathResult {
  // Same start and goal
  if (startX === goalX && startY === goalY) {
    return { path: [{ x: startX, y: startY }], cost: 0, found: true }
  }

  // Start is impassable
  if (!isPassable(startX, startY)) {
    return { path: [], cost: 0, found: false }
  }

  const startNode: Node = {
    x: startX,
    y: startY,
    g: 0,
    f: manhattan(startX, startY, goalX, goalY),
    parent: null,
  }

  // Binary heap for open set (min-heap by f value)
  const open: Node[] = [startNode]
  const closed = new Map<number, Node>()
  const openSet = new Set<number>()

  const key = (x: number, y: number) => y * width + x
  openSet.add(key(startX, startY))

  let closestNode = startNode
  let closestH = manhattan(startX, startY, goalX, goalY)

  function heapPush(node: Node) {
    open.push(node)
    let i = open.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (open[parent].f <= open[i].f) break
      const tmp = open[parent]
      open[parent] = open[i]
      open[i] = tmp
      i = parent
    }
  }

  function heapPop(): Node {
    const top = open[0]
    const last = open.pop()!
    if (open.length > 0) {
      open[0] = last
      let i = 0
      while (true) {
        let smallest = i
        const left = 2 * i + 1
        const right = 2 * i + 2
        if (left < open.length && open[left].f < open[smallest].f) smallest = left
        if (right < open.length && open[right].f < open[smallest].f) smallest = right
        if (smallest === i) break
        const tmp = open[smallest]
        open[smallest] = open[i]
        open[i] = tmp
        i = smallest
      }
    }
    return top
  }

  while (open.length > 0) {
    const current = heapPop()
    const ck = key(current.x, current.y)
    openSet.delete(ck)

    // Goal reached
    if (current.x === goalX && current.y === goalY) {
      return { path: reconstructPath(current), cost: current.g, found: true }
    }

    closed.set(ck, current)

    // Track closest node to goal
    const h = manhattan(current.x, current.y, goalX, goalY)
    if (h < closestH) {
      closestH = h
      closestNode = current
    }

    // Search limit
    if (closed.size >= MAX_OPEN_SET) {
      break
    }

    for (const dir of DIRECTIONS) {
      const nx = current.x + dir.dx
      const ny = current.y + dir.dy

      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
      if (!isPassable(nx, ny)) continue

      const nk = key(nx, ny)
      if (closed.has(nk)) continue

      const ng = current.g + 1
      const nf = ng + manhattan(nx, ny, goalX, goalY)

      if (openSet.has(nk)) {
        // Check if this path is better
        const existing = open.find(n => n.x === nx && n.y === ny)
        if (existing && ng >= existing.g) continue
        // Update in place (not ideal for heap, but correct)
        if (existing) {
          existing.g = ng
          existing.f = nf
          existing.parent = current
        }
      } else {
        const neighbor: Node = { x: nx, y: ny, g: ng, f: nf, parent: current }
        heapPush(neighbor)
        openSet.add(nk)
      }
    }
  }

  // No complete path found — return partial path to closest reachable tile
  if (closestNode !== startNode) {
    const path = reconstructPath(closestNode)
    return { path, cost: closestNode.g, found: false }
  }

  return { path: [], cost: 0, found: false }
}

function reconstructPath(node: Node): Array<{ x: number; y: number }> {
  const path: Array<{ x: number; y: number }> = []
  let current: Node | null = node
  while (current !== null) {
    path.unshift({ x: current.x, y: current.y })
    current = current.parent
  }
  return path
}
