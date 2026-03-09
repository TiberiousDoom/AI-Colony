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

function App() {
  const [showChecklist, setShowChecklist] = useState(false)
  const viewMode = useSimulationStore(s => s.viewMode)

  const keyboardCallbacks = useMemo(() => ({
    onEscape: () => setShowChecklist(false),
  }), [])
  useKeyboardShortcuts(keyboardCallbacks)

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
