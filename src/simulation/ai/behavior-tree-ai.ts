/**
 * Behavior Tree AI: hierarchical decision tree implementing IAISystem.
 *
 * Tree structure (top-to-bottom, first matching branch wins):
 *   Root (Selector)
 *   ├── Emergency (Selector)
 *   │   ├── health < 20? → eat/rest
 *   │   └── predator within 5 tiles? → flee
 *   ├── Critical Needs (Priority Selector)
 *   │   ├── hunger < 25? → eat (or forage if stockpile empty)
 *   │   ├── energy < 20? → rest
 *   │   └── warmth < 25 AND (winter OR cold snap)? → warm_up
 *   ├── Hauling (carry resources home)
 *   │   └── carrying? → haul
 *   ├── Village Tasks (Priority Selector)
 *   │   ├── food < threshold? → forage
 *   │   ├── wood < threshold? → chop_wood
 *   │   ├── need shelter? → build_shelter
 *   │   ├── need storage? → build_storage
 *   │   └── stone < 10 AND storage needed? → mine_stone
 *   ├── Proactive (autumn stockpiling)
 *   └── Idle → rest if energy < 60, else fish/forage
 */

import type { SeededRNG } from '../../utils/seed.ts'
import type { IAISystem, AIDecision, AIWorldView } from './ai-interface.ts'
import type { Villager, Position } from '../villager.ts'
import { NeedType, getNeed } from '../villager.ts'
import { TileType } from '../world.ts'
import { Selector, Sequence, Condition, ActionNode, type BTNode, type BTContext } from './behavior-tree.ts'

// --- Target Finders ---

