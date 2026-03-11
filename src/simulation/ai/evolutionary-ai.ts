/**
 * Evolutionary AI: uses evolved genome weights instead of hand-tuned parameters.
 * Structurally similar to Utility AI but all weights come from the genome.
 */

import type { SeededRNG } from '../../utils/seed.ts'
import type { IAISystem, AIDecision, AIWorldView } from './ai-interface.ts'
import type { Villager, VillagerAction, Position } from '../villager.ts'
import { NeedType, getNeed } from '../villager.ts'
import { TileType } from '../world.ts'
import { getAllActions } from '../actions.ts'
import { type Genome, ACTION_LIST } from './genome.ts'

/** Urgency curve matching Utility AI: (1 - value/100)^2 */
function urgencyCurve(value: number): number {
  const normalized = 1 - value / 100
  return normalized * normalized
}

/** Need types in the order they appear in the genome weight vector */
const BASE_NEEDS: NeedType[] = [NeedType.Hunger, NeedType.Energy, NeedType.Health, NeedType.Warmth]

/** Whether an action is outdoors (affected by night penalty) */
function isOutdoor(action: VillagerAction): boolean {
  return action === 'forage' || action === 'chop_wood' || action === 'fish' || action === 'mine_stone'
}

/** Whether an action gathers food */
function isGatherAction(action: VillagerAction): boolean {
  return action === 'forage' || action === 'fish'
}

/** Whether an action is a survival response */
function isSurvivalAction(action: VillagerAction): boolean {
  return action === 'eat' || action === 'rest' || action === 'warm_up' || action === 'flee'
}

/** Whether an action helps stockpile resources */
function isStockpileAction(action: VillagerAction): boolean {
  return action === 'forage' || action === 'chop_wood' || action === 'mine_stone' || action === 'fish' || action === 'haul'
}

/** Find a target position for actions that require the villager to be somewhere specific */
function findTargetForAction(action: VillagerAction, villager: Readonly<Villager>, worldView: AIWorldView): Position | undefined {
  switch (action) {
    case 'forage':
    case 'chop_wood': {
      const tiles = worldView.world.findTilesInRadius(
        villager.position.x, villager.position.y, 15,
        t => t.type === TileType.Forest && t.resourceAmount > 0,
      )
      if (tiles.length === 0) return undefined
      tiles.sort((a, b) => {
        const da = Math.abs(a.x - villager.position.x) + Math.abs(a.y - villager.position.y)
        const db = Math.abs(b.x - villager.position.x) + Math.abs(b.y - villager.position.y)
        return da - db
      })
      return { x: tiles[0].x, y: tiles[0].y }
    }
    case 'mine_stone': {
      const tiles = worldView.world.findTilesInRadius(
        villager.position.x, villager.position.y, 15,
        t => t.type === TileType.Stone && t.resourceAmount > 0,
      )
      if (tiles.length === 0) return undefined
      tiles.sort((a, b) => {
        const da = Math.abs(a.x - villager.position.x) + Math.abs(a.y - villager.position.y)
        const db = Math.abs(b.x - villager.position.x) + Math.abs(b.y - villager.position.y)
        return da - db
      })
      return { x: tiles[0].x, y: tiles[0].y }
    }
    case 'fish': {
      const waterTiles = worldView.world.findTilesInRadius(
        villager.position.x, villager.position.y, 15,
        t => t.type === TileType.Water,
      )
      const candidates: Position[] = []
      for (const wt of waterTiles) {
        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]]
        for (const [dx, dy] of dirs) {
          if (worldView.world.isPassable(wt.x + dx, wt.y + dy)) {
            candidates.push({ x: wt.x + dx, y: wt.y + dy })
          }
        }
      }
      if (candidates.length === 0) return undefined
      candidates.sort((a, b) => {
        const da = Math.abs(a.x - villager.position.x) + Math.abs(a.y - villager.position.y)
        const db = Math.abs(b.x - villager.position.x) + Math.abs(b.y - villager.position.y)
        return da - db
      })
      return candidates[0]
    }
    case 'eat':
    case 'rest':
    case 'haul':
    case 'build_shelter':
    case 'build_storage':
    case 'build_watchtower':
    case 'build_wall':
    case 'build_well':
    case 'warm_up':
    case 'cool_down':
      return { ...worldView.campfirePosition }
    case 'build_farm': {
      const fertile = worldView.world.findTilesInRadius(
        villager.position.x, villager.position.y, 15,
        t => t.type === TileType.FertileSoil,
      )
      if (fertile.length === 0) return worldView.campfirePosition
      fertile.sort((a, b) => {
        const da = Math.abs(a.x - villager.position.x) + Math.abs(a.y - villager.position.y)
        const db = Math.abs(b.x - villager.position.x) + Math.abs(b.y - villager.position.y)
        return da - db
      })
      return { x: fertile[0].x, y: fertile[0].y }
    }
    case 'flee': {
      const predator = worldView.activeEvents.find(e => e.type === 'predator')
      if (predator) {
        const px = worldView.campfirePosition.x + predator.relativePosition.dx
        const py = worldView.campfirePosition.y + predator.relativePosition.dy
        const dx = villager.position.x - px
        const dy = villager.position.y - py
        const targetX = Math.max(0, Math.min(worldView.world.width - 1, villager.position.x + Math.sign(dx) * 8))
        const targetY = Math.max(0, Math.min(worldView.world.height - 1, villager.position.y + Math.sign(dy) * 8))
        return { x: targetX, y: targetY }
      }
      return { ...worldView.campfirePosition }
    }
    default:
      return undefined
  }
}

