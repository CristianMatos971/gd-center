import * as THREE from 'three'

export function snapToGrid(value, grid) {
  if (!grid || grid <= 0) return value
  return Math.round(value / grid) * grid
}

export function roundCoord(value) {
  return Math.round(value * 10000) / 10000
}

export class BuildRaycaster {
  constructor() {
    this.raycaster = new THREE.Raycaster()
    this.ndc = new THREE.Vector2(0, 0)
    this.worldNormal = new THREE.Vector3()
  }

  computePlacement(
    camera,
    ndcX,
    ndcY,
    groundMesh,
    structureMeshes,
    draftSize,
    grid,
    groundY,
    verticalOffset
  ) {
    this.ndc.set(ndcX, ndcY)
    this.raycaster.setFromCamera(this.ndc, camera)

    const targets = groundMesh
      ? [groundMesh, ...structureMeshes]
      : structureMeshes
    const hits = this.raycaster.intersectObjects(targets, false)
    if (hits.length === 0) {
      return null
    }

    const hit = hits[0]
    const { width, height, depth } = draftSize

    if (hit.object === groundMesh || !hit.face) {
      const x = roundCoord(snapToGrid(hit.point.x, grid))
      const z = roundCoord(snapToGrid(hit.point.z, grid))
      const bottomY = Math.max(groundY, groundY + verticalOffset)
      const y = roundCoord(bottomY + height * 0.5)
      return { x, y, z }
    }

    this.worldNormal
      .copy(hit.face.normal)
      .transformDirection(hit.object.matrixWorld)
      .normalize()

    const nx = this.worldNormal.x
    const ny = this.worldNormal.y
    const nz = this.worldNormal.z

    let x
    let y
    let z

    if (ny > 0.5) {
      x = snapToGrid(hit.point.x, grid)
      z = snapToGrid(hit.point.z, grid)
      const bottomY = Math.max(groundY, hit.point.y + verticalOffset)
      y = bottomY + height * 0.5
    } else if (ny < -0.5) {
      x = snapToGrid(hit.point.x, grid)
      z = snapToGrid(hit.point.z, grid)
      const topY = hit.point.y + verticalOffset
      y = Math.max(groundY + height * 0.5, topY - height * 0.5)
    } else if (Math.abs(nx) > Math.abs(nz)) {
      const signX = nx >= 0 ? 1 : -1
      x = snapToGrid(hit.point.x + signX * (width * 0.5), grid)
      z = snapToGrid(hit.point.z, grid)
      const baseBottom = snapToGrid(hit.point.y - height * 0.5, grid)
      const bottomY = Math.max(groundY, baseBottom + verticalOffset)
      y = bottomY + height * 0.5
    } else {
      const signZ = nz >= 0 ? 1 : -1
      x = snapToGrid(hit.point.x, grid)
      z = snapToGrid(hit.point.z + signZ * (depth * 0.5), grid)
      const baseBottom = snapToGrid(hit.point.y - height * 0.5, grid)
      const bottomY = Math.max(groundY, baseBottom + verticalOffset)
      y = bottomY + height * 0.5
    }

    return {
      x: roundCoord(x),
      y: roundCoord(y),
      z: roundCoord(z),
    }
  }

  pickStructureId(camera, ndcX, ndcY, structureMeshes) {
    this.ndc.set(ndcX, ndcY)
    this.raycaster.setFromCamera(this.ndc, camera)
    const hits = this.raycaster.intersectObjects(structureMeshes, false)
    if (hits.length === 0) {
      return null
    }
    return hits[0].object.userData?.structureId || null
  }
}
