/**
 * Toast notification state management.
 */

import { create } from 'zustand'

export interface Toast {
  id: number
  message: string
  type: 'info' | 'warning' | 'danger' | 'success'
  expiresAt: number
}

let nextId = 0

interface ToastStore {
  toasts: Toast[]
  addToast: (message: string, type?: Toast['type']) => void
  removeToast: (id: number) => void
  clearExpired: () => void
}

const TOAST_DURATION_MS = 4000

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  addToast(message: string, type: Toast['type'] = 'info') {
    const id = nextId++
    const toast: Toast = { id, message, type, expiresAt: Date.now() + TOAST_DURATION_MS }
    set(state => ({ toasts: [...state.toasts.slice(-4), toast] })) // Keep max 5
  },

  removeToast(id: number) {
    set(state => ({ toasts: state.toasts.filter(t => t.id !== id) }))
  },

  clearExpired() {
    const now = Date.now()
    set(state => ({ toasts: state.toasts.filter(t => t.expiresAt > now) }))
  },
}))
