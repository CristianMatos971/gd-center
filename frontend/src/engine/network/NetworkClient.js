const PING_INTERVAL_MS = 1000
const FAKE_LATENCY_STEPS = [0, 100, 200]

export class NetworkClient {
  constructor(playerName, handlers) {
    this.playerName = playerName
    this.handlers = handlers

    this.ws = null
    this.pingTimerId = null
    this.activeTimeouts = new Set()
    this.isDisposed = false
    this.hasWelcomed = false

    this.fakeLatencyIndex = 0
    this.fakeLatencyMs = 0
    this.latestRtt = 0
    this.lastInboundDeliverAt = 0
    this.lastOutboundDeliverAt = 0
  }

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws`
    const ws = new WebSocket(wsUrl)
    this.ws = ws

    ws.addEventListener('open', () => {
      if (this.isDisposed) {
        ws.close()
        return
      }
      this.send({ type: 'join', name: this.playerName })

      this.pingTimerId = window.setInterval(() => {
        if (!this.isDisposed && this.hasWelcomed) {
          this.send({ type: 'ping', t: performance.now() })
        }
      }, PING_INTERVAL_MS)
    })

    ws.addEventListener('message', (event) => {
      if (this.isDisposed) return
      let parsed
      try {
        parsed = JSON.parse(String(event.data))
      } catch {
        return
      }

      const now = performance.now()
      const targetDeliverAt = Math.max(
        this.lastInboundDeliverAt,
        now + this.fakeLatencyMs
      )
      this.lastInboundDeliverAt = targetDeliverAt
      const waitMs = Math.max(0, targetDeliverAt - now)

      if (waitMs > 0) {
        const timerId = window.setTimeout(() => {
          this.activeTimeouts.delete(timerId)
          if (!this.isDisposed) {
            this.dispatchMessage(parsed)
          }
        }, waitMs)
        this.activeTimeouts.add(timerId)
      } else {
        this.dispatchMessage(parsed)
      }
    })

    ws.addEventListener('close', () => {
      if (this.isDisposed) return
      this.handlers.onClose?.()
    })

    ws.addEventListener('error', () => {
      if (this.isDisposed) return
      this.handlers.onError?.(this.hasWelcomed)
    })
  }

  send(payload) {
    const serialized = JSON.stringify(payload)
    const now = performance.now()
    const targetDeliverAt = Math.max(
      this.lastOutboundDeliverAt,
      now + this.fakeLatencyMs
    )
    this.lastOutboundDeliverAt = targetDeliverAt
    const waitMs = Math.max(0, targetDeliverAt - now)

    if (waitMs > 0) {
      const timerId = window.setTimeout(() => {
        this.activeTimeouts.delete(timerId)
        if (!this.isDisposed && this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(serialized)
        }
      }, waitMs)
      this.activeTimeouts.add(timerId)
    } else if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(serialized)
    }
  }

  sendInput(stepInput) {
    this.send({
      type: 'input',
      seq: stepInput.seq,
      forward: stepInput.forward,
      back: stepInput.back,
      left: stepInput.left,
      right: stepInput.right,
      run: stepInput.run,
      jump: stepInput.jump,
      yaw: stepInput.yaw,
      pitch: stepInput.pitch,
    })
  }

  cycleFakeLatency() {
    this.fakeLatencyIndex =
      (this.fakeLatencyIndex + 1) % FAKE_LATENCY_STEPS.length
    this.fakeLatencyMs = FAKE_LATENCY_STEPS[this.fakeLatencyIndex]
    return this.fakeLatencyMs
  }

  dispatchMessage(msg) {
    switch (msg.type) {
      case 'welcome':
        this.hasWelcomed = true
        this.handlers.onWelcome?.(msg)
        break
      case 'player_joined':
        this.handlers.onPlayerJoined?.(msg)
        break
      case 'player_left':
        this.handlers.onPlayerLeft?.(msg)
        break
      case 'snapshot':
        this.handlers.onSnapshot?.(msg)
        break
      case 'pong':
        if (typeof msg.t === 'number') {
          this.latestRtt = Math.max(0, Math.round(performance.now() - msg.t))
        }
        break
      case 'error':
        this.handlers.onServerError?.(msg.message)
        break
    }
  }

  dispose() {
    if (this.isDisposed) return
    this.isDisposed = true

    if (this.pingTimerId !== null) {
      clearInterval(this.pingTimerId)
      this.pingTimerId = null
    }

    for (const timerId of this.activeTimeouts) {
      clearTimeout(timerId)
    }
    this.activeTimeouts.clear()

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }
}
