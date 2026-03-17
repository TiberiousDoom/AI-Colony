import * as THREE from 'three'
import type { VoxelGrid } from '../world/voxel-grid.ts'
import { BlockType, isSolidBlock, isClimbable, isStair } from '../world/block-types.ts'
import type { Agent } from '../agents/agent.ts'
import type { VoxelCoord } from '../pathfinding/types.ts'

// Block colors
const BLOCK_COLORS: Record<number, number> = {
  [BlockType.Solid]: 0x8b7355,  // brown earth
  [BlockType.Ladder]: 0xdaa520, // goldenrod
  [BlockType.Stair]: 0xa0522d,  // sienna
}

const AGENT_COLOR = 0x4488ff
const AGENT_SELECTED_COLOR = 0xff4444
const DEST_COLOR = 0x00ff88
const PATH_COLOR = 0xffff00
const GRID_COLOR = 0x333333

export class VoxelRenderer {
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private blockMeshes: Map<string, THREE.Mesh> = new Map()
  private agentMeshes: Map<number, THREE.Mesh> = new Map()
  private pathLines: THREE.Line[] = []
  private destMarkers: THREE.Mesh[] = []
  private gridHelper: THREE.GridHelper | null = null

  private blockGeometry: THREE.BoxGeometry
  private agentGeometry: THREE.BoxGeometry
  private destGeometry: THREE.SphereGeometry
  private blockMaterials: Map<number, THREE.MeshLambertMaterial> = new Map()
  private agentMaterial: THREE.MeshLambertMaterial
  private agentSelectedMaterial: THREE.MeshLambertMaterial
  private pathMaterial: THREE.LineBasicMaterial
  private destMaterial: THREE.MeshLambertMaterial

  private raycaster = new THREE.Raycaster()
  private worldSize: number = 32

