import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { reconnectDelayMs } from './reconnect-backoff.js'

describe('reconnectDelayMs', () => {
  test('first attempt with no jitter returns the base delay', () => {
    assert.equal(reconnectDelayMs(0, { baseMs: 1000, maxMs: 30000, random: () => 0 }), 1000)
  })

  test('delay doubles per attempt until it hits the ceiling', () => {
    const opts = { baseMs: 1000, maxMs: 30000, random: () => 0 }
    assert.equal(reconnectDelayMs(1, opts), 2000)
    assert.equal(reconnectDelayMs(2, opts), 4000)
    assert.equal(reconnectDelayMs(3, opts), 8000)
  })

  test('delay is capped at maxMs for large attempts', () => {
    assert.equal(reconnectDelayMs(20, { baseMs: 1000, maxMs: 30000, random: () => 0 }), 30000)
  })

  test('jitter adds up to jitterRatio of the capped delay', () => {
    assert.equal(reconnectDelayMs(0, { baseMs: 1000, maxMs: 30000, jitterRatio: 0.3, random: () => 1 }), 1300)
    assert.equal(reconnectDelayMs(0, { baseMs: 1000, maxMs: 30000, jitterRatio: 0.3, random: () => 0.5 }), 1150)
  })

  test('two attempts at the ceiling with random jitter land in distinct slots', () => {
    const a = reconnectDelayMs(20, { baseMs: 1000, maxMs: 30000, random: () => 0.1 })
    const b = reconnectDelayMs(20, { baseMs: 1000, maxMs: 30000, random: () => 0.9 })
    assert.notEqual(a, b)
    assert.ok(a >= 30000 && b <= 30000 * 1.3)
  })
})
