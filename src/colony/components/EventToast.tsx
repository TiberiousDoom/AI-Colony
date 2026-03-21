/**
 * EventToast: toast notification overlay for game events.
 */

import { useEffect } from 'react'
import { useToastStore, type Toast } from '../store/toast-store.ts'

const TYPE_COLORS: Record<Toast['type'], string> = {
  info: '#3b82f6',
  warning: '#f59e0b',
  danger: '#ef4444',
  success: '#22c55e',
}

export function EventToastContainer() {
  const toasts = useToastStore(s => s.toasts)
  const clearExpired = useToastStore(s => s.clearExpired)

  useEffect(() => {
    if (toasts.length === 0) return
    const timer = setInterval(clearExpired, 1000)
    return () => clearInterval(timer)
  }, [toasts.length, clearExpired])

  if (toasts.length === 0) return null

  return (
    <div style={{
      position: 'fixed', top: 56, right: 12,
      display: 'flex', flexDirection: 'column', gap: 6,
      zIndex: 100, pointerEvents: 'none',
    }}>
      {toasts.map(toast => (
        <div key={toast.id} style={{
          background: '#1e293b',
          borderLeft: `3px solid ${TYPE_COLORS[toast.type]}`,
          borderRadius: 4,
          padding: '8px 12px',
          color: '#e2e8f0',
          fontSize: 12,
          maxWidth: 280,
          animation: 'fadeIn 0.2s ease-out',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}>
          {toast.message}
        </div>
      ))}
    </div>
  )
}
