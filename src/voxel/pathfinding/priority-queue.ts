export class PriorityQueue<T> {
  private heap: Array<{ item: T; priority: number }> = []

  get size(): number {
    return this.heap.length
  }

  push(item: T, priority: number): void {
    this.heap.push({ item, priority })
    this.bubbleUp(this.heap.length - 1)
  }

  pop(): T | undefined {
    if (this.heap.length === 0) return undefined
    const top = this.heap[0]
    const last = this.heap.pop()!
    if (this.heap.length > 0) {
      this.heap[0] = last
      this.sinkDown(0)
    }
    return top.item
  }

  peek(): T | undefined {
    return this.heap.length > 0 ? this.heap[0].item : undefined
  }

  clear(): void {
    this.heap.length = 0
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.heap[parent].priority <= this.heap[i].priority) break
      const tmp = this.heap[parent]
      this.heap[parent] = this.heap[i]
      this.heap[i] = tmp
      i = parent
    }
  }

  private sinkDown(i: number): void {
    const length = this.heap.length
    while (true) {
      let smallest = i
      const left = 2 * i + 1
      const right = 2 * i + 2
      if (left < length && this.heap[left].priority < this.heap[smallest].priority) smallest = left
      if (right < length && this.heap[right].priority < this.heap[smallest].priority) smallest = right
      if (smallest === i) break
      const tmp = this.heap[smallest]
      this.heap[smallest] = this.heap[i]
      this.heap[i] = tmp
      i = smallest
    }
  }
}
