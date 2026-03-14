/**
 * Utility AI: scores each action based on need urgency and environmental modifiers.
 */

import type { SeededRNG } from '../../utils/seed.ts'
import type { IAISystem, AIDecision, AIWorldView } from './ai-interface.ts'
import type { Villager, VillagerAction, Position } from '../villager.ts'
import { NeedType, getNeed } from '../villager.ts'
import { TileType } from '../world.ts'
import { getAllActions, type ActionDefinition } from '../actions.ts'
import { findNearestMonsterToVillager, countAlliesNearMonster, shouldFight } from '../monster.ts'
import { bestCraftableWeapon, bestCraftableArmor } from '../equipment.ts'

// --- Urgency Curve ---

/** Exponential urgency: low values score high */
function urgencyCurve(value: number): number {
  const normalized = 1 - value / 100
  return normalized * normalized
}

// --- Scoring Weights ---

interface ActionWeights {
  hunger: number
  energy: number
  health: number
  warmth: number
}

const WEIGHTS: Record<string, ActionWeights> = {
  forage:        { hunger: 0.8, energy: 0.1, health: 0.3, warmth: 0.0 },
  eat:           { hunger: 1.0, energy: 0.0, health: 0.4, warmth: 0.0 },
  rest:          { hunger: 0.0, energy: 1.0, health: 0.2, warmth: 0.0 },
  chop_wood:     { hunger: 0.2, energy: 0.1, health: 0.1, warmth: 0.0 },
  haul:          { hunger: 0.3, energy: 0.1, health: 0.1, warmth: 0.0 },
  fish:          { hunger: 0.7, energy: 0.1, health: 0.3, warmth: 0.0 },
  idle:          { hunger: 0.0, energy: 0.0, health: 0.0, warmth: 0.0 },
  mine_stone:    { hunger: 0.1, energy: 0.1, health: 0.1, warmth: 0.0 },
  build_shelter: { hunger: 0.0, energy: 0.1, health: 0.2, warmth: 0.3 },
  build_storage: { hunger: 0.0, energy: 0.1, health: 0.1, warmth: 0.0 },
  warm_up:       { hunger: 0.0, energy: 0.0, health: 0.2, warmth: 1.0 },
  flee:          { hunger: 0.0, energy: 0.0, health: 1.0, warmth: 0.0 },
  build_watchtower: { hunger: 0.0, energy: 0.1, health: 0.3, warmth: 0.0 },
  build_farm:       { hunger: 0.3, energy: 0.1, health: 0.1, warmth: 0.0 },
  build_wall:       { hunger: 0.0, energy: 0.1, health: 0.3, warmth: 0.0 },
  build_well:       { hunger: 0.2, energy: 0.1, health: 0.1, warmth: 0.0 },
  attack:           { hunger: 0.0, energy: 0.1, health: 0.8, warmth: 0.0 },
  craft_weapon:     { hunger: 0.0, energy: 0.1, health: 0.3, warmth: 0.0 },
  craft_armor:      { hunger: 0.0, energy: 0.1, health: 0.3, warmth: 0.0 },
}

// --- Score Calculation ---

