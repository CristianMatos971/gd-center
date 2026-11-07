import * as THREE from 'three'
import { useGameStore } from '../store/useGameStore'
import { stepMovement } from './movement'

const MOUSE_SENSITIVITY = 0.002
const MAX_PITCH = (89 * Math.PI) / 180
const INTERPOLATION_DELAY_MS = 100
const MAX_ACCUMULATOR_STEPS = 5
const PING_INTERVAL_MS = 1000
const FAKE_LATENCY_STEPS = [0, 100, 200]

export function lerpAngle(a, b, t) {
  let diff = ((b - a + Math.PI) % (2 * Math.PI)) - Math.PI
  if (diff < -Math.PI) {
    diff += 2 * Math.PI
  }
  return a + diff * t
}

export class GameEngine {
  constructor(container, mapData, playerName) {
    this.container = container
    this.mapData = mapData
    this.playerName = playerName
    this.ws = null
    this.animationFrameId = null
    this.pingTimerId = null
    this.activeTimeouts = new Set()
    this.isDisposed = false
    this.hasWelcomed = false

    this.yaw = 0
    this.pitch = 0

    this.prevState = {
      x: 0,
      y: 0,
      z: 0,
      vy: 0,
      onGround: true,
    }
    this.currState = {
      x: 0,
      y: 0,
      z: 0,
      vy: 0,
      onGround: true,
    }

    this.seq = 0
    this.accumulator = 0
    this.lastFrameTime = 0
    this.pendingInputs = []

    this.keys = {
      KeyW: false,
      KeyA: false,
      KeyS: false,
      KeyD: false,
      ShiftLeft: false,
      Space: false,
    }

    this.remotePlayers = new Map()

    this.fakeLatencyIndex = 0
    this.fakeLatencyMs = 0
    this.lastCorrectionDistance = 0
    this.latestServerTick = 0
    this.latestRtt = 0
    this.frameCount = 0
    this.fpsWindowStart = 0
    this.currentFps = 0
    this.lastInboundDeliverAt = 0
    this.lastOutboundDeliverAt = 0

    const { width, height, depth } = mapData.physics.player
    this.playerBoxGeometry = new THREE.BoxGeometry(width, height, depth)
    this.playerBoxMaterial = new THREE.MeshLambertMaterial({ color: 0xe53935 })

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(mapData.sky.color)

    this.camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      500
    )
    this.camera.rotation.order = 'YXZ'

    const defaultSpawn = mapData.spawnPoints[0] ?? { x: 0, y: 0, z: 0, yaw: 0 }
    this.setLocalStateImmediate(
      defaultSpawn.x,
      defaultSpawn.y,
      defaultSpawn.z,
      0,
      true,
      defaultSpawn.yaw,
      0
    )

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(container.clientWidth, container.clientHeight)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(this.renderer.domElement)

