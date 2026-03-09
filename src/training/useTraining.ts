/**
 * React hook for managing evolutionary AI training via Web Worker.
 */

import { useState, useRef, useCallback } from 'react'
import type { TrainingConfig, TrainingState } from './trainer.ts'
import { type Genome, deserializeGenome } from '../simulation/ai/genome.ts'

export interface UseTrainingResult {
  trainingState: TrainingState | null
  isTraining: boolean
  startTraining: (config: TrainingConfig) => void
  stopTraining: () => void
  trainedGenome: Genome | null
}

export function useTraining(): UseTrainingResult {
  const [trainingState, setTrainingState] = useState<TrainingState | null>(null)
  const [isTraining, setIsTraining] = useState(false)
  const [trainedGenome, setTrainedGenome] = useState<Genome | null>(null)
  const workerRef = useRef<Worker | null>(null)

  const startTraining = useCallback((config: TrainingConfig) => {
    // Terminate existing worker
    workerRef.current?.terminate()
    setTrainedGenome(null)
    setIsTraining(true)

    const worker = new Worker(
      new URL('./training-worker.ts', import.meta.url),
      { type: 'module' },
    )
    workerRef.current = worker

    worker.onmessage = (event: MessageEvent) => {
      const { type, state, genome } = event.data

      if (type === 'progress') {
        setTrainingState({
          ...state,
          bestGenome: deserializeGenome(state.bestGenome),
        })
      }

      if (type === 'complete') {
        const finalGenome = deserializeGenome(genome)
        setTrainedGenome(finalGenome)
        setIsTraining(false)
        setTrainingState(prev => prev ? { ...prev, isComplete: true } : null)
        worker.terminate()
        workerRef.current = null
      }
    }

    worker.onerror = (err) => {
      console.error('Training worker error:', err)
      setIsTraining(false)
      worker.terminate()
      workerRef.current = null
    }

    worker.postMessage({ type: 'start', config })
  }, [])

  const stopTraining = useCallback(() => {
    workerRef.current?.postMessage({ type: 'stop' })
  }, [])

  return {
    trainingState,
    isTraining,
    startTraining,
    stopTraining,
    trainedGenome,
  }
}
