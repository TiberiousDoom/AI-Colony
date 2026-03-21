import { useState } from 'react'

interface LandingPageProps {
  onSelect: (app: 'colony' | 'voxel') => void
}

const cards = [
  {
    id: 'colony' as const,
    title: 'AI Colony',
    subtitle: 'Village Simulation',
    description: 'Compete AI decision systems in a 2D village survival sim. Utility AI, Behavior Trees, GOAP, and Evolutionary AI battle across seasons, monsters, and resource scarcity.',
    icon: '🏘',
    accent: '#3b82f6',
    tags: ['PixiJS', '4 AI Systems', 'Competition Mode'],
  },
  {
    id: 'voxel' as const,
    title: 'Voxel Pathfinding',
    subtitle: 'Navigation Sandbox',
    description: '3D voxel pathfinding testbed. Five algorithms run side-by-side on dynamic terrain — blocks mined and placed in real time. R&D pipeline for Shovel Monster NPC navigation.',
    icon: '🧊',
    accent: '#10b981',
    tags: ['Three.js', '5 Algorithms', 'Dynamic Terrain'],
  },
] as const

export function LandingPage({ onSelect }: LandingPageProps) {
  const [hovered, setHovered] = useState<string | null>(null)

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      padding: '2rem',
      gap: '3rem',
    }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{
          fontSize: 'clamp(2rem, 5vw, 3.5rem)',
          fontWeight: 800,
          background: 'linear-gradient(135deg, #e2e8f0, #94a3b8)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: '0.5rem',
          letterSpacing: '-0.02em',
        }}>
          Simulation Hub
        </h1>
        <p style={{ color: '#64748b', fontSize: 'clamp(0.9rem, 2vw, 1.1rem)' }}>
          Choose a simulation to launch
        </p>
      </div>

      <div style={{
        display: 'flex',
        gap: '2rem',
        flexWrap: 'wrap',
        justifyContent: 'center',
        maxWidth: '900px',
        width: '100%',
      }}>
        {cards.map(card => {
          const isHovered = hovered === card.id

          return (
            <button
              key={card.id}
              onClick={() => onSelect(card.id)}
              onMouseEnter={() => setHovered(card.id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                flex: '1 1 340px',
                maxWidth: '420px',
                background: isHovered
                  ? `linear-gradient(135deg, ${card.accent}15, ${card.accent}08)`
                  : '#1e293b',
                border: `2px solid ${isHovered ? card.accent : '#334155'}`,
                borderRadius: '16px',
                padding: '2rem',
                cursor: 'pointer',
                textAlign: 'left',
                color: '#e2e8f0',
                transition: 'all 0.2s ease',
                transform: isHovered ? 'translateY(-4px)' : 'none',
                boxShadow: isHovered
                  ? `0 12px 40px ${card.accent}20`
                  : '0 4px 12px rgba(0,0,0,0.3)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>
                {card.icon}
              </div>

              <h2 style={{
                fontSize: '1.5rem',
                fontWeight: 700,
                marginBottom: '0.25rem',
                color: isHovered ? card.accent : '#f1f5f9',
                transition: 'color 0.2s ease',
              }}>
                {card.title}
              </h2>

              <p style={{
                fontSize: '0.85rem',
                color: card.accent,
                fontWeight: 600,
                marginBottom: '0.75rem',
                opacity: 0.8,
              }}>
                {card.subtitle}
              </p>

              <p style={{
                fontSize: '0.9rem',
                color: '#94a3b8',
                lineHeight: 1.6,
                marginBottom: '1.25rem',
              }}>
                {card.description}
              </p>

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {card.tags.map(tag => (
                  <span key={tag} style={{
                    fontSize: '0.75rem',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '6px',
                    background: `${card.accent}18`,
                    color: card.accent,
                    fontWeight: 500,
                    border: `1px solid ${card.accent}30`,
                  }}>
                    {tag}
                  </span>
                ))}
              </div>
            </button>
          )
        })}
      </div>

      <p style={{ color: '#475569', fontSize: '0.8rem' }}>
        Press a card to launch
      </p>
    </div>
  )
}
