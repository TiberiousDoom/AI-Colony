import * as THREE from 'three'
import type { WorldgenGrid } from '../world/worldgen-grid.ts'
import { WorldgenBlockType, isTransparent } from '../world/block-types.ts'
import { getBlockColor } from '../world/block-registry.ts'
import { BiomeType } from '../generation/generator-interface.ts'

export type VisualizationMode = 'natural' | 'heightmap' | 'biome' | 'cave' | 'ore' | 'spawn'

const MAX_INSTANCES = 300_000

// Biome colors for biome visualization mode
const BIOME_COLORS: Record<number, number> = {
  [BiomeType.Plains]:    0x7cfc00,
  [BiomeType.Forest]:    0x228b22,
  [BiomeType.Desert]:    0xedc967,
  [BiomeType.Tundra]:    0xf0f8ff,
  [BiomeType.Swamp]:     0x556b2f,
  [BiomeType.Mountains]: 0x808080,
  [BiomeType.Badlands]:  0xcd853f,
}

export class WorldgenRenderer {
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private instancedMeshes: Map<string, THREE.InstancedMesh> = new Map()
  private blockGeometry: THREE.BoxGeometry
  private gridHelper: THREE.GridHelper | null = null

  // Camera orbit state
  private orbitRadius = 100
  private orbitTheta = Math.PI / 4
  private orbitPhi = Math.PI / 3
  private orbitTarget = new THREE.Vector3()
  private isDragging = false
  private lastMouseX = 0
  private lastMouseY = 0
  private isRightDrag = false

  // Cross-section Y cutoff (-1 means disabled)
  private crossSectionY = -1

