import * as THREE from 'three'

export type CameraMode = 'orbit' | 'fly'

/**
 * Fly-through camera controller with WASD + mouse look.
 * Toggles between orbit mode (default) and free-fly mode.
 */
export class CameraController {
  private camera: THREE.PerspectiveCamera
  private mode: CameraMode = 'orbit'

  // Orbit state
  private orbitRadius = 100
  private orbitTheta = Math.PI / 4
  private orbitPhi = Math.PI / 3
  private orbitTarget = new THREE.Vector3()

  // Fly state
  private flyYaw = 0
  private flyPitch = 0
  private flySpeed = 0.5
  private keys = new Set<string>()

  // Shared input state
  private isDragging = false
  private lastMouseX = 0
  private lastMouseY = 0
  private isRightDrag = false
  private canvas: HTMLCanvasElement

  constructor(camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement) {
    this.camera = camera
    this.canvas = canvas

    canvas.addEventListener('mousedown', this.onMouseDown)
    canvas.addEventListener('mousemove', this.onMouseMove)
    canvas.addEventListener('mouseup', this.onMouseUp)
    canvas.addEventListener('wheel', this.onWheel, { passive: false })
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
  }

  setMode(mode: CameraMode): void {
    this.mode = mode
    if (mode === 'fly') {
      // Initialize fly from current camera position/rotation
      const dir = new THREE.Vector3()
      this.camera.getWorldDirection(dir)
      this.flyYaw = Math.atan2(dir.x, dir.z)
      this.flyPitch = Math.asin(dir.y)
    }
  }

  getMode(): CameraMode {
    return this.mode
  }

  setOrbitTarget(x: number, y: number, z: number): void {
    this.orbitTarget.set(x, y, z)
    if (this.mode === 'orbit') this.updateOrbit()
  }

  update(): void {
    if (this.mode === 'fly') {
      this.updateFly()
    }
  }

  private updateOrbit(): void {
    const phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.orbitPhi))
    this.camera.position.set(
      this.orbitTarget.x + this.orbitRadius * Math.sin(phi) * Math.cos(this.orbitTheta),
      this.orbitTarget.y + this.orbitRadius * Math.cos(phi),
      this.orbitTarget.z + this.orbitRadius * Math.sin(phi) * Math.sin(this.orbitTheta),
    )
    this.camera.lookAt(this.orbitTarget)
  }

  private updateFly(): void {
    const forward = new THREE.Vector3(
      Math.sin(this.flyYaw) * Math.cos(this.flyPitch),
      Math.sin(this.flyPitch),
      Math.cos(this.flyYaw) * Math.cos(this.flyPitch),
    )
    const right = new THREE.Vector3(
      Math.cos(this.flyYaw), 0, -Math.sin(this.flyYaw),
    )

    const speed = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? this.flySpeed * 3 : this.flySpeed

    if (this.keys.has('KeyW')) this.camera.position.addScaledVector(forward, speed)
    if (this.keys.has('KeyS')) this.camera.position.addScaledVector(forward, -speed)
    if (this.keys.has('KeyA')) this.camera.position.addScaledVector(right, -speed)
    if (this.keys.has('KeyD')) this.camera.position.addScaledVector(right, speed)
    if (this.keys.has('Space')) this.camera.position.y += speed
    if (this.keys.has('ControlLeft')) this.camera.position.y -= speed

    this.camera.lookAt(
      this.camera.position.x + forward.x,
      this.camera.position.y + forward.y,
      this.camera.position.z + forward.z,
    )
  }

  private onMouseDown = (e: MouseEvent): void => {
    this.isDragging = true
    this.isRightDrag = e.button === 2
    this.lastMouseX = e.clientX
    this.lastMouseY = e.clientY
  }

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.isDragging) return
    const dx = e.clientX - this.lastMouseX
    const dy = e.clientY - this.lastMouseY
    this.lastMouseX = e.clientX
    this.lastMouseY = e.clientY

    if (this.mode === 'fly') {
      this.flyYaw -= dx * 0.003
      this.flyPitch -= dy * 0.003
      this.flyPitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, this.flyPitch))
    } else if (this.isRightDrag) {
      const r = new THREE.Vector3()
      const up = new THREE.Vector3()
      r.crossVectors(this.camera.up, new THREE.Vector3().subVectors(this.camera.position, this.orbitTarget)).normalize()
      up.copy(this.camera.up)
      const panSpeed = this.orbitRadius * 0.002
      this.orbitTarget.addScaledVector(r, dx * panSpeed)
      this.orbitTarget.addScaledVector(up, -dy * panSpeed)
      this.updateOrbit()
    } else {
      this.orbitTheta -= dx * 0.005
      this.orbitPhi -= dy * 0.005
      this.orbitPhi = Math.max(0.1, Math.min(Math.PI - 0.1, this.orbitPhi))
      this.updateOrbit()
    }
  }

  private onMouseUp = (): void => {
    this.isDragging = false
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault()
    if (this.mode === 'orbit') {
      this.orbitRadius *= e.deltaY > 0 ? 1.1 : 0.9
      this.orbitRadius = Math.max(10, Math.min(300, this.orbitRadius))
      this.updateOrbit()
    } else {
      this.flySpeed *= e.deltaY > 0 ? 0.9 : 1.1
      this.flySpeed = Math.max(0.1, Math.min(5, this.flySpeed))
    }
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    this.keys.add(e.code)
  }

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code)
  }

  dispose(): void {
    this.canvas.removeEventListener('mousedown', this.onMouseDown)
    this.canvas.removeEventListener('mousemove', this.onMouseMove)
    this.canvas.removeEventListener('mouseup', this.onMouseUp)
    this.canvas.removeEventListener('wheel', this.onWheel)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
  }
}
