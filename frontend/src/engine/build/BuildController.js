import { useGameStore } from '../../store/useGameStore'
import { BuildHistory } from './BuildHistory'
import { BuildRaycaster, roundCoord } from './BuildRaycaster'
import { BuildVisuals } from './BuildVisuals'
import { FreeCameraController } from './FreeCameraController'

const UPDATE_DEBOUNCE_MS = 200

export class BuildController {
  constructor({
    canvasElement,
    sceneManager,
    groundMesh,
    structureManager,
    localPlayer,
    inputManager,
    networkClient,
    mapData,
  }) {
    this.canvasElement = canvasElement
    this.sceneManager = sceneManager
    this.groundMesh = groundMesh
    this.structureManager = structureManager
    this.localPlayer = localPlayer
    this.inputManager = inputManager
    this.networkClient = networkClient
    this.mapData = mapData

    this.freeCamera = new FreeCameraController()
    this.raycaster = new BuildRaycaster()
    this.visuals = new BuildVisuals(sceneManager.scene)
    this.history = new BuildHistory(networkClient, (historyState) => {
      useGameStore.getState().setHistoryState(historyState)
    })

    this.isRightMouseHeld = false
    this.cursorNdcX = 0
    this.cursorNdcY = 0
    this.hasCursorPosition = false
    this.verticalOffset = 0
    this.lastPlacement = null
    this.debounceTimerId = null

    this.flyKeys = {
      KeyW: false,
      KeyA: false,
      KeyS: false,
      KeyD: false,
      Space: false,
      KeyC: false,
      ShiftLeft: false,
    }

    this.attachListeners()
  }

  get isActive() {
    return useGameStore.getState().buildMode
  }

  toggleBuildMode() {
    if (this.isActive) {
      this.exitBuildMode()
    } else {
      this.enterBuildMode()
    }
  }

  enterBuildMode() {
    const store = useGameStore.getState()
    if (store.screen !== 'playing' || store.buildMode) return

    this.clearFlyKeys()
    this.inputManager.clearKeys()
    this.isRightMouseHeld = false
    this.verticalOffset = 0

    const eyePos = this.localPlayer.getInterpolatedEyePosition(1.0)
    this.freeCamera.enter(
      eyePos,
      this.inputManager.yaw,
      this.inputManager.pitch,
      this.mapData.build.maxY
    )

    if (document.pointerLockElement === this.canvasElement) {
      document.exitPointerLock?.()
    }

    store.setBuildMode(true)
  }

  exitBuildMode() {
    const store = useGameStore.getState()
    if (!store.buildMode) return

    this.clearPendingDebounce()
    this.clearFlyKeys()
    this.isRightMouseHeld = false
    this.verticalOffset = 0
    this.lastPlacement = null
    this.visuals.hideAll()

    if (document.pointerLockElement === this.canvasElement) {
      document.exitPointerLock?.()
    }

    this.inputManager.setLookAngles(
      this.freeCamera.frozenPlayerYaw,
      this.freeCamera.frozenPlayerPitch
    )
    this.localPlayer.updateCamera(
      this.sceneManager.camera,
      this.freeCamera.frozenPlayerYaw,
      this.freeCamera.frozenPlayerPitch,
      1.0
    )

    store.setBuildMode(false)
  }

  clearFlyKeys() {
    this.flyKeys.KeyW = false
    this.flyKeys.KeyA = false
    this.flyKeys.KeyS = false
    this.flyKeys.KeyD = false
    this.flyKeys.Space = false
    this.flyKeys.KeyC = false
    this.flyKeys.ShiftLeft = false
  }

  samplePlayerInput() {
    return this.freeCamera.buildFrozenIdleInput()
  }

