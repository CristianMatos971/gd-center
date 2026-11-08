import { useGameStore } from '../store/useGameStore'
import { LocalPlayerController } from './entities/LocalPlayerController'
import { RemotePlayerManager } from './entities/RemotePlayerManager'
import { InputManager } from './input/InputManager'
import { NetworkClient } from './network/NetworkClient'
import { SceneManager } from './scene/SceneManager'
import { WorldBuilder } from './scene/WorldBuilder'

const MAX_ACCUMULATOR_STEPS = 5

export class GameEngine {
  constructor(container, mapData, playerName) {
    this.mapData = mapData
    this.isDisposed = false
    this.animationFrameId = null

    this.accumulator = 0
    this.lastFrameTime = 0
    this.latestServerTick = 0
    this.frameCount = 0
    this.fpsWindowStart = 0
    this.currentFps = 0

    this.sceneManager = new SceneManager(container, mapData.sky.color)
    WorldBuilder.build(this.sceneManager.scene, mapData)

    this.localPlayer = new LocalPlayerController(mapData)
    this.remotePlayers = new RemotePlayerManager(
      this.sceneManager.scene,
      mapData.physics.player
    )

    this.inputManager = new InputManager(this.sceneManager.domElement, {
      onPointerLockChange: (locked) => {
        useGameStore.getState().setPointerLocked(locked)
      },
      onLookChange: (yaw, pitch) => {
        this.sceneManager.camera.rotation.y = yaw
        this.sceneManager.camera.rotation.x = pitch
      },
      onToggleDebug: () => {
        useGameStore.getState().toggleDebugVisible()
      },
      onCycleFakeLatency: () => {
        const fakeLatencyMs = this.networkClient.cycleFakeLatency()
        useGameStore.getState().updateDebugStats({ fakeLatencyMs })
      },
      onTabVisible: () => {
        this.accumulator = 0
        this.lastFrameTime = performance.now()
      },
    })

    const defaultSpawn = mapData.spawnPoints[0] ?? { x: 0, y: 0, z: 0, yaw: 0 }
    this.applyImmediateTransform(
      defaultSpawn.x,
      defaultSpawn.y,
      defaultSpawn.z,
      0,
      true,
      defaultSpawn.yaw,
      0
    )

    this.networkClient = new NetworkClient(playerName, {
      onWelcome: (msg) => this.handleWelcome(msg),
      onPlayerJoined: (msg) => this.handlePlayerJoined(msg),
      onPlayerLeft: (msg) => this.handlePlayerLeft(msg),
      onSnapshot: (msg) => this.handleSnapshot(msg),
      onServerError: (message) => {
        useGameStore
          .getState()
          .resetToLogin(message || 'Nome rejeitado pelo servidor.')
      },
      onClose: () => {
        const store = useGameStore.getState()
        if (store.screen !== 'error') {
          store.resetToLogin('Conexão com o servidor foi perdida.')
        }
      },
      onError: (hasWelcomed) => {
        const store = useGameStore.getState()
        if (!hasWelcomed && store.screen !== 'error') {
          store.resetToLogin(
            'Não foi possível conectar ao servidor WebSocket (/ws).'
          )
        }
      },
    })

    this.networkClient.connect()
    this.startLoop()
  }

  applyImmediateTransform(x, y, z, vy, onGround, yaw, pitch) {
    this.localPlayer.setImmediateState(x, y, z, vy, onGround)
    this.inputManager.setLookAngles(yaw, pitch)
    this.localPlayer.updateCamera(this.sceneManager.camera, yaw, pitch, 1.0)
  }

  handleWelcome(msg) {
    const store = useGameStore.getState()
    store.setPlayerId(msg.playerId)
    store.setConnectionStatus('connected')
    store.setScreen('playing')

    const playersMap = {}
    for (const p of msg.players) {
      playersMap[p.id] = p.name
      if (p.id !== msg.playerId) {
        this.remotePlayers.upsert(p.id, p.name, {
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

    this.applyImmediateTransform(
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

  handlePlayerJoined(msg) {
    const store = useGameStore.getState()
    store.upsertOnlinePlayer(msg.id, msg.name)
    if (msg.id !== store.playerId) {
      this.remotePlayers.upsert(msg.id, msg.name, {
        timestamp: performance.now(),
        x: msg.state.x,
        y: msg.state.y,
        z: msg.state.z,
        yaw: msg.state.yaw,
        pitch: msg.state.pitch,
      })
    }
  }

  handlePlayerLeft(msg) {
    useGameStore.getState().removeOnlinePlayer(msg.id)
    this.remotePlayers.remove(msg.id)
  }

  handleSnapshot(snapshot) {
    this.latestServerTick = snapshot.tick
    const store = useGameStore.getState()
    const localId = store.playerId
    const now = performance.now()

    for (const entry of snapshot.players) {
      if (entry.id === localId) {
        this.localPlayer.reconcile(entry)
      } else {
        const knownName = store.onlinePlayers[entry.id] || 'Jogador'
        this.remotePlayers.upsert(entry.id, knownName, {
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

      if (this.networkClient.hasWelcomed) {
        this.accumulator += elapsedSec
        if (this.accumulator > MAX_ACCUMULATOR_STEPS * fixedDt) {
          this.accumulator = MAX_ACCUMULATOR_STEPS * fixedDt
        }

        let steps = 0
        while (this.accumulator >= fixedDt && steps < MAX_ACCUMULATOR_STEPS) {
          const stepInput = this.localPlayer.stepPrediction(this.inputManager)
          this.networkClient.sendInput(stepInput)
          this.accumulator -= fixedDt
          steps++
        }

        const alpha = Math.max(0, Math.min(1, this.accumulator / fixedDt))
        this.localPlayer.updateCamera(
          this.sceneManager.camera,
          this.inputManager.yaw,
          this.inputManager.pitch,
          alpha
        )
        this.remotePlayers.updateInterpolation(now)
      }

      this.sceneManager.render()

      this.frameCount++
      const fpsElapsed = now - this.fpsWindowStart
      if (fpsElapsed >= 500) {
        this.currentFps = Math.round((this.frameCount * 1000) / fpsElapsed)
        this.frameCount = 0
        this.fpsWindowStart = now

        useGameStore.getState().updateDebugStats({
          rtt: this.networkClient.latestRtt,
          pendingInputs: this.localPlayer.pendingInputCount,
          lastCorrectionDistance: this.localPlayer.lastCorrectionDistance,
          serverTick: this.latestServerTick,
          fps: this.currentFps,
          fakeLatencyMs: this.networkClient.fakeLatencyMs,
        })
      }
    }

    this.animationFrameId = requestAnimationFrame(frame)
  }

  requestPointerLock() {
    this.inputManager.requestPointerLock()
  }

  dispose() {
    if (this.isDisposed) return
    this.isDisposed = true

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }

    this.networkClient.dispose()
    this.inputManager.dispose()
    this.remotePlayers.dispose()
    this.sceneManager.dispose()
  }
}
