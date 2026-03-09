/**
 * Competition Engine: runs two villages on mirrored worlds with different AI systems.
 * Global state (time, season, events) is shared; per-village state is independent.
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
import { type StructureType, getStockpileCap, getShelterCapacity, createStructure, getFarmFoodProduction, getWatchtowerDetectionBonus, hasWall } from './structures.ts'
import { EventScheduler, type RandomEvent, resolveEventPosition } from './events.ts'
import {
  TICKS_PER_DAY, DAY_TICKS, DAYS_PER_SEASON,
  type SimulationHistory, type SimulationEvent, type SimulationEventType,
} from './simulation-engine.ts'
import { COMPETITION, EVENTS as EVENT_CONST, POPULATION } from '../config/game-constants.ts'

const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter']
const VICTORY_LAP_DAYS = COMPETITION.VICTORY_LAP_DAYS
const STAGNATION_WINDOW = COMPETITION.STAGNATION_WINDOW
const STAGNATION_THRESHOLD = COMPETITION.STAGNATION_THRESHOLD

// --- Types ---

export interface VillageConfig {
  id: string
  name: string
  aiSystem: IAISystem
  villagerCount: number
}

export interface CompetitionConfig {
  seed: number
  worldWidth: number
  worldHeight: number
  villages: VillageConfig[]
  timeLimit?: number
  resourceMultiplier?: number
  eventFrequencyMultiplier?: number
}

export interface VillageState {
  id: string
  name: string
  world: World
  villagers: Villager[]
  stockpile: VillageStockpile
  structures: Structure[]
  aiSystem: IAISystem
  campfirePosition: Position
  history: SimulationHistory
  events: SimulationEvent[]
  isEliminated: boolean
  eliminationTick: number | null
  eliminationCause: string | null
  growthTimer: number
}

export interface CompetitionState {
  villages: VillageState[]
  tick: number
  dayCount: number
  timeOfDay: TimeOfDay
  season: Season
  seasonDay: number
  activeEvents: RandomEvent[]
  globalEvents: SimulationEvent[]
  isOver: boolean
  winner: string | null
  victoryLapRemaining: number
  config: CompetitionConfig
}

// --- Engine ---

export class CompetitionEngine {
  private state: CompetitionState
  private rng: SeededRNG
  private villageRngs: Map<string, { ai: SeededRNG; action: SeededRNG; general: SeededRNG }> = new Map()
  private eventScheduler: EventScheduler

  constructor(config: CompetitionConfig) {
    this.rng = createRNG(config.seed)
    this.eventScheduler = new EventScheduler(this.rng.fork(), config.eventFrequencyMultiplier)

    const villages: VillageState[] = config.villages.map(vc => {
      const villageRng = this.rng.fork()
      const aiRng = villageRng.fork()
      const actionRng = villageRng.fork()
      const generalRng = villageRng.fork()

      this.villageRngs.set(vc.id, { ai: aiRng, action: actionRng, general: generalRng })

      const world = new World({
        width: config.worldWidth,
        height: config.worldHeight,
        seed: config.seed,
      })

      const spawnRng = villageRng.fork()
      const villagers = createStartingVillagers(
        vc.villagerCount,
        world.campfirePosition.x,
        world.campfirePosition.y,
        spawnRng,
      )

      return {
        id: vc.id,
        name: vc.name,
        world,
        villagers,
        stockpile: createInitialStockpile(config.resourceMultiplier),
        structures: [],
        aiSystem: vc.aiSystem,
        campfirePosition: world.campfirePosition,
        history: { daily: [] },
        events: [],
        isEliminated: false,
        eliminationTick: null,
        eliminationCause: null,
        growthTimer: 0,
      }
    })

    this.state = {
      villages,
      tick: 0,
      dayCount: 0,
      timeOfDay: 'day',
      season: 'spring',
      seasonDay: 0,
      activeEvents: [],
      globalEvents: [],
      isOver: false,
      winner: null,
      victoryLapRemaining: 0,
      config,
    }

    for (const village of this.state.villages) {
      this.recordSnapshot(village)
    }
    this.addGlobalEvent('day_start', 'Day 1 begins')
  }

  tick(): void {
    if (this.state.isOver) return

    // 1. Time update
    this.state.tick++
    const tickInDay = this.state.tick % TICKS_PER_DAY
    const prevTimeOfDay = this.state.timeOfDay
    this.state.timeOfDay = tickInDay < DAY_TICKS ? 'day' : 'night'

    if (prevTimeOfDay === 'night' && this.state.timeOfDay === 'day') {
      this.state.dayCount++
      this.addGlobalEvent('day_start', `Day ${this.state.dayCount + 1} begins`)
      this.onNewDay()
    } else if (prevTimeOfDay === 'day' && this.state.timeOfDay === 'night') {
      this.addGlobalEvent('night_start', `Night falls on day ${this.state.dayCount + 1}`)
    }

    // 2. Process active events
    this.processActiveEvents()

    // 3. Tick each village
    for (const village of this.state.villages) {
      if (village.isEliminated) continue
      this.tickVillage(village)
    }

    // 4. Tick event durations
    this.state.activeEvents = this.eventScheduler.tickEvents(this.state.activeEvents)

    // 5. History snapshot on day boundary
    if (this.state.tick % TICKS_PER_DAY === 0) {
      for (const village of this.state.villages) {
        if (!village.isEliminated) {
          this.recordSnapshot(village)
        }
      }
    }

    // 6. World regen
    for (const village of this.state.villages) {
      if (!village.isEliminated) {
        village.world.tickRegeneration(this.state.season)
      }
    }

    // 7. End condition checks
    this.checkEndConditions()
  }

  getState(): Readonly<CompetitionState> {
    return this.state
  }

  reset(config?: CompetitionConfig): void {
    const c = config ?? this.state.config
    // Reconstruct everything from scratch
    this.rng = createRNG(c.seed)
    this.eventScheduler = new EventScheduler(this.rng.fork(), c.eventFrequencyMultiplier)
    this.villageRngs.clear()

    const villages: VillageState[] = c.villages.map(vc => {
      const villageRng = this.rng.fork()
      const aiRng = villageRng.fork()
      const actionRng = villageRng.fork()
      const generalRng = villageRng.fork()

      this.villageRngs.set(vc.id, { ai: aiRng, action: actionRng, general: generalRng })

      const world = new World({
        width: c.worldWidth,
        height: c.worldHeight,
        seed: c.seed,
      })

      const spawnRng = villageRng.fork()
      const villagers = createStartingVillagers(
        vc.villagerCount,
        world.campfirePosition.x,
        world.campfirePosition.y,
        spawnRng,
      )

      return {
        id: vc.id,
        name: vc.name,
        world,
        villagers,
        stockpile: createInitialStockpile(c.resourceMultiplier),
        structures: [],
        aiSystem: vc.aiSystem,
        campfirePosition: world.campfirePosition,
        history: { daily: [] },
        events: [],
        isEliminated: false,
        eliminationTick: null,
        eliminationCause: null,
        growthTimer: 0,
      }
    })

    this.state = {
      villages,
      tick: 0,
      dayCount: 0,
      timeOfDay: 'day',
      season: 'spring',
      seasonDay: 0,
      activeEvents: [],
      globalEvents: [],
      isOver: false,
      winner: null,
      victoryLapRemaining: 0,
      config: c,
    }

    for (const village of this.state.villages) {
      this.recordSnapshot(village)
    }
    this.addGlobalEvent('day_start', 'Day 1 begins')
  }

  private tickVillage(village: VillageState): void {
    const isStorm = this.state.activeEvents.some(e => e.type === 'storm')
    const ctx: TickContext = {
      timeOfDay: this.state.timeOfDay,
      season: this.state.season,
      structures: village.structures,
      isStorm,
    }
    const rngs = this.villageRngs.get(village.id)!

    // Tick status effects
    for (const villager of village.villagers) {
      if (!villager.alive) continue
      villager.statusEffects = villager.statusEffects.filter(e => {
        e.ticksRemaining--
        return e.ticksRemaining > 0
      })
    }

    // Needs drain
    for (const villager of village.villagers) {
      if (!villager.alive) continue
      tickNeeds(villager, this.state.season)
    }

    // Action progress
    for (const villager of village.villagers) {
      if (!villager.alive) continue
      if (villager.actionTicksRemaining > 0) {
        villager.actionTicksRemaining--

        const actionDef = getActionDefinition(villager.currentAction)
        if (actionDef && actionDef.energyCostPerTick > 0) {
          const energy = getNeed(villager, NeedType.Energy)
          energy.current -= actionDef.energyCostPerTick
          clampNeed(energy)
        }

        if (villager.actionTicksRemaining === 0) {
          if (actionDef) {
            actionDef.complete(
              villager, village.world, village.stockpile,
              rngs.action, village.campfirePosition, ctx,
            )

            // Check for built structure
            const built = (villager as Villager & { _builtStructure?: { type: string; position: Position } })._builtStructure
            if (built) {
              const structure = createStructure(
                built.type as StructureType,
                built.position, this.state.tick,
              )
              village.structures.push(structure)
              this.addVillageEvent(village, 'structure_built', `${villager.name} built a ${built.type}`)
              delete (villager as Villager & { _builtStructure?: unknown })._builtStructure
            }
          }

          this.tryAutoDeposit(villager, village)
          villager.currentAction = 'idle'
        }
      }
    }

    // Movement
    for (const villager of village.villagers) {
      if (!villager.alive) continue
      if (villager.path.length > 0) {
        const steps = villager.currentAction === 'flee' ? COMPETITION.FLEE_SPEED_MULTIPLIER : 1
        for (let i = 0; i < steps && villager.path.length > 0; i++) {
          const next = villager.path.shift()!
          villager.position.x = next.x
          villager.position.y = next.y
        }
      }
    }

    // AI decisions
    const worldView: AIWorldView = {
      world: village.world,
      stockpile: village.stockpile,
      villagers: village.villagers,
      tick: this.state.tick,
      timeOfDay: this.state.timeOfDay,
      campfirePosition: village.campfirePosition,
      season: this.state.season,
      structures: village.structures,
      activeEvents: this.state.activeEvents,
      villageId: village.id,
    }

    for (const villager of village.villagers) {
      if (!villager.alive) continue
      if (villager.actionTicksRemaining > 0) continue
      if (villager.path.length > 0) continue

      const decision = village.aiSystem.decide(villager, worldView, rngs.ai)
      villager.lastDecision = { reason: decision.reason, scores: decision.scores, goapPlan: decision.goapPlan }
      const actionDef = getActionDefinition(decision.action)

      if (actionDef && actionDef.canPerform(villager, village.world, village.stockpile, village.campfirePosition, ctx)) {
        villager.currentAction = decision.action
        villager.actionTicksRemaining = actionDef.getEffectiveDuration(ctx)
      } else if (decision.targetPosition) {
        const result = findPath(
          villager.position.x, villager.position.y,
          decision.targetPosition.x, decision.targetPosition.y,
          (x, y) => village.world.isPassable(x, y),
          village.world.width, village.world.height,
        )
        if (result.path.length > 1) {
          villager.path = result.path.slice(1)
          villager.targetPosition = decision.targetPosition
          villager.currentAction = decision.action
        }
      }
    }

    // Death check
    for (const villager of village.villagers) {
      if (villager.alive && getNeed(villager, NeedType.Health).current <= 0) {
        villager.alive = false
        this.addVillageEvent(village, 'death', `${villager.name} has died`)
      }
    }

    // Elimination check
    const alive = village.villagers.filter(v => v.alive).length
    if (alive === 0 && !village.isEliminated) {
      village.isEliminated = true
      village.eliminationTick = this.state.tick
      village.eliminationCause = this.inferCauseOfDeath(village)
      this.addGlobalEvent('village_eliminated',
        `${village.name} eliminated — ${village.eliminationCause}`)
    } else if (alive === 1) {
      const alreadyWarned = village.events.some(e => e.type === 'critical_population')
      if (!alreadyWarned) {
        const last = village.villagers.find(v => v.alive)!
        this.addVillageEvent(village, 'critical_population',
          `Critical: only ${last.name} remains!`)
      }
    }
  }

  private onNewDay(): void {
    // Season transitions
    this.state.seasonDay++
    if (this.state.seasonDay >= DAYS_PER_SEASON) {
      this.state.seasonDay = 0
      const idx = SEASONS.indexOf(this.state.season)
      this.state.season = SEASONS[(idx + 1) % SEASONS.length]
      this.addGlobalEvent('season_change',
        `${this.state.season.charAt(0).toUpperCase() + this.state.season.slice(1)} has arrived`)
    }

    // Random events (grace period)
    if (this.state.dayCount >= EVENT_CONST.GRACE_PERIOD_DAYS) {
      const event = this.eventScheduler.checkForEvent(this.state.dayCount, this.state.season)
      if (event) {
        this.state.activeEvents.push(event)
        // Events are mirrored — same relative position for each village
        this.addGlobalEvent('random_event',
          `${event.type} event! (relative offset: ${event.relativePosition.dx}, ${event.relativePosition.dy})`)

        // Apply blight to each village's world independently
        if (event.type === 'blight') {
          for (const village of this.state.villages) {
            if (village.isEliminated) continue
            const pos = resolveEventPosition(event, village.campfirePosition)
            village.world.applyBlight(pos.x, pos.y, event.radius, event.durationTicks)
          }
        }

        // Illness: infect one villager per village (use deterministic index for fairness)
        if (event.type === 'illness') {
          for (const village of this.state.villages) {
            if (village.isEliminated) continue
            const alive = village.villagers.filter(v => v.alive)
            if (alive.length > 0) {
              const idx = event.triggerTick % alive.length
              const target = alive[idx]
              if (!target.statusEffects.some(e => e.type === 'illness')) {
                target.statusEffects.push({ type: 'illness', ticksRemaining: EVENT_CONST.ILLNESS_DURATION })
                this.addVillageEvent(village, 'random_event', `${target.name} has fallen ill!`)
              }
            }
          }
        }

        // Resource discovery: spawn new resource tile near campfire
        if (event.type === 'resource_discovery') {
          const rngs0 = this.villageRngs.values().next().value!
          const isForest = rngs0.general.next() < 0.5
          for (const village of this.state.villages) {
            if (village.isEliminated) continue
            const pos = resolveEventPosition(event, village.campfirePosition)
            // Find a nearby grass tile to convert
            const converted = village.world.convertNearbyGrassTile(pos.x, pos.y, isForest ? 'forest' : 'stone')
            if (converted) {
              this.addVillageEvent(village, 'random_event',
                `New ${isForest ? 'forest' : 'stone'} discovered nearby!`)
            }
          }
        }
      }
    }

    // Farm food production (spring/summer only)
    if (this.state.season === 'spring' || this.state.season === 'summer') {
      for (const village of this.state.villages) {
        if (village.isEliminated) continue
        const farmFood = getFarmFoodProduction(village.structures)
        if (farmFood > 0) {
          const cap = getStockpileCap(village.structures)
          village.stockpile.food = Math.min(cap, village.stockpile.food + farmFood)
        }
      }
    }

    // Population growth for each village
    for (const village of this.state.villages) {
      if (village.isEliminated) continue
      this.checkPopulationGrowth(village)
    }

    // Victory lap countdown
    if (this.state.victoryLapRemaining > 0) {
      this.state.victoryLapRemaining--
      if (this.state.victoryLapRemaining === 0) {
        this.state.isOver = true
      }
    }

    // Time limit
    if (this.state.config.timeLimit && this.state.dayCount >= this.state.config.timeLimit) {
      this.state.isOver = true
      // Winner is village with highest prosperity
      const surviving = this.state.villages.filter(v => !v.isEliminated)
      if (surviving.length > 0) {
        surviving.sort((a, b) => {
          const aSnap = a.history.daily[a.history.daily.length - 1]
          const bSnap = b.history.daily[b.history.daily.length - 1]
          return (bSnap?.prosperityScore ?? 0) - (aSnap?.prosperityScore ?? 0)
        })
        this.state.winner = surviving[0].id
      }
    }

    // Stagnation check
    this.checkStagnation()
  }

  private processActiveEvents(): void {
    for (const event of this.state.activeEvents) {
      for (const village of this.state.villages) {
        if (village.isEliminated) continue
        const pos = resolveEventPosition(event, village.campfirePosition)

        if (event.type === 'predator') {
          const detectionBonus = getWatchtowerDetectionBonus(village.structures)
          const effectiveRadius = event.radius + detectionBonus
          const damageReduction = hasWall(village.structures) ? EVENT_CONST.WALL_DAMAGE_REDUCTION : 1.0

          for (const villager of village.villagers) {
            if (!villager.alive) continue
            const dist = Math.abs(villager.position.x - pos.x) + Math.abs(villager.position.y - pos.y)
            if (dist <= effectiveRadius) {
              // Villagers within detection range (but outside damage range) can flee
              // Villagers within damage range take reduced damage if walls present
              if (dist <= event.radius) {
                const health = getNeed(villager, NeedType.Health)
                health.current -= (event.severity * damageReduction) / Math.max(1, event.durationTicks || 1)
                clampNeed(health)
              }
            }
          }
        } else if (event.type === 'cold_snap') {
          for (const villager of village.villagers) {
            if (!villager.alive) continue
            const warmth = villager.needs.get(NeedType.Warmth)
            if (warmth && this.state.season !== 'winter') {
              warmth.current -= EVENT_CONST.COLD_SNAP_SEVERITY
              clampNeed(warmth)
            }
          }
        }
        // storm and illness are handled via ctx.isStorm flag and statusEffects — no per-event processing needed
      }
    }
  }

  private checkPopulationGrowth(village: VillageState): void {
    const alive = village.villagers.filter(v => v.alive).length
    const shelterCap = getShelterCapacity(village.structures)
    const rngs = this.villageRngs.get(village.id)!

    if (village.stockpile.food > POPULATION.GROWTH_FOOD_THRESHOLD && alive < shelterCap && shelterCap > 0) {
      village.growthTimer++
      if (village.growthTimer >= POPULATION.GROWTH_TIMER_BASE) {
        const threshold = POPULATION.GROWTH_TIMER_BASE + rngs.general.nextInt(0, POPULATION.GROWTH_TIMER_VARIANCE)
        if (village.growthTimer >= threshold) {
          const id = `villager-${village.villagers.length}`
          const name = `Villager ${village.villagers.length + 1}`
          const v = createVillager(
            id, name,
            village.campfirePosition.x + rngs.general.nextInt(-POPULATION.SPAWN_OFFSET, POPULATION.SPAWN_OFFSET),
            village.campfirePosition.y + rngs.general.nextInt(-POPULATION.SPAWN_OFFSET, POPULATION.SPAWN_OFFSET),
          )
          village.villagers.push(v)
          this.addVillageEvent(village, 'birth', `${name} has joined the village!`)
          village.growthTimer = 0
        }
      }
    } else {
      village.growthTimer = 0
    }
  }

  private tryAutoDeposit(villager: Villager, village: VillageState): void {
    if (villager.carrying === null) return
    const cp = village.campfirePosition
    if (Math.abs(villager.position.x - cp.x) > 1 || Math.abs(villager.position.y - cp.y) > 1) return

    const cap = getStockpileCap(village.structures)
    const s = village.stockpile
    switch (villager.carrying.type) {
      case 'food': s.food = Math.min(cap, s.food + villager.carrying.amount); break
      case 'wood': s.wood = Math.min(cap, s.wood + villager.carrying.amount); break
      case 'stone': s.stone = Math.min(cap, s.stone + villager.carrying.amount); break
    }
    villager.carrying = null
  }

  private checkEndConditions(): void {
    const eliminated = this.state.villages.filter(v => v.isEliminated)
    const surviving = this.state.villages.filter(v => !v.isEliminated)

    // All eliminated
    if (surviving.length === 0) {
      this.state.isOver = true
      // Check for tie (simultaneous elimination)
      const eliminationTicks = eliminated.map(v => v.eliminationTick).filter(t => t !== null) as number[]
      if (eliminationTicks.length > 0 && eliminationTicks.every(t => t === eliminationTicks[0])) {
        this.state.winner = null // Tie
      }
      return
    }

    // Last village standing → start victory lap
    if (surviving.length === 1 && eliminated.length > 0 && this.state.victoryLapRemaining === 0 && !this.state.winner) {
      this.state.winner = surviving[0].id
      this.state.victoryLapRemaining = VICTORY_LAP_DAYS
      this.addGlobalEvent('milestone',
        `${surviving[0].name} wins! Victory lap: ${VICTORY_LAP_DAYS} days remaining`)
    }
  }

  private checkStagnation(): void {
    for (const village of this.state.villages) {
      if (village.isEliminated) continue
      const daily = village.history.daily
      if (daily.length < STAGNATION_WINDOW) continue

      const recent = daily[daily.length - 1]
      const old = daily[daily.length - STAGNATION_WINDOW]
      if (!recent || !old || old.prosperityScore === 0) continue

      const change = Math.abs(recent.prosperityScore - old.prosperityScore) / old.prosperityScore
      if (change < STAGNATION_THRESHOLD) {
        const alreadyWarned = village.events.some(
          e => e.type === 'stagnation_warning' && e.day >= this.state.dayCount - 5,
        )
        if (!alreadyWarned) {
          this.addVillageEvent(village, 'stagnation_warning',
            `${village.name} prosperity stagnating (<5% change over ${STAGNATION_WINDOW} days)`)
        }
      }
    }
  }

  private inferCauseOfDeath(village: VillageState): string {
    if (this.state.season === 'winter') {
      return `perished during winter, day ${this.state.dayCount + 1}`
    }
    if (village.stockpile.food <= 0) {
      return `starvation, day ${this.state.dayCount + 1}`
    }
    const hadPredator = this.state.activeEvents.some(e => e.type === 'predator')
    if (hadPredator) {
      return `predator attack, day ${this.state.dayCount + 1}`
    }
    return `all villagers lost, day ${this.state.dayCount + 1}`
  }

  private recordSnapshot(village: VillageState): void {
    const alive = village.villagers.filter(v => v.alive)
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

    const uniqueTypes = new Set(village.structures.map(s => s.type)).size

    const prosperityScore = calculateProsperity(
      population, avgHealth,
      village.stockpile.food, village.stockpile.wood, village.stockpile.stone,
      village.structures.length, uniqueTypes,
      this.state.dayCount,
    )

    village.history.daily.push({
      day: this.state.dayCount,
      season: this.state.season,
      population,
      food: village.stockpile.food,
      wood: village.stockpile.wood,
      stone: village.stockpile.stone,
      avgHealth, avgHunger, avgEnergy,
      prosperityScore,
      activityBreakdown,
    })
  }

  private addGlobalEvent(type: SimulationEventType, message: string): void {
    this.state.globalEvents.push({
      tick: this.state.tick,
      day: this.state.dayCount,
      type,
      message,
    })
  }

  private addVillageEvent(village: VillageState, type: SimulationEventType, message: string): void {
    village.events.push({
      tick: this.state.tick,
      day: this.state.dayCount,
      type,
      message,
      villageId: village.id,
    })
  }
}
