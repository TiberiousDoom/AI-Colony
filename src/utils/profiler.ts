/**
 * Tick profiler for debugging performance.
 * Gated behind PROFILE flag — defaults to off.
 */

const PROFILE = false
const WINDOW_SIZE = 100

interface SectionData {
  samples: number[]
  index: number
  startTime: number
}

const sections = new Map<string, SectionData>()

export function beginSection(name: string): void {
  if (!PROFILE) return
  let data = sections.get(name)
  if (!data) {
    data = { samples: new Array(WINDOW_SIZE).fill(0), index: 0, startTime: 0 }
    sections.set(name, data)
  }
  data.startTime = performance.now()
}

export function endSection(name: string): void {
  if (!PROFILE) return
  const data = sections.get(name)
  if (!data) return
  const elapsed = performance.now() - data.startTime
  data.samples[data.index % WINDOW_SIZE] = elapsed
  data.index++
}

export function getProfileStats(): Record<string, { avg: number; max: number }> {
  const result: Record<string, { avg: number; max: number }> = {}
  for (const [name, data] of sections) {
    const count = Math.min(data.index, WINDOW_SIZE)
    if (count === 0) continue
    let sum = 0
    let max = 0
    for (let i = 0; i < count; i++) {
      sum += data.samples[i]
      max = Math.max(max, data.samples[i])
    }
    result[name] = { avg: sum / count, max }
  }
  return result
}
