import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { TimingStats } from './timing.js'

describe('TimingStats', () => {
  test('aggregates count, last, max, avg per command', () => {
    const t = new TimingStats()
    t.record('click', 100)
    t.record('click', 300)
    t.record('click', 200)
    const [s] = t.summary()
    assert.equal(s.name, 'click')
    assert.equal(s.count, 3)
    assert.equal(s.lastMs, 200)
    assert.equal(s.maxMs, 300)
    assert.equal(s.avgMs, 200)
  })

  test('summary sorts slowest-max first', () => {
    const t = new TimingStats()
    t.record('navigate', 50)
    t.record('snapshot', 900)
    t.record('click', 200)
    assert.deepEqual(t.summary().map(s => s.name), ['snapshot', 'click', 'navigate'])
  })

  test('empty stats give empty summary', () => {
    assert.deepEqual(new TimingStats().summary(), [])
  })
})