    this.buildEnvironment()
    this.attachListeners()
    this.connectWebSocket()
    this.startLoop()
  }

  setLocalStateImmediate(x, y, z, vy, onGround, yaw, pitch) {
    this.prevState = { x, y, z, vy, onGround }
    this.currState = { x, y, z, vy, onGround }
    this.yaw = yaw
    this.pitch = pitch
    this.updateCameraTransform(1.0)
  }

  buildEnvironment() {
    const { bounds, ground, boxes } = this.mapData

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65)
    this.scene.add(ambientLight)

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.85)
    dirLight.position.set(40, 80, 40)
    this.scene.add(dirLight)

    const width = bounds.maxX - bounds.minX
    const depth = bounds.maxZ - bounds.minZ
    const centerX = (bounds.minX + bounds.maxX) / 2
    const centerZ = (bounds.minZ + bounds.maxZ) / 2

    const groundGeom = new THREE.PlaneGeometry(width, depth)
    groundGeom.rotateX(-Math.PI / 2)
    const groundMat = new THREE.MeshLambertMaterial({ color: ground.color })
    const groundMesh = new THREE.Mesh(groundGeom, groundMat)
    groundMesh.position.set(centerX, ground.y, centerZ)
    this.scene.add(groundMesh)

    const grid = new THREE.GridHelper(
      Math.max(width, depth),
      Math.round(Math.max(width, depth) / 2),
      0x2e7d32,
      0x388e3c
    )
    grid.position.set(centerX, ground.y + 0.005, centerZ)
    this.scene.add(grid)

    for (const box of boxes) {
      const boxGeom = new THREE.BoxGeometry(box.width, box.height, box.depth)
      const boxMat = new THREE.MeshLambertMaterial({
        color: box.color || '#8d6e63',
      })
      const boxMesh = new THREE.Mesh(boxGeom, boxMat)
      boxMesh.position.set(box.x, box.y, box.z)
      this.scene.add(boxMesh)
    }
  }

  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws`
    const ws = new WebSocket(wsUrl)
    this.ws = ws

    ws.addEventListener('open', () => {
      if (this.isDisposed) {
        ws.close()
        return
      }
      this.sendWithOptionalDelay({ type: 'join', name: this.playerName })

      this.pingTimerId = window.setInterval(() => {
        if (!this.isDisposed && this.hasWelcomed) {
          this.sendWithOptionalDelay({ type: 'ping', t: performance.now() })
        }
      }, PING_INTERVAL_MS)
    })

    ws.addEventListener('message', (event) => {
      if (this.isDisposed) return
      const raw = String(event.data)
      let parsed
      try {
        parsed = JSON.parse(raw)
      } catch {
        return
      }

      const now = performance.now()
      const targetDeliverAt = Math.max(
        this.lastInboundDeliverAt,
        now + this.fakeLatencyMs
      )
      this.lastInboundDeliverAt = targetDeliverAt
      const waitMs = Math.max(0, targetDeliverAt - now)

      if (waitMs > 0) {
        const timerId = window.setTimeout(() => {
          this.activeTimeouts.delete(timerId)
          if (!this.isDisposed) {
            this.handleServerMessage(parsed)
          }
        }, waitMs)
        this.activeTimeouts.add(timerId)
      } else {
        this.handleServerMessage(parsed)
      }
    })

    ws.addEventListener('close', () => {
      if (this.isDisposed) return
      const store = useGameStore.getState()
      if (store.screen !== 'error') {
        store.resetToLogin('Conexão com o servidor foi perdida.')
      }
    })

    ws.addEventListener('error', () => {
      if (this.isDisposed) return
      const store = useGameStore.getState()
      if (!this.hasWelcomed && store.screen !== 'error') {
        store.resetToLogin(
          'Não foi possível conectar ao servidor WebSocket (/ws).'
        )
      }
    })
  }

  sendWithOptionalDelay(payload) {
    const serialized = JSON.stringify(payload)
    const now = performance.now()
    const targetDeliverAt = Math.max(
      this.lastOutboundDeliverAt,
      now + this.fakeLatencyMs
    )
    this.lastOutboundDeliverAt = targetDeliverAt
    const waitMs = Math.max(0, targetDeliverAt - now)

    if (waitMs > 0) {
      const timerId = window.setTimeout(() => {
        this.activeTimeouts.delete(timerId)
        if (!this.isDisposed && this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(serialized)
        }
      }, waitMs)
      this.activeTimeouts.add(timerId)
    } else if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(serialized)
    }
  }

  handleServerMessage(msg) {
    const store = useGameStore.getState()

    switch (msg.type) {
      case 'welcome':
        this.handleWelcome(msg)
        break

      case 'player_joined':
        store.upsertOnlinePlayer(msg.id, msg.name)
        if (msg.id !== store.playerId) {
          this.upsertRemotePlayer(msg.id, msg.name, {
            timestamp: performance.now(),
            x: msg.state.x,
            y: msg.state.y,
            z: msg.state.z,
            yaw: msg.state.yaw,
            pitch: msg.state.pitch,
          })
        }
        break

      case 'player_left':
        store.removeOnlinePlayer(msg.id)
        this.removeRemotePlayer(msg.id)
        break

      case 'snapshot':
        this.handleSnapshot(msg)
        break

      case 'pong':
        if (typeof msg.t === 'number') {
          this.latestRtt = Math.max(0, Math.round(performance.now() - msg.t))
        }
        break

      case 'error':
        store.resetToLogin(msg.message || 'Nome rejeitado pelo servidor.')
        break
    }
  }

  handleWelcome(msg) {
    this.hasWelcomed = true
    const store = useGameStore.getState()
    store.setPlayerId(msg.playerId)
    store.setConnectionStatus('connected')
    store.setScreen('playing')

    const playersMap = {}
    for (const p of msg.players) {
      playersMap[p.id] = p.name
      if (p.id !== msg.playerId) {
        this.upsertRemotePlayer(p.id, p.name, {
          timestamp: performance.now(),
          x: p.state.x,
          y: p.state.y,
          z: p.state.z,
          yaw: p.state.yaw,
          pitch: p.state.pitch,
        })
      }
    }
    store.setOnlinePlayers(playersMap)

    this.setLocalStateImmediate(
      msg.self.x,
      msg.self.y,
      msg.self.z,
      msg.self.vy,
      msg.self.onGround,
      msg.self.yaw,
      msg.self.pitch
    )
    this.lastFrameTime = performance.now()
    this.fpsWindowStart = this.lastFrameTime
  }

  handleSnapshot(snapshot) {
    this.latestServerTick = snapshot.tick
    const localId = useGameStore.getState().playerId
    const now = performance.now()

    for (const entry of snapshot.players) {
      if (entry.id === localId) {
        const beforeX = this.currState.x
        const beforeY = this.currState.y
        const beforeZ = this.currState.z

        this.pendingInputs = this.pendingInputs.filter(
          (inp) => inp.seq > entry.seq
        )

        let reconciled = {
          x: entry.x,
          y: entry.y,
          z: entry.z,
          vy: entry.vy,
          onGround: entry.onGround,
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
      } else {
        const knownName =
          useGameStore.getState().onlinePlayers[entry.id] || 'Jogador'
        this.upsertRemotePlayer(entry.id, knownName, {
          timestamp: now,
          x: entry.x,
          y: entry.y,
          z: entry.z,
          yaw: entry.yaw,
          pitch: entry.pitch,
        })
      }
    }
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
    sprite.position.set(0, this.mapData.physics.player.height + 0.35, 0)
    return sprite
  }

  upsertRemotePlayer(id, name, sample) {
    let entity = this.remotePlayers.get(id)
    if (!entity) {
      const group = new THREE.Group()

      const boxMesh = new THREE.Mesh(
        this.playerBoxGeometry,
        this.playerBoxMaterial
      )
      boxMesh.position.set(0, this.mapData.physics.player.height * 0.5, 0)
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
      if (entity.samples.length > 30) {
        entity.samples.shift()
      }
    }
  }

  removeRemotePlayer(id) {
    const entity = this.remotePlayers.get(id)
    if (!entity) return
    this.scene.remove(entity.group)
    const spriteMat = entity.labelSprite.material
    spriteMat.map?.dispose()
    spriteMat.dispose()
    this.remotePlayers.delete(id)
  }

  updateRemotePlayers(now) {
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

  startLoop() {
    const fixedDt = 1.0 / this.mapData.physics.tickRate

    const frame = (now) => {
      if (this.isDisposed) return
      this.animationFrameId = requestAnimationFrame(frame)

      if (this.lastFrameTime === 0) {
        this.lastFrameTime = now
        this.fpsWindowStart = now
      }

      const elapsedSec = Math.max(0, (now - this.lastFrameTime) / 1000)
      this.lastFrameTime = now

      if (this.hasWelcomed) {
        this.accumulator += elapsedSec
        if (this.accumulator > MAX_ACCUMULATOR_STEPS * fixedDt) {
          this.accumulator = MAX_ACCUMULATOR_STEPS * fixedDt
        }

        let steps = 0
        while (this.accumulator >= fixedDt && steps < MAX_ACCUMULATOR_STEPS) {
          this.runFixedPredictionStep()
          this.accumulator -= fixedDt
          steps++
        }

        const alpha = Math.max(0, Math.min(1, this.accumulator / fixedDt))
        this.updateCameraTransform(alpha)
        this.updateRemotePlayers(now)
      }

      this.renderer.render(this.scene, this.camera)

      this.frameCount++
      const fpsElapsed = now - this.fpsWindowStart
      if (fpsElapsed >= 500) {
        this.currentFps = Math.round((this.frameCount * 1000) / fpsElapsed)
        this.frameCount = 0
        this.fpsWindowStart = now

        useGameStore.getState().updateDebugStats({
          rtt: this.latestRtt,
          pendingInputs: this.pendingInputs.length,
          lastCorrectionDistance: this.lastCorrectionDistance,
          serverTick: this.latestServerTick,
          fps: this.currentFps,
          fakeLatencyMs: this.fakeLatencyMs,
        })
      }
    }

    this.animationFrameId = requestAnimationFrame(frame)
  }

  runFixedPredictionStep() {
    const locked = document.pointerLockElement === this.renderer.domElement

    this.seq += 1
    const stepInput = {
      seq: this.seq,
      forward: locked ? this.keys.KeyW : false,
      back: locked ? this.keys.KeyS : false,
      left: locked ? this.keys.KeyA : false,
      right: locked ? this.keys.KeyD : false,
      run: locked ? this.keys.ShiftLeft : false,
      jump: locked ? this.keys.Space : false,
      yaw: this.yaw,
      pitch: this.pitch,
    }

    this.pendingInputs.push(stepInput)
    if (this.pendingInputs.length > 240) {
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

    this.sendWithOptionalDelay({
      type: 'input',
      seq: stepInput.seq,
      forward: stepInput.forward,
      back: stepInput.back,
      left: stepInput.left,
      right: stepInput.right,
      run: stepInput.run,
      jump: stepInput.jump,
      yaw: stepInput.yaw,
      pitch: stepInput.pitch,
    })
  }

  updateCameraTransform(alpha) {
    const eyeHeight = this.mapData.physics.player.eyeHeight
    const interpX =
      this.prevState.x + (this.currState.x - this.prevState.x) * alpha
    const interpY =
      this.prevState.y + (this.currState.y - this.prevState.y) * alpha
    const interpZ =
      this.prevState.z + (this.currState.z - this.prevState.z) * alpha

    this.camera.position.set(interpX, interpY + eyeHeight, interpZ)
    this.camera.rotation.y = this.yaw
    this.camera.rotation.x = this.pitch
  }

  clearKeys() {
    this.keys.KeyW = false
    this.keys.KeyA = false
    this.keys.KeyS = false
    this.keys.KeyD = false
    this.keys.ShiftLeft = false
    this.keys.Space = false
  }

  onCanvasClick = () => {
    if (document.pointerLockElement !== this.renderer.domElement) {
      this.renderer.domElement.requestPointerLock?.()
    }
  }

  onPointerLockChange = () => {
    const locked = document.pointerLockElement === this.renderer.domElement
    if (!locked) {
      this.clearKeys()
    }
    useGameStore.getState().setPointerLocked(locked)
  }

  onMouseMove = (e) => {
    if (document.pointerLockElement !== this.renderer.domElement) return
    this.yaw -= e.movementX * MOUSE_SENSITIVITY
    this.pitch = Math.max(
      -MAX_PITCH,
      Math.min(MAX_PITCH, this.pitch - e.movementY * MOUSE_SENSITIVITY)
    )
    this.camera.rotation.y = this.yaw
    this.camera.rotation.x = this.pitch
  }

  onKeyDown = (e) => {
    if (e.code === 'F3') {
      e.preventDefault()
      useGameStore.getState().toggleDebugVisible()
      return
    }
    if (e.code === 'F4') {
      e.preventDefault()
      this.fakeLatencyIndex =
        (this.fakeLatencyIndex + 1) % FAKE_LATENCY_STEPS.length
      this.fakeLatencyMs = FAKE_LATENCY_STEPS[this.fakeLatencyIndex]
      useGameStore.getState().updateDebugStats({
        fakeLatencyMs: this.fakeLatencyMs,
      })
      return
    }

    if (document.pointerLockElement !== this.renderer.domElement) return

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
      this.accumulator = 0
      this.lastFrameTime = performance.now()
    } else {
      this.clearKeys()
    }
  }

  onWindowBlur = () => {
    this.clearKeys()
  }

  onResize = () => {
    if (this.isDisposed) return
    const w = this.container.clientWidth
    const h = Math.max(1, this.container.clientHeight)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  attachListeners() {
    this.renderer.domElement.addEventListener('click', this.onCanvasClick)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)
    document.addEventListener('mousemove', this.onMouseMove)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    document.addEventListener('visibilitychange', this.onVisibilityChange)
    window.addEventListener('blur', this.onWindowBlur)
    window.addEventListener('resize', this.onResize)
  }

  requestPointerLock() {
    if (document.pointerLockElement !== this.renderer.domElement) {
      this.renderer.domElement.requestPointerLock?.()
    }
  }

  dispose() {
    if (this.isDisposed) return
    this.isDisposed = true

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }

    if (this.pingTimerId !== null) {
      clearInterval(this.pingTimerId)
      this.pingTimerId = null
    }

    for (const timerId of this.activeTimeouts) {
      clearTimeout(timerId)
    }
    this.activeTimeouts.clear()

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    this.renderer.domElement.removeEventListener('click', this.onCanvasClick)
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
    document.removeEventListener('mousemove', this.onMouseMove)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    window.removeEventListener('blur', this.onWindowBlur)
    window.removeEventListener('resize', this.onResize)

    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock?.()
    }

    for (const id of Array.from(this.remotePlayers.keys())) {
      this.removeRemotePlayer(id)
    }

    this.playerBoxGeometry.dispose()
    this.playerBoxMaterial.dispose()

    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose()
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose())
        } else {
          obj.material?.dispose()
        }
      }
    })

    this.renderer.dispose()
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement)
    }
  }
}
