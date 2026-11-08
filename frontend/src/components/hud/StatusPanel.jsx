import { useGameStore } from '../../store/useGameStore'

const STATUS_LABELS = {
  connected: 'Conectado',
  connecting: 'Conectando...',
  disconnected: 'Desconectado',
}

export function StatusPanel() {
  const playerName = useGameStore((s) => s.playerName)
  const onlinePlayers = useGameStore((s) => s.onlinePlayers)
  const connectionStatus = useGameStore((s) => s.connectionStatus)

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
      <div className="hud-item">
        <span className="hud-label">Status:</span>{' '}
        <span className={`status-badge status-${connectionStatus}`}>
          {STATUS_LABELS[connectionStatus] || connectionStatus}
        </span>
      </div>
      <div className="hud-hint">F3: Debug | F4: Latência artificial</div>
    </div>
  )
}
