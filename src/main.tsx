import { StrictMode, useState, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { LandingPage } from './views/LandingPage.tsx'
import App from './App.tsx'

const VoxelApp = lazy(() => import('./views/VoxelApp.tsx'))
const WorldgenApp = lazy(() => import('./views/WorldgenApp.tsx'))

function Root() {
  const [selectedApp, setSelectedApp] = useState<'colony' | 'voxel' | 'worldgen' | null>(null)

  if (!selectedApp) {
    return <LandingPage onSelect={setSelectedApp} />
  }

  if (selectedApp === 'colony') {
    return <App />
  }

  const LoadingFallback = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0f172a', color: '#94a3b8' }}>
      Loading...
    </div>
  )

  if (selectedApp === 'worldgen') {
    return (
      <Suspense fallback={LoadingFallback}>
        <WorldgenApp onBack={() => setSelectedApp(null)} />
      </Suspense>
    )
  }

  return (
    <Suspense fallback={LoadingFallback}>
      <VoxelApp onBack={() => setSelectedApp(null)} />
    </Suspense>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
