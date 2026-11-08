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

  stepPrediction(inputManager) {
    this.seq += 1
    const stepInput = inputManager.sampleInput(this.seq)

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
      this.mapData.boxes
    )

    return stepInput
  }

  reconcile(serverEntry) {
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
        this.mapData.boxes
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

  updateCamera(camera, yaw, pitch, alpha) {
    const eyeHeight = this.mapData.physics.player.eyeHeight
    const interpX =
      this.prevState.x + (this.currState.x - this.prevState.x) * alpha
    const interpY =
      this.prevState.y + (this.currState.y - this.prevState.y) * alpha
    const interpZ =
      this.prevState.z + (this.currState.z - this.prevState.z) * alpha

    camera.position.set(interpX, interpY + eyeHeight, interpZ)
    camera.rotation.y = yaw
    camera.rotation.x = pitch
  }
}
