import { useGameStore } from '../../store/useGameStore'
import { DebugPanel } from './DebugPanel'
import { PointerLockOverlay } from './PointerLockOverlay'
import { StatusPanel } from './StatusPanel'

export function Hud({ onRequestPointerLock }) {
  const screen = useGameStore((s) => s.screen)

  return (
    <>
      {screen === 'playing' && (
        <>
          <StatusPanel />
          <DebugPanel />
          <div className="crosshair" />
        </>
      )}
      <PointerLockOverlay onRequestPointerLock={onRequestPointerLock} />
    </>
  )
}
