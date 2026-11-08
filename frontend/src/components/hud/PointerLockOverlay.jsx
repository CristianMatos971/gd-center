import { useGameStore } from '../../store/useGameStore'

export function PointerLockOverlay({ onRequestPointerLock }) {
  const screen = useGameStore((s) => s.screen)
  const playerName = useGameStore((s) => s.playerName)
  const pointerLocked = useGameStore((s) => s.pointerLocked)

  if (screen === 'connecting') {
    return (
      <div className="pointer-overlay">
        <div className="pointer-overlay-box">
          <h2>Conectando ao servidor...</h2>
          <p>Entrando no campus como {playerName}</p>
        </div>
      </div>
    )
  }

  if (!pointerLocked) {
    return (
      <div className="pointer-overlay" onClick={onRequestPointerLock}>
        <div className="pointer-overlay-box">
          <h2>Clique para jogar</h2>
          <p>
            WASD: Mover | Shift: Correr | Espaço: Pular | Mouse: Olhar | ESC:
            Pausar cursor
          </p>
        </div>
      </div>
    )
  }

  return null
}
