import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { LandingPage } from './views/LandingPage.tsx'
import App from './App.tsx'

function Root() {
  const [selectedApp, setSelectedApp] = useState<'colony' | 'voxel' | null>(null)

  if (!selectedApp) {
    return <LandingPage onSelect={setSelectedApp} />
  }

  if (selectedApp === 'colony') {
    return <App />
  }

  // Voxel SIM placeholder — will be replaced with actual app
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: '#0f172a',
      color: '#e2e8f0',
      gap: '1.5rem',
    }}>
      <span style={{ fontSize: '4rem' }}>🧊</span>
      <h1 style={{ fontSize: '2rem', fontWeight: 700 }}>Voxel SIM</h1>
      <p style={{ color: '#64748b', maxWidth: '400px', textAlign: 'center', lineHeight: 1.6 }}>
        Shovel Monster 3D is a Unity project. This launcher will be updated once the web version is available.
      </p>
      <button
        onClick={() => setSelectedApp(null)}
        style={{
          background: '#334155',
          border: '1px solid #475569',
          color: '#e2e8f0',
          padding: '0.6rem 1.5rem',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '0.9rem',
        }}
      >
        Back to Hub
      </button>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
