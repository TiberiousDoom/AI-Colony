export interface LogEntry {
  tick: number
  type: string
  data: Record<string, unknown>
}

export class EventLogger {
  private entries: LogEntry[] = []

  log(tick: number, type: string, data: Record<string, unknown> = {}): void {
    this.entries.push({ tick, type, data })
  }

  getEntries(): ReadonlyArray<LogEntry> {
    return this.entries
  }

  getEntriesByType(type: string): LogEntry[] {
    return this.entries.filter(e => e.type === type)
  }

  clear(): void {
    this.entries = []
  }

  get length(): number {
    return this.entries.length
  }
}