export class EvolutionaryAI implements IAISystem {
  readonly name = 'Evolutionary'
  private readonly genome: Genome

  constructor(genome: Genome) {
    this.genome = genome
  }

  getGenome(): Genome {
    return this.genome
  }

  decide(villager: Readonly<Villager>, worldView: AIWorldView, rng: SeededRNG): AIDecision {
    const allActions = getAllActions()
    const campfire = worldView.campfirePosition
    const ctx = {
      timeOfDay: worldView.timeOfDay,
      season: worldView.season,
      structures: worldView.structures as Array<{ type: string; position: { x: number; y: number } }>,
    }

    // Build the list of active needs for this genome
    const activeNeeds = [...BASE_NEEDS]
    if (this.genome.needCount >= 5) {
      activeNeeds.push(NeedType.Cooling)
    }

    const scored: Array<{ action: VillagerAction; score: number; reason: string }> = []

    for (let actionIdx = 0; actionIdx < ACTION_LIST.length; actionIdx++) {
      const actionType = ACTION_LIST[actionIdx]
      const actionDef = allActions.find(a => a.type === actionType)
      if (!actionDef) continue

      // Check if action can be performed
      if (!actionDef.canPerform(
        villager as Villager,
        worldView.world,
        worldView.stockpile as { food: number; wood: number; stone: number },
        campfire,
        ctx,
      )) {
        scored.push({ action: actionType, score: -999, reason: 'unavailable' })
        continue
      }

      // Need-based scoring using genome weights
      let score = 0
      const parts: string[] = []

      for (let needIdx = 0; needIdx < activeNeeds.length; needIdx++) {
        const needType = activeNeeds[needIdx]
        const need = villager.needs.get(needType)
        if (!need) continue

        // Warmth urgency only matters in winter (matches Utility AI behavior)
        // Outside winter, warmth doesn't drain, so urgency would be noise
        const urgency = needType === NeedType.Warmth && worldView.season !== 'winter'
          ? 0
          : urgencyCurve(need.current)

        const weightIdx = actionIdx * this.genome.needCount + needIdx
        const weight = this.genome.actionWeights[weightIdx] ?? 0
        const contribution = weight * urgency
        score += contribution

        if (contribution > 0.01) {
          parts.push(`${needType}:${contribution.toFixed(2)}`)
        }
      }

      // Environmental modifiers using evolved weights
      const envW = this.genome.envWeights

      // [0] Night modifier
      if (worldView.timeOfDay === 'night') {
        const mod = envW[0] * (isOutdoor(actionType) ? -1 : 0.5)
        score += mod
      }

      // [1] Carrying modifier
      if (villager.carrying !== null && actionType === 'haul') {
        score += envW[1]
      }

      // [2] Low food modifier
      if (worldView.stockpile.food < 10 && isGatherAction(actionType)) {
        score += Math.max(0.3, envW[2])
      }

      // [3] Emergency modifier (low health or energy)
      // Targeted: only boost the action that actually addresses the root cause
      const health = getNeed(villager as Villager, NeedType.Health)
      const energy = getNeed(villager as Villager, NeedType.Energy)
      const hunger = getNeed(villager as Villager, NeedType.Hunger)
      if (health.current < 30 && actionType === 'eat' && hunger.current < 50) {
        score += Math.max(0.8, envW[3]) // health low from hunger → eat
      }
      if (health.current < 30 && actionType === 'rest' && energy.current < 30) {
        score += Math.max(0.8, envW[3]) // health low from exhaustion → rest
      }
      if (energy.current < 25 && actionType === 'rest') {
        score += Math.max(0.8, envW[3])
      }
      if (hunger.current < 35 && actionType === 'eat') {
        score += Math.max(1.0, envW[3])
      }
      if (hunger.current < 35 && isGatherAction(actionType) && worldView.stockpile.food < 10) {
        score += Math.max(0.6, envW[3] * 0.5)
      }

      // [4] Autumn stockpiling modifier
      if (worldView.season === 'autumn' && isStockpileAction(actionType)) {
        score += envW[4]
      }

      // [5] Social: bonus for being near campfire when resting/eating
      if ((actionType === 'rest' || actionType === 'eat') &&
        Math.abs(villager.position.x - campfire.x) <= 2 &&
        Math.abs(villager.position.y - campfire.y) <= 2) {
        score += envW[5] * 0.3
      }

      // Predator flee: hardcoded response like Utility AI
      if (actionType === 'flee') {
        const predator = worldView.activeEvents.find(e => e.type === 'predator')
        if (predator) {
          const px = campfire.x + predator.relativePosition.dx
          const py = campfire.y + predator.relativePosition.dy
          const dist = Math.abs(villager.position.x - px) + Math.abs(villager.position.y - py)
          if (dist <= 5) {
            score += 2.0
            parts.push('predator +2.0')
          }
        }
      }

      // Winter warmth emergency — must warm up before warmth drops critically
      if (actionType === 'warm_up' && worldView.season === 'winter') {
        const warmth = villager.needs.get(NeedType.Warmth)
        if (warmth && warmth.current < 40) {
          const warmthBonus = warmth.current < 20 ? 1.5 : 1.0
          score += Math.max(warmthBonus, envW[3])
        }
      }

      // Small random noise
      score += rng.next() * 0.1

      scored.push({
        action: actionType,
        score,
        reason: parts.length > 0 ? parts.join(', ') : 'base',
      })
    }

    // Hard survival overrides — bypass genome when death is imminent
    const overrideHunger = getNeed(villager as Villager, NeedType.Hunger)
    const overrideEnergy = getNeed(villager as Villager, NeedType.Energy)
    if (overrideHunger.current <= 15) {
      const eatEntry = scored.find(s => s.action === 'eat' && s.score > -999)
      if (eatEntry) {
        const target = findTargetForAction('eat', villager, worldView)
        return {
          action: 'eat',
          targetPosition: target,
          reason: `Evo(gen${this.genome.generation}): eat [STARVING override]`,
          scores: scored.map(s => ({ action: s.action, score: s.score, reason: s.reason })),
        }
      }
      // No food available — force forage if possible
      const forageEntry = scored.find(s => s.action === 'forage' && s.score > -999)
      if (forageEntry) {
        const target = findTargetForAction('forage', villager, worldView)
        return {
          action: 'forage',
          targetPosition: target,
          reason: `Evo(gen${this.genome.generation}): forage [STARVING override, no food]`,
          scores: scored.map(s => ({ action: s.action, score: s.score, reason: s.reason })),
        }
      }
    }
    if (overrideEnergy.current <= 10) {
      const restEntry = scored.find(s => s.action === 'rest' && s.score > -999)
      if (restEntry) {
        const target = findTargetForAction('rest', villager, worldView)
        return {
          action: 'rest',
          targetPosition: target,
          reason: `Evo(gen${this.genome.generation}): rest [EXHAUSTION override]`,
          scores: scored.map(s => ({ action: s.action, score: s.score, reason: s.reason })),
        }
      }
    }

    // Select highest scoring action
    scored.sort((a, b) => b.score - a.score)
    const best = scored[0] ?? { action: 'idle' as VillagerAction, score: 0, reason: 'fallback' }

    const targetPosition = findTargetForAction(best.action, villager, worldView)

    return {
      action: best.action,
      targetPosition,
      reason: `Evo(gen${this.genome.generation}): ${best.action} [${best.score.toFixed(2)}]`,
      scores: scored.map(s => ({ action: s.action, score: s.score, reason: s.reason })),
    }
  }
}