function findNearestTileOfType(
  villager: Readonly<Villager>,
  worldView: AIWorldView,
  tileType: typeof TileType[keyof typeof TileType],
): Position | undefined {
  const tiles = worldView.world.findTilesInRadius(
    villager.position.x, villager.position.y, 15,
    t => t.type === tileType && t.resourceAmount > 0,
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

// --- Helper predicates ---

function isNearCampfire(villager: Readonly<Villager>, wv: AIWorldView): boolean {
  return Math.abs(villager.position.x - wv.campfirePosition.x) <= 1 &&
         Math.abs(villager.position.y - wv.campfirePosition.y) <= 1
}

function getPredatorDistance(villager: Readonly<Villager>, wv: AIWorldView): number | null {
  const predator = wv.activeEvents.find(e => e.type === 'predator')
  if (!predator) return null
  const px = wv.campfirePosition.x + predator.relativePosition.dx
  const py = wv.campfirePosition.y + predator.relativePosition.dy
  return Math.abs(villager.position.x - px) + Math.abs(villager.position.y - py)
}

function hasColdSnapActive(wv: AIWorldView): boolean {
  return wv.activeEvents.some(e => e.type === 'cold_snap')
}

// --- Tree Builder ---

function buildVillagerTree(villager: Readonly<Villager>, wv: AIWorldView): BTNode {
  // Emergency branch
  const emergency = new Selector([
    // Health crisis → eat or rest
    new Sequence([
      new Condition((_ctx) => {
        const health = getNeed(villager as Villager, NeedType.Health)
        return health.current < 20
      }),
      new ActionNode((ctx) => {
        const campfire = ctx.worldView.campfirePosition
        if (isNearCampfire(villager, ctx.worldView) && ctx.worldView.stockpile.food >= 5) {
          return { action: 'eat', targetPosition: { ...campfire }, reason: 'BT: health emergency → eat' }
        }
        return { action: 'rest', targetPosition: { ...campfire }, reason: 'BT: health emergency → rest' }
      }),
    ]),
    // Predator nearby → flee
    new Sequence([
      new Condition(() => {
        const dist = getPredatorDistance(villager, wv)
        return dist !== null && dist <= 5
      }),
      new ActionNode((ctx) => {
        const predator = ctx.worldView.activeEvents.find(e => e.type === 'predator')!
        const px = ctx.worldView.campfirePosition.x + predator.relativePosition.dx
        const py = ctx.worldView.campfirePosition.y + predator.relativePosition.dy
        const dx = villager.position.x - px
        const dy = villager.position.y - py
        const targetX = Math.max(0, Math.min(ctx.worldView.world.width - 1, villager.position.x + Math.sign(dx) * 8))
        const targetY = Math.max(0, Math.min(ctx.worldView.world.height - 1, villager.position.y + Math.sign(dy) * 8))
        return { action: 'flee', targetPosition: { x: targetX, y: targetY }, reason: 'BT: predator nearby → flee' }
      }),
    ]),
  ])

  // Critical needs branch
  const criticalNeeds = new Selector([
    // Very hungry → eat (or forage if no food)
    new Sequence([
      new Condition(() => getNeed(villager as Villager, NeedType.Hunger).current < 25),
      new ActionNode((ctx) => {
        const campfire = ctx.worldView.campfirePosition
        if (villager.carrying?.type === 'food' && villager.carrying.amount >= 5) {
          return { action: 'eat', targetPosition: villager.position, reason: 'BT: hungry → eat carried food' }
        }
        if (isNearCampfire(villager, ctx.worldView) && ctx.worldView.stockpile.food >= 5) {
          return { action: 'eat', targetPosition: { ...campfire }, reason: 'BT: hungry → eat from stockpile' }
        }
        if (ctx.worldView.stockpile.food >= 5) {
          return { action: 'eat', targetPosition: { ...campfire }, reason: 'BT: hungry → go to campfire and eat' }
        }
        // No food available → forage
        const forest = findNearestTileOfType(villager, ctx.worldView, TileType.Forest)
        if (forest) {
          return { action: 'forage', targetPosition: forest, reason: 'BT: hungry, no food → forage' }
        }
        // Try fishing
        const water = findNearestWaterAdjacent(villager, ctx.worldView)
        if (water) {
          return { action: 'fish', targetPosition: water, reason: 'BT: hungry, no forest → fish' }
        }
        return { action: 'rest', targetPosition: { ...campfire }, reason: 'BT: hungry, nothing available → rest' }
      }),
    ]),
    // Very tired → rest
    new Sequence([
      new Condition(() => getNeed(villager as Villager, NeedType.Energy).current < 20),
      new ActionNode((ctx) => {
        return { action: 'rest', targetPosition: { ...ctx.worldView.campfirePosition }, reason: 'BT: energy critical → rest' }
      }),
    ]),
    // Cold in winter/cold snap → warm up
    new Sequence([
      new Condition(() => {
        const warmth = getNeed(villager as Villager, NeedType.Warmth)
        return warmth.current < 25 && (wv.season === 'winter' || hasColdSnapActive(wv))
      }),
      new ActionNode((ctx) => {
        return { action: 'warm_up', targetPosition: { ...ctx.worldView.campfirePosition }, reason: 'BT: warmth critical → warm up' }
      }),
    ]),
  ])

  // Hauling branch — bring resources home first
  const hauling = new Sequence([
    new Condition(() => villager.carrying !== null),
    new ActionNode((ctx) => {
      return { action: 'haul', targetPosition: { ...ctx.worldView.campfirePosition }, reason: 'BT: carrying resources → haul' }
    }),
  ])

  // Village tasks branch
  const foodThreshold = wv.season === 'autumn' ? 50 : 30
  const woodThreshold = wv.season === 'autumn' ? 30 : 20

  const villageTasks = new Selector([
    // Low food → forage
    new Sequence([
      new Condition((ctx) => ctx.worldView.stockpile.food < foodThreshold),
      new ActionNode((ctx) => {
        // Try forage first, fall back to fish
        const forest = findNearestTileOfType(villager, ctx.worldView, TileType.Forest)
        if (forest) {
          return { action: 'forage', targetPosition: forest, reason: `BT: food < ${foodThreshold} → forage` }
        }
        const water = findNearestWaterAdjacent(villager, ctx.worldView)
        if (water) {
          return { action: 'fish', targetPosition: water, reason: `BT: food < ${foodThreshold}, no forest → fish` }
        }
        return { action: 'idle', reason: 'BT: need food but no sources' }
      }),
    ]),
    // Low wood → chop
    new Sequence([
      new Condition((ctx) => ctx.worldView.stockpile.wood < woodThreshold),
      new ActionNode((ctx) => {
        const forest = findNearestTileOfType(villager, ctx.worldView, TileType.Forest)
        if (forest) {
          return { action: 'chop_wood', targetPosition: forest, reason: `BT: wood < ${woodThreshold} → chop wood` }
        }
        return { action: 'idle', reason: 'BT: need wood but no forest' }
      }),
    ]),
    // Need shelter → build
    new Sequence([
      new Condition((ctx) => {
        const pop = ctx.worldView.villagers.filter(v => v.alive).length
        const shelterCount = ctx.worldView.structures.filter(s => s.type === 'shelter').length
        const shelterCap = shelterCount * 3
        return pop > shelterCap && ctx.worldView.stockpile.wood >= 20
      }),
      new ActionNode((ctx) => {
        return {
          action: 'build_shelter',
          targetPosition: { ...ctx.worldView.campfirePosition },
          reason: 'BT: population > shelter capacity → build shelter',
        }
      }),
    ]),
    // Need storage → build
    new Sequence([
      new Condition((ctx) => {
        const hasStorage = ctx.worldView.structures.some(s => s.type === 'storage')
        const anyHigh = ctx.worldView.stockpile.food > 80 || ctx.worldView.stockpile.wood > 80
        return !hasStorage && anyHigh &&
          ctx.worldView.stockpile.wood >= 15 && ctx.worldView.stockpile.stone >= 10
      }),
      new ActionNode((ctx) => {
        return {
          action: 'build_storage',
          targetPosition: { ...ctx.worldView.campfirePosition },
          reason: 'BT: need storage → build storage',
        }
      }),
    ]),
    // Low stone + storage needed → mine
    new Sequence([
      new Condition((ctx) => {
        const hasStorage = ctx.worldView.structures.some(s => s.type === 'storage')
        return !hasStorage && ctx.worldView.stockpile.stone < 10
      }),
      new ActionNode((ctx) => {
        const stone = findNearestTileOfType(villager, ctx.worldView, TileType.Stone)
        if (stone) {
          return { action: 'mine_stone', targetPosition: stone, reason: 'BT: stone < 10 → mine stone' }
        }
        return { action: 'idle', reason: 'BT: need stone but none found' }
      }),
    ]),
  ])

  // Idle / fallback branch
  const idle = new ActionNode((ctx) => {
    const energy = getNeed(villager as Villager, NeedType.Energy)
    if (energy.current < 60) {
      return { action: 'rest', targetPosition: { ...ctx.worldView.campfirePosition }, reason: 'BT: idle → rest (energy < 60)' }
    }
    // Try fishing or foraging for something to do
    const water = findNearestWaterAdjacent(villager, ctx.worldView)
    if (water) {
      return { action: 'fish', targetPosition: water, reason: 'BT: idle → fish' }
    }
    const forest = findNearestTileOfType(villager, ctx.worldView, TileType.Forest)
    if (forest) {
      return { action: 'forage', targetPosition: forest, reason: 'BT: idle → forage' }
    }
    return { action: 'rest', targetPosition: { ...ctx.worldView.campfirePosition }, reason: 'BT: idle → rest' }
  })

  // Root selector: try branches top-to-bottom
  return new Selector([
    emergency,
    criticalNeeds,
    hauling,
    villageTasks,
    idle,
  ])
}

// --- BT AI Implementation ---

export class BehaviorTreeAI implements IAISystem {
  readonly name = 'Behavior Tree'

  decide(villager: Readonly<Villager>, worldView: AIWorldView, rng: SeededRNG): AIDecision {
    const tree = buildVillagerTree(villager, worldView)
    const context: BTContext = {
      worldView,
      rng,
      decision: null,
    }

    tree.tick(context)

    if (context.decision) {
      return context.decision
    }

    // Fallback (should never reach here)
    return {
      action: 'idle',
      reason: 'BT: fallback idle',
    }
  }
}
