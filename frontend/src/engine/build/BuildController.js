import { useGameStore } from '../../store/useGameStore'
import { BuildHistory } from './BuildHistory'
import { BuildRaycaster, roundCoord } from './BuildRaycaster'
import { BuildVisuals } from './BuildVisuals'
import { FreeCameraController } from './FreeCameraController'

const UPDATE_DEBOUNCE_MS = 200
const DRAG_THRESHOLD_PX = 6

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

    this.isFreeLookLocked = false
    this.cursorNdcX = 0
    this.cursorNdcY = 0
    this.hasCursorPosition = false
    this.verticalOffset = 0
    this.lastPlacement = null
    this.debounceTimerId = null
    this.openColorPickerCallback = null

    this.dragState = null

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

  setOpenColorPickerCallback(fn) {
    this.openColorPickerCallback = fn
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
    this.isFreeLookLocked = true
    this.dragState = null
    this.verticalOffset = 0

    const eyePos = this.localPlayer.getInterpolatedEyePosition(1.0)
    this.freeCamera.enter(
      eyePos,
      this.inputManager.yaw,
      this.inputManager.pitch,
      this.mapData.build.maxY
    )

    if (document.pointerLockElement !== this.canvasElement) {
      this.canvasElement.requestPointerLock?.()
    } else {
      store.setPointerLocked(true)
    }

    store.setBuildMode(true)
  }

  exitBuildMode() {
    const store = useGameStore.getState()
    if (!store.buildMode) return

    this.cancelDrag()
    this.clearPendingDebounce()
    this.clearFlyKeys()
    this.isFreeLookLocked = false
    this.verticalOffset = 0
    this.lastPlacement = null
    this.visuals.hideAll()

    if (store.screen === 'playing') {
      if (document.pointerLockElement !== this.canvasElement) {
        this.canvasElement.requestPointerLock?.()
      } else {
        store.setPointerLocked(true)
      }
    } else if (document.pointerLockElement === this.canvasElement) {
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

  toggleFreeLook() {
    if (!this.isActive) return
    if (document.pointerLockElement === this.canvasElement) {
      this.isFreeLookLocked = false
      document.exitPointerLock?.()
    } else {
      this.isFreeLookLocked = true
      this.canvasElement.requestPointerLock?.()
    }
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

  cancelDrag() {
    if (!this.dragState) return
    const wasMoved = this.dragState.hasMoved
    const initial = this.dragState.initialStructure
    this.dragState = null
    if (wasMoved) {
      this.structureManager.restoreAllPositions()
      if (initial) {
        const store = useGameStore.getState()
        if (store.selectedStructureId === initial.id) {
          store.setSelectedStructurePos({
            x: initial.x,
            y: initial.y,
            z: initial.z,
          })
        }
      }
    }
  }

  startDrag(button, structure, hit, clientX, clientY) {
    this.verticalOffset = 0
    this.dragState = {
      button,
      structureId: structure.id,
      initialStructure: { ...structure },
      hitY: hit.point.y,
      grabDistance: hit.distance,
      offsetX: structure.x - hit.point.x,
      offsetZ: structure.z - hit.point.z,
      startX: clientX,
      startY: clientY,
      movedDist: 0,
      startCamX: this.freeCamera.x,
      startCamY: this.freeCamera.y,
      startCamZ: this.freeCamera.z,
      hasMoved: false,
      targetPos: { x: structure.x, y: structure.y, z: structure.z },
    }
  }

  placeStructureAtNdc(ndc) {
    const store = useGameStore.getState()
    const placement = this.raycaster.computePlacement(
      this.sceneManager.camera,
      ndc.x,
      ndc.y,
      this.groundMesh,
      this.structureManager.getMeshes(),
      store.draftSize,
      this.mapData.build.grid,
      this.mapData.ground.y,
      this.verticalOffset
    )
    if (!placement) return
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

  samplePlayerInput() {
    return this.freeCamera.buildFrozenIdleInput()
  }

  getActiveNdc() {
    if (document.pointerLockElement === this.canvasElement) {
      return { x: 0, y: 0 }
    }
    return {
      x: this.hasCursorPosition ? this.cursorNdcX : 0,
      y: this.hasCursorPosition ? this.cursorNdcY : 0,
    }
  }

  updateFrame(dt) {
    if (!this.isActive) {
      this.visuals.hideAll()
      return
    }

    if (document.pointerLockElement !== this.canvasElement) {
      this.isFreeLookLocked = false
    }

    this.freeCamera.update(
      dt,
      this.flyKeys,
      this.mapData.bounds,
      this.mapData.build.maxY
    )
    this.freeCamera.applyToCamera(this.sceneManager.camera)

    const store = useGameStore.getState()
    const ndc = this.getActiveNdc()

    if (this.dragState && !this.dragState.hasMoved) {
      const camMoved = Math.hypot(
        this.freeCamera.x - this.dragState.startCamX,
        this.freeCamera.y - this.dragState.startCamY,
        this.freeCamera.z - this.dragState.startCamZ
      )
      if (camMoved > 0.05) {
        this.dragState.hasMoved = true
      }
    }

    const isDragging = Boolean(this.dragState && this.dragState.hasMoved)

    if (isDragging) {
      const excludedMesh = this.structureManager.getMeshById(
        this.dragState.structureId
      )
      const placementPos = this.raycaster.computePlacement(
        this.sceneManager.camera,
        ndc.x,
        ndc.y,
        this.groundMesh,
        this.structureManager.getMeshes(),
        store.draftSize,
        this.mapData.build.grid,
        this.mapData.ground.y,
        this.verticalOffset,
        excludedMesh
      )
      const dragPos =
        placementPos ||
        this.raycaster.computeDragPosition(
          this.sceneManager.camera,
          ndc.x,
          ndc.y,
          this.dragState,
          store.draftSize,
          this.mapData.build.grid,
          this.mapData.bounds,
          this.mapData.ground.y,
          this.mapData.build.maxY,
          this.verticalOffset
        )
      this.dragState.targetPos = dragPos
      this.structureManager.setTemporaryPosition(
        this.dragState.structureId,
        dragPos
      )
      store.setSelectedStructurePos(dragPos)

      this.visuals.updateGhost(
        dragPos,
        store.draftSize,
        store.draftColor,
         true
      )
      this.visuals.updateSelectionHighlight(
        {
          x: dragPos.x,
          y: dragPos.y,
          z: dragPos.z,
          width: store.draftSize.width,
          height: store.draftSize.height,
          depth: store.draftSize.depth,
        },
        true
      )
      return
    }

    this.lastPlacement = this.raycaster.computePlacement(
      this.sceneManager.camera,
      ndc.x,
      ndc.y,
      this.groundMesh,
      this.structureManager.getMeshes(),
      store.draftSize,
      this.mapData.build.grid,
      this.mapData.ground.y,
      this.verticalOffset
    )

    const showGhost =
      this.lastPlacement !== null && !store.selectedStructureId

    this.visuals.updateGhost(
      this.lastPlacement,
      store.draftSize,
      store.draftColor,
      showGhost
    )

    const selected = store.selectedStructureId
      ? this.structureManager.getById(store.selectedStructureId)
      : null
    this.visuals.updateSelectionHighlight(selected, Boolean(selected))
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
    this.structureManager.restoreAllPositions()
    const store = useGameStore.getState()
    if (store.selectedStructureId) {
      const authoritative = this.structureManager.getById(
        store.selectedStructureId
      )
      if (authoritative) {
        store.setSelectedStructure(authoritative)
      }
    }
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
    this.cancelDrag()
    this.clearPendingDebounce()
    this.history.undo()
  }

  redo() {
    this.cancelDrag()
    this.clearPendingDebounce()
    this.history.redo()
  }

  copyStructure(structure) {
    if (!structure) return
    this.cancelDrag()
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

    const ndc = this.getActiveNdc()
    const pickedId = this.raycaster.pickStructureId(
      this.sceneManager.camera,
      ndc.x,
      ndc.y,
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

    if (store.selectedStructureId) {
      this.scheduleSelectedUpdate(null, nextSize, store.draftColor)
    }
  }

  removeSelectedOrHoveredStructure() {
    this.cancelDrag()
    const store = useGameStore.getState()
    let targetId = store.selectedStructureId

    if (!targetId) {
      const ndc = this.getActiveNdc()
      targetId = this.raycaster.pickStructureId(
        this.sceneManager.camera,
        ndc.x,
        ndc.y,
        this.structureManager.getMeshes()
      )
    }

    if (!targetId) return

    const existing = this.structureManager.getById(targetId)
    this.clearPendingDebounce()
    if (store.selectedStructureId === targetId) {
      store.setSelectedStructure(null)
    }
    if (existing) {
      this.history.recordRemove(existing)
    }
    this.networkClient.sendBuildRemove(targetId)
  }

  removeSelectedStructure() {
    this.removeSelectedOrHoveredStructure()
  }

  nudgeSelectedStructure(dx, dy, dz) {
    const store = useGameStore.getState()
    if (!store.selectedStructureId) return
    const current = this.structureManager.getById(store.selectedStructureId)
    if (!current) return

    const basePos = this.pendingPositionOverride || {
      x: current.x,
      y: current.y,
      z: current.z,
    }
    const minBottomY = this.mapData.ground.y
    const halfH = store.draftSize.height * 0.5
    const nextPos = {
      x: roundCoord(basePos.x + dx),
      y: roundCoord(Math.max(minBottomY + halfH, basePos.y + dy)),
      z: roundCoord(basePos.z + dz),
    }
    this.pendingPositionOverride = nextPos
    this.structureManager.setTemporaryPosition(current.id, nextPos)
    store.setSelectedStructurePos(nextPos)
    this.scheduleSelectedUpdate(nextPos, store.draftSize, store.draftColor)
  }

  updateSelectedPositionField(axis, rawValue) {
    const parsed = Number(rawValue)
    if (!Number.isFinite(parsed)) return
    const store = useGameStore.getState()
    if (!store.selectedStructureId) return
    const current = this.structureManager.getById(store.selectedStructureId)
    if (!current) return

    const basePos = this.pendingPositionOverride || {
      x: current.x,
      y: current.y,
      z: current.z,
    }
    const nextPos = {
      ...basePos,
      [axis]: roundCoord(parsed),
    }
    this.pendingPositionOverride = nextPos
    this.structureManager.setTemporaryPosition(current.id, nextPos)
    store.setSelectedStructurePos(nextPos)
    this.scheduleSelectedUpdate(nextPos, store.draftSize, store.draftColor)
  }

  updateDraftDimension(field, rawValue) {
    const parsed = Number(rawValue)
    if (!Number.isFinite(parsed)) return
    const { minSize, maxSize } = this.mapData.build
    const clamped = roundCoord(Math.max(minSize, Math.min(maxSize, parsed)))

    const store = useGameStore.getState()
    const nextSize = { ...store.draftSize, [field]: clamped }
    store.setDraftSize({ [field]: clamped })

    if (store.selectedStructureId) {
      this.scheduleSelectedUpdate(null, nextSize, store.draftColor)
    }
  }

  updateDraftColor(nextColor) {
    if (typeof nextColor !== 'string') return
    const store = useGameStore.getState()
    store.setDraftColor(nextColor)

    if (store.selectedStructureId) {
      this.scheduleSelectedUpdate(null, store.draftSize, nextColor)
    }
  }

  scheduleSelectedUpdate(positionOverride, size, color) {
    this.clearPendingDebounce()
    if (positionOverride) {
      this.pendingPositionOverride = positionOverride
    }
    this.debounceTimerId = window.setTimeout(() => {
      this.debounceTimerId = null
      const store = useGameStore.getState()
      if (!store.buildMode || !store.selectedStructureId) return
      const current = this.structureManager.getById(store.selectedStructureId)
      if (!current) return

      const targetPos = this.pendingPositionOverride || {
        x: current.x,
        y: current.y,
        z: current.z,
      }
      this.pendingPositionOverride = null

      const updatedPayload = {
        id: current.id,
        kind: current.kind,
        x: targetPos.x,
        y: targetPos.y,
        z: targetPos.z,
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
    this.pendingPositionOverride = null
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

    if (document.pointerLockElement !== this.canvasElement) {
      this.updateCursorNdc(e.clientX, e.clientY)
    }
    const ndc = this.getActiveNdc()
    const store = useGameStore.getState()

    if (e.button === 0) {
      if (e.altKey) {
        const pickedId = this.raycaster.pickStructureId(
          this.sceneManager.camera,
          ndc.x,
          ndc.y,
          this.structureManager.getMeshes()
        )
        if (pickedId) {
          this.copyStructure(this.structureManager.getById(pickedId))
        }
        return
      }

      if (store.selectedStructureId) {
        const hit = this.raycaster.pickStructureHit(
          this.sceneManager.camera,
          ndc.x,
          ndc.y,
          this.structureManager.getMeshes()
        )
        if (hit && hit.structureId === store.selectedStructureId) {
          const selectedStructure = this.structureManager.getById(
            hit.structureId
          )
          if (selectedStructure) {
            this.clearPendingDebounce()
            this.startDrag(0, selectedStructure, hit, e.clientX, e.clientY)
            return
          }
        }
      }

      this.placeStructureAtNdc(ndc)
      return
    }

    if (e.button === 2) {
      e.preventDefault()
      this.cancelDrag()
      this.clearPendingDebounce()

      const hit = this.raycaster.pickStructureHit(
        this.sceneManager.camera,
        ndc.x,
        ndc.y,
        this.structureManager.getMeshes()
      )
      const pickedStructure = hit
        ? this.structureManager.getById(hit.structureId)
        : null

      if (pickedStructure) {
        store.setSelectedStructure(pickedStructure)
        this.startDrag(2, pickedStructure, hit, e.clientX, e.clientY)
      } else {
        store.setSelectedStructure(null)
        this.dragState = null
      }
    }
  }

  onMouseUp = (e) => {
    if (!this.dragState || e.button !== this.dragState.button) return

    const drag = this.dragState
    this.dragState = null
    this.verticalOffset = 0

    if (drag.hasMoved && drag.targetPos) {
      const initial = drag.initialStructure
      const store = useGameStore.getState()
      const posChanged =
        drag.targetPos.x !== initial.x ||
        drag.targetPos.y !== initial.y ||
        drag.targetPos.z !== initial.z

      if (posChanged) {
        const updatedPayload = {
          id: initial.id,
          kind: initial.kind,
          x: drag.targetPos.x,
          y: drag.targetPos.y,
          z: drag.targetPos.z,
          width: store.draftSize.width,
          height: store.draftSize.height,
          depth: store.draftSize.depth,
          color: store.draftColor,
        }
        store.setSelectedStructure(updatedPayload)
        this.history.recordUpdate(initial, updatedPayload)
        this.networkClient.sendBuildUpdate(updatedPayload)
      } else {
        this.structureManager.restoreAllPositions()
      }
    } else if (!drag.hasMoved && drag.button === 0) {
      this.placeStructureAtNdc(this.getActiveNdc())
    }
  }

  onMouseMove = (e) => {
    if (!this.isActive) return

    if (document.pointerLockElement === this.canvasElement) {
      this.freeCamera.applyLookDelta(e.movementX, e.movementY)
      this.freeCamera.applyToCamera(this.sceneManager.camera)
      if (this.dragState && !this.dragState.hasMoved) {
        this.dragState.movedDist += Math.hypot(
          e.movementX || 0,
          e.movementY || 0
        )
        if (this.dragState.movedDist >= DRAG_THRESHOLD_PX) {
          this.dragState.hasMoved = true
        }
      }
      return
    }

    this.updateCursorNdc(e.clientX, e.clientY)

    if (this.dragState && !this.dragState.hasMoved) {
      const dist = Math.hypot(
        e.clientX - this.dragState.startX,
        e.clientY - this.dragState.startY
      )
      if (dist >= DRAG_THRESHOLD_PX) {
        this.dragState.hasMoved = true
      }
    }
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
      this.cancelDrag()
      this.clearPendingDebounce()
      store.setSelectedStructure(null)
      return
    }

    if (isInputFocused) return

    if (e.code === 'KeyF') {
      e.preventDefault()
      this.toggleFreeLook()
      return
    }

    if (e.code === 'KeyX') {
      e.preventDefault()
      this.openColorPickerCallback?.()
      return
    }

    if (e.code in this.flyKeys) {
      if (e.code === 'Space') {
        e.preventDefault()
      }
      this.flyKeys[e.code] = true
      return
    }

    const grid = this.mapData.build.grid

    switch (e.code) {
      case 'Digit1':
        this.cancelDrag()
        this.verticalOffset = 0
        store.selectBuildKind('wall')
        break
      case 'Digit2':
        this.cancelDrag()
        this.verticalOffset = 0
        store.selectBuildKind('floor')
        break
      case 'Digit3':
        this.cancelDrag()
        this.verticalOffset = 0
        store.selectBuildKind('block')
        break
      case 'KeyQ':
      case 'Delete':
        e.preventDefault()
        this.removeSelectedOrHoveredStructure()
        break
      case 'KeyR':
        this.rotate90()
        break
      case 'KeyG':
        this.copyHoveredOrSelectedStructure()
        break
      case 'ArrowUp':
        if (store.selectedStructureId) {
          e.preventDefault()
          this.nudgeSelectedStructure(0, 0, -grid)
        }
        break
      case 'ArrowDown':
        if (store.selectedStructureId) {
          e.preventDefault()
          this.nudgeSelectedStructure(0, 0, grid)
        }
        break
      case 'ArrowLeft':
        if (store.selectedStructureId) {
          e.preventDefault()
          this.nudgeSelectedStructure(-grid, 0, 0)
        }
        break
      case 'ArrowRight':
        if (store.selectedStructureId) {
          e.preventDefault()
          this.nudgeSelectedStructure(grid, 0, 0)
        }
        break
      case 'PageUp':
        e.preventDefault()
        if (this.dragState) {
          this.verticalOffset = roundCoord(this.verticalOffset + grid)
        } else if (store.selectedStructureId) {
          this.nudgeSelectedStructure(0, grid, 0)
        } else {
          this.verticalOffset = roundCoord(this.verticalOffset + grid)
        }
        break
      case 'PageDown':
        e.preventDefault()
        if (this.dragState) {
          this.verticalOffset = roundCoord(this.verticalOffset - grid)
        } else if (store.selectedStructureId) {
          this.nudgeSelectedStructure(0, -grid, 0)
        } else {
          this.verticalOffset = roundCoord(this.verticalOffset - grid)
        }
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
    this.cancelDrag()
  }

  attachListeners() {
    window.addEventListener('contextmenu', this.onContextMenu)
    this.canvasElement.addEventListener('mousedown', this.onMouseDown)
    window.addEventListener('mouseup', this.onMouseUp)
    window.addEventListener('mousemove', this.onMouseMove)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onWindowBlur)
  }

  dispose() {
    this.cancelDrag()
    this.clearPendingDebounce()
    this.clearFlyKeys()
    this.history.clear()
    this.openColorPickerCallback = null
    if (document.pointerLockElement === this.canvasElement) {
      document.exitPointerLock?.()
    }
    window.removeEventListener('contextmenu', this.onContextMenu)
    this.canvasElement.removeEventListener('mousedown', this.onMouseDown)
    window.removeEventListener('mouseup', this.onMouseUp)
    window.removeEventListener('mousemove', this.onMouseMove)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onWindowBlur)
    this.visuals.dispose()
  }
}