function scoreAction(
  action: ActionDefinition,
  villager: Readonly<Villager>,
  worldView: AIWorldView,
  rng: SeededRNG,
): { score: number; reason: string } {
  const weights = WEIGHTS[action.type] ?? { hunger: 0, energy: 0, health: 0, warmth: 0 }

  const hunger = getNeed(villager as Villager, NeedType.Hunger)
  const energy = getNeed(villager as Villager, NeedType.Energy)
  const health = getNeed(villager as Villager, NeedType.Health)
  const warmth = getNeed(villager as Villager, NeedType.Warmth)

  const hungerUrgency = urgencyCurve(hunger.current)
  const energyUrgency = urgencyCurve(energy.current)
  const healthUrgency = urgencyCurve(health.current)
  const warmthUrgency = worldView.season === 'winter' ? urgencyCurve(warmth.current) : 0

  let needScore =
    weights.hunger * hungerUrgency +
    weights.energy * energyUrgency +
    weights.health * healthUrgency +
    weights.warmth * warmthUrgency

  // Environmental modifiers
  let envMod = 0
  const reasons: string[] = []

  // Night penalty for outdoor actions
  if (worldView.timeOfDay === 'night' &&
      (action.type === 'forage' || action.type === 'chop_wood' || action.type === 'fish' || action.type === 'mine_stone')) {
    envMod -= 0.3
    reasons.push('night -0.3')
  }

  // Carrying resources → prioritize haul
  if (action.type === 'haul' && villager.carrying !== null) {
    envMod += 0.5
    reasons.push('carrying +0.5')
  }

  // Low food stockpile → prioritize food gathering
  if ((action.type === 'forage' || action.type === 'fish') && worldView.stockpile.food < 10) {
    envMod += 0.3
    reasons.push('low food +0.3')
  }

  // High food stockpile → shift to wood
  if (action.type === 'chop_wood' && worldView.stockpile.food > 80) {
    envMod += 0.2
    reasons.push('surplus food +0.2')
  }

  // Emergency: very low energy
  if (action.type === 'rest' && energy.current < 15) {
    envMod += 0.5
    reasons.push('energy emergency +0.5')
  }

  // Emergency: very low health
  if ((action.type === 'eat' || action.type === 'rest') && health.current < 20) {
    envMod += 0.5
    reasons.push('health emergency +0.5')
  }

  // Emergency: very low warmth in winter
  if (action.type === 'warm_up' && warmth.current < 20 && worldView.season === 'winter') {
    envMod += 0.5
    reasons.push('warmth emergency +0.5')
  }

  // Monster combat: attack or flee based on fight-vs-flee heuristic
  const nearestMonster = findNearestMonsterToVillager(villager, worldView.monsters)
  const monsterDist = nearestMonster
    ? Math.abs(villager.position.x - nearestMonster.position.x) + Math.abs(villager.position.y - nearestMonster.position.y)
    : Infinity

  if (action.type === 'attack') {
    if (nearestMonster && monsterDist <= 5) {
      const alliesNear = countAlliesNearMonster(nearestMonster.position, worldView.villagers)
      const villagerHealth = health.current
      if (shouldFight(villagerHealth, nearestMonster, alliesNear, villager.equipment.weapon !== null)) {
        envMod += 1.5
        reasons.push('fight monster +1.5')
        if (nearestMonster.hp < nearestMonster.maxHp * 0.5) {
          envMod += 0.3
          reasons.push('finish weak +0.3')
        }
      }
    }
  }

  // Flee: predator or monster nearby
  if (action.type === 'flee') {
    // Monster flee
    if (nearestMonster && monsterDist <= 5) {
      const alliesNear = countAlliesNearMonster(nearestMonster.position, worldView.villagers)
      if (!shouldFight(health.current, nearestMonster, alliesNear, villager.equipment.weapon !== null)) {
        envMod += 2.0
        reasons.push('flee monster +2.0')
      }
    }
    // Legacy predator event flee
    const predator = worldView.activeEvents.find(e => e.type === 'predator')
    if (predator) {
      const px = worldView.campfirePosition.x + predator.relativePosition.dx
      const py = worldView.campfirePosition.y + predator.relativePosition.dy
      const dist = Math.abs(villager.position.x - px) + Math.abs(villager.position.y - py)
      if (dist <= 5) {
        envMod += 2.0
        reasons.push('predator nearby +2.0')
      }
    }
  }

  // Build shelter: high when population > shelter capacity
  if (action.type === 'build_shelter') {
    const shelterCount = worldView.structures.filter(s => s.type === 'shelter').length
    const shelterCap = shelterCount * 3
    const pop = worldView.villagers.filter(v => v.alive).length
    if (pop > shelterCap && worldView.stockpile.wood >= 20) {
      envMod += 0.4
      reasons.push('need shelter +0.4')
    }
  }

  // Build storage: moderate when nearing cap
  if (action.type === 'build_storage') {
    const hasStorage = worldView.structures.some(s => s.type === 'storage')
    if (!hasStorage && (worldView.stockpile.food > 80 || worldView.stockpile.wood > 80)) {
      if (worldView.stockpile.wood >= 15 && worldView.stockpile.stone >= 10) {
        envMod += 0.3
        reasons.push('need storage +0.3')
      }
    }
  }

  // Mine stone: bonus when low stone and storage needed
  if (action.type === 'mine_stone' && worldView.stockpile.stone < 15) {
    envMod += 0.2
    reasons.push('low stone +0.2')
  }

  // Build watchtower: when pop > 5 and no watchtower
  if (action.type === 'build_watchtower') {
    const hasWatchtower = worldView.structures.some(s => s.type === 'watchtower')
    const pop = worldView.villagers.filter(v => v.alive).length
    if (!hasWatchtower && pop > 5 && worldView.stockpile.wood >= 10 && worldView.stockpile.stone >= 15) {
      envMod += 0.3
      reasons.push('need watchtower +0.3')
    }
  }

  // Build farm: when fertile soil available and no farm
  if (action.type === 'build_farm') {
    const hasFarm = worldView.structures.some(s => s.type === 'farm')
    if (!hasFarm && worldView.stockpile.wood >= 15) {
      envMod += 0.25
      reasons.push('need farm +0.25')
    }
  }

  // Build wall: after predator event and no wall
  if (action.type === 'build_wall') {
    const hasWallStruct = worldView.structures.some(s => s.type === 'wall')
    const hadPredator = worldView.activeEvents.some(e => e.type === 'predator')
    if (!hasWallStruct && hadPredator && worldView.stockpile.stone >= 12) {
      envMod += 0.35
      reasons.push('need wall (predator) +0.35')
    }
  }

  // Build well: when no well and could benefit from water access
  if (action.type === 'build_well') {
    const hasWellStruct = worldView.structures.some(s => s.type === 'well')
    if (!hasWellStruct && worldView.stockpile.stone >= 20) {
      envMod += 0.2
      reasons.push('need well +0.2')
    }
  }

  // Craft weapon: boost when monsters exist and villager unarmed
  if (action.type === 'craft_weapon') {
    const hasMonsters = worldView.monsters.some(m => m.behaviorState !== 'dead')
    if (hasMonsters && !villager.equipment.weapon && bestCraftableWeapon(worldView.stockpile, villager.equipment.weapon)) {
      envMod += 1.0
      reasons.push('unarmed + monsters +1.0')
    } else if (!villager.equipment.weapon && bestCraftableWeapon(worldView.stockpile, villager.equipment.weapon)) {
      envMod += 0.3
      reasons.push('unarmed, prepare +0.3')
    }
    // Suppress when survival needs critical
    if (hunger.current < 30 || energy.current < 30) {
      envMod -= 1.0
      reasons.push('survival priority -1.0')
    }
  }

  // Craft armor: boost when monsters exist and villager unarmored
  if (action.type === 'craft_armor') {
    const hasMonsters = worldView.monsters.some(m => m.behaviorState !== 'dead')
    if (hasMonsters && !villager.equipment.armor && bestCraftableArmor(worldView.stockpile, villager.equipment.armor)) {
      envMod += 0.8
      reasons.push('unarmored + monsters +0.8')
    } else if (!villager.equipment.armor && bestCraftableArmor(worldView.stockpile, villager.equipment.armor)) {
      envMod += 0.2
      reasons.push('unarmored, prepare +0.2')
    }
    if (hunger.current < 30 || energy.current < 30) {
      envMod -= 1.0
      reasons.push('survival priority -1.0')
    }
  }

  // Autumn stockpiling bonus
  if (worldView.season === 'autumn' && (action.type === 'forage' || action.type === 'fish' || action.type === 'chop_wood')) {
    envMod += 0.15
    reasons.push('autumn prep +0.15')
  }

  // Small random noise to break ties
  const noise = rng.nextFloat(0, 0.1)

  const total = needScore + envMod + noise

  const reason = `${action.type}: need=${needScore.toFixed(2)}, env=${envMod.toFixed(2)}${reasons.length > 0 ? ` (${reasons.join(', ')})` : ''}, total=${total.toFixed(2)}`

  return { score: total, reason }
}

