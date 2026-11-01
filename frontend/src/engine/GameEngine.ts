import * as THREE from 'three'
import { useGameStore } from '../store/useGameStore'
import type { MapData } from '../types/game'

const MOUSE_SENSITIVITY = 0.002
const MAX_PITCH = (89 * Math.PI) / 180

export class GameEngine {
  private container: HTMLElement
  private mapData: MapData
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private renderer: THREE.WebGLRenderer
  private animationFrameId: number | null = null
  private isDisposed = false

  private yaw = 0
  private pitch = 0

  constructor(container: HTMLElement, mapData: MapData) {
    this.container = container
    this.mapData = mapData

    // Initialize scene with sky color from map
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(mapData.sky.color)

    // First-person camera using YXZ order so yaw (Y) is applied before pitch (X)
    this.camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      500
    )
    this.camera.rotation.order = 'YXZ'

    const spawn = mapData.spawnPoints[0] ?? { x: 0, y: 0, z: 0, yaw: 0 }
    this.yaw = spawn.yaw
    this.pitch = 0
    this.camera.position.set(
      spawn.x,
      spawn.y + mapData.physics.player.eyeHeight,
      spawn.z
    )
    this.updateCameraOrientation()

    // Renderer setup
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(container.clientWidth, container.clientHeight)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(this.renderer.domElement)

    this.buildEnvironment()
    this.attachListeners()
    this.startLoop()
  }

  private buildEnvironment(): void {
    const { bounds, ground, boxes } = this.mapData

    // Ambient + directional light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65)
    this.scene.add(ambientLight)

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.85)
    dirLight.position.set(40, 80, 40)
    this.scene.add(dirLight)

    // Ground sized to bounds
    const width = bounds.maxX - bounds.minX
    const depth = bounds.maxZ - bounds.minZ
    const centerX = (bounds.minX + bounds.maxX) / 2
    const centerZ = (bounds.minZ + bounds.maxZ) / 2

    const groundGeom = new THREE.PlaneGeometry(width, depth)
    groundGeom.rotateX(-Math.PI / 2)
    const groundMat = new THREE.MeshLambertMaterial({ color: ground.color })
    const groundMesh = new THREE.Mesh(groundGeom, groundMat)
    groundMesh.position.set(centerX, ground.y, centerZ)
    this.scene.add(groundMesh)

    // Subtle grid on ground so movement and rotation are visually clear
    const grid = new THREE.GridHelper(
      Math.max(width, depth),
      Math.round(Math.max(width, depth) / 2),
      0x2e7d32,
      0x388e3c
    )
    grid.position.set(centerX, ground.y + 0.005, centerZ)
    this.scene.add(grid)

    // Render any static map boxes (center = x,y,z; sizes = width,height,depth)
    for (const box of boxes) {
      const boxGeom = new THREE.BoxGeometry(box.width, box.height, box.depth)
      const boxMat = new THREE.MeshLambertMaterial({
        color: box.color || '#8d6e63',
      })
      const boxMesh = new THREE.Mesh(boxGeom, boxMat)
      boxMesh.position.set(box.x, box.y, box.z)
      this.scene.add(boxMesh)
    }
  }

  private updateCameraOrientation(): void {
    this.camera.rotation.y = this.yaw
    this.camera.rotation.x = this.pitch
  }

  private onCanvasClick = (): void => {
    if (document.pointerLockElement !== this.renderer.domElement) {
      this.renderer.domElement.requestPointerLock?.()
    }
  }

  private onPointerLockChange = (): void => {
    const locked = document.pointerLockElement === this.renderer.domElement
    useGameStore.getState().setPointerLocked(locked)
  }

  private onMouseMove = (e: MouseEvent): void => {
    if (document.pointerLockElement !== this.renderer.domElement) return
    this.yaw -= e.movementX * MOUSE_SENSITIVITY
    this.pitch = Math.max(
      -MAX_PITCH,
      Math.min(MAX_PITCH, this.pitch - e.movementY * MOUSE_SENSITIVITY)
    )
    this.updateCameraOrientation()
  }

  private onResize = (): void => {
    if (this.isDisposed) return
    const w = this.container.clientWidth
    const h = Math.max(1, this.container.clientHeight)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  private attachListeners(): void {
    this.renderer.domElement.addEventListener('click', this.onCanvasClick)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)
    document.addEventListener('mousemove', this.onMouseMove)
    window.addEventListener('resize', this.onResize)
  }

  private startLoop(): void {
    const tick = () => {
      if (this.isDisposed) return
      this.animationFrameId = requestAnimationFrame(tick)
      this.renderer.render(this.scene, this.camera)
    }
    this.animationFrameId = requestAnimationFrame(tick)
  }

  public requestPointerLock(): void {
    if (document.pointerLockElement !== this.renderer.domElement) {
      this.renderer.domElement.requestPointerLock?.()
    }
  }

  public dispose(): void {
    if (this.isDisposed) return
    this.isDisposed = true

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }

    this.renderer.domElement.removeEventListener('click', this.onCanvasClick)
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
    document.removeEventListener('mousemove', this.onMouseMove)
    window.removeEventListener('resize', this.onResize)

    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock?.()
    }

    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose()
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose())
        } else {
          obj.material?.dispose()
        }
      }
    })

    this.renderer.dispose()
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement)
    }
  }
}
