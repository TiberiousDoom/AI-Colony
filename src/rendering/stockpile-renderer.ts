/**
 * StockpileRenderer: visual indicator of resource levels near the campfire.
 */

import { Container, Graphics } from 'pixi.js'
import type { VillageStockpile, Position } from '../simulation/villager.ts'

export class StockpileRenderer {
  readonly container: Container
  private graphics: Graphics
  private tileSize: number

  constructor(tileSize: number) {
    this.tileSize = tileSize
    this.container = new Container()
    this.graphics = new Graphics()
    this.container.addChild(this.graphics)
  }

  /** Update stockpile visual near campfire */
  update(stockpile: Readonly<VillageStockpile>, campfirePosition: Position, stockpileCap: number): void {
    this.graphics.clear()

    const baseX = (campfirePosition.x + 1.5) * this.tileSize
    const baseY = (campfirePosition.y + 0.5) * this.tileSize
    const barWidth = this.tileSize * 0.6
    const barHeight = 3
    const gap = 5

    const cap = Math.max(stockpileCap, 1)

    // Food bar (green)
    const foodRatio = Math.min(1, stockpile.food / cap)
    this.graphics.rect(baseX, baseY, barWidth, barHeight).fill(0x333333)
    this.graphics.rect(baseX, baseY, barWidth * foodRatio, barHeight).fill(0x44aa44)

    // Wood bar (brown)
    const woodRatio = Math.min(1, stockpile.wood / cap)
    this.graphics.rect(baseX, baseY + gap, barWidth, barHeight).fill(0x333333)
    this.graphics.rect(baseX, baseY + gap, barWidth * woodRatio, barHeight).fill(0x8b4513)

    // Stone bar (gray)
    const stoneRatio = Math.min(1, stockpile.stone / cap)
    this.graphics.rect(baseX, baseY + gap * 2, barWidth, barHeight).fill(0x333333)
    this.graphics.rect(baseX, baseY + gap * 2, barWidth * stoneRatio, barHeight).fill(0x888888)
  }

  destroy(): void {
    this.container.destroy({ children: true })
  }
}
