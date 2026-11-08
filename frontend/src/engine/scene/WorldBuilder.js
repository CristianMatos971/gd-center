import * as THREE from 'three'

export class WorldBuilder {
  static build(scene, mapData) {
    const { bounds, ground } = mapData

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65)
    scene.add(ambientLight)

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.85)
    dirLight.position.set(40, 80, 40)
    scene.add(dirLight)

    const width = bounds.maxX - bounds.minX
    const depth = bounds.maxZ - bounds.minZ
    const centerX = (bounds.minX + bounds.maxX) / 2
    const centerZ = (bounds.minZ + bounds.maxZ) / 2

    const groundGeom = new THREE.PlaneGeometry(width, depth)
    groundGeom.rotateX(-Math.PI / 2)
    const groundMat = new THREE.MeshLambertMaterial({ color: ground.color })
    const groundMesh = new THREE.Mesh(groundGeom, groundMat)
    groundMesh.position.set(centerX, ground.y, centerZ)
    scene.add(groundMesh)

    const grid = new THREE.GridHelper(
      Math.max(width, depth),
      Math.round(Math.max(width, depth) / 2),
      0x2e7d32,
      0x388e3c
    )
    grid.position.set(centerX, ground.y + 0.005, centerZ)
    scene.add(grid)

    return groundMesh
  }
}
