import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { WebSocket } from 'ws'
import { CrxClient } from './crx-client.js'
import { CommandError } from '../domain/command-error.js'
import { encodeBinaryFrame } from '../domain/ws-frame.js'

/**
 * Minimal fake that mimics the subset of the `ws` WebSocket surface that
 * CrxClient uses: event handlers for 'message', 'close', and 'pong',
 * `send(data)`, `ping()`, `terminate()`, and a readable `readyState`
 * (1 = OPEN, 3 = CLOSED).
 */
class FakeSocket {
  readyState = 1
  private handlers: Record<string, ((...args: unknown[]) => void)[]> = {}
  sent: string[] = []
  pings = 0
  terminated = false
  autoPong = false
  onSend: ((msg: { id: string; type: string; payload: Record<string, unknown> }) => unknown) | null = null

  on(event: string, handler: (...args: unknown[]) => void): this {
    this.handlers[event] = this.handlers[event] ?? []
    this.handlers[event].push(handler)
    return this
  }

  send(data: string): void {
    this.sent.push(data)
    const reply = this.onSend?.(JSON.parse(data))
    if (reply) queueMicrotask(() => this.emitMessage(reply))
  }

  ping(): void {
    this.pings += 1
    if (this.autoPong) queueMicrotask(() => this.emitPong())
  }

  terminate(): void {
    this.terminated = true
    this.simulateClose()
  }

  emitPong(): void {
    for (const h of this.handlers['pong'] ?? []) h()
  }

  /** Simulate an incoming server→client message. */
  emitMessage(payload: unknown): void {
    const data = Buffer.from(JSON.stringify(payload))
    for (const h of this.handlers['message'] ?? []) h(data, false)
  }

  emitRaw(raw: string): void {
    for (const h of this.handlers['message'] ?? []) h(Buffer.from(raw), false)
  }

  emitBinary(frame: Uint8Array): void {
    for (const h of this.handlers['message'] ?? []) h(Buffer.from(frame), true)
  }

  /** Simulate a disconnect. */
  simulateClose(): void {
    if (this.readyState === 3) return
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

function sentOfType(socket: FakeSocket, type: string): string[] {
  return socket.sent.filter(s => (JSON.parse(s) as { type: string }).type === type)
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
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
    const client = new CrxClient('/tmp/test', { commandTimeoutMs: 50 })
    const sock = new FakeSocket()
    client.attachSocket(sock.asWebSocket())

    client.ping().catch(() => {}) // don't await; we only care about what was sent

    assert.equal(sock.sent.length, 1)
    const msg = JSON.parse(sock.sent[0])
    assert.ok(msg.id)
    assert.equal(msg.type, 'ping')
    assert.deepEqual(msg.payload, {})
  })

  test('concurrent pings produce distinct ids', async () => {
    const client = new CrxClient('/tmp/test', { commandTimeoutMs: 50 })
    const sock = new FakeSocket()
    client.attachSocket(sock.asWebSocket())

    client.ping().catch(() => {})
    client.ping().catch(() => {})
    client.ping().catch(() => {})

    const ids = sock.sent.map(s => (JSON.parse(s) as { id: string }).id)
    assert.equal(new Set(ids).size, 3)
  })
})

describe('CrxClient command timeout', () => {
  test('command rejects with code "timeout" after commandTimeoutMs', async () => {
    const client = new CrxClient('/tmp/test', { commandTimeoutMs: 30 })
    const sock = new FakeSocket()
    client.attachSocket(sock.asWebSocket())

    const pong = client.ping()
    try {
      await pong
      assert.fail('expected rejection')
    } catch (err) {
      assert.match((err as Error).message, /timed out after 30ms/)
      assert.equal((err as CommandError).code, 'timeout')
    }
  })

  test('a late reply after timeout is ignored and a fresh command still works', async () => {
    const client = new CrxClient('/tmp/test', { commandTimeoutMs: 20 })
    const sock = new FakeSocket()
    client.attachSocket(sock.asWebSocket())

    const stale = client.ping()
    const staleId = lastSentId(sock)
    await assert.rejects(() => stale, /timed out/)

    sock.emitMessage({ id: staleId, success: true, data: 'late' })

    const fresh = client.ping()
    sock.emitMessage({ id: lastSentId(sock), success: true, data: 'ok' })
    assert.equal(await fresh, 'ok')
  })
})

