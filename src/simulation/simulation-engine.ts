/**
 * Core simulation engine: tick-based loop driving the entire simulation.
 * No DOM dependencies — can run headlessly.
 */

import { createRNG, type SeededRNG } from '../utils/seed.ts'
import { findPath } from '../utils/pathfinding.ts'
import { calculateProsperity } from '../utils/scoring.ts'
import { World } from './world.ts'
import {
  type Villager,
  type VillagerAction,
  type VillageStockpile,
  type Position,
  type Season,
  createStartingVillagers,
  createVillager,
  createInitialStockpile,
  tickNeeds,
  getNeed,
  NeedType,
  clampNeed,
} from './villager.ts'
import { type TimeOfDay, type TickContext, getActionDefinition } from './actions.ts'
import type { IAISystem, AIWorldView } from './ai/ai-interface.ts'
import type { Structure } from './structures.ts'
import { getStockpileCap, getShelterCapacity, createStructure } from './structures.ts'
import { EventScheduler, type RandomEvent, resolveEventPosition } from './events.ts'
import { TIMING, COMPETITION, EVENTS as EVENT_CONST, POPULATION } from '../config/game-constants.ts'

// --- Constants ---

export const TICKS_PER_DAY = TIMING.TICKS_PER_DAY
export const DAY_TICKS = TIMING.DAY_TICKS
export const NIGHT_TICKS = TIMING.NIGHT_TICKS
export const DAYS_PER_SEASON = TIMING.DAYS_PER_SEASON
export const SNAPSHOTS_PER_DAY = TIMING.SNAPSHOTS_PER_DAY
export const SNAPSHOT_INTERVAL = Math.floor(TICKS_PER_DAY / SNAPSHOTS_PER_DAY)

const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter']

// --- Types ---

export interface SimulationConfig {
  seed: number
  worldWidth: number
  worldHeight: number
  aiSystem: IAISystem
  villagerCount: number
}

export interface DailySnapshot {
  day: number
  season: Season
  population: number
  food: number
  wood: number
  stone: number
  avgHealth: number
  avgHunger: number
  avgEnergy: number
  prosperityScore: number
  activityBreakdown: Record<VillagerAction, number>
}

export interface SimulationHistory {
  daily: DailySnapshot[]
}

export type SimulationEventType =
  | 'death'
  | 'birth'
  | 'day_start'
  | 'night_start'
  | 'season_change'
  | 'milestone'
  | 'structure_built'
  | 'random_event'
  | 'village_eliminated'
  | 'critical_population'
  | 'stagnation_warning'
  | 'resource_exhaustion'
  | 'monster_killed'

export interface SimulationEvent {
  tick: number
  day: number
  type: SimulationEventType
  message: string
  villageId?: string
}

export interface SimulationState {
  world: World
  villagers: Villager[]
  stockpile: VillageStockpile
  tick: number
  dayCount: number
  timeOfDay: TimeOfDay
  season: Season
  seasonDay: number
  campfirePosition: Position
  structures: Structure[]
  activeEvents: RandomEvent[]
  history: SimulationHistory
  events: SimulationEvent[]
  isOver: boolean
  config: SimulationConfig
}

// --- Engine ---

export class SimulationEngine {
  private state: SimulationState
  private rng: SeededRNG
  private aiRng: SeededRNG
  private actionRng: SeededRNG
  private eventScheduler: EventScheduler
  private growthTimer: number = 0

  constructor(config: SimulationConfig) {
    this.rng = createRNG(config.seed)
    this.aiRng = this.rng.fork()
    this.actionRng = this.rng.fork()
    this.eventScheduler = new EventScheduler(this.rng.fork())

    const world = new World({
      width: config.worldWidth,
      height: config.worldHeight,
      seed: config.seed,
    })

    const villagerRng = this.rng.fork()
    const villagers = createStartingVillagers(
      config.villagerCount,
      world.campfirePosition.x,
      world.campfirePosition.y,
      villagerRng,
    )

    this.state = {
      world,
      villagers,
      stockpile: createInitialStockpile(),
      tick: 0,
      dayCount: 0,
      timeOfDay: 'day',
      season: 'spring',
      seasonDay: 0,
      campfirePosition: world.campfirePosition,
      structures: [],
      activeEvents: [],
      history: { daily: [] },
      events: [],
      isOver: false,
      config,
    }

    this.recordSnapshot()
    this.addEvent('day_start', 'Day 1 begins')
  }

