import type { VoxelCoord } from './types.ts'
import { voxelKey } from './types.ts'

export class ReservationTable {
  /** tick → (voxelKey → agentId) */
  private tickMap: Map<number, Map<string, number>> = new Map()
  /** agentId → set of ticks that have reservations */
  private agentTicks: Map<number, Set<number>> = new Map()

  reserve(agentId: number, tick: number, positions: VoxelCoord[]): void {
    let tickSlot = this.tickMap.get(tick)
    if (!tickSlot) {
      tickSlot = new Map()
      this.tickMap.set(tick, tickSlot)
    }

    let agentSet = this.agentTicks.get(agentId)
    if (!agentSet) {
      agentSet = new Set()
      this.agentTicks.set(agentId, agentSet)
    }
    agentSet.add(tick)

    for (const pos of positions) {
      tickSlot.set(voxelKey(pos), agentId)
    }
  }

  cancel(agentId: number): void {
    const ticks = this.agentTicks.get(agentId)
    if (!ticks) return

    for (const tick of ticks) {
      const tickSlot = this.tickMap.get(tick)
      if (!tickSlot) continue
      for (const [key, id] of tickSlot) {
        if (id === agentId) tickSlot.delete(key)
      }
      if (tickSlot.size === 0) this.tickMap.delete(tick)
    }

    this.agentTicks.delete(agentId)
  }

  isReserved(tick: number, pos: VoxelCoord, excludeAgent?: number): boolean {
    const tickSlot = this.tickMap.get(tick)
    if (!tickSlot) return false
    const key = voxelKey(pos)
    const reservedBy = tickSlot.get(key)
    if (reservedBy === undefined) return false
    if (excludeAgent !== undefined && reservedBy === excludeAgent) return false
    return true
  }

  getReservedBy(tick: number, pos: VoxelCoord): number | undefined {
    const tickSlot = this.tickMap.get(tick)
    if (!tickSlot) return undefined
    return tickSlot.get(voxelKey(pos))
  }

  gcPastTicks(currentTick: number): number {
    let removed = 0
    for (const [tick] of this.tickMap) {
      if (tick < currentTick) {
        this.tickMap.delete(tick)
        removed++
      }
    }
    // Clean up agent tick references
    for (const [, ticks] of this.agentTicks) {
      for (const t of ticks) {
        if (t < currentTick) ticks.delete(t)
      }
    }
    return removed
  }

  get tickCount(): number {
    return this.tickMap.size
  }
}
