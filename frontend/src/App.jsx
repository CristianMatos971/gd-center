import { useEffect, useRef, useState } from 'react'
import './App.css'
import { GameEngine } from './engine/GameEngine'
import { useGameStore } from './store/useGameStore'

export function App() {
  const screen = useGameStore((s) => s.screen)
  const playerName = useGameStore((s) => s.playerName)
  const mapData = useGameStore((s) => s.mapData)
  const errorMessage = useGameStore((s) => s.errorMessage)
  const pointerLocked = useGameStore((s) => s.pointerLocked)
  const setPlayerName = useGameStore((s) => s.setPlayerName)
  const setMapData = useGameStore((s) => s.setMapData)
  const setScreen = useGameStore((s) => s.setScreen)
  const setErrorMessage = useGameStore((s) => s.setErrorMessage)
  const resetToLogin = useGameStore((s) => s.resetToLogin)

  const [isLoading, setIsLoading] = useState(false)
  const containerRef = useRef(null)
  const engineRef = useRef(null)

  const handlePlay = async (e) => {
    e.preventDefault()
    const trimmed = playerName.trim()
    if (trimmed.length < 1 || trimmed.length > 16) {
      setErrorMessage('O nome deve ter entre 1 e 16 caracteres.')
      return
    }

    setErrorMessage(null)
    setIsLoading(true)

    try {
      const response = await fetch('/api/map', { cache: 'no-store' })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const data = await response.json()
      setMapData(data)
      setScreen('playing')
    } catch {
      setErrorMessage(
        'Falha ao carregar o mapa do servidor. Verifique se o backend está rodando.'
      )
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (screen !== 'playing' || !mapData || !containerRef.current) {
      return
    }

    const engine = new GameEngine(containerRef.current, mapData)
    engineRef.current = engine

    return () => {
      engine.dispose()
      engineRef.current = null
    }
  }, [screen, mapData])

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
                  Voltar
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
                disabled={isLoading}
                autoFocus
              />
              <button
                type="submit"
                className="play-btn"
                disabled={isLoading || playerName.trim().length === 0}
              >
                {isLoading ? 'CARREGANDO...' : 'JOGAR'}
              </button>
            </form>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="game-wrapper">
      <div ref={containerRef} className="game-canvas-container" />

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
            <p>Use o mouse para olhar ao redor (ESC para liberar o cursor)</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
