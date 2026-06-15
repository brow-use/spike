import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { matchesSession, planRunDeletion } from './run-artifacts.js'

describe('matchesSession', () => {
  const sid = 'explore-1779953733225'

  test('matches an exact directory name', () => {
    assert.equal(matchesSession(sid, sid), true)
  })

  test('matches a dotted file', () => {
    assert.equal(matchesSession(`${sid}.jsonl`, sid), true)
    assert.equal(matchesSession(`${sid}.json`, sid), true)
  })

  test('matches a hyphen-suffixed file', () => {
    assert.equal(matchesSession(`${sid}-1779954811784.zip`, sid), true)
    assert.equal(matchesSession(`${sid}-actions.jsonl`, sid), true)
    assert.equal(matchesSession(`${sid}-skipped.jsonl`, sid), true)
  })

  test('does not match a different session that shares a prefix', () => {
    assert.equal(matchesSession('explore-17799537332250.jsonl', sid), false)
    assert.equal(matchesSession('explore-1779953733225999.zip', sid), false)
  })

  test('does not match an unrelated session', () => {
    assert.equal(matchesSession('explore-1745385600000.json', sid), false)
  })
})

describe('planRunDeletion', () => {
  const run = {
    sessionId: 'explore-100',
    artifacts: {
      tracePath: 'output/trace/explore-100-200.zip',
      ariaLog: 'output/exploration/explore-100.jsonl',
    },
  }

  test('collects every matching entry across scanned directories', () => {
    const listings = {
      'output/trace': ['explore-100-200.zip', 'explore-100-actions.jsonl', 'explore-999-1.zip'],
      'output/exploration': ['explore-100.jsonl', 'explore-100-skipped.jsonl', 'explore-100', 'explore-999.jsonl'],
      'output/reasoning': ['explore-100.jsonl'],
      'viewer/public/data': ['explore-100.json', 'explore-100', '_index.json'],
    }
    assert.deepEqual(planRunDeletion(run, listings), [
      'output/exploration/explore-100',
      'output/exploration/explore-100-skipped.jsonl',
      'output/exploration/explore-100.jsonl',
      'output/reasoning/explore-100.jsonl',
      'output/trace/explore-100-200.zip',
      'output/trace/explore-100-actions.jsonl',
      'viewer/public/data/explore-100',
      'viewer/public/data/explore-100.json',
    ])
  })

  test('includes explicit artifact paths even when the directory is unscanned', () => {
    const run2 = { sessionId: 'explore-100', artifacts: { odd: 'custom/place/explore-100.bin' } }
    assert.deepEqual(planRunDeletion(run2, {}), ['custom/place/explore-100.bin'])
  })

  test('shared files like _index.json are never matched', () => {
    const listings = { 'viewer/public/data': ['_index.json'] }
    assert.deepEqual(planRunDeletion({ sessionId: 'explore-100' }, listings), [])
  })
})
