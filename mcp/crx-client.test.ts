import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { WebSocket } from 'ws'
import { CrxClient } from './crx-client.js'

/**
 * Minimal fake that mimics the subset of the `ws` WebSocket surface that
 * CrxClient uses: event handlers for 'message' and 'close', `send(data)`,
 * and a readable `readyState` (1 = OPEN, 3 = CLOSED).
 */
class FakeSocket {
  readyState = 1
  private handlers: Record<string, ((...args: unknown[]) => void)[]> = {}
  sent: string[] = []

  on(event: string, handler: (...args: unknown[]) => void): this {
    this.handlers[event] = this.handlers[event] ?? []
    this.handlers[event].push(handler)
    return this
  }

  send(data: string): void {
    this.sent.push(data)
  }

  /** Simulate an incoming server→client message. */
  emitMessage(payload: unknown): void {
    const data = Buffer.from(JSON.stringify(payload))
    for (const h of this.handlers['message'] ?? []) h(data)
  }

  /** Simulate a disconnect. */
  simulateClose(): void {
    this.readyState = 3
    for (const h of this.handlers['close'] ?? []) h()
  }

  asWebSocket(): WebSocket {
    return this as unknown as WebSocket
  }
}

function lastSentId(socket: FakeSocket): string {
  const msg = JSON.parse(socket.sent[socket.sent.length - 1]) as { id: string }
  return msg.id
}

describe('CrxClient', () => {
  test('connected getter reflects socket readyState', () => {
    const client = new CrxClient('/tmp/test')
    assert.equal(client.connected, false)
    const sock = new FakeSocket()
    client.attachSocket(sock.asWebSocket())
    assert.equal(client.connected, true)
    sock.readyState = 3
    assert.equal(client.connected, false)
  })

  test('ping before attach rejects with "Extension not connected"', async () => {
    const client = new CrxClient('/tmp/test')
    await assert.rejects(() => client.ping(), /Extension not connected/)
  })

  test('matched id resolves the pending promise with data', async () => {
    const client = new CrxClient('/tmp/test')
    const sock = new FakeSocket()
    client.attachSocket(sock.asWebSocket())

    const pong = client.ping()
    const id = lastSentId(sock)
    sock.emitMessage({ id, success: true, data: { pong: true, version: '0.1.0' } })

    const result = await pong
    assert.deepEqual(result, { pong: true, version: '0.1.0' })
  })

  test('error response rejects the pending promise', async () => {
    const client = new CrxClient('/tmp/test')
    const sock = new FakeSocket()
    client.attachSocket(sock.asWebSocket())

    const pong = client.ping()
    const id = lastSentId(sock)
    sock.emitMessage({ id, success: false, error: 'boom' })

    await assert.rejects(() => pong, /boom/)
  })

  test('response with default error message when server sends no error text', async () => {
    const client = new CrxClient('/tmp/test')
    const sock = new FakeSocket()
    client.attachSocket(sock.asWebSocket())

    const pong = client.ping()
    const id = lastSentId(sock)
    sock.emitMessage({ id, success: false })

    await assert.rejects(() => pong, /Command failed/)
  })

  test('unmatched response id is ignored (does not crash)', async () => {
    const client = new CrxClient('/tmp/test')
    const sock = new FakeSocket()
    client.attachSocket(sock.asWebSocket())

    const pong = client.ping()
    const realId = lastSentId(sock)

    // Stray message with an unrelated id must not reject or otherwise
    // affect the pending promise.
    sock.emitMessage({ id: 'not-the-right-id', success: true, data: null })
    // Simulate a brief tick to catch any accidental rejection.
    await new Promise(r => setTimeout(r, 0))

    // Now deliver the real response — original promise must still be live.
    sock.emitMessage({ id: realId, success: true, data: 'ok' })
    assert.equal(await pong, 'ok')
  })

  test('socket close rejects all pending with "Extension disconnected"', async () => {
    const client = new CrxClient('/tmp/test')
    const sock = new FakeSocket()
    client.attachSocket(sock.asWebSocket())

    const p1 = client.ping()
    const p2 = client.ping()

    sock.simulateClose()

    await assert.rejects(() => p1, /Extension disconnected/)
    await assert.rejects(() => p2, /Extension disconnected/)
  })

  test('after close, new ping rejects with "Extension not connected"', async () => {
    const client = new CrxClient('/tmp/test')
    const sock = new FakeSocket()
    client.attachSocket(sock.asWebSocket())
    sock.simulateClose()

    await assert.rejects(() => client.ping(), /Extension not connected/)
  })

  test('reconnect: attachSocket with a fresh socket restores connectivity', async () => {
    const client = new CrxClient('/tmp/test')
    const first = new FakeSocket()
    client.attachSocket(first.asWebSocket())
    first.simulateClose()
    assert.equal(client.connected, false)

    const second = new FakeSocket()
    client.attachSocket(second.asWebSocket())
    assert.equal(client.connected, true)

    const pong = client.ping()
    const id = lastSentId(second)
    second.emitMessage({ id, success: true, data: 'reconnected' })
    assert.equal(await pong, 'reconnected')
  })

  test('send wire format includes id, type, and payload', async () => {
    const client = new CrxClient('/tmp/test')
    const sock = new FakeSocket()
    client.attachSocket(sock.asWebSocket())

    void client.ping() // don't await; we only care about what was sent

    assert.equal(sock.sent.length, 1)
    const msg = JSON.parse(sock.sent[0])
    assert.ok(msg.id)
    assert.equal(msg.type, 'ping')
    assert.deepEqual(msg.payload, {})
  })

  test('concurrent pings produce distinct ids', async () => {
    const client = new CrxClient('/tmp/test')
    const sock = new FakeSocket()
    client.attachSocket(sock.asWebSocket())

    void client.ping()
    void client.ping()
    void client.ping()

    const ids = sock.sent.map(s => (JSON.parse(s) as { id: string }).id)
    assert.equal(new Set(ids).size, 3)
  })
})