  /** Advance the simulation by one tick */
  tick(): void {
    if (this.state.isOver) return

    // 1. Time update
    this.state.tick++
    const tickInDay = this.state.tick % TICKS_PER_DAY
    const prevTimeOfDay = this.state.timeOfDay
    this.state.timeOfDay = tickInDay < DAY_TICKS ? 'day' : 'night'

    // Day/night transition events
    if (prevTimeOfDay === 'night' && this.state.timeOfDay === 'day') {
      this.state.dayCount++
      this.addEvent('day_start', `Day ${this.state.dayCount + 1} begins`)
      this.onNewDay()
    } else if (prevTimeOfDay === 'day' && this.state.timeOfDay === 'night') {
      this.addEvent('night_start', `Night falls on day ${this.state.dayCount + 1}`)
    }

    const ctx = this.getTickContext()

    // 2. Process active events
    this.processActiveEvents()

    // 3. Need drain
    for (const villager of this.state.villagers) {
      if (!villager.alive) continue
      tickNeeds(villager, this.state.season)
    }

    // 4. Action progress
    for (const villager of this.state.villagers) {
      if (!villager.alive) continue
      if (villager.actionTicksRemaining > 0) {
        villager.actionTicksRemaining--

        const actionDef = getActionDefinition(villager.currentAction)
        if (actionDef && actionDef.energyCostPerTick > 0) {
          const energy = getNeed(villager, NeedType.Energy)
          energy.current -= actionDef.energyCostPerTick
          clampNeed(energy)
        }

        // Action complete
        if (villager.actionTicksRemaining === 0) {
          const actionDef = getActionDefinition(villager.currentAction)
          if (actionDef) {
            actionDef.complete(
              villager,
              this.state.world,
              this.state.stockpile,
              this.actionRng,
              this.state.campfirePosition,
              ctx,
            )

            // Check for built structure
            const built = (villager as Villager & { _builtStructure?: { type: string; position: Position } })._builtStructure
            if (built) {
              const structure = createStructure(
                built.type as 'shelter' | 'storage',
                built.position,
                this.state.tick,
              )
              this.state.structures.push(structure)
              this.addEvent('structure_built', `${villager.name} built a ${built.type}`)
              delete (villager as Villager & { _builtStructure?: unknown })._builtStructure
            }
          }

          // Auto-deposit if at campfire and carrying
          this.tryAutoDeposit(villager)

          villager.currentAction = 'idle'
        }
      }
    }

    // 5. Movement
    for (const villager of this.state.villagers) {
      if (!villager.alive) continue
      if (villager.path.length > 0) {
        // Flee: 2× movement speed
        const steps = villager.currentAction === 'flee' ? COMPETITION.FLEE_SPEED_MULTIPLIER : 1
        for (let i = 0; i < steps && villager.path.length > 0; i++) {
          const next = villager.path.shift()!
          villager.position.x = next.x
          villager.position.y = next.y
        }
      }
    }

    // 6. AI decisions
    const worldView: AIWorldView = {
      world: this.state.world,
      stockpile: this.state.stockpile,
      villagers: this.state.villagers,
      tick: this.state.tick,
      timeOfDay: this.state.timeOfDay,
      campfirePosition: this.state.campfirePosition,
      season: this.state.season,
      structures: this.state.structures,
      activeEvents: this.state.activeEvents,
      monsters: [],
      villageId: 'single',
    }

    for (const villager of this.state.villagers) {
      if (!villager.alive) continue
      if (villager.actionTicksRemaining > 0) continue
      if (villager.path.length > 0) continue

      const decision = this.state.config.aiSystem.decide(villager, worldView, this.aiRng)
      villager.lastDecision = { reason: decision.reason, scores: decision.scores }

      const actionDef = getActionDefinition(decision.action)
      if (actionDef && actionDef.canPerform(villager, this.state.world, this.state.stockpile, this.state.campfirePosition, ctx)) {
        villager.currentAction = decision.action
        villager.actionTicksRemaining = actionDef.getEffectiveDuration(ctx)
      } else if (decision.targetPosition) {
        const result = findPath(
          villager.position.x,
          villager.position.y,
          decision.targetPosition.x,
          decision.targetPosition.y,
          (x, y) => this.state.world.isPassable(x, y),
          this.state.world.width,
          this.state.world.height,
        )
        if (result.path.length > 1) {
          villager.path = result.path.slice(1)
          villager.targetPosition = decision.targetPosition
          villager.currentAction = decision.action
        }
      }
    }

    // 7. Death check
    for (const villager of this.state.villagers) {
      if (villager.alive && getNeed(villager, NeedType.Health).current <= 0) {
        villager.alive = false
        this.addEvent('death', `${villager.name} has died`)
      }
    }

    // 8. World update
    this.state.world.tickRegeneration(this.state.season)

    // 9. Tick active event durations
    this.state.activeEvents = this.eventScheduler.tickEvents(this.state.activeEvents)

    // 10. History snapshot every 6 hours
    if (this.state.tick % SNAPSHOT_INTERVAL === 0) {
      this.recordSnapshot()

      if (this.state.stockpile.food >= 100 &&
          (this.state.history.daily.length <= 1 ||
           this.state.history.daily[this.state.history.daily.length - 2].food < 100)) {
        this.addEvent('milestone', 'Food stockpile reached 100!')
      }
    }

    // 11. End condition
    const alive = this.state.villagers.filter(v => v.alive).length
    if (alive === 0) {
      this.state.isOver = true
      this.addEvent('milestone', 'All villagers have perished')
    } else if (alive === 1) {
      const lastAlive = this.state.villagers.find(v => v.alive)
      // Only warn once
      const alreadyWarned = this.state.events.some(e => e.type === 'critical_population')
      if (!alreadyWarned && lastAlive) {
        this.addEvent('critical_population', `Critical: only ${lastAlive.name} remains!`)
      }
    }
  }

