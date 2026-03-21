import { describe, it, expect } from 'vitest'
import { Camera } from '../../src/colony/rendering/camera.ts'

describe('Camera', () => {
  function makeCamera() {
    return new Camera(64, 64, 16) // 64x64 world, 16px tiles
  }

  it('initializes centered on world', () => {
    const cam = makeCamera()
    expect(cam.x).toBe(512) // 64*16/2
    expect(cam.y).toBe(512)
    expect(cam.zoom).toBe(1.0)
  })

  it('screen-to-world at zoom 1.0', () => {
    const cam = makeCamera()
    // Center of 800x600 canvas => world center
    const center = cam.screenToWorld(400, 300, 800, 600)
    expect(center.x).toBeCloseTo(512)
    expect(center.y).toBeCloseTo(512)
  })

  it('screen-to-world at zoom 2.0', () => {
    const cam = makeCamera()
    cam.zoom = 2.0
    const center = cam.screenToWorld(400, 300, 800, 600)
    expect(center.x).toBeCloseTo(512)
    expect(center.y).toBeCloseTo(512)
  })

  it('world-to-screen round-trips correctly', () => {
    const cam = makeCamera()
    const w = cam.screenToWorld(100, 200, 800, 600)
    const s = cam.worldToScreen(w.x, w.y, 800, 600)
    expect(s.x).toBeCloseTo(100)
    expect(s.y).toBeCloseTo(200)
  })

  it('pan updates camera position', () => {
    const cam = makeCamera()
    const origX = cam.x
    cam.pan(100, 0)
    expect(cam.x).toBeLessThan(origX) // Panning right moves camera left
  })

  it('zoom at center maintains center point', () => {
    const cam = makeCamera()
    const before = cam.screenToWorld(400, 300, 800, 600)
    cam.zoomAt(400, 300, -100, 800, 600)
    const after = cam.screenToWorld(400, 300, 800, 600)
    expect(after.x).toBeCloseTo(before.x, 0)
    expect(after.y).toBeCloseTo(before.y, 0)
  })

  it('zoom respects min and max bounds', () => {
    const cam = makeCamera()
    cam.zoomAt(400, 300, 100000, 800, 600)
    expect(cam.zoom).toBeGreaterThanOrEqual(cam.minZoom)
    cam.zoomAt(400, 300, -100000, 800, 600)
    expect(cam.zoom).toBeLessThanOrEqual(cam.maxZoom)
  })

  it('clamp prevents camera from leaving world bounds', () => {
    const cam = makeCamera()
    cam.x = -1000
    cam.y = -1000
    cam.clamp(800, 600)
    expect(cam.x).toBeGreaterThanOrEqual(0)
    expect(cam.y).toBeGreaterThanOrEqual(0)
  })

  it('visible bounds calculation returns correct tile range', () => {
    const cam = makeCamera()
    cam.zoom = 1.0
    const bounds = cam.getVisibleBounds(800, 600)
    expect(bounds.minTileX).toBeGreaterThanOrEqual(0)
    expect(bounds.maxTileX).toBeLessThanOrEqual(63)
    expect(bounds.minTileY).toBeGreaterThanOrEqual(0)
    expect(bounds.maxTileY).toBeLessThanOrEqual(63)
  })

  it('visible bounds expand when zoomed out, shrink when zoomed in', () => {
    const cam = makeCamera()
    cam.zoom = 1.0
    const normal = cam.getVisibleBounds(800, 600)
    const normalRange = (normal.maxTileX - normal.minTileX) * (normal.maxTileY - normal.minTileY)

    cam.zoom = 0.5
    const zoomed = cam.getVisibleBounds(800, 600)
    const zoomedRange = (zoomed.maxTileX - zoomed.minTileX) * (zoomed.maxTileY - zoomed.minTileY)

    expect(zoomedRange).toBeGreaterThan(normalRange)
  })

  it('getTransform returns correct values', () => {
    const cam = makeCamera()
    const t = cam.getTransform(800, 600)
    expect(t.scale).toBe(1.0)
    expect(t.x).toBe(400 - 512) // canvasW/2 - camX * zoom
    expect(t.y).toBe(300 - 512)
  })

  it('centerOn sets camera to tile center', () => {
    const cam = makeCamera()
    cam.centerOn(10, 20)
    expect(cam.x).toBe(10.5 * 16)
    expect(cam.y).toBe(20.5 * 16)
  })
})
