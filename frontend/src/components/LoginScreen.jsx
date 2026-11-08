import { useState } from 'react'
import { useGameStore } from '../store/useGameStore'

export function LoginScreen() {
  const screen = useGameStore((s) => s.screen)
  const playerName = useGameStore((s) => s.playerName)
  const errorMessage = useGameStore((s) => s.errorMessage)

  const setPlayerName = useGameStore((s) => s.setPlayerName)
  const setMapData = useGameStore((s) => s.setMapData)
  const setScreen = useGameStore((s) => s.setScreen)
  const setConnectionStatus = useGameStore((s) => s.setConnectionStatus)
  const setErrorMessage = useGameStore((s) => s.setErrorMessage)
  const resetToLogin = useGameStore((s) => s.resetToLogin)

  const [isFetchingMap, setIsFetchingMap] = useState(false)

  const handlePlay = async (e) => {
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
      const data = await response.json()
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
