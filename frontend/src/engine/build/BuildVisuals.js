import * as THREE from 'three'

const GHOST_OPACITY = 0.45
const HIGHLIGHT_SCALE_PADDING = 1.006

export class BuildVisuals {
  constructor(scene) {
    this.scene = scene

    this.ghostGeometry = new THREE.BoxGeometry(1, 1, 1)
    this.ghostMaterial = new THREE.MeshLambertMaterial({
      color: 0xcccccc,
      transparent: true,
      opacity: GHOST_OPACITY,
      depthWrite: false,
    })
    this.ghostMesh = new THREE.Mesh(this.ghostGeometry, this.ghostMaterial)
    this.ghostMesh.visible = false
    this.ghostMesh.renderOrder = 1
    this.scene.add(this.ghostMesh)

    const unitBox = new THREE.BoxGeometry(1, 1, 1)
    this.highlightEdgesGeometry = new THREE.EdgesGeometry(unitBox)
    unitBox.dispose()

    this.highlightMaterial = new THREE.LineBasicMaterial({
      color: 0xfacc15,
      depthTest: false,
      transparent: true,
      opacity: 0.95,
    })
    this.highlightLines = new THREE.LineSegments(
      this.highlightEdgesGeometry,
      this.highlightMaterial
    )
    this.highlightLines.visible = false
    this.highlightLines.renderOrder = 2
    this.scene.add(this.highlightLines)
  }

  updateGhost(placement, draftSize, draftColor, visible) {
    if (!visible || !placement) {
      this.ghostMesh.visible = false
      return
    }
    this.ghostMesh.visible = true
    this.ghostMaterial.color.set(draftColor || '#cccccc')
    this.ghostMesh.position.set(placement.x, placement.y, placement.z)
    this.ghostMesh.scale.set(
      draftSize.width,
      draftSize.height,
      draftSize.depth
    )
  }

  updateSelectionHighlight(structure, visible) {
    if (!visible || !structure) {
      this.highlightLines.visible = false
      return
    }
    this.highlightLines.visible = true
    this.highlightLines.position.set(structure.x, structure.y, structure.z)
    this.highlightLines.scale.set(
      structure.width * HIGHLIGHT_SCALE_PADDING,
      structure.height * HIGHLIGHT_SCALE_PADDING,
      structure.depth * HIGHLIGHT_SCALE_PADDING
    )
  }

  hideAll() {
    this.ghostMesh.visible = false
    this.highlightLines.visible = false
  }

  dispose() {
    this.scene.remove(this.ghostMesh)
    this.scene.remove(this.highlightLines)
    this.ghostGeometry.dispose()
    this.ghostMaterial.dispose()
    this.highlightEdgesGeometry.dispose()
    this.highlightMaterial.dispose()
  }
}
