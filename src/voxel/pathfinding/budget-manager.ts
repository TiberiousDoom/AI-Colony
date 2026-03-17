export const DEFAULT_TICK_BUDGET_MS = 15
export const WATCHDOG_TIMEOUT_MS = 100

export interface BudgetRequest {
  type: 'reroute' | 'new'
  execute: () => void
}

export class PathfindingBudgetManager {
  private tickBudgetMs: number
  private queue: BudgetRequest[] = []
  private deferredCount: number = 0

  constructor(tickBudgetMs: number = DEFAULT_TICK_BUDGET_MS) {
    this.tickBudgetMs = tickBudgetMs
  }

  enqueue(request: BudgetRequest): void {
    this.queue.push(request)
    // Keep sorted: reroutes first
    this.queue.sort((a, b) => {
      if (a.type === 'reroute' && b.type === 'new') return -1
      if (a.type === 'new' && b.type === 'reroute') return 1
      return 0
    })
  }

  processTick(): { processed: number; deferred: number } {
    const startTime = performance.now()
    let processed = 0
    let deferred = 0

    while (this.queue.length > 0) {
      if (performance.now() - startTime >= this.tickBudgetMs) {
        deferred = this.queue.length
        this.deferredCount += deferred
        break
      }

      const request = this.queue.shift()!
      try {
        request.execute()
      } catch (err) {
        // Error recovery: log but don't crash
        console.error('[BudgetManager] Request failed:', err)
      }
      processed++
    }

    return { processed, deferred }
  }

  get pendingCount(): number {
    return this.queue.length
  }

  get totalDeferred(): number {
    return this.deferredCount
  }

  clear(): void {
    this.queue.length = 0
  }
}

export function withWatchdog<T>(fn: () => T, timeoutMs: number = WATCHDOG_TIMEOUT_MS): T {
  const start = performance.now()
  const result = fn()
  const elapsed = performance.now() - start
  if (elapsed > timeoutMs) {
    throw new Error(`Watchdog timeout: computation took ${elapsed.toFixed(1)}ms (limit: ${timeoutMs}ms)`)
  }
  return result
}
