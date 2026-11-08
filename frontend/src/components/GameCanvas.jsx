import { useEffect, useRef } from 'react'
import { GameEngine } from '../engine/GameEngine'
import { useGameStore } from '../store/useGameStore'

export function GameCanvas({ engineRef }) {
  const mapData = useGameStore((s) => s.mapData)
  const containerRef = useRef(null)

  useEffect(() => {
    if (!mapData || !containerRef.current) {
      return
    }

    const currentName = useGameStore.getState().playerName
    const engine = new GameEngine(containerRef.current, mapData, currentName)
    if (engineRef) {
      engineRef.current = engine
    }

    return () => {
      engine.dispose()
      if (engineRef) {
        engineRef.current = null
      }
    }
  }, [mapData, engineRef])

  return <div ref={containerRef} className="game-canvas-container" />
}
