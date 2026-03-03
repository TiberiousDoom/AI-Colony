/**
 * Utility AI: scores each action based on need urgency and environmental modifiers.
 */

import type { SeededRNG } from '../../utils/seed.ts'
import type { IAISystem, AIDecision, AIWorldView } from './ai-interface.ts'
import type { Villager, VillagerAction, Position } from '../villager.ts'
import { NeedType, getNeed } from '../villager.ts'
import { TileType } from '../world.ts'
import { getAllActions, type ActionDefinition } from '../actions.ts'

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
}

const WEIGHTS: Record<string, ActionWeights> = {
  forage:    { hunger: 0.8, energy: 0.1, health: 0.3 },
  eat:       { hunger: 1.0, energy: 0.0, health: 0.4 },
  rest:      { hunger: 0.0, energy: 1.0, health: 0.2 },
  chop_wood: { hunger: 0.2, energy: 0.1, health: 0.1 },
  haul:      { hunger: 0.3, energy: 0.1, health: 0.1 },
  fish:      { hunger: 0.7, energy: 0.1, health: 0.3 },
  idle:      { hunger: 0.0, energy: 0.0, health: 0.0 },
}

// --- Score Calculation ---

function scoreAction(
  action: ActionDefinition,
  villager: Readonly<Villager>,
  worldView: AIWorldView,
  rng: SeededRNG,
): { score: number; reason: string } {
  const weights = WEIGHTS[action.type] ?? { hunger: 0, energy: 0, health: 0 }

  const hunger = getNeed(villager as Villager, NeedType.Hunger)
  const energy = getNeed(villager as Villager, NeedType.Energy)
  const health = getNeed(villager as Villager, NeedType.Health)

  const hungerUrgency = urgencyCurve(hunger.current)
  const energyUrgency = urgencyCurve(energy.current)
  const healthUrgency = urgencyCurve(health.current)

  let needScore =
    weights.hunger * hungerUrgency +
    weights.energy * energyUrgency +
    weights.health * healthUrgency

  // Environmental modifiers
  let envMod = 0
  const reasons: string[] = []

  // Night penalty for outdoor actions
  if (worldView.timeOfDay === 'night' &&
      (action.type === 'forage' || action.type === 'chop_wood' || action.type === 'fish')) {
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

function findNearestWaterAdjacent(villager: Readonly<Villager>, worldView: AIWorldView): Position | undefined {
  // Find passable tiles adjacent to water
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
    case 'fish':
      return findNearestWaterAdjacent(villager, worldView)
    case 'eat':
    case 'rest':
    case 'haul':
      return { ...worldView.campfirePosition }
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

    for (const action of actions) {
      // Skip actions that can't be performed (but still score them if they need a target)
      const { score, reason } = scoreAction(action, villager, worldView, rng)

      if (score > bestScore) {
        bestScore = score
        bestAction = action
        bestReason = reason
      }
    }

    const targetPosition = findTargetForAction(bestAction.type, villager, worldView)

    return {
      action: bestAction.type,
      targetPosition,
      reason: bestReason,
    }
  }
}
