import * as THREE from 'three'

const INTERPOLATION_DELAY_MS = 100
const MAX_SAMPLES_PER_PLAYER = 30

export function lerpAngle(a, b, t) {
  let diff = ((b - a + Math.PI) % (2 * Math.PI)) - Math.PI
  if (diff < -Math.PI) {
    diff += 2 * Math.PI
  }
  return a + diff * t
}

export class RemotePlayerManager {
  constructor(scene, playerDimensions) {
    this.scene = scene
    this.playerDimensions = playerDimensions
    this.remotePlayers = new Map()

    const { width, height, depth } = playerDimensions
    this.playerBoxGeometry = new THREE.BoxGeometry(width, height, depth)
    this.playerBoxMaterial = new THREE.MeshLambertMaterial({ color: 0xe53935 })
  }

  createNameSprite(name) {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 64
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.font = 'bold 28px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const textWidth = ctx.measureText(name).width
      const padX = 24
      const boxW = Math.min(250, textWidth + padX * 2)
      const boxX = (canvas.width - boxW) / 2
      ctx.fillStyle = 'rgba(15, 23, 42, 0.75)'
      ctx.beginPath()
      ctx.roundRect(boxX, 10, boxW, 44, 8)
      ctx.fill()

      ctx.fillStyle = '#f8fafc'
      ctx.fillText(name, canvas.width / 2, canvas.height / 2 + 1)
    }

    const texture = new THREE.CanvasTexture(canvas)
    texture.needsUpdate = true
    const material = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      transparent: true,
    })
    const sprite = new THREE.Sprite(material)
    sprite.scale.set(1.6, 0.4, 1)
    sprite.position.set(0, this.playerDimensions.height + 0.35, 0)
    return sprite
  }

  upsert(id, name, sample) {
    let entity = this.remotePlayers.get(id)
    if (!entity) {
      const group = new THREE.Group()

      const boxMesh = new THREE.Mesh(
        this.playerBoxGeometry,
        this.playerBoxMaterial
      )
      boxMesh.position.set(0, this.playerDimensions.height * 0.5, 0)
      group.add(boxMesh)

      const labelSprite = this.createNameSprite(name)
      group.add(labelSprite)

      group.position.set(sample.x, sample.y, sample.z)
      group.rotation.y = sample.yaw
      this.scene.add(group)

      entity = {
        id,
        name,
        group,
        boxMesh,
        labelSprite,
        samples: [sample],
      }
      this.remotePlayers.set(id, entity)
    } else {
      entity.samples.push(sample)
      if (entity.samples.length > MAX_SAMPLES_PER_PLAYER) {
        entity.samples.shift()
      }
    }
  }

  remove(id) {
    const entity = this.remotePlayers.get(id)
    if (!entity) return
    this.scene.remove(entity.group)
    const spriteMat = entity.labelSprite.material
    spriteMat.map?.dispose()
    spriteMat.dispose()
    this.remotePlayers.delete(id)
  }

  updateInterpolation(now) {
    const renderTime = now - INTERPOLATION_DELAY_MS

    for (const entity of this.remotePlayers.values()) {
      const samples = entity.samples
      if (samples.length === 0) continue

      while (samples.length >= 2 && samples[1].timestamp <= renderTime) {
        samples.shift()
      }

      if (samples.length === 1 || renderTime <= samples[0].timestamp) {
        const s = samples[0]
        entity.group.position.set(s.x, s.y, s.z)
        entity.group.rotation.y = s.yaw
      } else {
        const s0 = samples[0]
        const s1 = samples[1]
        if (renderTime >= s1.timestamp) {
          const last = samples[samples.length - 1]
          entity.group.position.set(last.x, last.y, last.z)
          entity.group.rotation.y = last.yaw
        } else {
          const span = s1.timestamp - s0.timestamp
          const t = span > 0 ? (renderTime - s0.timestamp) / span : 1.0
          entity.group.position.set(
            s0.x + (s1.x - s0.x) * t,
            s0.y + (s1.y - s0.y) * t,
            s0.z + (s1.z - s0.z) * t
          )
          entity.group.rotation.y = lerpAngle(s0.yaw, s1.yaw, t)
        }
      }
    }
  }

  dispose() {
    for (const id of Array.from(this.remotePlayers.keys())) {
      this.remove(id)
    }
    this.playerBoxGeometry.dispose()
    this.playerBoxMaterial.dispose()
  }
}
