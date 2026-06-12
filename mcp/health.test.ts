import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { buildHealthStatus, type CrxConnection, type HealthDeps } from './health.js'
import { TimingStats } from './timing.js'

const pongOk = { pong: true, version: '0.1.0', selectedTabId: 7, currentTabUrl: 'https://x', currentTabTitle: 'X' }

function hang(): Promise<unknown> {
  return new Promise(() => {})
}

function makeDeps(crx: CrxConnection, mode: 'playwright' | 'crx' = 'crx'): HealthDeps {
  return {
    mode,
    serverStart: Date.now() - 5000,
    crx,
    getBrowserState: async () => ({ launched: false, currentUrl: null, currentTitle: null }),
    timing: new TimingStats(),
  }
}

describe('buildHealthStatus', () => {
  test('playwright mode does not require the extension', async () => {
    const crx: CrxConnection = { connected: false, ping: hang, dropSocket: () => {} }
    const status = await buildHealthStatus(makeDeps(crx, 'playwright'))
    assert.equal(status.ok, true)
    assert.deepEqual(status.extension, { required: false })
  })

  test('healthy crx mode reports extension details', async () => {
    const crx: CrxConnection = { connected: true, ping: async () => pongOk, dropSocket: () => {} }
    const status = await buildHealthStatus(makeDeps(crx))
    assert.equal(status.ok, true)
    assert.equal(status.extension.version, '0.1.0')
    assert.equal(status.extension.selectedTabId, 7)
  })

  test('no pinned tab raises an issue with a remedy', async () => {
    const crx: CrxConnection = { connected: true, ping: async () => ({ ...pongOk, selectedTabId: null }), dropSocket: () => {} }
    const status = await buildHealthStatus(makeDeps(crx))
    assert.equal(status.ok, false)
    assert.equal(status.issues[0].kind, 'no-selected-tab')
    assert.match(status.issues[0].remedy, /use-session/)
  })

  test('disconnected extension raises extension-disconnected', async () => {
    const crx: CrxConnection = { connected: false, ping: hang, dropSocket: () => {} }
    const status = await buildHealthStatus(makeDeps(crx))
    assert.equal(status.ok, false)
    assert.equal(status.issues[0].kind, 'extension-disconnected')
  })

  test('hung ping raises extension-ping-timeout', async () => {
    const crx: CrxConnection = { connected: true, ping: hang, dropSocket: () => {} }
    const status = await buildHealthStatus(makeDeps(crx), { pingTimeoutMs: 20 })
    assert.equal(status.ok, false)
    assert.equal(status.issues[0].kind, 'extension-ping-timeout')
    assert.equal(status.healed, undefined)
  })

  test('heal drops the socket and reports healed once ping recovers', async () => {
    let dropped = false
    const crx: CrxConnection = {
      connected: true,
      ping: () => (dropped ? Promise.resolve(pongOk) : hang()),
      dropSocket: () => { dropped = true },
    }
    const status = await buildHealthStatus(makeDeps(crx), { heal: true, pingTimeoutMs: 20, healWaitMs: 100, healPollMs: 10 })
    assert.equal(dropped, true)
    assert.equal(status.healed, true)
    assert.equal(status.ok, true)
    assert.equal(status.extension.version, '0.1.0')
  })

  test('heal reports healed:false when ping stays dead', async () => {
    const crx: CrxConnection = { connected: true, ping: hang, dropSocket: () => {} }
    const status = await buildHealthStatus(makeDeps(crx), { heal: true, pingTimeoutMs: 20, healWaitMs: 50, healPollMs: 10 })
    assert.equal(status.healed, false)
    assert.equal(status.ok, false)
    assert.equal(status.issues[0].kind, 'extension-ping-timeout')
  })

  test('timings from the collector are included', async () => {
    const crx: CrxConnection = { connected: true, ping: async () => pongOk, dropSocket: () => {} }
    const deps = makeDeps(crx)
    deps.timing.record('snapshot', 800)
    const status = await buildHealthStatus(deps)
    assert.equal(status.timings[0].name, 'snapshot')
    assert.equal(status.timings[0].maxMs, 800)
  })
})
