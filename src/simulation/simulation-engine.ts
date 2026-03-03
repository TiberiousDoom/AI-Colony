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
  createStartingVillagers,
  createInitialStockpile,
  tickNeeds,
  getNeed,
  NeedType,
  clampNeed,
} from './villager.ts'
import { type TimeOfDay, getActionDefinition } from './actions.ts'
import type { IAISystem, AIWorldView } from './ai/ai-interface.ts'

// --- Constants ---

export const TICKS_PER_DAY = 30
export const DAY_TICKS = 20
export const NIGHT_TICKS = 10

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

export interface SimulationEvent {
  tick: number
  day: number
  type: 'death' | 'day_start' | 'night_start' | 'milestone'
  message: string
}

export interface SimulationState {
  world: World
  villagers: Villager[]
  stockpile: VillageStockpile
  tick: number
  dayCount: number
  timeOfDay: TimeOfDay
  campfirePosition: Position
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

  constructor(config: SimulationConfig) {
    this.rng = createRNG(config.seed)
    this.aiRng = this.rng.fork()
    this.actionRng = this.rng.fork()

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
      campfirePosition: world.campfirePosition,
      history: { daily: [] },
      events: [],
      isOver: false,
      config,
    }

    // Record initial snapshot at tick 0
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
    } else if (prevTimeOfDay === 'day' && this.state.timeOfDay === 'night') {
      this.addEvent('night_start', `Night falls on day ${this.state.dayCount + 1}`)
    }

    // 2. Need drain
    for (const villager of this.state.villagers) {
      if (!villager.alive) continue
      tickNeeds(villager)
    }

    // 3. Action progress
    for (const villager of this.state.villagers) {
      if (!villager.alive) continue
      if (villager.actionTicksRemaining > 0) {
        villager.actionTicksRemaining--

        // Apply per-tick energy cost for the current action
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
            )
          }

          // Auto-deposit if at campfire and carrying
          if (villager.carrying !== null) {
            const cp = this.state.campfirePosition
            if (Math.abs(villager.position.x - cp.x) <= 1 &&
                Math.abs(villager.position.y - cp.y) <= 1) {
              const s = this.state.stockpile
              switch (villager.carrying.type) {
                case 'food': s.food += villager.carrying.amount; break
                case 'wood': s.wood += villager.carrying.amount; break
                case 'stone': s.stone += villager.carrying.amount; break
              }
              villager.carrying = null
            }
          }

          villager.currentAction = 'idle'
        }
      }
    }

    // 4. Movement
    for (const villager of this.state.villagers) {
      if (!villager.alive) continue
      if (villager.path.length > 0) {
        const next = villager.path.shift()!
        villager.position.x = next.x
        villager.position.y = next.y
      }
    }

    // 5. AI decisions
    const worldView: AIWorldView = {
      world: this.state.world,
      stockpile: this.state.stockpile,
      villagers: this.state.villagers,
      tick: this.state.tick,
      timeOfDay: this.state.timeOfDay,
      campfirePosition: this.state.campfirePosition,
    }

    for (const villager of this.state.villagers) {
      if (!villager.alive) continue
      if (villager.actionTicksRemaining > 0) continue
      if (villager.path.length > 0) continue

      // Villager is idle — ask AI for a decision
      const decision = this.state.config.aiSystem.decide(villager, worldView, this.aiRng)

      // Check if villager can perform the action at current position
      const actionDef = getActionDefinition(decision.action)
      if (actionDef && actionDef.canPerform(villager, this.state.world, this.state.stockpile, this.state.campfirePosition)) {
        // Start the action immediately
        villager.currentAction = decision.action
        villager.actionTicksRemaining = actionDef.getEffectiveDuration(this.state.timeOfDay)
      } else if (decision.targetPosition) {
        // Need to move to target first
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
          // Remove first element (current position)
          villager.path = result.path.slice(1)
          villager.targetPosition = decision.targetPosition
        }
      }
      // If no action and no target, villager stays idle (will re-decide next tick)
    }

    // 6. Death check
    for (const villager of this.state.villagers) {
      if (villager.alive && getNeed(villager, NeedType.Health).current <= 0) {
        villager.alive = false
        this.addEvent('death', `${villager.name} has died`)
      }
    }

    // 7. World update
    this.state.world.tickRegeneration()

    // 8. History snapshot on day boundary
    if (this.state.tick % TICKS_PER_DAY === 0) {
      this.recordSnapshot()

      // Resource milestones
      if (this.state.stockpile.food >= 100 &&
          (this.state.history.daily.length <= 1 ||
           this.state.history.daily[this.state.history.daily.length - 2].food < 100)) {
        this.addEvent('milestone', 'Food stockpile reached 100!')
      }
    }

    // 9. End condition
    const alive = this.state.villagers.filter(v => v.alive).length
    if (alive === 0) {
      this.state.isOver = true
      this.addEvent('milestone', 'All villagers have perished')
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
      campfirePosition: world.campfirePosition,
      history: { daily: [] },
      events: [],
      isOver: false,
      config: c,
    }

    this.recordSnapshot()
    this.addEvent('day_start', 'Day 1 begins')
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
      'haul', 'fish', 'flee', 'build', 'warm_up',
    ]
    for (const a of actionTypes) activityBreakdown[a] = 0
    for (const v of alive) {
      activityBreakdown[v.currentAction] = (activityBreakdown[v.currentAction] || 0) + 1
    }

    const prosperityScore = calculateProsperity(
      population,
      avgHealth,
      this.state.stockpile.food,
      this.state.stockpile.wood,
      this.state.stockpile.stone,
      0, // structureCount (Phase 2)
      0, // uniqueStructureTypes (Phase 2)
      this.state.dayCount,
    )

    this.state.history.daily.push({
      day: this.state.dayCount,
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

  private addEvent(type: SimulationEvent['type'], message: string): void {
    this.state.events.push({
      tick: this.state.tick,
      day: this.state.dayCount,
      type,
      message,
    })
  }
}