  updateFrame(dt) {
    if (!this.isActive) {
      this.visuals.hideAll()
      return
    }

    this.freeCamera.update(
      dt,
      this.flyKeys,
      this.mapData.bounds,
      this.mapData.build.maxY
    )
    this.freeCamera.applyToCamera(this.sceneManager.camera)

    const store = useGameStore.getState()
    if (store.buildTool === 'place') {
      const ndcX = this.hasCursorPosition ? this.cursorNdcX : 0
      const ndcY = this.hasCursorPosition ? this.cursorNdcY : 0

      this.lastPlacement = this.raycaster.computePlacement(
        this.sceneManager.camera,
        ndcX,
        ndcY,
        this.groundMesh,
        this.structureManager.getMeshes(),
        store.draftSize,
        this.mapData.build.grid,
        this.mapData.ground.y,
        this.verticalOffset
      )
      this.visuals.updateGhost(
        this.lastPlacement,
        store.draftSize,
        store.draftColor,
        this.lastPlacement !== null
      )
      this.visuals.updateSelectionHighlight(null, false)
    } else {
      this.lastPlacement = null
      this.visuals.updateGhost(null, store.draftSize, store.draftColor, false)
      const selected = store.selectedStructureId
        ? this.structureManager.getById(store.selectedStructureId)
        : null
      this.visuals.updateSelectionHighlight(selected, Boolean(selected))
    }
  }

  handleStructuresUpdate(msg) {
    this.history.handleStructuresAdded(msg.added || [])

    const store = useGameStore.getState()
    if (store.selectedStructureId && Array.isArray(msg.updated)) {
      const updatedSelected = msg.updated.find(
        (s) => s.id === store.selectedStructureId
      )
      if (updatedSelected && this.debounceTimerId === null) {
        store.setSelectedStructure(updatedSelected)
      }
    }
  }

  handleBuildRejected() {
    this.history.handleRejected()
  }

  handleStructureRemoved(removedId) {
    const store = useGameStore.getState()
    if (store.selectedStructureId === removedId) {
      this.clearPendingDebounce()
      store.setSelectedStructure(null)
    }
  }

  undo() {
    this.clearPendingDebounce()
    this.history.undo()
  }

  redo() {
    this.clearPendingDebounce()
    this.history.redo()
  }

  copyStructure(structure) {
    if (!structure) return
    this.clearPendingDebounce()
    this.verticalOffset = 0
    useGameStore.getState().copyStructureToDraft(structure)
  }

  copyHoveredOrSelectedStructure() {
    const store = useGameStore.getState()
    if (store.selectedStructureId) {
      const selected = this.structureManager.getById(store.selectedStructureId)
      if (selected) {
        this.copyStructure(selected)
        return
      }
    }

    const ndcX = this.hasCursorPosition ? this.cursorNdcX : 0
    const ndcY = this.hasCursorPosition ? this.cursorNdcY : 0
    const pickedId = this.raycaster.pickStructureId(
      this.sceneManager.camera,
      ndcX,
      ndcY,
      this.structureManager.getMeshes()
    )
    if (pickedId) {
      this.copyStructure(this.structureManager.getById(pickedId))
    }
  }

  rotate90() {
    const store = useGameStore.getState()
    const { width, height, depth } = store.draftSize
    const nextSize = { width: depth, height, depth: width }
    store.setDraftSize(nextSize)

    if (store.buildTool === 'select' && store.selectedStructureId) {
      this.scheduleSelectedUpdate(nextSize, store.draftColor)
    }
  }

  removeSelectedStructure() {
    const store = useGameStore.getState()
    if (!store.selectedStructureId) return
    const id = store.selectedStructureId
    const existing = this.structureManager.getById(id)
    this.clearPendingDebounce()
    store.setSelectedStructure(null)
    if (existing) {
      this.history.recordRemove(existing)
    }
    this.networkClient.sendBuildRemove(id)
  }

  updateDraftDimension(field, rawValue) {
    const parsed = Number(rawValue)
    if (!Number.isFinite(parsed)) return
    const { minSize, maxSize } = this.mapData.build
    const clamped = roundCoord(Math.max(minSize, Math.min(maxSize, parsed)))

    const store = useGameStore.getState()
    const nextSize = { ...store.draftSize, [field]: clamped }
    store.setDraftSize({ [field]: clamped })

    if (store.buildTool === 'select' && store.selectedStructureId) {
      this.scheduleSelectedUpdate(nextSize, store.draftColor)
    }
  }