describe('CrxClient reconnect queue', () => {
  test('command issued while disconnected is sent once the socket attaches', async () => {
    const client = new CrxClient('/tmp/test', { reconnectGraceMs: 1000 })
    const promise = client.execute('list_tabs', {})

    const sock = new FakeSocket()
    client.attachSocket(sock.asWebSocket())

    assert.equal(sock.sent.length, 1)
    const msg = JSON.parse(sock.sent[0]) as { id: string; type: string }
    assert.equal(msg.type, 'list_tabs')
    sock.emitMessage({ id: msg.id, success: true, data: [] })
    assert.equal(await promise, '[]')
  })

  test('queued command rejects with code "extension-disconnected" after the grace period', async () => {
    const client = new CrxClient('/tmp/test', { reconnectGraceMs: 25 })
    try {
      await client.execute('list_tabs', {})
      assert.fail('expected rejection')
    } catch (err) {
      assert.match((err as Error).message, /Extension not connected/)
      assert.equal((err as CommandError).code, 'extension-disconnected')
    }
  })

  test('in-flight commands at disconnect are rejected, not resent', async () => {
    const client = new CrxClient('/tmp/test')
    const first = new FakeSocket()
    client.attachSocket(first.asWebSocket())

    const inFlight = client.execute('list_tabs', {})
    first.simulateClose()
    await assert.rejects(() => inFlight, /Extension disconnected/)

    const second = new FakeSocket()
    client.attachSocket(second.asWebSocket())
    assert.equal(second.sent.length, 0)
  })
})

describe('CrxClient socket replacement', () => {
  test('a new connection terminates the old socket and abandons its in-flight commands', async () => {
    const client = new CrxClient('/tmp/test')
    const first = new FakeSocket()
    client.attachSocket(first.asWebSocket())
    const inFlight = client.ping()

    const second = new FakeSocket()
    client.attachSocket(second.asWebSocket())

    assert.equal(first.terminated, true)
    assert.equal(client.connected, true)
    await assert.rejects(() => inFlight, /reconnected/)

    const fresh = client.ping()
    assert.equal(second.sent.length, 1)
    const id = lastSentId(second)
    // A spoofed reply arriving on the stale socket must be ignored.
    first.emitMessage({ id, success: false, error: 'spoof' })
    second.emitMessage({ id, success: true, data: 'fresh' })
    assert.equal(await fresh, 'fresh')
  })

  test('dropSocket terminates the active socket so the extension can reconnect', () => {
    const client = new CrxClient('/tmp/test')
    const sock = new FakeSocket()
    client.attachSocket(sock.asWebSocket())
    client.dropSocket()
    assert.equal(sock.terminated, true)
    assert.equal(client.connected, false)
  })
})