  getState(): Readonly<SimulationState> {
    return this.state
  }

  reset(config?: SimulationConfig): void {
    const c = config ?? this.state.config
    this.rng = createRNG(c.seed)
    this.aiRng = this.rng.fork()
    this.actionRng = this.rng.fork()
    this.eventScheduler = new EventScheduler(this.rng.fork())
    this.growthTimer = 0

    const world = new World({
      width: c.worldWidth,
      height: c.worldHeight,
      seed: c.seed,
    })

    const villagerRng = this.rng.fork()
    const villagers = createStartingVillagers(
      c.villagerCount,
      world.campfirePosition.x,
      world.campfirePosition.y,
      villagerRng,
    )

    this.state = {
      world,
      villagers,
      stockpile: createInitialStockpile(),
      tick: 0,
      dayCount: 0,
      timeOfDay: 'day',
      season: 'spring',
      seasonDay: 0,
      campfirePosition: world.campfirePosition,
      structures: [],
      activeEvents: [],
      history: { daily: [] },
      events: [],
      isOver: false,
      config: c,
    }

    this.recordSnapshot()
    this.addEvent('day_start', 'Day 1 begins')
  }

  private getTickContext(): TickContext {
    return {
      timeOfDay: this.state.timeOfDay,
      season: this.state.season,
      structures: this.state.structures,
    }
  }

  private onNewDay(): void {
    // Season transitions
    this.state.seasonDay++
    if (this.state.seasonDay >= DAYS_PER_SEASON) {
      this.state.seasonDay = 0
      const idx = SEASONS.indexOf(this.state.season)
      this.state.season = SEASONS[(idx + 1) % SEASONS.length]
      this.addEvent('season_change', `${this.state.season.charAt(0).toUpperCase() + this.state.season.slice(1)} has arrived`)
    }

    // Random events (grace period)
    if (this.state.dayCount >= EVENT_CONST.GRACE_PERIOD_DAYS) {
      const event = this.eventScheduler.checkForEvent(this.state.dayCount, this.state.season)
      if (event) {
        this.state.activeEvents.push(event)
        const pos = resolveEventPosition(event, this.state.campfirePosition)
        this.addEvent('random_event', `${event.type} event at (${pos.x}, ${pos.y})!`)
      }
    }

    // Population growth check
    this.checkPopulationGrowth()
  }

  private checkPopulationGrowth(): void {
    const alive = this.state.villagers.filter(v => v.alive).length
    const shelterCap = getShelterCapacity(this.state.structures)

    if (this.state.stockpile.food > POPULATION.GROWTH_FOOD_THRESHOLD && alive < shelterCap && shelterCap > 0) {
      this.growthTimer++
      if (this.growthTimer >= POPULATION.GROWTH_TIMER_BASE) {
        const threshold = POPULATION.GROWTH_TIMER_BASE + this.rng.nextInt(0, POPULATION.GROWTH_TIMER_VARIANCE)
        if (this.growthTimer >= threshold) {
          const id = `villager-${this.state.villagers.length}`
          const name = `Villager ${this.state.villagers.length + 1}`
          const v = createVillager(
            id,
            name,
            this.state.campfirePosition.x + this.rng.nextInt(-POPULATION.SPAWN_OFFSET, POPULATION.SPAWN_OFFSET),
            this.state.campfirePosition.y + this.rng.nextInt(-POPULATION.SPAWN_OFFSET, POPULATION.SPAWN_OFFSET),
          )
          this.state.villagers.push(v)
          this.addEvent('birth', `${name} has joined the village!`)
          this.growthTimer = 0
        }
      }
    } else {
      this.growthTimer = 0
    }
  }

