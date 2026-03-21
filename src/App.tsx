import { useState, useMemo, useEffect, useRef, lazy, Suspense } from 'react'
import { TopBar } from './colony/components/TopBar.tsx'
import { MetricsDashboard } from './colony/views/MetricsDashboard.tsx'
import { AcceptanceChecklist } from './colony/components/AcceptanceChecklist.tsx'
import { ErrorBoundary } from './colony/components/ErrorBoundary.tsx'
import { EventToastContainer } from './colony/components/EventToast.tsx'
import { FPSCounter } from './colony/components/FPSCounter.tsx'
import { HelpModal } from './colony/components/HelpModal.tsx'
import { SaveLoadPanel } from './colony/components/SaveLoadPanel.tsx'
import { useSimulationStore } from './colony/store/simulation-store.ts'
import { useToastStore } from './colony/store/toast-store.ts'
import { useKeyboardShortcuts } from './colony/hooks/useKeyboardShortcuts.ts'
import './App.css'

/** Retry a dynamic import once on failure (handles stale chunk 404s after redeploy) */
function lazyRetry<T extends Record<string, unknown>>(
  factory: () => Promise<T>,
  pick: (m: T) => { default: React.ComponentType },
): React.LazyExoticComponent<React.ComponentType> {
  return lazy(() =>
    factory()
      .then(pick)
      .catch(() => {
        // Chunk 404 — likely a stale deployment. Reload once to get fresh asset manifest.
        const key = 'chunk-retry-reloaded'
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, '1')
          window.location.reload()
        }
        // If we already reloaded, surface the error
        return factory().then(pick)
      }),
  )
}

const SimulationView = lazyRetry(() => import('./colony/views/SimulationView.tsx'), m => ({ default: m.SimulationView }))
const ResultsSummary = lazyRetry(() => import('./colony/views/ResultsSummary.tsx'), m => ({ default: m.ResultsSummary }))
const SetupScreen = lazyRetry(() => import('./colony/views/SetupScreen.tsx'), m => ({ default: m.SetupScreen }))
const VoxelSandbox = lazyRetry(() => import('./voxel/views/VoxelSandbox.tsx'), m => ({ default: m.VoxelSandbox }))
const ComparisonView = lazyRetry(() => import('./voxel/views/ComparisonView.tsx'), m => ({ default: m.ComparisonView }))

function App() {
  const [showChecklist, setShowChecklist] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [showFPS, setShowFPS] = useState(false)
  const [showSaveLoad, setShowSaveLoad] = useState(false)
  const viewMode = useSimulationStore(s => s.viewMode)
  const showSetup = useSimulationStore(s => s.showSetup)
  const voxelOnly = useSimulationStore(s => s.voxelOnly)
  const competitionState = useSimulationStore(s => s.competitionState)

  // Emit toasts for new global events
  const prevEventCountRef = useRef(0)
  const addToast = useToastStore(s => s.addToast)
  useEffect(() => {
    if (!competitionState) return
    const events = competitionState.globalEvents
    if (events.length > prevEventCountRef.current) {
      for (let i = prevEventCountRef.current; i < events.length; i++) {
        const evt = events[i]
        if (evt.type === 'random_event') {
          addToast(evt.message, 'warning')
        } else if (evt.type === 'village_eliminated') {
          addToast(evt.message, 'danger')
        } else if (evt.type === 'milestone') {
          addToast(evt.message, 'success')
        }
      }
    }
    prevEventCountRef.current = events.length
  }, [competitionState?.globalEvents.length, addToast, competitionState])

  const keyboardCallbacks = useMemo(() => ({
    onEscape: () => {
      setShowChecklist(false)
      setShowHelp(false)
      setShowSaveLoad(false)
    },
    onToggleHelp: () => setShowHelp(v => !v),
    onToggleFPS: () => setShowFPS(v => !v),
  }), [])
  useKeyboardShortcuts(keyboardCallbacks)

  if (showSetup) {
    return (
      <ErrorBoundary>
        <Suspense fallback={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0f172a', color: '#94a3b8' }}>
            Loading...
          </div>
        }>
          <SetupScreen />
        </Suspense>
      </ErrorBoundary>
    )
  }

  return (
    <div className="app">
      <TopBar
        onToggleChecklist={() => setShowChecklist(v => !v)}
        onToggleSaveLoad={() => setShowSaveLoad(v => !v)}
        voxelOnly={voxelOnly}
      />
      <ErrorBoundary>
        <main className="app-main">
          {viewMode === 'compare' ? (
            <Suspense fallback={
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8' }}>
                Loading comparison view...
              </div>
            }>
              <ComparisonView />
            </Suspense>
          ) : viewMode === 'voxel' ? (
            <Suspense fallback={
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8' }}>
                Loading voxel sandbox...
              </div>
            }>
              <VoxelSandbox />
            </Suspense>
          ) : viewMode === 'metrics' ? (
            <MetricsDashboard />
          ) : viewMode === 'results' ? (
            <Suspense fallback={
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8' }}>
                Loading results...
              </div>
            }>
              <ResultsSummary />
            </Suspense>
          ) : (
            <Suspense fallback={
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8' }}>
                Loading simulation view...
              </div>
            }>
              <SimulationView />
            </Suspense>
          )}
        </main>
      </ErrorBoundary>
      {!voxelOnly && <EventToastContainer />}
      {showFPS && <FPSCounter />}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      {!voxelOnly && showSaveLoad && <SaveLoadPanel onClose={() => setShowSaveLoad(false)} />}
      {!voxelOnly && showChecklist && (
        <ErrorBoundary>
          <AcceptanceChecklist onClose={() => setShowChecklist(false)} />
        </ErrorBoundary>
      )}
    </div>
  )
}

export default App
