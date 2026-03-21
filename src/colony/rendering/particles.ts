/**
 * Simple particle effects system using PixiJS Graphics.
 * Fixed-size pool for efficient reuse.
 */

import { Container, Graphics } from 'pixi.js'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  color: number
  size: number
  active: boolean
}

export type ParticleType = 'chop_sparks' | 'forage_leaves' | 'mine_dust' | 'build_dust'

const PARTICLE_COLORS: Record<ParticleType, number> = {
  chop_sparks: 0xddcc44,
  forage_leaves: 0x66cc66,
  mine_dust: 0x999999,
  build_dust: 0x886644,
}

const POOL_SIZE = 128

export class ParticlePool {
  readonly container: Container
  private particles: Particle[]
  private graphics: Graphics

  constructor() {
    this.container = new Container()
    this.graphics = new Graphics()
    this.container.addChild(this.graphics)
    this.particles = Array.from({ length: POOL_SIZE }, () => ({
      x: 0, y: 0, vx: 0, vy: 0,
      life: 0, maxLife: 0, color: 0, size: 2, active: false,
    }))
  }

  /** Emit particles at a world position */
  emit(x: number, y: number, type: ParticleType, count = 6): void {
    const color = PARTICLE_COLORS[type]
    let emitted = 0
    for (const p of this.particles) {
      if (emitted >= count) break
      if (p.active) continue
      p.x = x
      p.y = y
      p.vx = (Math.random() - 0.5) * 2
      p.vy = -Math.random() * 1.5 - 0.5
      p.life = 400 + Math.random() * 200
      p.maxLife = p.life
      p.color = color
      p.size = 1.5 + Math.random() * 1.5
      p.active = true
      emitted++
    }
  }

  /** Update all active particles */
  update(deltaMs: number): void {
    this.graphics.clear()
    for (const p of this.particles) {
      if (!p.active) continue
      p.life -= deltaMs
      if (p.life <= 0) {
        p.active = false
        continue
      }
      p.x += p.vx * (deltaMs / 16)
      p.y += p.vy * (deltaMs / 16)
      p.vy += 0.03 * (deltaMs / 16) // gravity

      const alpha = p.life / p.maxLife
      this.graphics.circle(p.x, p.y, p.size * alpha).fill({ color: p.color, alpha })
    }
  }

  destroy(): void {
    this.container.destroy({ children: true })
  }
}
