import * as THREE from 'three'

export class SceneManager {
  constructor(container, skyColor) {
    this.container = container
    this.isDisposed = false

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(skyColor)

    this.camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      500
    )
    this.camera.rotation.order = 'YXZ'

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(container.clientWidth, container.clientHeight)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(this.renderer.domElement)

    window.addEventListener('resize', this.onResize)
  }

  get domElement() {
    return this.renderer.domElement
  }

  onResize = () => {
    if (this.isDisposed) return
    const width = this.container.clientWidth
    const height = Math.max(1, this.container.clientHeight)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  render() {
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    if (this.isDisposed) return
    this.isDisposed = true

    window.removeEventListener('resize', this.onResize)

    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
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