describe('CrxClient frame handling', () => {
  test('malformed frame is dropped without affecting pending commands', async () => {
    const client = new CrxClient('/tmp/test')
    const sock = new FakeSocket()
    client.attachSocket(sock.asWebSocket())

    const pong = client.ping()
    const id = lastSentId(sock)
    sock.emitRaw('not json{{')
    sock.emitMessage({ id, success: true, data: 'ok' })
    assert.equal(await pong, 'ok')
  })

  test('binary frame resolves with raw payload bytes', async () => {
    const client = new CrxClient('/tmp/test')
    const sock = new FakeSocket()
    client.attachSocket(sock.asWebSocket())

    const promise = client.fetchSnapshotBuffer()
    const id = lastSentId(sock)
    sock.emitBinary(encodeBinaryFrame({ id, success: true }, new Uint8Array([1, 2, 3])))
    assert.deepEqual([...await promise], [1, 2, 3])
  })

  test('base64 string snapshot data from an older extension still decodes', async () => {
    const client = new CrxClient('/tmp/test')
    const sock = new FakeSocket()
    client.attachSocket(sock.asWebSocket())

    const promise = client.fetchSnapshotBuffer()
    const id = lastSentId(sock)
    sock.emitMessage({ id, success: true, data: Buffer.from([4, 5]).toString('base64') })
    assert.deepEqual([...await promise], [4, 5])
  })

  test('failure code from the extension surfaces on the rejection', async () => {
    const client = new CrxClient('/tmp/test')
    const sock = new FakeSocket()
    client.attachSocket(sock.asWebSocket())

    const promise = client.execute('list_tabs', {})
    const id = lastSentId(sock)
    sock.emitMessage({ id, success: false, error: 'pinned tab is gone', code: 'tab-gone' })
    try {
      await promise
      assert.fail('expected rejection')
    } catch (err) {
      assert.equal((err as CommandError).code, 'tab-gone')
    }
  })
})

describe('CrxClient aria cache', () => {
  function ariaResponder(sock: FakeSocket, tree: string): void {
    sock.onSend = (msg) => {
      if (msg.type === 'get_accessibility_tree') return { id: msg.id, success: true, data: tree }
      if (msg.type === 'click' || msg.type === 'type' || msg.type === 'navigate') return { id: msg.id, success: true, data: { title: 't', url: 'u' } }
      return null
    }
  }

  test('repeated tree reads hit the cache', async () => {
    const client = new CrxClient('/tmp/test')
    const sock = new FakeSocket()
    ariaResponder(sock, '- button "Go"')
    client.attachSocket(sock.asWebSocket())

    assert.equal(await client.execute('get_accessibility_tree', {}), '- button "Go"')
    assert.equal(await client.execute('get_accessibility_tree', {}), '- button "Go"')
    assert.equal(sentOfType(sock, 'get_accessibility_tree').length, 1)
  })

  test('a click invalidates the cache', async () => {
    const client = new CrxClient('/tmp/test')
    const sock = new FakeSocket()
    ariaResponder(sock, '- button "Go"')
    client.attachSocket(sock.asWebSocket())

    await client.execute('get_accessibility_tree', {})
    await client.execute('click', { selector: 'role=button[name="Go"]' })
    await client.execute('get_accessibility_tree', {})
    assert.equal(sentOfType(sock, 'get_accessibility_tree').length, 2)
  })

  test('a navigate invalidates the cache', async () => {
    const client = new CrxClient('/tmp/test')
    const sock = new FakeSocket()
    ariaResponder(sock, '- heading "Page"')
    client.attachSocket(sock.asWebSocket())

    await client.execute('get_accessibility_tree', {})
    await client.execute('navigate', { url: 'https://example.com' })
    await client.execute('get_accessibility_tree', {})
    assert.equal(sentOfType(sock, 'get_accessibility_tree').length, 2)
  })
})