  private canvas: HTMLCanvasElement

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(0x1a1a2e)

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500)

    const ambient = new THREE.AmbientLight(0x404060, 1.5)
    this.scene.add(ambient)
    const sun = new THREE.DirectionalLight(0xffffff, 1.2)
    sun.position.set(80, 120, 60)
    this.scene.add(sun)

    this.blockGeometry = new THREE.BoxGeometry(1, 1, 1)

    this.updateCameraPosition()

    canvas.addEventListener('mousedown', this.onMouseDown)
    canvas.addEventListener('mousemove', this.onMouseMove)
    canvas.addEventListener('mouseup', this.onMouseUp)
    canvas.addEventListener('wheel', this.onWheel, { passive: false })
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  setCrossSectionY(y: number): void {
    this.crossSectionY = y
  }

  private updateCameraPosition(): void {
    const phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.orbitPhi))
    this.camera.position.set(
      this.orbitTarget.x + this.orbitRadius * Math.sin(phi) * Math.cos(this.orbitTheta),
      this.orbitTarget.y + this.orbitRadius * Math.cos(phi),
      this.orbitTarget.z + this.orbitRadius * Math.sin(phi) * Math.sin(this.orbitTheta),
    )
    this.camera.lookAt(this.orbitTarget)
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

    if (this.isRightDrag) {
      const right = new THREE.Vector3()
      const up = new THREE.Vector3()
      right.crossVectors(this.camera.up, new THREE.Vector3().subVectors(this.camera.position, this.orbitTarget)).normalize()
      up.copy(this.camera.up)
      const panSpeed = this.orbitRadius * 0.002
      this.orbitTarget.addScaledVector(right, dx * panSpeed)
      this.orbitTarget.addScaledVector(up, -dy * panSpeed)
    } else {
      this.orbitTheta -= dx * 0.005
      this.orbitPhi -= dy * 0.005
      this.orbitPhi = Math.max(0.1, Math.min(Math.PI - 0.1, this.orbitPhi))
    }
    this.updateCameraPosition()
  }

  private onMouseUp = (): void => {
    this.isDragging = false
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault()
    this.orbitRadius *= e.deltaY > 0 ? 1.1 : 0.9
    this.orbitRadius = Math.max(10, Math.min(300, this.orbitRadius))
    this.updateCameraPosition()
  }

  rebuildTerrain(
    grid: WorldgenGrid,
    mode: VisualizationMode = 'natural',
    biomeMap?: Uint8Array,
    heightMap?: Float32Array,
  ): void {
    // Remove old meshes
    for (const mesh of this.instancedMeshes.values()) {
      this.scene.remove(mesh)
      mesh.dispose()
    }
    this.instancedMeshes.clear()

    const { worldWidth, worldHeight, worldDepth } = grid
    const cutoffY = this.crossSectionY >= 0 ? this.crossSectionY : worldHeight

    if (mode === 'cave') {
      this.buildCaveView(grid, worldWidth, worldHeight, worldDepth, cutoffY, heightMap)
    } else {
      this.buildStandardView(grid, worldWidth, worldHeight, worldDepth, cutoffY, mode, biomeMap)
    }

    // Grid helper
    if (this.gridHelper) this.scene.remove(this.gridHelper)
    this.gridHelper = new THREE.GridHelper(worldWidth, 8, 0x333333, 0x333333)
    this.gridHelper.position.set(worldWidth / 2 - 0.5, -0.5, worldDepth / 2 - 0.5)
    this.scene.add(this.gridHelper)

    // Center camera
    this.orbitTarget.set(worldWidth / 2, worldHeight * 0.25, worldDepth / 2)
    this.updateCameraPosition()
  }

  private buildStandardView(
    grid: WorldgenGrid,
    worldWidth: number, worldHeight: number, worldDepth: number,
    cutoffY: number,
    mode: VisualizationMode,
    biomeMap?: Uint8Array,
  ): void {
    // Collect visible blocks
    const blocks: { x: number; y: number; z: number; type: number; biome: number }[] = []

    for (let x = 0; x < worldWidth; x++) {
      for (let y = 0; y < Math.min(cutoffY, worldHeight); y++) {
        for (let z = 0; z < worldDepth; z++) {
          const type = grid.getBlock({ x, y, z })
          if (type === WorldgenBlockType.Air) continue
          if (!this.isExposed(grid, x, y, z)) continue
          const biome = biomeMap ? biomeMap[x * worldDepth + z] : 0
          blocks.push({ x, y, z, type, biome })
        }
      }
    }

    if (blocks.length === 0) return

    const count = Math.min(blocks.length, MAX_INSTANCES)
    let material: THREE.MeshLambertMaterial

    if (mode === 'biome') {
      material = new THREE.MeshLambertMaterial({ color: 0xffffff })
    } else if (mode === 'heightmap') {
      material = new THREE.MeshLambertMaterial({ color: 0xffffff })
    } else {
      // Natural mode - we need per-instance color for different block types
      material = new THREE.MeshLambertMaterial({ color: 0xffffff })
    }

    const mesh = new THREE.InstancedMesh(this.blockGeometry, material, count)
    const colorAttr = new Float32Array(count * 3)
    const matrix = new THREE.Matrix4()
    const tmpColor = new THREE.Color()

    for (let i = 0; i < count; i++) {
      const b = blocks[i]
      matrix.setPosition(b.x, b.y, b.z)
      mesh.setMatrixAt(i, matrix)

      if (mode === 'biome') {
        const biomeColor = BIOME_COLORS[b.biome] ?? 0x888888
        tmpColor.set(biomeColor)
      } else if (mode === 'heightmap') {
        const t = b.y / worldHeight
        tmpColor.setRGB(t, t, t)
      } else {
        // Natural
        tmpColor.set(getBlockColor(b.type as WorldgenBlockType))
      }
      colorAttr[i * 3] = tmpColor.r
      colorAttr[i * 3 + 1] = tmpColor.g
      colorAttr[i * 3 + 2] = tmpColor.b
    }

    mesh.instanceColor = new THREE.InstancedBufferAttribute(colorAttr, 3)
    mesh.instanceMatrix.needsUpdate = true
    this.scene.add(mesh)
    this.instancedMeshes.set('main', mesh)
  }

  private buildCaveView(
    grid: WorldgenGrid,
    worldWidth: number, worldHeight: number, worldDepth: number,
    cutoffY: number,
    heightMap?: Float32Array,
  ): void {
    // Cave view: render terrain as very transparent, cave air as blue markers
    const terrainBlocks: { x: number; y: number; z: number }[] = []
    const caveBlocks: { x: number; y: number; z: number }[] = []

    for (let x = 0; x < worldWidth; x++) {
      for (let y = 0; y < Math.min(cutoffY, worldHeight); y++) {
        for (let z = 0; z < worldDepth; z++) {
          const type = grid.getBlock({ x, y, z })

          if (type === WorldgenBlockType.Air && y > 0) {
            // Check if this is underground air (cave)
            const surfaceY = heightMap
              ? heightMap[x * worldDepth + z]
              : worldHeight
            if (y < surfaceY - 1) {
              caveBlocks.push({ x, y, z })
            }
          } else if (type !== WorldgenBlockType.Air && this.isExposed(grid, x, y, z)) {
            terrainBlocks.push({ x, y, z })
          }
        }
      }
    }

    const matrix = new THREE.Matrix4()

    // Semi-transparent terrain
    if (terrainBlocks.length > 0) {
      const count = Math.min(terrainBlocks.length, MAX_INSTANCES)
      const material = new THREE.MeshLambertMaterial({
        color: 0x555555,
        transparent: true,
        opacity: 0.08,
        depthWrite: false,
      })
      const mesh = new THREE.InstancedMesh(this.blockGeometry, material, count)
      for (let i = 0; i < count; i++) {
        matrix.setPosition(terrainBlocks[i].x, terrainBlocks[i].y, terrainBlocks[i].z)
        mesh.setMatrixAt(i, matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
      this.scene.add(mesh)
      this.instancedMeshes.set('terrain-ghost', mesh)
    }

    // Cave air as bright blue markers
    if (caveBlocks.length > 0) {
      const count = Math.min(caveBlocks.length, MAX_INSTANCES)
      const material = new THREE.MeshBasicMaterial({
        color: 0x4488ff,
        transparent: true,
        opacity: 0.6,
      })
      const mesh = new THREE.InstancedMesh(this.blockGeometry, material, count)
      for (let i = 0; i < count; i++) {
        matrix.setPosition(caveBlocks[i].x, caveBlocks[i].y, caveBlocks[i].z)
        mesh.setMatrixAt(i, matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
      this.scene.add(mesh)
      this.instancedMeshes.set('caves', mesh)
    }
  }

  private isExposed(grid: WorldgenGrid, x: number, y: number, z: number): boolean {
    const dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]
    for (const [dx, dy, dz] of dirs) {
      const nx = x + dx, ny = y + dy, nz = z + dz
      if (!grid.isInBounds({ x: nx, y: ny, z: nz })) return true
      if (isTransparent(grid.getBlock({ x: nx, y: ny, z: nz }))) return true
    }
    return false
  }

  render(): void {
    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    this.blockGeometry.dispose()
    for (const mesh of this.instancedMeshes.values()) {
      this.scene.remove(mesh);
      (mesh.material as THREE.Material).dispose()
      mesh.dispose()
    }
    if (this.gridHelper) this.scene.remove(this.gridHelper)
    this.canvas.removeEventListener('mousedown', this.onMouseDown)
    this.canvas.removeEventListener('mousemove', this.onMouseMove)
    this.canvas.removeEventListener('mouseup', this.onMouseUp)
    this.canvas.removeEventListener('wheel', this.onWheel)
    this.renderer.dispose()
  }
}
