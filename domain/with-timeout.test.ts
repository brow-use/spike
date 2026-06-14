import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { withTimeout, TimeoutError } from './with-timeout.js'

describe('withTimeout', () => {
  test('resolves with the promise value when it settles before the deadline', async () => {
    const result = await withTimeout(Promise.resolve(42), 1000, 'too slow')
    assert.equal(result, 42)
  })

  test('rejects with TimeoutError carrying the message when the deadline passes', async () => {
    const never = new Promise<void>(() => {})
    await assert.rejects(withTimeout(never, 5, 'op timed out'), (err: unknown) => {
      assert.ok(err instanceof TimeoutError)
      assert.equal(err.message, 'op timed out')
      return true
    })
  })

  test('propagates the original rejection unchanged', async () => {
    const boom = new Error('boom')
    await assert.rejects(withTimeout(Promise.reject(boom), 1000, 'too slow'), (err: unknown) => {
      assert.equal(err, boom)
      return true
    })
  })
})
