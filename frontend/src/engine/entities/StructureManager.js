import * as THREE from 'three'

export class StructureManager {
  constructor(scene, onStructureRemoved) {
    this.scene = scene
    this.onStructureRemoved = onStructureRemoved
    this.structuresById = new Map()
    this.materialsByColor = new Map()
    this.unitBoxGeometry = new THREE.BoxGeometry(1, 1, 1)
    this.colliders = []
    this.meshes = []
  }

  getMaterial(color) {
    const normalized = String(color || '#cccccc').toLowerCase()
    let mat = this.materialsByColor.get(normalized)
    if (!mat) {
      mat = new THREE.MeshLambertMaterial({ color: normalized })
      this.materialsByColor.set(normalized, mat)
    }
    return mat
  }

  loadInitial(structures = []) {
    this.clearAllMeshes()
    for (const s of structures) {
      this.upsertInternal(s)
    }
    this.rebuildCaches()
  }

  applyUpdate({ added = [], updated = [], removedIds = [] }) {
    for (const id of removedIds) {
      this.removeInternal(id)
    }
    for (const s of added) {
      this.upsertInternal(s)
    }
    for (const s of updated) {
      this.upsertInternal(s)
    }
    this.rebuildCaches()
  }

  upsertInternal(s) {
    let entry = this.structuresById.get(s.id)
    const material = this.getMaterial(s.color)

    if (!entry) {
      const mesh = new THREE.Mesh(this.unitBoxGeometry, material)
      mesh.position.set(s.x, s.y, s.z)
      mesh.scale.set(s.width, s.height, s.depth)
      mesh.updateMatrixWorld()
      mesh.userData.structureId = s.id
      this.scene.add(mesh)
      entry = { data: { ...s }, mesh }
      this.structuresById.set(s.id, entry)
    } else {
      entry.data = { ...s }
      entry.mesh.material = material
      entry.mesh.position.set(s.x, s.y, s.z)
      entry.mesh.scale.set(s.width, s.height, s.depth)
      entry.mesh.updateMatrixWorld()
    }
  }

  removeInternal(id) {
    const entry = this.structuresById.get(id)
    if (!entry) return
    this.scene.remove(entry.mesh)
    this.structuresById.delete(id)
    this.onStructureRemoved?.(id)
  }

  rebuildCaches() {
    const nextColliders = []
    const nextMeshes = []
    for (const entry of this.structuresById.values()) {
      const d = entry.data
      nextColliders.push({
        x: d.x,
        y: d.y,
        z: d.z,
        width: d.width,
        height: d.height,
        depth: d.depth,
      })
      nextMeshes.push(entry.mesh)
    }
    this.colliders = nextColliders
    this.meshes = nextMeshes
  }

  getColliders() {
    return this.colliders
  }

  getMeshes() {
    return this.meshes
  }

  getById(id) {
    return this.structuresById.get(id)?.data || null
  }

  getMeshById(id) {
    return this.structuresById.get(id)?.mesh || null
  }

  setTemporaryPosition(id, pos) {
    const entry = this.structuresById.get(id)
    if (!entry || !pos) return
    entry.mesh.position.set(pos.x, pos.y, pos.z)
    entry.mesh.updateMatrixWorld()
  }

  restoreAllPositions() {
    for (const entry of this.structuresById.values()) {
      const d = entry.data
      entry.mesh.position.set(d.x, d.y, d.z)
      entry.mesh.updateMatrixWorld()
    }
  }

  clearAllMeshes() {
    for (const entry of this.structuresById.values()) {
      this.scene.remove(entry.mesh)
    }
    this.structuresById.clear()
    this.colliders = []
    this.meshes = []
  }

  dispose() {
    this.clearAllMeshes()
    this.unitBoxGeometry.dispose()
    for (const mat of this.materialsByColor.values()) {
      mat.dispose()
    }
    this.materialsByColor.clear()
  }
}