// --- Target Finding ---

function findNearestForest(villager: Readonly<Villager>, worldView: AIWorldView): Position | undefined {
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

function findNearestStone(villager: Readonly<Villager>, worldView: AIWorldView): Position | undefined {
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

function findNearestWaterAdjacent(villager: Readonly<Villager>, worldView: AIWorldView): Position | undefined {
  const candidates: Position[] = []
  const tiles = worldView.world.findTilesInRadius(
    villager.position.x, villager.position.y, 15,
    t => t.type === TileType.Water,
  )
  for (const waterTile of tiles) {
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]]
    for (const [dx, dy] of dirs) {
      if (worldView.world.isPassable(waterTile.x + dx, waterTile.y + dy)) {
        candidates.push({ x: waterTile.x + dx, y: waterTile.y + dy })
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

function findTargetForAction(
  action: VillagerAction,
  villager: Readonly<Villager>,
  worldView: AIWorldView,
): Position | undefined {
  switch (action) {
    case 'forage':
    case 'chop_wood':
      return findNearestForest(villager, worldView)
    case 'mine_stone':
      return findNearestStone(villager, worldView)
    case 'fish':
      return findNearestWaterAdjacent(villager, worldView)
    case 'eat':
    case 'rest':
    case 'haul':
    case 'build_shelter':
    case 'build_storage':
    case 'build_watchtower':
    case 'build_wall':
    case 'build_well':
    case 'warm_up':
      return { ...worldView.campfirePosition }
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
      // Flee away from nearest monster or predator
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

// --- Utility AI Implementation ---

export class UtilityAI implements IAISystem {
  readonly name = 'Utility AI'

  decide(villager: Readonly<Villager>, worldView: AIWorldView, rng: SeededRNG): AIDecision {
    const actions = getAllActions()
    let bestScore = -Infinity
    let bestAction: ActionDefinition = actions[actions.length - 1] // idle fallback
    let bestReason = 'idle: fallback'

    const allScores: Array<{ action: string; score: number; reason: string }> = []

    for (const action of actions) {
      const { score, reason } = scoreAction(action, villager, worldView, rng)
      allScores.push({ action: action.type, score, reason })

      if (score > bestScore) {
        bestScore = score
        bestAction = action
        bestReason = reason
      }
    }

    // Sort scores descending for inspector display
    allScores.sort((a, b) => b.score - a.score)

    const targetPosition = findTargetForAction(bestAction.type, villager, worldView)

    return {
      action: bestAction.type,
      targetPosition,
      reason: bestReason,
      scores: allScores,
    }
  }
}