  private processActiveEvents(): void {
    for (const event of this.state.activeEvents) {
      const pos = resolveEventPosition(event, this.state.campfirePosition)

      if (event.type === 'predator') {
        // Damage villagers within radius
        for (const villager of this.state.villagers) {
          if (!villager.alive) continue
          const dist = Math.abs(villager.position.x - pos.x) + Math.abs(villager.position.y - pos.y)
          if (dist <= event.radius) {
            const health = getNeed(villager, NeedType.Health)
            health.current -= event.severity / Math.max(1, event.durationTicks || 1)
            clampNeed(health)
          }
        }
      } else if (event.type === 'cold_snap') {
        // Cold snap: warmth drains at winter rate regardless of actual season
        for (const villager of this.state.villagers) {
          if (!villager.alive) continue
          const warmth = villager.needs.get(NeedType.Warmth)
          if (warmth && this.state.season !== 'winter') {
            warmth.current -= EVENT_CONST.COLD_SNAP_SEVERITY
            clampNeed(warmth)
          }
        }
      }
      // Blight is handled at event creation time (world.applyBlight)
    }
  }

  private tryAutoDeposit(villager: Villager): void {
    if (villager.carrying === null) return
    const cp = this.state.campfirePosition
    if (Math.abs(villager.position.x - cp.x) > 1 || Math.abs(villager.position.y - cp.y) > 1) return

    const cap = getStockpileCap(this.state.structures)
    const s = this.state.stockpile
    switch (villager.carrying.type) {
      case 'food': s.food = Math.min(cap, s.food + villager.carrying.amount); break
      case 'wood': s.wood = Math.min(cap, s.wood + villager.carrying.amount); break
      case 'stone': s.stone = Math.min(cap, s.stone + villager.carrying.amount); break
    }
    villager.carrying = null
  }

  private recordSnapshot(): void {
    const alive = this.state.villagers.filter(v => v.alive)
    const population = alive.length

    let avgHealth = 0
    let avgHunger = 0
    let avgEnergy = 0
    if (population > 0) {
      for (const v of alive) {
        avgHealth += getNeed(v, NeedType.Health).current
        avgHunger += getNeed(v, NeedType.Hunger).current
        avgEnergy += getNeed(v, NeedType.Energy).current
      }
      avgHealth /= population
      avgHunger /= population
      avgEnergy /= population
    }

    const activityBreakdown = {} as Record<VillagerAction, number>
    const actionTypes: VillagerAction[] = [
      'idle', 'forage', 'eat', 'rest', 'chop_wood', 'mine_stone',
      'haul', 'fish', 'flee', 'build_shelter', 'build_storage', 'warm_up',
      'build_watchtower', 'build_farm', 'build_wall', 'build_well',
    ]
    for (const a of actionTypes) activityBreakdown[a] = 0
    for (const v of alive) {
      activityBreakdown[v.currentAction] = (activityBreakdown[v.currentAction] || 0) + 1
    }

    const uniqueTypes = new Set(this.state.structures.map(s => s.type)).size

    const prosperityScore = calculateProsperity(
      population,
      avgHealth,
      this.state.stockpile.food,
      this.state.stockpile.wood,
      this.state.stockpile.stone,
      this.state.structures.length,
      uniqueTypes,
      this.state.dayCount,
      avgHunger,
      avgEnergy,
    )

    this.state.history.daily.push({
      day: this.state.tick / TICKS_PER_DAY,
      season: this.state.season,
      population,
      food: this.state.stockpile.food,
      wood: this.state.stockpile.wood,
      stone: this.state.stockpile.stone,
      avgHealth,
      avgHunger,
      avgEnergy,
      prosperityScore,
      activityBreakdown,
    })
  }

  private addEvent(type: SimulationEventType, message: string): void {
    this.state.events.push({
      tick: this.state.tick,
      day: this.state.dayCount,
      type,
      message,
    })
  }
}
