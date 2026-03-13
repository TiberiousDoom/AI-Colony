/**
 * Monster entity, type stats, AI state machine, and combat helpers.
 */

import type { Position } from './villager.ts'
import type { Villager } from './villager.ts'
import type { World } from './world.ts'
import type { Structure } from './structures.ts'
import type { SeededRNG } from '../utils/seed.ts'
import { MONSTERS } from '../config/game-constants.ts'
import { isAtStructure } from './structures.ts'

// --- Types ---

export type MonsterBehaviorState = 'roaming' | 'chasing' | 'attacking' | 'fleeing' | 'dead'
export type MonsterType = 'wolf' | 'bear' | 'goblin' | 'snake'

export interface Monster {
  id: string
  type: MonsterType
  hp: number
  maxHp: number
  damage: number
  speed: number
  position: Position
  behaviorState: MonsterBehaviorState
  targetVillagerId: string | null
  path: Array<{ x: number; y: number }>
  spawnedByEvent: boolean
  despawnTick: number | null
  lastAttackTick: number
  roamTarget: Position | null
  /** Tracks wall slow effect: skip movement for this many ticks */
  wallSlowRemaining: number
}

// --- Factory ---

let monsterIdCounter = 0

export function createMonster(
  type: MonsterType,
  position: Position,
  spawnedByEvent: boolean,
  despawnTick: number | null,
): Monster {
  const stats = MONSTERS.TYPES[type]
  return {
    id: `monster-${monsterIdCounter++}`,
    type,
    hp: stats.hp,
    maxHp: stats.hp,
    damage: stats.damage,
    speed: stats.speed,
    position: { ...position },
    behaviorState: 'roaming',
    targetVillagerId: null,
    path: [],
    spawnedByEvent,
    despawnTick,
    lastAttackTick: -999,
    roamTarget: null,
    wallSlowRemaining: 0,
  }
}

/** Reset the counter (for tests) */
export function resetMonsterIdCounter(): void {
  monsterIdCounter = 0
}

// --- Helpers ---

export function manhattanDistance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

export function isAdjacentToMonster(villagerPos: Position, monsterPos: Position): boolean {
  return manhattanDistance(villagerPos, monsterPos) <= MONSTERS.ATTACK_RANGE
}

export function damageMonster(monster: Monster, amount: number): void {
  monster.hp -= amount
  if (monster.hp <= 0) {
    monster.hp = 0
    monster.behaviorState = 'dead'
  }
}

export function getMonsterLoot(monster: Monster): { food: number; wood: number } {
  const stats = MONSTERS.TYPES[monster.type]
  return { food: stats.lootFood, wood: stats.lootWood }
}

export function findNearestVillager(
  monster: Monster,
  villagers: Villager[],
  detectionRadius: number,
): Villager | null {
  let best: Villager | null = null
  let bestDist = Infinity

  for (const v of villagers) {
    if (!v.alive) continue
    const dist = manhattanDistance(monster.position, v.position)
    if (dist <= detectionRadius && dist < bestDist) {
      bestDist = dist
      best = v
    }
  }
  return best
}

// --- Combat Helpers for AI ---

export interface MonsterInfo {
  id: string
  type: string
  hp: number
  maxHp: number
  damage: number
  position: { x: number; y: number }
  behaviorState: string
  targetVillagerId: string | null
}

export function findNearestMonsterToVillager(
  villager: Readonly<Villager>,
  monsters: ReadonlyArray<Readonly<MonsterInfo>> | undefined,
): Readonly<MonsterInfo> | null {
  if (!monsters || monsters.length === 0) return null
  let best: Readonly<MonsterInfo> | null = null
  let bestDist = Infinity
  for (const m of monsters) {
    if (m.behaviorState === 'dead') continue
    const dist = Math.abs(villager.position.x - m.position.x) + Math.abs(villager.position.y - m.position.y)
    if (dist < bestDist) {
      bestDist = dist
      best = m
    }
  }
  return best
}

