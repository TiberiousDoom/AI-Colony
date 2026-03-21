/**
 * Evolutionary AI: uses evolved genome weights instead of hand-tuned parameters.
 * Structurally similar to Utility AI but all weights come from the genome.
 */

import type { SeededRNG } from '../../../shared/seed.ts'
import type { IAISystem, AIDecision, AIWorldView } from './ai-interface.ts'
import type { Villager, VillagerAction, Position } from '../villager.ts'
import { NeedType, getNeed } from '../villager.ts'
import { TileType } from '../world.ts'
import { type Genome, ACTION_LIST } from './genome.ts'
import { findNearestMonsterToVillager, countAlliesNearMonster, shouldFight } from '../monster.ts'
import { bestCraftableWeapon, bestCraftableArmor } from '../equipment.ts'

/** Urgency curve matching Utility AI: (1 - value/100)^2 */
function urgencyCurve(value: number): number {
  const normalized = 1 - value / 100
  return normalized * normalized
}

/** Need types in the order they appear in the genome weight vector */
const BASE_NEEDS: NeedType[] = [NeedType.Hunger, NeedType.Energy, NeedType.Health, NeedType.Warmth]

/**
 * Relevance mask: which needs each action can meaningfully respond to.
 * Matches Utility AI's non-zero weight patterns.
 * true = genome weight is used as-is; false = capped at 0.1 to prevent
 * cross-need contamination (e.g., warm_up scoring from hunger urgency).
 */
const ACTION_NEED_RELEVANCE: Record<string, boolean[]> = {
  // [hunger, energy, health, warmth]
  idle:            [false, false, false, false],
  forage:          [true,  false, true,  false],
  eat:             [true,  false, true,  false],
  rest:            [false, true,  true,  false],
  chop_wood:       [true,  false, false, false],
  mine_stone:      [false, false, false, false],
  haul:            [true,  false, false, false],
  fish:            [true,  false, true,  false],
  flee:            [false, false, false, false],
  build_shelter:   [false, false, true,  true ],
  build_storage:   [false, false, false, false],
  warm_up:         [false, false, false, true ],
  build_watchtower:[false, false, true,  false],
  build_farm:      [true,  false, false, false],
  build_wall:      [false, false, true,  false],
  build_well:      [false, false, false, false],
  cool_down:       [false, false, false, false],
  attack:          [false, false, true,  false],
  craft_weapon:    [false, false, true,  false],
  craft_armor:     [false, false, true,  false],
}

/** Whether an action is outdoors (affected by night penalty) */
function isOutdoor(action: VillagerAction): boolean {
  return action === 'forage' || action === 'chop_wood' || action === 'fish' || action === 'mine_stone'
}

