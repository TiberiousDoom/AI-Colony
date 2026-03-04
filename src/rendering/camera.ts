/**
 * Camera: pan/zoom for a single village viewport.
 */

export class Camera {
  x: number
  y: number
  zoom: number
  readonly minZoom: number
  readonly maxZoom: number
  private readonly worldPixelW: number
  private readonly worldPixelH: number
  private readonly tileSize: number

  constructor(worldWidth: number, worldHeight: number, tileSize: number) {
    this.tileSize = tileSize
    this.worldPixelW = worldWidth * tileSize
    this.worldPixelH = worldHeight * tileSize
    // Center on world
    this.x = this.worldPixelW / 2
    this.y = this.worldPixelH / 2
    this.zoom = 1.0
    this.minZoom = 0.25
    this.maxZoom = 4.0
  }

  /** Convert screen coordinates to world pixel coordinates */
  screenToWorld(screenX: number, screenY: number, canvasWidth: number, canvasHeight: number): { x: number; y: number } {
    const wx = (screenX - canvasWidth / 2) / this.zoom + this.x
    const wy = (screenY - canvasHeight / 2) / this.zoom + this.y
    return { x: wx, y: wy }
  }

  /** Convert world pixel coordinates to screen coordinates */
  worldToScreen(worldX: number, worldY: number, canvasWidth: number, canvasHeight: number): { x: number; y: number } {
    const sx = (worldX - this.x) * this.zoom + canvasWidth / 2
    const sy = (worldY - this.y) * this.zoom + canvasHeight / 2
    return { x: sx, y: sy }
  }

  /** Pan by screen-space delta */
  pan(dx: number, dy: number): void {
    this.x -= dx / this.zoom
    this.y -= dy / this.zoom
  }

  /** Zoom toward a screen-space point */
  zoomAt(screenX: number, screenY: number, delta: number, canvasWidth: number, canvasHeight: number): void {
    const worldBefore = this.screenToWorld(screenX, screenY, canvasWidth, canvasHeight)
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * (1 - delta * 0.001)))
    const worldAfter = this.screenToWorld(screenX, screenY, canvasWidth, canvasHeight)
    // Adjust camera so the point under cursor stays fixed
    this.x += worldBefore.x - worldAfter.x
    this.y += worldBefore.y - worldAfter.y
  }

  /** Clamp camera to world bounds */
  clamp(canvasWidth: number, canvasHeight: number): void {
    const halfViewW = canvasWidth / (2 * this.zoom)
    const halfViewH = canvasHeight / (2 * this.zoom)
    this.x = Math.max(halfViewW, Math.min(this.worldPixelW - halfViewW, this.x))
    this.y = Math.max(halfViewH, Math.min(this.worldPixelH - halfViewH, this.y))
  }

  /** Center camera on a world tile position */
  centerOn(tileX: number, tileY: number): void {
    this.x = (tileX + 0.5) * this.tileSize
    this.y = (tileY + 0.5) * this.tileSize
  }

  /** Get the visible tile range for culling */
  getVisibleBounds(canvasWidth: number, canvasHeight: number): {
    minTileX: number; maxTileX: number; minTileY: number; maxTileY: number
  } {
    const halfW = canvasWidth / (2 * this.zoom)
    const halfH = canvasHeight / (2 * this.zoom)
    return {
      minTileX: Math.max(0, Math.floor((this.x - halfW) / this.tileSize)),
      maxTileX: Math.min(Math.ceil((this.x + halfW) / this.tileSize), this.worldPixelW / this.tileSize - 1),
      minTileY: Math.max(0, Math.floor((this.y - halfH) / this.tileSize)),
      maxTileY: Math.min(Math.ceil((this.y + halfH) / this.tileSize), this.worldPixelH / this.tileSize - 1),
    }
  }

  /** Get the container transform values for PixiJS */
  getTransform(canvasWidth: number, canvasHeight: number): { x: number; y: number; scale: number } {
    return {
      x: canvasWidth / 2 - this.x * this.zoom,
      y: canvasHeight / 2 - this.y * this.zoom,
      scale: this.zoom,
    }
  }
}
