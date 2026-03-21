/**
 * Seeded PRNG using Mulberry32 algorithm.
 * Pure integer arithmetic — no Math.sin, portable across JS engines.
 */

export interface SeededRNG {
  /** Returns next float in [0, 1) */
  next(): number
  /** Returns integer in [min, max] inclusive */
  nextInt(min: number, max: number): number
  /** Returns float in [min, max) */
  nextFloat(min: number, max: number): number
  /** Creates an independent child RNG seeded from current state */
  fork(): SeededRNG
  /** Shuffle an array in place using Fisher-Yates */
  shuffle<T>(array: T[]): T[]
  /** Returns the current internal state for serialization */
  getState(): number
}

export function createRNG(seed: number): SeededRNG {
  let state = seed | 0

  function nextRaw(): number {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const rng: SeededRNG = {
    next(): number {
      return nextRaw()
    },

    nextInt(min: number, max: number): number {
      return Math.floor(nextRaw() * (max - min + 1)) + min
    },

    nextFloat(min: number, max: number): number {
      return nextRaw() * (max - min) + min
    },

    fork(): SeededRNG {
      // Derive a child seed from current state
      const childSeed = (nextRaw() * 4294967296) | 0
      return createRNG(childSeed)
    },

    shuffle<T>(array: T[]): T[] {
      for (let i = array.length - 1; i > 0; i--) {
        const j = rng.nextInt(0, i)
        const tmp = array[i]
        array[i] = array[j]
        array[j] = tmp
      }
      return array
    },

    getState(): number {
      return state
    },
  }

  return rng
}

/** Restore an RNG from a previously captured internal state */
export function createRNGFromState(savedState: number): SeededRNG {
  // Mulberry32's state IS the seed before first call.
  // Recreate by using the saved state directly.
  return createRNGFromStateInternal(savedState)
}

function createRNGFromStateInternal(savedState: number): SeededRNG {
  let state = savedState

  function nextRaw(): number {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const rng: SeededRNG = {
    next(): number {
      return nextRaw()
    },

    nextInt(min: number, max: number): number {
      return Math.floor(nextRaw() * (max - min + 1)) + min
    },

    nextFloat(min: number, max: number): number {
      return nextRaw() * (max - min) + min
    },

    fork(): SeededRNG {
      const childSeed = (nextRaw() * 4294967296) | 0
      return createRNG(childSeed)
    },

    shuffle<T>(array: T[]): T[] {
      for (let i = array.length - 1; i > 0; i--) {
        const j = rng.nextInt(0, i)
        const tmp = array[i]
        array[i] = array[j]
        array[j] = tmp
      }
      return array
    },

    getState(): number {
      return state
    },
  }

  return rng
}
