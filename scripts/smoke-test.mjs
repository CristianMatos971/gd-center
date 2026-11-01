#!/usr/bin/env node
/**
 * Smoke test for GD Center authoritative WebSocket server using Node 22 built-in WebSocket.
 * - Connects two fake clients (Alice and Bob)
 * - Verifies welcome, player_joined, ~20 Hz snapshots, position advancement after ~120 forward inputs,
 *   seq acknowledgements increasing up to 120, and player_left on disconnect.
 */

const WS_URL = process.env.WS_URL || 'ws://localhost:8080/ws'
const TOTAL_INPUTS = 120
const INPUT_INTERVAL_MS = 1000 / 60

function createClient(name) {
  const ws = new WebSocket(WS_URL)
  const state = {
    name,
    ws,
    playerId: null,
    initialSelf: null,
    snapshots: [],
    joinedEvents: [],
    leftEvents: [],
    errors: [],
    pongs: [],
    welcomePromise: null,
    leftPromise: null,
    _resolveWelcome: null,
    _rejectWelcome: null,
    _resolveLeft: null,
  }

  state.welcomePromise = new Promise((resolve, reject) => {
    state._resolveWelcome = resolve
    state._rejectWelcome = reject
  })

  state.leftPromise = new Promise((resolve) => {
    state._resolveLeft = resolve
  })

  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ type: 'join', name }))
    ws.send(JSON.stringify({ type: 'ping', t: Date.now() }))
  })

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(String(event.data))
    switch (msg.type) {
      case 'welcome':
        state.playerId = msg.playerId
        state.initialSelf = msg.self
        state._resolveWelcome(msg)
        break
      case 'player_joined':
        state.joinedEvents.push(msg)
        break
      case 'player_left':
        state.leftEvents.push(msg)
        state._resolveLeft(msg)
        break
      case 'snapshot':
        state.snapshots.push({ receivedAt: performance.now(), data: msg })
        break
      case 'pong':
        state.pongs.push(msg)
        break
      case 'error':
        state.errors.push(msg)
        state._rejectWelcome(new Error(`Server error for ${name}: ${msg.message}`))
        break
    }
  })

  ws.addEventListener('error', (err) => {
    state._rejectWelcome(new Error(`WebSocket error for ${name}: ${err.message || 'unknown'}`))
  })

  return state
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`)
  }
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function run() {
  console.log(`[smoke-test] Connecting two clients to ${WS_URL}...`)
  const clientA = createClient('SmokeAlice')
  const welcomeA = await clientA.welcomePromise
  console.log(`[smoke-test] Alice joined with id=${welcomeA.playerId} at z=${welcomeA.self.z}`)

  const clientB = createClient('SmokeBob')
  const welcomeB = await clientB.welcomePromise
  console.log(`[smoke-test] Bob joined with id=${welcomeB.playerId} at z=${welcomeB.self.z}`)

  await sleep(50)
  assert(
    clientA.joinedEvents.some((e) => e.id === clientB.playerId && e.name === 'SmokeBob'),
    'Alice should receive player_joined for Bob'
  )

  // Clear snapshot history before the timed 120-step run
  clientA.snapshots.length = 0
  clientB.snapshots.length = 0

  const startTime = performance.now()
  for (let seq = 1; seq <= TOTAL_INPUTS; seq++) {
    const inputPayload = {
      type: 'input',
      seq,
      forward: true,
      back: false,
      left: false,
      right: false,
      run: false,
      jump: false,
      yaw: 0.0,
      pitch: 0.0,
    }
    clientA.ws.send(JSON.stringify(inputPayload))
    clientB.ws.send(JSON.stringify(inputPayload))
    await sleep(INPUT_INTERVAL_MS)
  }

  // Wait briefly for remaining queued inputs and snapshot broadcast
  await sleep(150)
  const elapsedSec = (performance.now() - startTime) / 1000
  const snapCount = clientA.snapshots.length
  const effectiveHz = snapCount / elapsedSec

  console.log(
    `[smoke-test] Received ${snapCount} snapshots in ${elapsedSec.toFixed(2)}s (~${effectiveHz.toFixed(1)} Hz)`
  )
  assert(
    effectiveHz >= 14 && effectiveHz <= 26,
    `Expected snapshot rate around 20 Hz, got ${effectiveHz.toFixed(2)} Hz`
  )

  const firstSnapA = clientA.snapshots[0].data.players.find((p) => p.id === clientA.playerId)
  const lastSnapA = clientA.snapshots[clientA.snapshots.length - 1].data.players.find(
    (p) => p.id === clientA.playerId
  )
  const lastSnapB = clientA.snapshots[clientA.snapshots.length - 1].data.players.find(
    (p) => p.id === clientB.playerId
  )

  assert(firstSnapA && lastSnapA && lastSnapB, 'Both players must appear in snapshots')
  assert(
    lastSnapA.seq === TOTAL_INPUTS,
    `Expected Alice final acked seq to be ${TOTAL_INPUTS}, got ${lastSnapA.seq}`
  )
  assert(
    lastSnapB.seq === TOTAL_INPUTS,
    `Expected Bob final acked seq to be ${TOTAL_INPUTS}, got ${lastSnapB.seq}`
  )
  assert(
    lastSnapA.seq > firstSnapA.seq,
    `Expected seq to increase (${firstSnapA.seq} -> ${lastSnapA.seq})`
  )

  // Moving forward with yaw=0 moves along -Z by 120 * (4 m/s / 60 Hz) = -8.0 meters
  const dzA = lastSnapA.z - clientA.initialSelf.z
  console.log(
    `[smoke-test] Alice moved dz=${dzA.toFixed(4)}m (initial z=${clientA.initialSelf.z}, final z=${lastSnapA.z.toFixed(4)}, seq=${lastSnapA.seq})`
  )
  assert(Math.abs(dzA - -8.0) < 0.01, `Expected dz ~ -8.0m, got ${dzA}`)
  assert(clientA.pongs.length >= 1, 'Expected at least 1 pong response')

  // Disconnect Bob and verify Alice gets player_left
  console.log('[smoke-test] Disconnecting Bob and awaiting player_left on Alice...')
  clientB.ws.close()
  const leftEvent = await Promise.race([
    clientA.leftPromise,
    sleep(2000).then(() => {
      throw new Error('Timed out waiting for player_left event')
    }),
  ])
  assert(
    leftEvent.id === clientB.playerId,
    `Expected player_left for ${clientB.playerId}, got ${leftEvent.id}`
  )
  console.log(`[smoke-test] Alice received player_left for Bob (${leftEvent.id})`)

  clientA.ws.close()
  await sleep(50)
  console.log('[smoke-test] PASS: All checks succeeded!')
}

run().catch((err) => {
  console.error('[smoke-test] FAIL:', err)
  process.exit(1)
})
