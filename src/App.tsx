import { useState } from 'react'
import { TopBar } from './components/TopBar.tsx'
import { MetricsDashboard } from './views/MetricsDashboard.tsx'
import { AcceptanceChecklist } from './components/AcceptanceChecklist.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import './App.css'

function App() {
  const [showChecklist, setShowChecklist] = useState(false)

  return (
    <div className="app">
      <TopBar onToggleChecklist={() => setShowChecklist(v => !v)} />
      <ErrorBoundary>
        <main className="app-main">
          <MetricsDashboard />
        </main>
      </ErrorBoundary>
      {showChecklist && (
        <AcceptanceChecklist onClose={() => setShowChecklist(false)} />
      )}
    </div>
  )
}

export default App