  // Camera orbit state
  private orbitRadius = 40
  private orbitTheta = Math.PI / 4   // horizontal angle
  private orbitPhi = Math.PI / 3     // vertical angle (from top)
  private orbitTarget = new THREE.Vector3()
  private isDragging = false
  private lastMouseX = 0
  private lastMouseY = 0
  private isRightDrag = false

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.setClearColor(0x1a1a2e)

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200)

    // Lighting
    const ambient = new THREE.AmbientLight(0x404060, 1.5)
    this.scene.add(ambient)
    const sun = new THREE.DirectionalLight(0xffffff, 1.2)
    sun.position.set(30, 50, 20)
    this.scene.add(sun)

    // Shared geometries and materials
    this.blockGeometry = new THREE.BoxGeometry(1, 1, 1)
    this.agentGeometry = new THREE.BoxGeometry(0.6, 1.2, 0.6)
    this.destGeometry = new THREE.SphereGeometry(0.3, 8, 8)

    for (const [type, color] of Object.entries(BLOCK_COLORS)) {
      this.blockMaterials.set(Number(type), new THREE.MeshLambertMaterial({ color }))
    }
    this.agentMaterial = new THREE.MeshLambertMaterial({ color: AGENT_COLOR })
    this.agentSelectedMaterial = new THREE.MeshLambertMaterial({ color: AGENT_SELECTED_COLOR })
    this.pathMaterial = new THREE.LineBasicMaterial({ color: PATH_COLOR, linewidth: 2 })
    this.destMaterial = new THREE.MeshLambertMaterial({ color: DEST_COLOR })

    this.updateCameraPosition()

    // Event listeners
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
      // Pan
      const right = new THREE.Vector3()
      const up = new THREE.Vector3()
      this.camera.getWorldDirection(new THREE.Vector3())
      right.crossVectors(this.camera.up, new THREE.Vector3().subVectors(this.camera.position, this.orbitTarget)).normalize()
      up.copy(this.camera.up)
      const panSpeed = this.orbitRadius * 0.002
      this.orbitTarget.addScaledVector(right, dx * panSpeed)
      this.orbitTarget.addScaledVector(up, -dy * panSpeed)
    } else {
      // Orbit
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
    this.orbitRadius = Math.max(5, Math.min(100, this.orbitRadius))
    this.updateCameraPosition()
  }

  /** Raycast a click into the voxel world, returning the voxel coordinate hit */
  raycast(screenX: number, screenY: number, canvas: HTMLCanvasElement): { voxel: VoxelCoord; face: VoxelCoord } | null {
    const rect = canvas.getBoundingClientRect()
    const x = ((screenX - rect.left) / rect.width) * 2 - 1
    const y = -((screenY - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera)

    const meshes = Array.from(this.blockMeshes.values())
    const intersects = this.raycaster.intersectObjects(meshes)
    if (intersects.length === 0) return null

    const hit = intersects[0]
    const pos = hit.object.position
    const voxel: VoxelCoord = {
      x: Math.round(pos.x),
      y: Math.round(pos.y),
      z: Math.round(pos.z),
    }

    // Face normal gives us the adjacent empty voxel
    const normal = hit.face?.normal ?? new THREE.Vector3(0, 1, 0)
    const face: VoxelCoord = {
      x: voxel.x + Math.round(normal.x),
      y: voxel.y + Math.round(normal.y),
      z: voxel.z + Math.round(normal.z),
    }

    return { voxel, face }
  }

  /** Rebuild all block meshes from the grid. Call after terrain changes. */
  rebuildTerrain(grid: VoxelGrid): void {
    // Remove old meshes
    for (const mesh of this.blockMeshes.values()) {
      this.scene.remove(mesh)
    }
    this.blockMeshes.clear()

    this.worldSize = grid.worldSize

    // Only add visible blocks (those with at least one air neighbor)
    for (let x = 0; x < grid.worldSize; x++) {
      for (let y = 0; y < grid.worldSize; y++) {
        for (let z = 0; z < grid.worldSize; z++) {
          const type = grid.getBlock({ x, y, z })
          if (type === BlockType.Air) continue

          // Check if any face is exposed
          if (!this.isExposed(grid, x, y, z)) continue

          const material = this.blockMaterials.get(type) ?? this.blockMaterials.get(BlockType.Solid)!
          const mesh = new THREE.Mesh(this.blockGeometry, material)
          mesh.position.set(x, y, z)
          this.scene.add(mesh)
          this.blockMeshes.set(`${x},${y},${z}`, mesh)
        }
      }
    }

    // Grid helper on the floor
    if (this.gridHelper) this.scene.remove(this.gridHelper)
    this.gridHelper = new THREE.GridHelper(grid.worldSize, grid.worldSize, GRID_COLOR, GRID_COLOR)
    this.gridHelper.position.set(grid.worldSize / 2 - 0.5, -0.5, grid.worldSize / 2 - 0.5)
    this.scene.add(this.gridHelper)

    // Center orbit target
    this.orbitTarget.set(grid.worldSize / 2, grid.worldSize * 0.25, grid.worldSize / 2)
    this.updateCameraPosition()
  }

  private isExposed(grid: VoxelGrid, x: number, y: number, z: number): boolean {
    const dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]
    for (const [dx, dy, dz] of dirs) {
      const nx = x + dx, ny = y + dy, nz = z + dz
      if (!grid.isInBounds({ x: nx, y: ny, z: nz })) return true
      if (!isSolidBlock(grid.getBlock({ x: nx, y: ny, z: nz })) &&
          !isClimbable(grid.getBlock({ x: nx, y: ny, z: nz })) &&
          !isStair(grid.getBlock({ x: nx, y: ny, z: nz }))) {
        return true
      }
    }
    return false
  }

  /** Update agent visuals and path lines */
  updateAgents(agents: ReadonlyArray<Agent>, selectedId: number | null): void {
    // Remove stale agent meshes
    const activeIds = new Set(agents.map(a => a.id))
    for (const [id, mesh] of this.agentMeshes) {
      if (!activeIds.has(id)) {
        this.scene.remove(mesh)
        this.agentMeshes.delete(id)
      }
    }

    // Remove old path lines and dest markers
    for (const line of this.pathLines) this.scene.remove(line)
    this.pathLines = []
    for (const marker of this.destMarkers) this.scene.remove(marker)
    this.destMarkers = []

    for (const agent of agents) {
      // Agent mesh
      let mesh = this.agentMeshes.get(agent.id)
      if (!mesh) {
        mesh = new THREE.Mesh(this.agentGeometry,
          agent.id === selectedId ? this.agentSelectedMaterial : this.agentMaterial)
        this.scene.add(mesh)
        this.agentMeshes.set(agent.id, mesh)
      }
      mesh.material = agent.id === selectedId ? this.agentSelectedMaterial : this.agentMaterial
      mesh.position.set(agent.position.x, agent.position.y + 0.1, agent.position.z)

      // Path visualization
      if (agent.smoothedPath && agent.smoothedPath.length > 1) {
        const points = agent.smoothedPath.map(
          wp => new THREE.Vector3(wp.x, wp.y + 0.5, wp.z)
        )
        const geometry = new THREE.BufferGeometry().setFromPoints(points)
        const line = new THREE.Line(geometry, this.pathMaterial)
        this.scene.add(line)
        this.pathLines.push(line)
      }

      // Destination marker
      if (agent.destination) {
        const marker = new THREE.Mesh(this.destGeometry, this.destMaterial)
        marker.position.set(agent.destination.x, agent.destination.y + 0.5, agent.destination.z)
        this.scene.add(marker)
        this.destMarkers.push(marker)
      }
    }
  }

  render(): void {
    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    this.blockGeometry.dispose()
    this.agentGeometry.dispose()
    this.destGeometry.dispose()
    for (const mat of this.blockMaterials.values()) mat.dispose()
    this.agentMaterial.dispose()
    this.agentSelectedMaterial.dispose()
    this.pathMaterial.dispose()
    this.destMaterial.dispose()
    for (const mesh of this.blockMeshes.values()) this.scene.remove(mesh)
    for (const mesh of this.agentMeshes.values()) this.scene.remove(mesh)
    for (const line of this.pathLines) this.scene.remove(line)
    for (const marker of this.destMarkers) this.scene.remove(marker)
    if (this.gridHelper) this.scene.remove(this.gridHelper)
    this.renderer.dispose()
  }
}
