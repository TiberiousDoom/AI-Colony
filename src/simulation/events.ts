/**
 * Random event system: predator attacks, blight, cold snaps.
 * Phase 2 events only. resource_discovery, illness, and storm are deferred to Phase 4.
 */

import type { SeededRNG } from '../utils/seed.ts'
import type { Position, Season } from './villager.ts'

export type RandomEventType = 'predator' | 'blight' | 'cold_snap'

export interface RandomEvent {
  type: RandomEventType
  triggerTick: number
  /** Relative offset from campfire where event occurs — applied per-village */
  relativePosition: { dx: number; dy: number }
  radius: number
  /** Ticks remaining (0 for instant events like predator damage) */
  durationTicks: number
  /** Damage/intensity parameter */
  severity: number
}

/** Convert relative event position to absolute position for a given campfire */
export function resolveEventPosition(event: RandomEvent, campfire: Position): Position {
  return {
    x: campfire.x + event.relativePosition.dx,
    y: campfire.y + event.relativePosition.dy,
  }
}

export class EventScheduler {
  private rng: SeededRNG
  private daysSinceLastEvent: number = 0

  constructor(rng: SeededRNG) {
    this.rng = rng
  }

  /** Check if a new event should fire this day. Returns event or null. */
  checkForEvent(dayCount: number, season: Season): RandomEvent | null {
    this.daysSinceLastEvent++

    // Events fire every 5–10 days
    const threshold = 5 + this.rng.nextInt(0, 5)
    if (this.daysSinceLastEvent < threshold) return null

    this.daysSinceLastEvent = 0

    // Determine event type
    const roll = this.rng.next()

    if (season === 'autumn' && roll < 0.4) {
      // Cold snap fires mid-autumn only
      return this.createColdSnap(dayCount)
    } else if (roll < 0.5) {
      return this.createPredator(dayCount)
    } else {
      return this.createBlight(dayCount)
    }
  }

  /** Apply per-tick effects of active events */
  processActiveEvents(
    _events: RandomEvent[],
    _villagers: { alive: boolean; position: Position; needs: Map<string, { current: number }> }[],
    _campfire: Position,
  ): void {
    // Processing is done in the engine tick loop
  }

  /** Decrement durations, remove expired events */
  tickEvents(events: RandomEvent[]): RandomEvent[] {
    return events.filter(e => {
      if (e.durationTicks <= 0) return false
      e.durationTicks--
      return e.durationTicks > 0
    })
  }

  private createPredator(dayCount: number): RandomEvent {
    const dx = this.rng.nextInt(-8, 8)
    const dy = this.rng.nextInt(-8, 8)
    const severity = this.rng.nextInt(20, 40)
    return {
      type: 'predator',
      triggerTick: dayCount,
      relativePosition: { dx, dy },
      radius: 5,
      durationTicks: 1, // Instant damage applied once
      severity,
    }
  }

  private createBlight(dayCount: number): RandomEvent {
    const dx = this.rng.nextInt(-10, 10)
    const dy = this.rng.nextInt(-10, 10)
    return {
      type: 'blight',
      triggerTick: dayCount,
      relativePosition: { dx, dy },
      radius: 5,
      durationTicks: 90, // 3 days = 90 ticks
      severity: 0,
    }
  }

  private createColdSnap(dayCount: number): RandomEvent {
    return {
      type: 'cold_snap',
      triggerTick: dayCount,
      relativePosition: { dx: 0, dy: 0 },
      radius: 999, // Affects entire map
      durationTicks: 60, // 2 days = 60 ticks
      severity: 3, // Warmth drain rate
    }
  }
}
