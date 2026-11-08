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
    this.dragPoint = new THREE.Vector3()
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
    verticalOffset,
    excludedMesh = null
  ) {
    this.ndc.set(ndcX, ndcY)
    this.raycaster.setFromCamera(this.ndc, camera)

    const filteredMeshes = excludedMesh
      ? structureMeshes.filter((m) => m !== excludedMesh)
      : structureMeshes

    const targets = groundMesh
      ? [groundMesh, ...filteredMeshes]
      : filteredMeshes
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

  computeDragPosition(
    camera,
    ndcX,
    ndcY,
    dragState,
    draftSize,
    grid,
    bounds,
    groundY,
    maxY,
    verticalOffset
  ) {
    this.ndc.set(ndcX, ndcY)
    this.raycaster.setFromCamera(this.ndc, camera)
    const ray = this.raycaster.ray

    const maxReach = Math.max(dragState.grabDistance * 2.5, 25)
    let dist = Math.max(1, Math.min(80, dragState.grabDistance))

    if (ray.direction.y < -0.04) {
      const planeT = (dragState.hitY - ray.origin.y) / ray.direction.y
      if (planeT > 0.5) {
        dist = Math.min(planeT, maxReach)
      }
    }

    this.dragPoint.copy(ray.direction).multiplyScalar(dist).add(ray.origin)

    const rawX = snapToGrid(this.dragPoint.x + dragState.offsetX, grid)
    const rawZ = snapToGrid(this.dragPoint.z + dragState.offsetZ, grid)

    const halfW = draftSize.width * 0.5
    const halfH = draftSize.height * 0.5
    const halfD = draftSize.depth * 0.5

    const minX = bounds.minX + halfW
    const maxX = bounds.maxX - halfW
    const minZ = bounds.minZ + halfD
    const maxZ = bounds.maxZ - halfD

    const x = roundCoord(Math.max(minX, Math.min(maxX, rawX)))
    const z = roundCoord(Math.max(minZ, Math.min(maxZ, rawZ)))
    const y = roundCoord(
      Math.max(
        groundY + halfH,
        Math.min(maxY - halfH, dragState.initialStructure.y + verticalOffset)
      )
    )

    return { x, y, z }
  }

  pickStructureHit(camera, ndcX, ndcY, structureMeshes) {
    this.ndc.set(ndcX, ndcY)
    this.raycaster.setFromCamera(this.ndc, camera)
    const hits = this.raycaster.intersectObjects(structureMeshes, false)
    if (hits.length === 0) {
      return null
    }
    const hit = hits[0]
    const structureId = hit.object.userData?.structureId || null
    if (!structureId) {
      return null
    }
    return {
      structureId,
      point: hit.point.clone(),
      distance: hit.distance,
    }
  }

  pickStructureId(camera, ndcX, ndcY, structureMeshes) {
    const hit = this.pickStructureHit(camera, ndcX, ndcY, structureMeshes)
    return hit ? hit.structureId : null
  }
}
