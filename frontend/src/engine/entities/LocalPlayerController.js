import { stepMovement } from '../physics/movement'

const MAX_PENDING_INPUTS = 240

export class LocalPlayerController {
  constructor(mapData) {
    this.mapData = mapData
    this.seq = 0
    this.pendingInputs = []
    this.lastCorrectionDistance = 0

    this.prevState = { x: 0, y: 0, z: 0, vy: 0, onGround: true }
    this.currState = { x: 0, y: 0, z: 0, vy: 0, onGround: true }
  }

  get pendingInputCount() {
    return this.pendingInputs.length
  }

  setImmediateState(x, y, z, vy, onGround) {
    this.prevState = { x, y, z, vy, onGround }
    this.currState = { x, y, z, vy, onGround }
  }

  stepPrediction(rawSample, colliders) {
    this.seq += 1
    const stepInput = {
      ...rawSample,
      seq: this.seq,
    }

    this.pendingInputs.push(stepInput)
    if (this.pendingInputs.length > MAX_PENDING_INPUTS) {
      this.pendingInputs.shift()
    }

    this.prevState = { ...this.currState }
    this.currState = stepMovement(
      this.currState,
      stepInput,
      this.mapData.physics,
      this.mapData.ground,
      this.mapData.bounds,
      colliders
    )

    return stepInput
  }

  reconcile(serverEntry, colliders) {
    const beforeX = this.currState.x
    const beforeY = this.currState.y
    const beforeZ = this.currState.z

    this.pendingInputs = this.pendingInputs.filter(
      (inp) => inp.seq > serverEntry.seq
    )

    let reconciled = {
      x: serverEntry.x,
      y: serverEntry.y,
      z: serverEntry.z,
      vy: serverEntry.vy,
      onGround: serverEntry.onGround,
    }

    for (const pending of this.pendingInputs) {
      reconciled = stepMovement(
        reconciled,
        pending,
        this.mapData.physics,
        this.mapData.ground,
        this.mapData.bounds,
        colliders
      )
    }

    const dx = reconciled.x - beforeX
    const dy = reconciled.y - beforeY
    const dz = reconciled.z - beforeZ
    this.lastCorrectionDistance = Math.hypot(dx, dy, dz)

    this.currState = reconciled
    if (this.lastCorrectionDistance > 0.001) {
      this.prevState = { ...reconciled }
    }
  }

  getInterpolatedEyePosition(alpha) {
    const eyeHeight = this.mapData.physics.player.eyeHeight
    return {
      x: this.prevState.x + (this.currState.x - this.prevState.x) * alpha,
      y:
        this.prevState.y +
        (this.currState.y - this.prevState.y) * alpha +
        eyeHeight,
      z: this.prevState.z + (this.currState.z - this.prevState.z) * alpha,
    }
  }

  updateCamera(camera, yaw, pitch, alpha) {
    const pos = this.getInterpolatedEyePosition(alpha)
    camera.position.set(pos.x, pos.y, pos.z)
    camera.rotation.y = yaw
    camera.rotation.x = pitch
  }
}