  updateDraftColor(nextColor) {
    if (typeof nextColor !== 'string') return
    const store = useGameStore.getState()
    store.setDraftColor(nextColor)

    if (store.buildTool === 'select' && store.selectedStructureId) {
      this.scheduleSelectedUpdate(store.draftSize, nextColor)
    }
  }

  scheduleSelectedUpdate(size, color) {
    this.clearPendingDebounce()
    this.debounceTimerId = window.setTimeout(() => {
      this.debounceTimerId = null
      const store = useGameStore.getState()
      if (!store.buildMode || !store.selectedStructureId) return
      const current = this.structureManager.getById(store.selectedStructureId)
      if (!current) return

      const updatedPayload = {
        id: current.id,
        kind: current.kind,
        x: current.x,
        y: current.y,
        z: current.z,
        width: size.width,
        height: size.height,
        depth: size.depth,
        color,
      }
      this.history.recordUpdate(current, updatedPayload)
      this.networkClient.sendBuildUpdate(updatedPayload)
    }, UPDATE_DEBOUNCE_MS)
  }

  clearPendingDebounce() {
    if (this.debounceTimerId !== null) {
      clearTimeout(this.debounceTimerId)
      this.debounceTimerId = null
    }
  }

  updateCursorNdc(clientX, clientY) {
    const rect = this.canvasElement.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    this.cursorNdcX = ((clientX - rect.left) / rect.width) * 2 - 1
    this.cursorNdcY = -((clientY - rect.top) / rect.height) * 2 + 1
    this.hasCursorPosition = true
  }

  onContextMenu = (e) => {
    if (this.isActive) {
      e.preventDefault()
    }
  }

  onMouseDown = (e) => {
    if (!this.isActive) return
    if (e.target !== this.canvasElement) return

    if (e.button === 2) {
      e.preventDefault()
      this.isRightMouseHeld = true
      if (document.pointerLockElement !== this.canvasElement) {
        this.canvasElement.requestPointerLock?.()
      }
      return
    }

    if (e.button === 0 && !this.isRightMouseHeld) {
      this.updateCursorNdc(e.clientX, e.clientY)

      if (e.altKey) {
        const pickedId = this.raycaster.pickStructureId(
          this.sceneManager.camera,
          this.cursorNdcX,
          this.cursorNdcY,
          this.structureManager.getMeshes()
        )
        if (pickedId) {
          this.copyStructure(this.structureManager.getById(pickedId))
        }
        return
      }

      const store = useGameStore.getState()

      if (store.buildTool === 'place') {
        const placement = this.raycaster.computePlacement(
          this.sceneManager.camera,
          this.cursorNdcX,
          this.cursorNdcY,
          this.groundMesh,
          this.structureManager.getMeshes(),
          store.draftSize,
          this.mapData.build.grid,
          this.mapData.ground.y,
          this.verticalOffset
        )
        if (placement) {
          const payload = {
            kind: store.selectedKind,
            x: placement.x,
            y: placement.y,
            z: placement.z,
            width: store.draftSize.width,
            height: store.draftSize.height,
            depth: store.draftSize.depth,
            color: store.draftColor,
          }
          this.history.recordPendingPlace(payload)
          this.networkClient.sendBuildPlace(payload)
        }
      } else {
        const pickedId = this.raycaster.pickStructureId(
          this.sceneManager.camera,
          this.cursorNdcX,
          this.cursorNdcY,
          this.structureManager.getMeshes()
        )
        const structure = pickedId
          ? this.structureManager.getById(pickedId)
          : null
        this.clearPendingDebounce()
        store.setSelectedStructure(structure)
      }
    }
  }

  onMouseUp = (e) => {
    if (e.button === 2 && this.isRightMouseHeld) {
      this.isRightMouseHeld = false
      if (document.pointerLockElement === this.canvasElement) {
        document.exitPointerLock?.()
      }
    }
  }

