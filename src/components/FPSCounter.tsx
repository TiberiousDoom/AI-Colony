/**
 * FPSCounter: small overlay showing frames per second.
 */

import { useEffect, useRef, useState } from 'react'

export function FPSCounter() {
  const [fps, setFps] = useState(0)
  const framesRef = useRef(0)
  const lastRef = useRef(performance.now())

  useEffect(() => {
    let animId: number
    function tick(now: number) {
      framesRef.current++
      if (now - lastRef.current >= 1000) {
        setFps(framesRef.current)
        framesRef.current = 0
        lastRef.current = now
      }
      animId = requestAnimationFrame(tick)
    }
    animId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animId)
  }, [])

  return (
    <div style={{
      position: 'fixed', bottom: 8, right: 8,
      background: 'rgba(0,0,0,0.7)',
      color: fps >= 30 ? '#4ade80' : fps >= 15 ? '#fbbf24' : '#ef4444',
      padding: '2px 6px', borderRadius: 3,
      fontSize: 11, fontFamily: 'monospace',
      zIndex: 90, pointerEvents: 'none',
    }}>
      {fps} FPS
    </div>
  )
}
