import { useEffect, useRef, useState, type FormEvent } from 'react'
import './App.css'
import { GameEngine } from './engine/GameEngine'
import type { Map } from './game/types'
import { useGameStore, type ConnectionStatus } from './store/useGameStore'

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  connected: 'Conectado',
  connecting: 'Conectando...',
  disconnected: 'Desconectado',
}

export function App() {
  const screen = useGameStore((s) => s.screen)
  const playerName = useGameStore((s) => s.playerName)
  const mapData = useGameStore((s) => s.mapData)
  const connectionStatus = useGameStore((s) => s.connectionStatus)
  const errorMessage = useGameStore((s) => s.errorMessage)
  const pointerLocked = useGameStore((s) => s.pointerLocked)
  const onlinePlayers = useGameStore((s) => s.onlinePlayers)
  const debugVisible = useGameStore((s) => s.debugVisible)
  const debugStats = useGameStore((s) => s.debugStats)

  const setPlayerName = useGameStore((s) => s.setPlayerName)
  const setMapData = useGameStore((s) => s.setMapData)
  const setScreen = useGameStore((s) => s.setScreen)
  const setConnectionStatus = useGameStore((s) => s.setConnectionStatus)
  const setErrorMessage = useGameStore((s) => s.setErrorMessage)
  const resetToLogin = useGameStore((s) => s.resetToLogin)

  const [isFetchingMap, setIsFetchingMap] = useState<boolean>(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const engineRef = useRef<GameEngine | null>(null)

  const handlePlay = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const trimmed = playerName.trim()
    if (trimmed.length < 1 || trimmed.length > 16) {
      setErrorMessage('O nome deve ter entre 1 e 16 caracteres.')
      return
    }

    setErrorMessage(null)
    setIsFetchingMap(true)

    try {
      const response = await fetch('/api/map', { cache: 'no-store' })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const data = (await response.json()) as Map
      setPlayerName(trimmed)
      setMapData(data)
      setConnectionStatus('connecting')
      setScreen('connecting')
    } catch {
      setErrorMessage(
        'Falha ao carregar o mapa do servidor. Verifique se o backend está rodando.'
      )
    } finally {
      setIsFetchingMap(false)
    }
  }

  // Single lifecycle effect for GameEngine: stays mounted across 'connecting' -> 'playing'
  // and cleanly tears down on unmount, error, or return to login (StrictMode-safe).
  const isEngineActive = screen === 'connecting' || screen === 'playing'

  useEffect(() => {
    if (!isEngineActive || !mapData || !containerRef.current) {
      return
    }

    const currentName = useGameStore.getState().playerName
    const engine = new GameEngine(containerRef.current, mapData, currentName)
    engineRef.current = engine

    return () => {
      engine.dispose()
      engineRef.current = null
    }
  }, [isEngineActive, mapData])

  if (screen === 'login' || screen === 'error') {
    return (
      <div className="login-backdrop">
        <div className="login-card">
          <h1>GD Center</h1>
          <p className="subtitle">Campus UFGD — Multiplayer 3D</p>

          {errorMessage && (
            <div className="error-banner" role="alert">
              <span>{errorMessage}</span>
              {screen === 'error' && (
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => resetToLogin(null)}
                >
                  Voltar ao início
                </button>
              )}
            </div>
          )}

          {screen === 'login' && (
            <form onSubmit={handlePlay} className="login-form">
              <label htmlFor="player-name">Seu nome</label>
              <input
                id="player-name"
                type="text"
                maxLength={16}
                placeholder="Digite seu nome (máx. 16)"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                disabled={isFetchingMap}
                autoFocus
              />
              <button
                type="submit"
                className="play-btn"
                disabled={isFetchingMap || playerName.trim().length === 0}
              >
                {isFetchingMap ? 'CARREGANDO...' : 'JOGAR'}
              </button>
            </form>
          )}
        </div>
      </div>
    )
  }

  const onlineCount = Object.keys(onlinePlayers).length

  return (
    <div className="game-wrapper">
      <div ref={containerRef} className="game-canvas-container" />

      {/* Connecting modal while waiting for server welcome */}
      {screen === 'connecting' && (
        <div className="pointer-overlay">
          <div className="pointer-overlay-box">
            <h2>Conectando ao servidor...</h2>
            <p>Entrando no campus como {playerName}</p>
          </div>
        </div>
      )}

      {/* Active game HUD and overlays */}
      {screen === 'playing' && (
        <>
          <div className="hud-top-left">
            <div className="hud-item">
              <span className="hud-label">Jogador:</span>{' '}
              <strong>{playerName}</strong>
            </div>
            <div className="hud-item">
              <span className="hud-label">Online:</span>{' '}
              <strong>{onlineCount}</strong>
            </div>
            <div className="hud-item">
              <span className="hud-label">Status:</span>{' '}
              <span className={`status-badge status-${connectionStatus}`}>
                {STATUS_LABELS[connectionStatus]}
              </span>
            </div>
            <div className="hud-hint">F3: Debug | F4: Latência artificial</div>
          </div>

          {debugVisible && (
            <div className="debug-panel">
              <div className="debug-title">Diagnóstico de Rede / Motor (F3)</div>
              <div>RTT (ping/pong): {debugStats.rtt} ms</div>
              <div>Inputs pendentes: {debugStats.pendingInputs}</div>
              <div>
                Última correção: {debugStats.lastCorrectionDistance.toFixed(4)} m
              </div>
              <div>Tick do servidor: {debugStats.serverTick}</div>
              <div>FPS: {debugStats.fps}</div>
              <div>
                Latência simulada (F4): ±{debugStats.fakeLatencyMs} ms (
                {debugStats.fakeLatencyMs * 2} ms RTT extra)
              </div>
            </div>
          )}

          {/* Center crosshair dot */}
          <div className="crosshair" />

          {/* Pointer lock overlay */}
          {!pointerLocked && (
            <div
              className="pointer-overlay"
              onClick={() => engineRef.current?.requestPointerLock()}
            >
              <div className="pointer-overlay-box">
                <h2>Clique para jogar</h2>
                <p>
                  WASD: Mover | Shift: Correr | Espaço: Pular | Mouse: Olhar |
                  ESC: Pausar cursor
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default App
