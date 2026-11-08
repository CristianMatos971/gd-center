import { useGameStore } from '../../store/useGameStore'

export function StatusPanel() {
  const playerName = useGameStore((s) => s.playerName)
  const onlinePlayers = useGameStore((s) => s.onlinePlayers)
  const buildMode = useGameStore((s) => s.buildMode)

  const onlineCount = Object.keys(onlinePlayers).length

  return (
    <div className="hud-top-left">
      <div className="hud-item">
        <span className="hud-label">Jogador:</span>{' '}
        <strong>{playerName}</strong>
      </div>
      <div className="hud-item">
        <span className="hud-label">Online:</span>{' '}
        <strong>{onlineCount}</strong>
      </div>
      <div className="hud-hint">
        B: {buildMode ? 'Sair Construção' : 'Construir'} | F3: Debug | F4:
        Latência
      </div>
    </div>
  )
}
