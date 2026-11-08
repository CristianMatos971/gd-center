import { useRef } from 'react'
import './App.css'
import { GameCanvas } from './components/GameCanvas'
import { LoginScreen } from './components/LoginScreen'
import { Hud } from './components/hud/Hud'
import { useGameStore } from './store/useGameStore'

export function App() {
  const screen = useGameStore((s) => s.screen)
  const engineRef = useRef(null)

  if (screen === 'login' || screen === 'error') {
    return <LoginScreen />
  }

  return (
    <div className="game-wrapper">
      <GameCanvas engineRef={engineRef} />
      <Hud
        engineRef={engineRef}
        onRequestPointerLock={() => engineRef.current?.requestPointerLock()}
      />
    </div>
  )
}

export default App
