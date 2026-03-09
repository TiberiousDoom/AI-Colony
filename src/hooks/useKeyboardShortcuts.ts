/**
 * Keyboard shortcuts for simulation control.
 *
 * Space: toggle start/pause
 * 1/2/3/4: set speed 1x/2x/4x/8x
 * M: metrics view, S: simulation view, R: results view
 * Escape: close modals/inspector
 * ?: toggle help modal
 */

import { useEffect } from 'react'
import { useSimulationStore } from '../store/simulation-store.ts'

const SPEED_MAP: Record<string, number> = {
  '1': 1,
  '2': 2,
  '3': 4,
  '4': 8,
}

export function useKeyboardShortcuts(callbacks?: {
  onToggleHelp?: () => void
  onToggleFPS?: () => void
  onEscape?: () => void
}) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't handle shortcuts when focused on input/textarea/select
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      const store = useSimulationStore.getState()

      if (e.code === 'Space') {
        e.preventDefault()
        if (store.isRunning) {
          store.pause()
        } else {
          store.start()
        }
        return
      }

      if (SPEED_MAP[e.key]) {
        store.setSpeed(SPEED_MAP[e.key])
        return
      }

      const lower = e.key.toLowerCase()

      if (lower === 'm') {
        store.setViewMode('metrics')
        return
      }
      if (lower === 's') {
        store.setViewMode('simulation')
        return
      }
      if (lower === 'r') {
        store.setViewMode('results')
        return
      }

      if (lower === 'f') {
        callbacks?.onToggleFPS?.()
        return
      }

      if (e.key === 'Escape') {
        callbacks?.onEscape?.()
        return
      }

      if (e.key === '?') {
        callbacks?.onToggleHelp?.()
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [callbacks])
}
