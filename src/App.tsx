import { useState, useMemo, lazy, Suspense } from 'react'
import { TopBar } from './components/TopBar.tsx'
import { MetricsDashboard } from './views/MetricsDashboard.tsx'
import { AcceptanceChecklist } from './components/AcceptanceChecklist.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { useSimulationStore } from './store/simulation-store.ts'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.ts'
import './App.css'

const SimulationView = lazy(() => import('./views/SimulationView.tsx').then(m => ({ default: m.SimulationView })))
const ResultsSummary = lazy(() => import('./views/ResultsSummary.tsx').then(m => ({ default: m.ResultsSummary })))
const SetupScreen = lazy(() => import('./views/SetupScreen.tsx').then(m => ({ default: m.SetupScreen })))

function App() {
  const [showChecklist, setShowChecklist] = useState(false)
  const viewMode = useSimulationStore(s => s.viewMode)
  const showSetup = useSimulationStore(s => s.showSetup)

  const keyboardCallbacks = useMemo(() => ({
    onEscape: () => setShowChecklist(false),
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
      <TopBar onToggleChecklist={() => setShowChecklist(v => !v)} />
      <ErrorBoundary>
        <main className="app-main">
          {viewMode === 'metrics' ? (
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
      {showChecklist && (
        <ErrorBoundary>
          <AcceptanceChecklist onClose={() => setShowChecklist(false)} />
        </ErrorBoundary>
      )}
    </div>
  )
}

export default App
