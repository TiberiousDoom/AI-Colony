/**
 * Evolutionary AI: uses evolved genome weights instead of hand-tuned parameters.
 * Structurally similar to Utility AI but all weights come from the genome.
 */

import type { SeededRNG } from '../../utils/seed.ts'
import type { IAISystem, AIDecision, AIWorldView } from './ai-interface.ts'
import type { Villager, VillagerAction } from '../villager.ts'
import { NeedType, getNeed } from '../villager.ts'
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

        const urgency = urgencyCurve(need.current)
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
        score += envW[2]
      }

      // [3] Emergency modifier (low health or energy)
      const health = getNeed(villager as Villager, NeedType.Health)
      const energy = getNeed(villager as Villager, NeedType.Energy)
      if ((health.current < 20 || energy.current < 15) && isSurvivalAction(actionType)) {
        score += envW[3]
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

      // Small random noise
      score += rng.next() * 0.1

      scored.push({
        action: actionType,
        score,
        reason: parts.length > 0 ? parts.join(', ') : 'base',
      })
    }

    // Select highest scoring action
    scored.sort((a, b) => b.score - a.score)
    const best = scored[0] ?? { action: 'idle' as VillagerAction, score: 0, reason: 'fallback' }

    return {
      action: best.action,
      reason: `Evo(gen${this.genome.generation}): ${best.action} [${best.score.toFixed(2)}]`,
      scores: scored.map(s => ({ action: s.action, score: s.score, reason: s.reason })),
    }
  }
}
