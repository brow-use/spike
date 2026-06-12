import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createCommandQueue } from './command-queue.js'

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: Error) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('command-queue', () => {
  test('tasks run strictly in order, one at a time', async () => {
    const enqueue = createCommandQueue()
    const events: string[] = []
    const first = deferred<void>()

    const p1 = enqueue(async () => {
      events.push('start-1')
      await first.promise
      events.push('end-1')
      return 1
    })
    const p2 = enqueue(async () => {
      events.push('start-2')
      return 2
    })

    await new Promise(r => setTimeout(r, 10))
    assert.deepEqual(events, ['start-1'])

    first.resolve()
    assert.equal(await p1, 1)
    assert.equal(await p2, 2)
    assert.deepEqual(events, ['start-1', 'end-1', 'start-2'])
  })

  test('a rejected task does not block subsequent tasks', async () => {
    const enqueue = createCommandQueue()
    const p1 = enqueue(async () => { throw new Error('boom') })
    const p2 = enqueue(async () => 'ok')

    await assert.rejects(() => p1, /boom/)
    assert.equal(await p2, 'ok')
  })

  test('each caller receives its own result', async () => {
    const enqueue = createCommandQueue()
    const results = await Promise.all([
      enqueue(async () => 'a'),
      enqueue(async () => 'b'),
      enqueue(async () => 'c'),
    ])
    assert.deepEqual(results, ['a', 'b', 'c'])
  })
})