  onMouseMove = (e) => {
    if (!this.isActive) return

    if (
      this.isRightMouseHeld &&
      document.pointerLockElement === this.canvasElement
    ) {
      this.freeCamera.applyLookDelta(e.movementX, e.movementY)
      this.freeCamera.applyToCamera(this.sceneManager.camera)
      return
    }

    this.updateCursorNdc(e.clientX, e.clientY)
  }

  onKeyDown = (e) => {
    const store = useGameStore.getState()
    if (store.screen !== 'playing') return

    const activeTag = document.activeElement?.tagName
    const isInputFocused = activeTag === 'INPUT' || activeTag === 'TEXTAREA'

    if (e.code === 'KeyB' && !isInputFocused && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      this.toggleBuildMode()
      return
    }

    if (!store.buildMode) return

    if ((e.ctrlKey || e.metaKey) && !isInputFocused) {
      if (e.code === 'KeyZ') {
        e.preventDefault()
        if (e.shiftKey) {
          this.redo()
        } else {
          this.undo()
        }
        return
      }
      if (e.code === 'KeyY') {
        e.preventDefault()
        this.redo()
        return
      }
      if (e.code === 'KeyC') {
        e.preventDefault()
        this.copyHoveredOrSelectedStructure()
        return
      }
    }

    if (e.code === 'Escape') {
      if (isInputFocused) {
        document.activeElement.blur()
      }
      this.clearPendingDebounce()
      store.setSelectedStructure(null)
      return
    }

    if (isInputFocused) return

    if (e.code in this.flyKeys) {
      if (e.code === 'Space') {
        e.preventDefault()
      }
      this.flyKeys[e.code] = true
      return
    }

    switch (e.code) {
      case 'Digit1':
        this.verticalOffset = 0
        store.selectBuildKind('wall')
        break
      case 'Digit2':
        this.verticalOffset = 0
        store.selectBuildKind('floor')
        break
      case 'Digit3':
        this.verticalOffset = 0
        store.selectBuildKind('block')
        break
      case 'KeyQ':
        this.clearPendingDebounce()
        store.setBuildTool(store.buildTool === 'place' ? 'select' : 'place')
        break
      case 'KeyR':
        this.rotate90()
        break
      case 'KeyG':
        this.copyHoveredOrSelectedStructure()
        break
      case 'PageUp':
        e.preventDefault()
        this.verticalOffset = roundCoord(
          this.verticalOffset + this.mapData.build.grid
        )
        break
      case 'PageDown':
        e.preventDefault()
        this.verticalOffset = roundCoord(
          this.verticalOffset - this.mapData.build.grid
        )
        break
      case 'Delete':
        e.preventDefault()
        this.removeSelectedStructure()
        break
    }
  }

  onKeyUp = (e) => {
    if (e.code in this.flyKeys) {
      this.flyKeys[e.code] = false
    }
  }

  onWindowBlur = () => {
    this.clearFlyKeys()
    this.isRightMouseHeld = false
  }

  attachListeners() {
    this.canvasElement.addEventListener('contextmenu', this.onContextMenu)
    this.canvasElement.addEventListener('mousedown', this.onMouseDown)
    window.addEventListener('mouseup', this.onMouseUp)
    window.addEventListener('mousemove', this.onMouseMove)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onWindowBlur)
  }

  dispose() {
    this.clearPendingDebounce()
    this.clearFlyKeys()
    this.history.clear()
    this.isRightMouseHeld = false
    if (document.pointerLockElement === this.canvasElement) {
      document.exitPointerLock?.()
    }
    this.canvasElement.removeEventListener('contextmenu', this.onContextMenu)
    this.canvasElement.removeEventListener('mousedown', this.onMouseDown)
    window.removeEventListener('mouseup', this.onMouseUp)
    window.removeEventListener('mousemove', this.onMouseMove)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onWindowBlur)
    this.visuals.dispose()
  }
}
