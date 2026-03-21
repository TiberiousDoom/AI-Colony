/**
 * Random event system: predator attacks, blight, cold snaps.
 * Phase 2 events only. resource_discovery, illness, and storm are deferred to Phase 4.
 */

import type { SeededRNG } from '../../shared/seed.ts'
import type { Position, Season } from './villager.ts'
import { EVENTS } from '../config/game-constants.ts'

export type RandomEventType = 'predator' | 'blight' | 'cold_snap' | 'illness' | 'storm' | 'resource_discovery'

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

/** Progressive difficulty scaling based on day count */
export function getDifficultyMultiplier(dayCount: number): number {
  if (dayCount <= 15) return 1.0
  if (dayCount <= 30) return 1.2
  if (dayCount <= 50) return 1.5
  return 1.8
}

export class EventScheduler {
  private rng: SeededRNG
  private daysSinceLastEvent: number = 0
  private frequencyMultiplier: number

  constructor(rng: SeededRNG, frequencyMultiplier: number = 1.0) {
    this.rng = rng
    this.frequencyMultiplier = frequencyMultiplier
  }

  /** Check if a new event should fire this day. Returns event or null. */
  checkForEvent(dayCount: number, season: Season): RandomEvent | null {
    this.daysSinceLastEvent++

    // Events fire every 5–10 days, scaled by frequency multiplier
    const baseThreshold = EVENTS.MIN_INTERVAL + this.rng.nextInt(0, EVENTS.INTERVAL_VARIANCE)
    const threshold = Math.round(baseThreshold * this.frequencyMultiplier)
    if (this.daysSinceLastEvent < threshold) return null

    this.daysSinceLastEvent = 0

    // Determine event type
    const roll = this.rng.next()

    if (season === 'autumn' && roll < 0.3) {
      return this.createColdSnap(dayCount)
    } else if (roll < 0.4) {
      return this.createPredator(dayCount)
    } else if (roll < 0.55) {
      return this.createIllness(dayCount)
    } else if (roll < 0.7) {
      return this.createStorm(dayCount)
    } else if (roll < 0.85) {
      return this.createBlight(dayCount)
    } else {
      return this.createResourceDiscovery(dayCount)
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
    const dx = this.rng.nextInt(-EVENTS.PREDATOR_OFFSET, EVENTS.PREDATOR_OFFSET)
    const dy = this.rng.nextInt(-EVENTS.PREDATOR_OFFSET, EVENTS.PREDATOR_OFFSET)
    const baseSeverity = this.rng.nextInt(EVENTS.PREDATOR_SEVERITY_MIN, EVENTS.PREDATOR_SEVERITY_MAX)
    const severity = Math.round(baseSeverity * getDifficultyMultiplier(dayCount))
    return {
      type: 'predator',
      triggerTick: dayCount,
      relativePosition: { dx, dy },
      radius: EVENTS.PREDATOR_RADIUS,
      durationTicks: EVENTS.PREDATOR_DURATION,
      severity,
    }
  }

  private createBlight(dayCount: number): RandomEvent {
    const dx = this.rng.nextInt(-EVENTS.BLIGHT_OFFSET, EVENTS.BLIGHT_OFFSET)
    const dy = this.rng.nextInt(-EVENTS.BLIGHT_OFFSET, EVENTS.BLIGHT_OFFSET)
    return {
      type: 'blight',
      triggerTick: dayCount,
      relativePosition: { dx, dy },
      radius: EVENTS.BLIGHT_RADIUS,
      durationTicks: EVENTS.BLIGHT_DURATION,
      severity: 0,
    }
  }

  private createColdSnap(dayCount: number): RandomEvent {
    const mult = getDifficultyMultiplier(dayCount)
    return {
      type: 'cold_snap',
      triggerTick: dayCount,
      relativePosition: { dx: 0, dy: 0 },
      radius: EVENTS.COLD_SNAP_RADIUS,
      durationTicks: Math.round(EVENTS.COLD_SNAP_DURATION * mult),
      severity: EVENTS.COLD_SNAP_SEVERITY,
    }
  }

  createIllness(dayCount: number): RandomEvent {
    const mult = getDifficultyMultiplier(dayCount)
    return {
      type: 'illness',
      triggerTick: dayCount,
      relativePosition: { dx: 0, dy: 0 },
      radius: EVENTS.COLD_SNAP_RADIUS,
      durationTicks: Math.round(EVENTS.ILLNESS_DURATION * mult),
      severity: EVENTS.ILLNESS_SEVERITY,
    }
  }

  createStorm(dayCount: number): RandomEvent {
    return {
      type: 'storm',
      triggerTick: dayCount,
      relativePosition: { dx: 0, dy: 0 },
      radius: EVENTS.COLD_SNAP_RADIUS,
      durationTicks: EVENTS.STORM_DURATION,
      severity: EVENTS.STORM_SEVERITY,
    }
  }

  createResourceDiscovery(dayCount: number): RandomEvent {
    const dx = this.rng.nextInt(-EVENTS.RESOURCE_DISCOVERY_OFFSET, EVENTS.RESOURCE_DISCOVERY_OFFSET)
    const dy = this.rng.nextInt(-EVENTS.RESOURCE_DISCOVERY_OFFSET, EVENTS.RESOURCE_DISCOVERY_OFFSET)
    return {
      type: 'resource_discovery',
      triggerTick: dayCount,
      relativePosition: { dx, dy },
      radius: EVENTS.RESOURCE_DISCOVERY_RADIUS,
      durationTicks: EVENTS.RESOURCE_DISCOVERY_DURATION,
      severity: 0,
    }
  }
}