/** Whether an action gathers food */
function isGatherAction(action: VillagerAction): boolean {
  return action === 'forage' || action === 'fish'
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
    case 'craft_weapon':
    case 'craft_armor':
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
    case 'attack': {
      const monster = findNearestMonsterToVillager(villager, worldView.monsters)
      if (monster) return { x: monster.position.x, y: monster.position.y }
      return undefined
    }
    case 'flee': {
      // Flee from nearest monster first, then predator events
      const monster = findNearestMonsterToVillager(villager, worldView.monsters)
      if (monster) {
        const dx = villager.position.x - monster.position.x
        const dy = villager.position.y - monster.position.y
        const targetX = Math.max(0, Math.min(worldView.world.width - 1, villager.position.x + Math.sign(dx) * 8))
        const targetY = Math.max(0, Math.min(worldView.world.height - 1, villager.position.y + Math.sign(dy) * 8))
        return { x: targetX, y: targetY }
      }
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
    const campfire = worldView.campfirePosition

    // Build the list of active needs for this genome
    const activeNeeds = [...BASE_NEEDS]
    if (this.genome.needCount >= 5) {
      activeNeeds.push(NeedType.Cooling)
    }

    const scored: Array<{ action: VillagerAction; score: number; reason: string }> = []

    for (let actionIdx = 0; actionIdx < ACTION_LIST.length; actionIdx++) {
      const actionType = ACTION_LIST[actionIdx]
      // Note: we do NOT check canPerform here (matching Utility AI behavior).
      // canPerform often requires adjacency to specific tiles (forest, stone, water),
      // but the engine handles pathfinding to targetPosition before starting the action.
      // Filtering by canPerform would reject forage/fish/etc for villagers not yet
      // at their target, causing always-available actions like warm_up to win by default.

      // Suppress eat when no food is available — eat requires stockpile.food >= 5
      // Without this, villagers walk to campfire, fail to eat, and idle in a death spiral
      if (actionType === 'eat') {
        const canEat = worldView.stockpile.food >= 5 ||
          (villager.carrying?.type === 'food' && (villager.carrying?.amount ?? 0) >= 5)
        if (!canEat) {
          scored.push({ action: actionType, score: -999, reason: 'no food available' })
          continue
        }
      }

      // Suppress flee when no predator or monster is present
      if (actionType === 'flee') {
        const hasPredator = worldView.activeEvents.some(e => e.type === 'predator')
        const hasMonster = (worldView.monsters ?? []).some(m =>
          Math.abs(m.position.x - villager.position.x) + Math.abs(m.position.y - villager.position.y) <= 5 &&
          m.behaviorState !== 'dead')
        if (!hasPredator && !hasMonster) {
          scored.push({ action: actionType, score: -999, reason: 'no threat' })
          continue
        }
      }

      // Suppress attack when no monsters nearby
      if (actionType === 'attack') {
        const hasMonster = (worldView.monsters ?? []).some(m =>
          Math.abs(m.position.x - villager.position.x) + Math.abs(m.position.y - villager.position.y) <= 5 &&
          m.behaviorState !== 'dead')
        if (!hasMonster) {
          scored.push({ action: actionType, score: -999, reason: 'no monster' })
          continue
        }
      }

      // Suppress crafting when no upgrade available
      if (actionType === 'craft_weapon' && !bestCraftableWeapon(worldView.stockpile, villager.equipment.weapon)) {
        scored.push({ action: actionType, score: -999, reason: 'no weapon to craft' })
        continue
      }
      if (actionType === 'craft_armor' && !bestCraftableArmor(worldView.stockpile, villager.equipment.armor)) {
        scored.push({ action: actionType, score: -999, reason: 'no armor to craft' })
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
        let weight = this.genome.actionWeights[weightIdx] ?? 0
        // Cap irrelevant action-need pairs to prevent cross-contamination
        const relevance = ACTION_NEED_RELEVANCE[actionType]
        if (relevance && !relevance[needIdx]) {
          weight = Math.min(weight, 0.1)
        }
        const contribution = weight * urgency
        score += contribution

        if (contribution > 0.01) {
          parts.push(`${needType}:${contribution.toFixed(2)}`)
        }
      }

      // Environmental modifiers using evolved weights
      const envW = this.genome.envWeights

      // [0] Night modifier — reduced impact to prevent rest domination
      if (worldView.timeOfDay === 'night') {
        const mod = envW[0] * (isOutdoor(actionType) ? -0.3 : 0.15)
        score += mod
      }

      // [1] Carrying modifier
      if (villager.carrying !== null && actionType === 'haul') {
        score += envW[1]
      }

      // [2] Low food modifier — critical for sustaining population
      // Scale threshold with population: need ~5 food per villager per eat cycle
      const alivePop = worldView.villagers.filter(v => v.alive).length
      const foodPerCapita = alivePop > 0 ? worldView.stockpile.food / alivePop : 100
      if (foodPerCapita < 15 && isGatherAction(actionType)) {
        const foodBonus = foodPerCapita < 5 ? 0.6 : foodPerCapita < 10 ? 0.4 : 0.25
        score += Math.max(foodBonus, envW[2])
      }

      // Productivity modifiers
      const health = getNeed(villager as Villager, NeedType.Health)
      const energy = getNeed(villager as Villager, NeedType.Energy)
      const hunger = getNeed(villager as Villager, NeedType.Hunger)

      // Resting penalty scales with how unnecessary rest is
      if (actionType === 'rest') {
        if (energy.current > 50) {
          score -= 0.3 // not tired at all
        } else if (energy.current > 25 && foodPerCapita < 10) {
          score -= 0.2 // not critical energy + food crisis = keep working
        }
      }
      // Productive work bonus
      if (energy.current > 25 && (isGatherAction(actionType) || actionType === 'chop_wood' || actionType === 'mine_stone')) {
        score += 0.15
      }

      // [3] Emergency modifier (low health or energy)
      // Targeted: only boost the action that actually addresses the root cause
      if (health.current < 30 && actionType === 'eat' && hunger.current < 50) {
        score += Math.max(0.8, envW[3]) // health low from hunger → eat
      }
      if (health.current < 30 && actionType === 'rest' && energy.current < 30) {
        score += Math.max(0.8, envW[3]) // health low from exhaustion → rest
      }
      if (energy.current < 10 && actionType === 'rest') {
        score += Math.max(0.6, envW[3])
      } else if (energy.current < 25 && actionType === 'rest' && foodPerCapita >= 10) {
        // Only rest for moderate tiredness when food isn't critical
        score += Math.max(0.4, envW[3] * 0.5)
      }
      if (hunger.current < 50 && actionType === 'eat') {
        score += Math.max(0.5, envW[3])
      }
      if (hunger.current < 50 && isGatherAction(actionType) && worldView.stockpile.food < 20) {
        score += Math.max(0.4, envW[3] * 0.5)
      }

      // Wood gathering: when food is sufficient but wood is low, chop wood for building
      if (actionType === 'chop_wood' && foodPerCapita >= 15 && worldView.stockpile.wood < 30) {
        score += 0.3
      }
      // Mine stone when wood is sufficient and stone is low
      if (actionType === 'mine_stone' && foodPerCapita >= 15 && worldView.stockpile.wood >= 20 && worldView.stockpile.stone < 15) {
        score += 0.25
      }

      // Building priorities: shelters for population, farms for food production
      if (actionType === 'build_shelter') {
        const shelterCount = worldView.structures.filter(s => s.type === 'shelter').length
        const pop = worldView.villagers.filter(v => v.alive).length
        if (pop > shelterCount * 3 && worldView.stockpile.wood >= 20) {
          score += 0.4
        }
      }
      if (actionType === 'build_farm') {
        const hasFarm = worldView.structures.some(s => s.type === 'farm')
        if (!hasFarm && worldView.stockpile.wood >= 15) {
          score += 0.3
        }
      }
      if (actionType === 'build_storage') {
        const hasStorage = worldView.structures.some(s => s.type === 'storage')
        if (!hasStorage && worldView.stockpile.wood >= 15 && worldView.stockpile.stone >= 10) {
          score += 0.3
        }
      }

      // [4] Autumn stockpiling modifier
      if (worldView.season === 'autumn' && isStockpileAction(actionType)) {
        score += envW[4]
      }

      // [5] Social: bonus for being near campfire when eating (not resting)
      if (actionType === 'eat' &&
        Math.abs(villager.position.x - campfire.x) <= 2 &&
        Math.abs(villager.position.y - campfire.y) <= 2) {
        score += envW[5] * 0.3
      }

      // Monster combat: fight or flee using evolved aggression weight [6]
      const nearestMonster = findNearestMonsterToVillager(villager, worldView.monsters)
      const monsterDist = nearestMonster
        ? Math.abs(villager.position.x - nearestMonster.position.x) + Math.abs(villager.position.y - nearestMonster.position.y)
        : Infinity

      if (actionType === 'attack' && nearestMonster && monsterDist <= 5) {
        const alliesNear = countAlliesNearMonster(nearestMonster.position, worldView.villagers)
        if (envW[6] > 0.5 && health.current > 40 && alliesNear >= 2) {
          score += 1.5
          parts.push('fight monster +1.5')
        } else if (shouldFight(health.current, nearestMonster, alliesNear, villager.equipment.weapon !== null)) {
          score += 1.0
          parts.push('fight (heuristic) +1.0')
        }
      }

      if (actionType === 'flee' && nearestMonster && monsterDist <= 5) {
        const alliesNear = countAlliesNearMonster(nearestMonster.position, worldView.villagers)
        if (!shouldFight(health.current, nearestMonster, alliesNear, villager.equipment.weapon !== null)) {
          score += 2.0
          parts.push('flee monster +2.0')
        }
      }

      // Crafting: boost when monsters exist and unarmed/unarmored
      if (actionType === 'craft_weapon') {
        const hasMonsters = (worldView.monsters ?? []).some(m => m.behaviorState !== 'dead')
        const aliveCount = worldView.villagers.filter(v => v.alive).length
        const foodPerCapita = aliveCount > 0 ? worldView.stockpile.food / aliveCount : 0
        const othersCrafting = worldView.villagers.filter(v => v.alive && v.id !== villager.id && (v.currentAction === 'craft_weapon' || v.currentAction === 'craft_armor')).length
        if (hasMonsters && !villager.equipment.weapon) {
          score += 1.0
          parts.push('unarmed + monsters +1.0')
        } else if (!villager.equipment.weapon) {
          score += 0.08
          parts.push('unarmed, prepare +0.08')
        }
        if (hunger.current < 30 || energy.current < 30) {
          score -= 1.0
          parts.push('survival priority -1.0')
        }
        if (foodPerCapita < 5) {
          score -= 0.5
          parts.push('low food/capita -0.5')
        }
        if (othersCrafting >= 2) {
          score -= 0.5
          parts.push('others crafting -0.5')
        }
      }
      if (actionType === 'craft_armor') {
        const hasMonsters = (worldView.monsters ?? []).some(m => m.behaviorState !== 'dead')
        const aliveCount = worldView.villagers.filter(v => v.alive).length
        const foodPerCapita = aliveCount > 0 ? worldView.stockpile.food / aliveCount : 0
        const othersCrafting = worldView.villagers.filter(v => v.alive && v.id !== villager.id && (v.currentAction === 'craft_weapon' || v.currentAction === 'craft_armor')).length
        if (hasMonsters && !villager.equipment.armor) {
          score += 0.8
          parts.push('unarmored + monsters +0.8')
        } else if (!villager.equipment.armor) {
          score += 0.05
          parts.push('unarmored, prepare +0.05')
        }
        if (hunger.current < 30 || energy.current < 30) {
          score -= 1.0
          parts.push('survival priority -1.0')
        }
        if (foodPerCapita < 5) {
          score -= 0.5
          parts.push('low food/capita -0.5')
        }
        if (othersCrafting >= 2) {
          score -= 0.5
          parts.push('others crafting -0.5')
        }
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

    // Hard survival overrides — bypass genome when needs are critical
    const overrideHunger = getNeed(villager as Villager, NeedType.Hunger)
    const overrideEnergy = getNeed(villager as Villager, NeedType.Energy)
    const hungerCritical = overrideHunger.current <= 30
    const energyCritical = overrideEnergy.current <= 15

    // When both are critical, address the MORE urgent one first
    const hungerFirst = hungerCritical && (!energyCritical || overrideHunger.current <= overrideEnergy.current)
    const energyFirst = energyCritical && !hungerFirst

    if (energyFirst) {
      const target = findTargetForAction('rest', villager, worldView)
      return {
        action: 'rest',
        targetPosition: target,
        reason: `Evo(gen${this.genome.generation}): rest [EXHAUSTION override]`,
        scores: scored.map(s => ({ action: s.action, score: s.score, reason: s.reason })),
      }
    }

    if (hungerFirst) {
      // Try eat — but only if food is actually available (eat requires stockpile.food >= 5)
      const canEat = worldView.stockpile.food >= 5 ||
        (villager.carrying?.type === 'food' && (villager.carrying?.amount ?? 0) >= 5)
      const eatEntry = canEat ? scored.find(s => s.action === 'eat' && s.score > -999) : undefined
      if (eatEntry) {
        const target = findTargetForAction('eat', villager, worldView)
        return {
          action: 'eat',
          targetPosition: target,
          reason: `Evo(gen${this.genome.generation}): eat [HUNGRY override]`,
          scores: scored.map(s => ({ action: s.action, score: s.score, reason: s.reason })),
        }
      }
      // If carrying food, haul it back so it can be eaten
      if (villager.carrying?.type === 'food') {
        const target = findTargetForAction('haul', villager, worldView)
        return {
          action: 'haul',
          targetPosition: target,
          reason: `Evo(gen${this.genome.generation}): haul [HUNGRY override, hauling food]`,
          scores: scored.map(s => ({ action: s.action, score: s.score, reason: s.reason })),
        }
      }
      // No food available — try to gather food
      for (const gatherAction of ['forage', 'fish'] as VillagerAction[]) {
        const entry = scored.find(s => s.action === gatherAction && s.score > -999)
        if (entry) {
          const target = findTargetForAction(gatherAction, villager, worldView)
          return {
            action: gatherAction,
            targetPosition: target,
            reason: `Evo(gen${this.genome.generation}): ${gatherAction} [HUNGRY override, no food]`,
            scores: scored.map(s => ({ action: s.action, score: s.score, reason: s.reason })),
          }
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