describe('CrxClient selector healing', () => {
  test('click heals via the accessibility tree and reports the substitution', async () => {
    const client = new CrxClient('/tmp/test')
    const sock = new FakeSocket()
    const clicks: string[] = []
    sock.onSend = (msg) => {
      if (msg.type === 'click') {
        clicks.push(msg.payload.selector as string)
        if (clicks.length === 1) return { id: msg.id, success: false, error: 'Timeout 8000ms exceeded.', code: 'element-not-found' }
        return { id: msg.id, success: true }
      }
      if (msg.type === 'get_accessibility_tree') return { id: msg.id, success: true, data: '- button "Submit order"' }
      return null
    }
    client.attachSocket(sock.asWebSocket())

    const result = await client.execute('click', { selector: '#submit-order' })
    assert.deepEqual(clicks, ['#submit-order', 'role=button[name="Submit order"]'])
    assert.match(result as string, /healed from: #submit-order/)
  })

  test('type heals via the accessibility tree', async () => {
    const client = new CrxClient('/tmp/test')
    const sock = new FakeSocket()
    const types: string[] = []
    sock.onSend = (msg) => {
      if (msg.type === 'type') {
        types.push(msg.payload.selector as string)
        if (types.length === 1) return { id: msg.id, success: false, error: 'Element not found: #email', code: 'element-not-found' }
        return { id: msg.id, success: true }
      }
      if (msg.type === 'get_accessibility_tree') return { id: msg.id, success: true, data: '- textbox "Email address"' }
      return null
    }
    client.attachSocket(sock.asWebSocket())

    const result = await client.execute('type', { selector: '#email-address', text: 'a@b.c' })
    assert.deepEqual(types, ['#email-address', 'role=textbox[name="Email address"]'])
    assert.match(result as string, /healed from: #email-address/)
  })

  test('with no healing candidate the original error is rethrown', async () => {
    const client = new CrxClient('/tmp/test')
    const sock = new FakeSocket()
    sock.onSend = (msg) => {
      if (msg.type === 'click') return { id: msg.id, success: false, error: 'Element not found: #submit-order', code: 'element-not-found' }
      if (msg.type === 'get_accessibility_tree') return { id: msg.id, success: true, data: '- button "Totally unrelated"' }
      return null
    }
    client.attachSocket(sock.asWebSocket())

    await assert.rejects(() => client.execute('click', { selector: '#submit-order' }), /Element not found: #submit-order/)
    assert.equal(sentOfType(sock, 'click').length, 1)
  })

  test('errors other than element-not-found are not healed', async () => {
    const client = new CrxClient('/tmp/test')
    const sock = new FakeSocket()
    sock.onSend = (msg) => {
      if (msg.type === 'click') return { id: msg.id, success: false, error: 'pinned tab is gone', code: 'tab-gone' }
      return null
    }
    client.attachSocket(sock.asWebSocket())

    try {
      await client.execute('click', { selector: '#x' })
      assert.fail('expected rejection')
    } catch (err) {
      assert.equal((err as CommandError).code, 'tab-gone')
    }
    assert.equal(sentOfType(sock, 'get_accessibility_tree').length, 0)
  })
})

describe('CrxClient trace session', () => {
  function clientWithTempDir(): { client: CrxClient; socket: FakeSocket; dir: string } {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crx-client-test-'))
    const client = new CrxClient(dir)
    const socket = new FakeSocket()
    client.attachSocket(socket.asWebSocket())
    return { client, socket, dir }
  }

  test('successful start_trace creates the session and the actions file', async () => {
    const { client, socket, dir } = clientWithTempDir()
    socket.onSend = (msg) => ({ id: msg.id, success: true })

    const result = await client.execute('start_trace', { name: 'run-1' })
    assert.match(result as string, /Trace started/)
    assert.ok(fs.existsSync(path.join(dir, 'trace', 'run-1-actions.jsonl')))
  })

  test('failed start_trace leaves no session and writes nothing to disk', async () => {
    const { client, socket, dir } = clientWithTempDir()
    socket.onSend = (msg) => ({ id: msg.id, success: false, error: 'tracing.start: Tracing has been already started' })

    await assert.rejects(client.execute('start_trace', { name: 'run-1' }), /already started/i)
    assert.equal(fs.existsSync(path.join(dir, 'trace', 'run-1')), false)
    assert.equal(fs.existsSync(path.join(dir, 'trace', 'run-1-actions.jsonl')), false)
    await assert.rejects(client.execute('stop_trace', { name: 'run-1' }), /No active trace session/)
  })

  test('a successful flush writes a chunk and adds no warning to the result', async () => {
    const { client, socket, dir } = clientWithTempDir()
    socket.onSend = (msg) => {
      if (msg.type === 'start_trace') return { id: msg.id, success: true }
      if (msg.type === 'navigate') return { id: msg.id, success: true, data: { title: 't', url: 'u' } }
      if (msg.type === 'flush_trace_chunk') return { id: msg.id, success: true, data: Buffer.from([1, 2, 3]).toString('base64') }
      return null
    }

    await client.execute('start_trace', { name: 'run-1' })
    const lastResult = await client.execute('navigate', { url: 'https://x/0' }) as string

    assert.ok(!lastResult.includes('[trace]'))
    assert.ok(fs.existsSync(path.join(dir, 'trace', 'run-1', 'chunk-0000.zip')))
  })

  test('a trace-lost flush is surfaced to the caller and the trace is restarted', async () => {
    const { client, socket } = clientWithTempDir()
    let flushes = 0
    let startTraces = 0
    socket.onSend = (msg) => {
      if (msg.type === 'start_trace') { startTraces += 1; return { id: msg.id, success: true } }
      if (msg.type === 'navigate') return { id: msg.id, success: true, data: { title: 't', url: 'u' } }
      if (msg.type === 'flush_trace_chunk') {
        flushes += 1
        return { id: msg.id, success: false, error: 'Trace recording was lost when the extension service worker restarted', code: 'trace-lost' }
      }
      return null
    }

    await client.execute('start_trace', { name: 'run-1' })
    const lastResult = await client.execute('navigate', { url: 'https://x/0' }) as string

    assert.equal(flushes, 1) // flushes every action
    assert.equal(startTraces, 2) // initial start plus the revive
    assert.match(lastResult, /trace recording was lost/i)
    assert.match(lastResult, /restarted/i)
  })

  test('a non-trace-lost flush failure is surfaced without restarting the trace', async () => {
    const { client, socket } = clientWithTempDir()
    let startTraces = 0
    socket.onSend = (msg) => {
      if (msg.type === 'start_trace') { startTraces += 1; return { id: msg.id, success: true } }
      if (msg.type === 'navigate') return { id: msg.id, success: true, data: { title: 't', url: 'u' } }
      if (msg.type === 'flush_trace_chunk') return { id: msg.id, success: false, error: 'boom', code: 'unknown' }
      return null
    }

    await client.execute('start_trace', { name: 'run-1' })
    const lastResult = await client.execute('navigate', { url: 'https://x/0' }) as string

    assert.equal(startTraces, 1) // no revive
    assert.match(lastResult, /flush failed/i)
  })
})

describe('CrxClient heartbeat', () => {
  test('a missed pong terminates the socket', async () => {
    const client = new CrxClient('/tmp/test', { heartbeatIntervalMs: 20 })
    const sock = new FakeSocket()
    client.attachSocket(sock.asWebSocket())

    await sleep(90)
    assert.ok(sock.pings >= 1)
    assert.equal(sock.terminated, true)
    assert.equal(client.connected, false)
  })

  test('a missed pong is logged via the onLog hook', async () => {
    const logs: string[] = []
    const client = new CrxClient('/tmp/test', { heartbeatIntervalMs: 20, onLog: (...a) => logs.push(a.join(' ')) })
    const sock = new FakeSocket()
    client.attachSocket(sock.asWebSocket())

    await sleep(90)
    assert.ok(logs.some(l => /no pong/i.test(l)))
  })

  test('pongs keep the socket alive', async () => {
    const client = new CrxClient('/tmp/test', { heartbeatIntervalMs: 20 })
    const sock = new FakeSocket()
    sock.autoPong = true
    client.attachSocket(sock.asWebSocket())

    await sleep(90)
    assert.ok(sock.pings >= 2)
    assert.equal(sock.terminated, false)
    assert.equal(client.connected, true)
    sock.simulateClose()
  })
})