export function countAlliesNearMonster(
  monsterPos: { x: number; y: number },
  villagers: ReadonlyArray<Readonly<Villager>> | undefined,
  radius: number = 5,
): number {
  if (!villagers) return 0
  let count = 0
  for (const v of villagers) {
    if (!v.alive) continue
    const dist = Math.abs(v.position.x - monsterPos.x) + Math.abs(v.position.y - monsterPos.y)
    if (dist <= radius) count++
  }
  return count
}

export function shouldFight(
  villagerHealth: number,
  monster: { hp: number; maxHp: number; damage: number },
  alliesNear: number,
  hasWeapon: boolean = false,
): boolean {
  const healthOk = villagerHealth > 40
  const hasAllies = alliesNear >= 2  // counting self, so 2 means at least 1 ally
  const monsterWeak = monster.hp < monster.maxHp * 0.5
  const monsterLowDamage = monster.damage <= 3  // wolf/goblin/snake level
  // Armed villagers are braver — fight solo against low-damage monsters
  if (hasWeapon && healthOk && monster.damage <= 4) return true
  // Fight if: healthy with allies, or healthy vs low-damage monster, or monster is weak
  return (healthOk && hasAllies) || (healthOk && monsterLowDamage) || monsterWeak
}

// --- Monster AI State Machine ---

function stepToward(from: Position, to: Position, world: World): Position {
  const dx = Math.sign(to.x - from.x)
  const dy = Math.sign(to.y - from.y)

  // Try direct diagonal-ish movement (prioritize axis with greater distance)
  const candidates: Array<{ x: number; y: number }> = []
  if (Math.abs(to.x - from.x) >= Math.abs(to.y - from.y)) {
    if (dx !== 0) candidates.push({ x: from.x + dx, y: from.y })
    if (dy !== 0) candidates.push({ x: from.x, y: from.y + dy })
  } else {
    if (dy !== 0) candidates.push({ x: from.x, y: from.y + dy })
    if (dx !== 0) candidates.push({ x: from.x + dx, y: from.y })
  }

  for (const c of candidates) {
    if (world.isPassable(c.x, c.y)) return c
  }
  return from // stuck
}

function stepAwayFrom(from: Position, threat: Position, world: World): Position {
  const dx = Math.sign(from.x - threat.x)
  const dy = Math.sign(from.y - threat.y)

  const candidates: Array<{ x: number; y: number }> = []
  if (dx !== 0) candidates.push({ x: from.x + dx, y: from.y })
  if (dy !== 0) candidates.push({ x: from.x, y: from.y + dy })
  if (dx !== 0 && dy !== 0) candidates.push({ x: from.x + dx, y: from.y + dy })

  for (const c of candidates) {
    if (world.isPassable(c.x, c.y)) return c
  }
  return from
}

