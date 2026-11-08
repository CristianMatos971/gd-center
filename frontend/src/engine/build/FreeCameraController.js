const BASE_FLY_SPEED = 8
const FAST_FLY_MULTIPLIER = 3
const MIN_CAMERA_Y = 0.5
const MOUSE_SENSITIVITY = 0.002
const MAX_PITCH = (89 * Math.PI) / 180

export class FreeCameraController {
  constructor() {
    this.x = 0
    this.y = 1.6
    this.z = 0
    this.yaw = 0
    this.pitch = 0
    this.frozenPlayerYaw = 0
    this.frozenPlayerPitch = 0
  }

  enter(eyePosition, currentYaw, currentPitch, maxY) {
    this.frozenPlayerYaw = currentYaw
    this.frozenPlayerPitch = currentPitch
    this.x = eyePosition.x
    this.y = Math.max(MIN_CAMERA_Y, Math.min(maxY, eyePosition.y))
    this.z = eyePosition.z
    this.yaw = currentYaw
    this.pitch = currentPitch
  }

  applyLookDelta(movementX, movementY) {
    this.yaw -= movementX * MOUSE_SENSITIVITY
    this.pitch = Math.max(
      -MAX_PITCH,
      Math.min(MAX_PITCH, this.pitch - movementY * MOUSE_SENSITIVITY)
    )
  }

  update(dt, keys, bounds, maxY) {
    const forwardAxis = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0)
    const rightAxis = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0)
    const verticalAxis = (keys.Space ? 1 : 0) - (keys.KeyC ? 1 : 0)

    const sinYaw = Math.sin(this.yaw)
    const cosYaw = Math.cos(this.yaw)

    const forwardX = -sinYaw
    const forwardZ = -cosYaw
    const rightX = cosYaw
    const rightZ = -sinYaw

    let dirX = forwardAxis * forwardX + rightAxis * rightX
    let dirZ = forwardAxis * forwardZ + rightAxis * rightZ
    const horizLen = Math.hypot(dirX, dirZ)
    if (horizLen > 0) {
      dirX /= horizLen
      dirZ /= horizLen
    }

    const speed = keys.ShiftLeft
      ? BASE_FLY_SPEED * FAST_FLY_MULTIPLIER
      : BASE_FLY_SPEED

    this.x += dirX * speed * dt
    this.z += dirZ * speed * dt
    this.y += verticalAxis * speed * dt

    this.x = Math.max(bounds.minX, Math.min(bounds.maxX, this.x))
    this.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, this.z))
    this.y = Math.max(MIN_CAMERA_Y, Math.min(maxY, this.y))
  }

  applyToCamera(camera) {
    camera.position.set(this.x, this.y, this.z)
    camera.rotation.y = this.yaw
    camera.rotation.x = this.pitch
  }

  buildFrozenIdleInput() {
    return {
      forward: false,
      back: false,
      left: false,
      right: false,
      run: false,
      jump: false,
      yaw: this.frozenPlayerYaw,
      pitch: this.frozenPlayerPitch,
    }
  }
}
