/**
 * Two-key lexicographic min-heap for D* Lite.
 * Keys are [k1, k2] tuples compared lexicographically.
 * Binary heap backed by array + Map for O(1) index lookup by voxel key.
 */

export type DStarKey = [number, number]

interface HeapEntry {
  voxelKey: string
  key: DStarKey
}

export function compareKeys(a: DStarKey, b: DStarKey): number {
  if (a[0] !== b[0]) return a[0] - b[0]
  return a[1] - b[1]
}

export class DStarPriorityQueue {
  private heap: HeapEntry[] = []
  private indexMap: Map<string, number> = new Map()

  get size(): number {
    return this.heap.length
  }

  isEmpty(): boolean {
    return this.heap.length === 0
  }

  topKey(): DStarKey {
    if (this.heap.length === 0) return [Infinity, Infinity]
    return this.heap[0].key
  }

  contains(voxelKey: string): boolean {
    return this.indexMap.has(voxelKey)
  }

  getKey(voxelKey: string): DStarKey | null {
    const idx = this.indexMap.get(voxelKey)
    if (idx === undefined) return null
    return this.heap[idx].key
  }

  insert(voxelKey: string, key: DStarKey): void {
    if (this.indexMap.has(voxelKey)) {
      this.update(voxelKey, key)
      return
    }
    const entry: HeapEntry = { voxelKey, key }
    this.heap.push(entry)
    const idx = this.heap.length - 1
    this.indexMap.set(voxelKey, idx)
    this.bubbleUp(idx)
  }

  pop(): { voxelKey: string; key: DStarKey } | null {
    if (this.heap.length === 0) return null
    const top = this.heap[0]
    this.indexMap.delete(top.voxelKey)

    if (this.heap.length === 1) {
      this.heap.pop()
      return top
    }

    const last = this.heap.pop()!
    this.heap[0] = last
    this.indexMap.set(last.voxelKey, 0)
    this.bubbleDown(0)
    return top
  }

  remove(voxelKey: string): void {
    const idx = this.indexMap.get(voxelKey)
    if (idx === undefined) return
    this.indexMap.delete(voxelKey)

    if (idx === this.heap.length - 1) {
      this.heap.pop()
      return
    }

    const last = this.heap.pop()!
    this.heap[idx] = last
    this.indexMap.set(last.voxelKey, idx)
    this.bubbleUp(idx)
    this.bubbleDown(this.indexMap.get(last.voxelKey)!)
  }

  update(voxelKey: string, key: DStarKey): void {
    const idx = this.indexMap.get(voxelKey)
    if (idx === undefined) {
      this.insert(voxelKey, key)
      return
    }
    this.heap[idx].key = key
    this.bubbleUp(idx)
    this.bubbleDown(this.indexMap.get(voxelKey)!)
  }

  clear(): void {
    this.heap = []
    this.indexMap.clear()
  }

  private bubbleUp(idx: number): void {
    while (idx > 0) {
      const parent = (idx - 1) >> 1
      if (compareKeys(this.heap[idx].key, this.heap[parent].key) < 0) {
        this.swap(idx, parent)
        idx = parent
      } else {
        break
      }
    }
  }

  private bubbleDown(idx: number): void {
    const n = this.heap.length
    while (true) {
      let smallest = idx
      const left = 2 * idx + 1
      const right = 2 * idx + 2

      if (left < n && compareKeys(this.heap[left].key, this.heap[smallest].key) < 0) {
        smallest = left
      }
      if (right < n && compareKeys(this.heap[right].key, this.heap[smallest].key) < 0) {
        smallest = right
      }

      if (smallest !== idx) {
        this.swap(idx, smallest)
        idx = smallest
      } else {
        break
      }
    }
  }

  private swap(i: number, j: number): void {
    const a = this.heap[i]
    const b = this.heap[j]
    this.heap[i] = b
    this.heap[j] = a
    this.indexMap.set(a.voxelKey, j)
    this.indexMap.set(b.voxelKey, i)
  }
}