export function tickMonsterAI(
  monster: Monster,
  villagers: Villager[],
  world: World,
  structures: Structure[],
  rng: SeededRNG,
  currentTick: number,
  villageCenter?: Position,
): void {
  if (monster.behaviorState === 'dead') return

  const stats = MONSTERS.TYPES[monster.type]

  // Check flee threshold from any state
  if (monster.behaviorState !== 'fleeing' && monster.hp / monster.maxHp < stats.fleeThresholdPercent / 100) {
    monster.behaviorState = 'fleeing'
    monster.targetVillagerId = null
  }

  // Wall slow effect: skip movement this tick
  if (monster.wallSlowRemaining > 0) {
    monster.wallSlowRemaining--
    return
  }

  // Slow monsters (speed < 1) skip movement on some ticks
  if (monster.speed < 1 && currentTick % Math.round(1 / monster.speed) !== 0) {
    return
  }

  switch (monster.behaviorState) {
    case 'roaming': {
      // Scan for villagers
      const target = findNearestVillager(monster, villagers, stats.detectionRadius)
      if (target) {
        monster.behaviorState = 'chasing'
        monster.targetVillagerId = target.id
        break
      }

      // Pick or move toward roam target — biased toward village center
      if (!monster.roamTarget || manhattanDistance(monster.position, monster.roamTarget) <= 1) {
        if (villageCenter && rng.next() < 0.7) {
          // 70% chance to roam toward village center (with some offset)
          monster.roamTarget = {
            x: Math.max(2, Math.min(world.width - 3, villageCenter.x + rng.nextInt(-8, 8))),
            y: Math.max(2, Math.min(world.height - 3, villageCenter.y + rng.nextInt(-8, 8))),
          }
        } else {
          monster.roamTarget = {
            x: rng.nextInt(2, world.width - 3),
            y: rng.nextInt(2, world.height - 3),
          }
        }
      }

      const nextPos = stepToward(monster.position, monster.roamTarget, world)
      applyWallInteraction(monster, nextPos, structures)
      if (monster.wallSlowRemaining === 0) {
        monster.position.x = nextPos.x
        monster.position.y = nextPos.y
      }
      break
    }

    case 'chasing': {
      const target = villagers.find(v => v.id === monster.targetVillagerId && v.alive)
      if (!target) {
        // Target dead or gone, scan for new one
        const newTarget = findNearestVillager(monster, villagers, stats.detectionRadius)
        if (newTarget) {
          monster.targetVillagerId = newTarget.id
        } else {
          monster.behaviorState = 'roaming'
          monster.targetVillagerId = null
        }
        break
      }

      const dist = manhattanDistance(monster.position, target.position)

      // Leash range
      if (dist > stats.detectionRadius * 1.5) {
        monster.behaviorState = 'roaming'
        monster.targetVillagerId = null
        break
      }

      // Adjacent = start attacking
      if (dist <= MONSTERS.ATTACK_RANGE) {
        monster.behaviorState = 'attacking'
        break
      }

      // Move toward target
      const nextPos = stepToward(monster.position, target.position, world)
      applyWallInteraction(monster, nextPos, structures)
      if (monster.wallSlowRemaining === 0) {
        monster.position.x = nextPos.x
        monster.position.y = nextPos.y
      }
      break
    }

    case 'attacking': {
      const target = villagers.find(v => v.id === monster.targetVillagerId && v.alive)
      if (!target) {
        // Target died, scan for next
        const newTarget = findNearestVillager(monster, villagers, stats.detectionRadius)
        if (newTarget) {
          monster.targetVillagerId = newTarget.id
          monster.behaviorState = 'chasing'
        } else {
          monster.behaviorState = 'roaming'
          monster.targetVillagerId = null
        }
        break
      }

      const dist = manhattanDistance(monster.position, target.position)
      if (dist > MONSTERS.ATTACK_RANGE) {
        monster.behaviorState = 'chasing'
        break
      }

      // Attack is handled by the engine (monster attack loop)
      // The state machine just maintains the state
      break
    }

    case 'fleeing': {
      const nearestVillager = findNearestVillager(monster, villagers, 999)
      if (nearestVillager) {
        const nextPos = stepAwayFrom(monster.position, nearestVillager.position, world)
        monster.position.x = nextPos.x
        monster.position.y = nextPos.y
      }

      // Check if at map edge
      if (monster.position.x <= 0 || monster.position.x >= world.width - 1 ||
          monster.position.y <= 0 || monster.position.y >= world.height - 1) {
        monster.behaviorState = 'dead' // escaped, will be cleaned up
      }
      break
    }
  }
}

/** Apply wall damage and slow when monster moves near a wall structure */
function applyWallInteraction(monster: Monster, nextPos: Position, structures: Structure[]): void {
  const nearWall = isAtStructure(nextPos, structures, 'wall')
  if (nearWall) {
    monster.hp -= MONSTERS.WALL_MONSTER_DAMAGE
    if (monster.hp <= 0) {
      monster.hp = 0
      monster.behaviorState = 'dead'
      return
    }
    monster.wallSlowRemaining = MONSTERS.WALL_MONSTER_SLOW_TICKS
  }
}
