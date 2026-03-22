import type { RoomTemplate } from './room-templates.ts'
import { ROOM_TEMPLATES } from './room-templates.ts'

export interface ProductionRule {
  weight: number
  minDepth: number
  maxDepth: number
  template: RoomTemplate
}

function findTemplate(name: string): RoomTemplate {
  return ROOM_TEMPLATES.find(t => t.name === name) ?? ROOM_TEMPLATES[0]
}

export const PRODUCTION_RULES: ProductionRule[] = [
  { weight: 3, minDepth: 0, maxDepth: 99, template: findTemplate('Small Room') },
  { weight: 2, minDepth: 0, maxDepth: 99, template: findTemplate('Corridor EW') },
  { weight: 2, minDepth: 0, maxDepth: 99, template: findTemplate('Corridor NS') },
  { weight: 1.5, minDepth: 1, maxDepth: 99, template: findTemplate('Large Hall') },
  { weight: 1, minDepth: 2, maxDepth: 99, template: findTemplate('Stair Down') },
  { weight: 0.8, minDepth: 3, maxDepth: 99, template: findTemplate('Guard Post') },
  { weight: 0.5, minDepth: 5, maxDepth: 99, template: findTemplate('Treasure Room') },
  { weight: 0.3, minDepth: 6, maxDepth: 99, template: findTemplate('Boss Chamber') },
]

/**
 * Select a production rule based on depth and weighted random.
 */
export function selectRule(depth: number, rng: { next: () => number }): ProductionRule {
  const eligible = PRODUCTION_RULES.filter(r => depth >= r.minDepth && depth <= r.maxDepth)
  if (eligible.length === 0) return PRODUCTION_RULES[0]

  const totalWeight = eligible.reduce((s, r) => s + r.weight, 0)
  let roll = rng.next() * totalWeight
  for (const rule of eligible) {
    roll -= rule.weight
    if (roll <= 0) return rule
  }
  return eligible[eligible.length - 1]
}
