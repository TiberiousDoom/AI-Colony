/**
 * Web Worker for running evolutionary training off the main thread.
 * Receives TrainingConfig, posts TrainingState progress updates.
 */

import { trainSync, type TrainingConfig, type TrainingState } from './trainer.ts'
import { serializeGenome } from '../simulation/ai/genome.ts'

let stopRequested = false

self.onmessage = (event: MessageEvent) => {
  const { type, config } = event.data

  if (type === 'stop') {
    stopRequested = true
    return
  }

  if (type === 'start') {
    stopRequested = false
    const trainingConfig = config as TrainingConfig

    const bestGenome = trainSync(
      trainingConfig,
      (state: TrainingState) => {
        self.postMessage({
          type: 'progress',
          state: {
            ...state,
            bestGenome: serializeGenome(state.bestGenome),
          },
        })
      },
      () => stopRequested,
    )

    self.postMessage({
      type: 'complete',
      genome: serializeGenome(bestGenome),
    })
  }
}
