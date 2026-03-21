/**
 * Behavior Tree core node types.
 * Provides Selector, Sequence, Condition, and ActionNode for composing decision trees.
 */

import type { SeededRNG } from '../../../shared/seed.ts'
import type { AIDecision, AIWorldView } from './ai-interface.ts'

export type BTStatus = 'success' | 'failure' | 'running'

export interface BTContext {
  worldView: AIWorldView
  rng: SeededRNG
  /** Set by action nodes when they produce a decision */
  decision: AIDecision | null
}

export interface BTNode {
  tick(context: BTContext): BTStatus
}

/** Try children in order until one succeeds. */
export class Selector implements BTNode {
  constructor(private children: BTNode[]) {}

  tick(context: BTContext): BTStatus {
    for (const child of this.children) {
      const status = child.tick(context)
      if (status === 'success') return 'success'
      if (status === 'running') return 'running'
    }
    return 'failure'
  }
}

/** Run children in order; fail on first failure. */
export class Sequence implements BTNode {
  constructor(private children: BTNode[]) {}

  tick(context: BTContext): BTStatus {
    for (const child of this.children) {
      const status = child.tick(context)
      if (status === 'failure') return 'failure'
      if (status === 'running') return 'running'
    }
    return 'success'
  }
}

/** Check a predicate. Returns success if true, failure if false. */
export class Condition implements BTNode {
  constructor(private predicate: (ctx: BTContext) => boolean) {}

  tick(context: BTContext): BTStatus {
    return this.predicate(context) ? 'success' : 'failure'
  }
}

/** Produce an AI decision. Always succeeds. */
export class ActionNode implements BTNode {
  constructor(private produce: (ctx: BTContext) => AIDecision) {}

  tick(context: BTContext): BTStatus {
    context.decision = this.produce(context)
    return 'success'
  }
}
