import { useGameStore } from '../../store/useGameStore'

const MOUSE_SENSITIVITY = 0.002
const MAX_PITCH = (89 * Math.PI) / 180

export class InputManager {
  constructor(canvasElement, callbacks) {
    this.canvasElement = canvasElement
    this.callbacks = callbacks

    this.yaw = 0
    this.pitch = 0

    this.keys = {
      KeyW: false,
      KeyA: false,
      KeyS: false,
      KeyD: false,
      ShiftLeft: false,
      Space: false,
    }

    this.attachListeners()
  }

  get isPointerLocked() {
    return document.pointerLockElement === this.canvasElement
  }

  setLookAngles(yaw, pitch) {
    this.yaw = yaw
    this.pitch = pitch
  }

  sampleInput(seq) {
    const locked = this.isPointerLocked && !useGameStore.getState().buildMode
    return {
      seq,
      forward: locked ? this.keys.KeyW : false,
      back: locked ? this.keys.KeyS : false,
      left: locked ? this.keys.KeyA : false,
      right: locked ? this.keys.KeyD : false,
      run: locked ? this.keys.ShiftLeft : false,
      jump: locked ? this.keys.Space : false,
      yaw: this.yaw,
      pitch: this.pitch,
    }
  }

  clearKeys() {
    this.keys.KeyW = false
    this.keys.KeyA = false
    this.keys.KeyS = false
    this.keys.KeyD = false
    this.keys.ShiftLeft = false
    this.keys.Space = false
  }

  requestPointerLock() {
    if (useGameStore.getState().buildMode) return
    if (!this.isPointerLocked) {
      this.canvasElement.requestPointerLock?.()
    }
  }

  onCanvasClick = () => {
    if (useGameStore.getState().buildMode) return
    this.requestPointerLock()
  }

  onPointerLockChange = () => {
    const locked = this.isPointerLocked
    if (!locked) {
      this.clearKeys()
    }
    this.callbacks.onPointerLockChange?.(locked)
  }

  onMouseMove = (e) => {
    if (useGameStore.getState().buildMode) return
    if (!this.isPointerLocked) return
    this.yaw -= e.movementX * MOUSE_SENSITIVITY
    this.pitch = Math.max(
      -MAX_PITCH,
      Math.min(MAX_PITCH, this.pitch - e.movementY * MOUSE_SENSITIVITY)
    )
    this.callbacks.onLookChange?.(this.yaw, this.pitch)
  }

  onKeyDown = (e) => {
    if (e.code === 'F3') {
      e.preventDefault()
      this.callbacks.onToggleDebug?.()
      return
    }
    if (e.code === 'F4') {
      e.preventDefault()
      this.callbacks.onCycleFakeLatency?.()
      return
    }

    if (useGameStore.getState().buildMode) return
    if (!this.isPointerLocked) return

    if (e.code in this.keys) {
      if (e.code === 'Space') {
        e.preventDefault()
      }
      this.keys[e.code] = true
    }
  }

  onKeyUp = (e) => {
    if (e.code in this.keys) {
      this.keys[e.code] = false
    }
  }

  onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      this.callbacks.onTabVisible?.()
    } else {
      this.clearKeys()
    }
  }

  onWindowBlur = () => {
    this.clearKeys()
  }

  attachListeners() {
    this.canvasElement.addEventListener('click', this.onCanvasClick)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)
    document.addEventListener('mousemove', this.onMouseMove)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    document.addEventListener('visibilitychange', this.onVisibilityChange)
    window.addEventListener('blur', this.onWindowBlur)
  }

  dispose() {
    this.canvasElement.removeEventListener('click', this.onCanvasClick)
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
    document.removeEventListener('mousemove', this.onMouseMove)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    window.removeEventListener('blur', this.onWindowBlur)

    if (this.isPointerLocked) {
      document.exitPointerLock?.()
    }
  }
}
