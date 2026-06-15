import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { compareFingerprint } from './compare-fingerprint.js'
import type { ToolContext } from './tool.js'

const emptyCtx = {} as ToolContext

async function call(input: Record<string, unknown>) {
  const out = await compareFingerprint.execute(input, emptyCtx)
  return JSON.parse(out as string)
}

describe('compare_fingerprint', () => {
  test('aria-identical: ariaHash exact match wins regardless of phash', () => {
    return call({
      candidate: { phash: 'ffffffffffffffff', ariaHash: 'abc123' },
      known: [{ phash: '0000000000000000', ariaHash: 'abc123' }],
    }).then(r => {
      assert.equal(r.matched, true)
      assert.equal(r.reason, 'aria-identical')
      assert.equal(r.matchedIndex, 0)
    })
  })

  test('phash-close: no aria match but within threshold', async () => {
    const r = await call({
      candidate: { phash: '0000000000000001', ariaHash: 'x' },
      known: [{ phash: '0000000000000000', ariaHash: 'y' }],
    })
    assert.equal(r.matched, true)
    assert.equal(r.reason, 'phash-close')
    assert.equal(r.minPhashDistance, 1)
  })

  test('threshold boundary: distance == threshold matches', async () => {
    const r = await call({
      candidate: { phash: '000000000000000f', ariaHash: 'x' },
      known: [{ phash: '0000000000000000', ariaHash: 'y' }],
      phashThreshold: 4,
    })
    assert.equal(r.matched, true)
    assert.equal(r.reason, 'phash-close')
    assert.equal(r.minPhashDistance, 4)
  })

  test('threshold just exceeded: no match', async () => {
    const r = await call({
      candidate: { phash: '000000000000001f', ariaHash: 'x' },
      known: [{ phash: '0000000000000000', ariaHash: 'y' }],
      phashThreshold: 4,
    })
    assert.equal(r.matched, false)
    assert.equal(r.reason, 'no-match')
  })

  test('no match: ariaHash different, phash distant', async () => {
    const r = await call({
      candidate: { phash: 'ffffffffffffffff', ariaHash: 'x' },
      known: [{ phash: '0000000000000000', ariaHash: 'y' }],
    })
    assert.equal(r.matched, false)
    assert.equal(r.reason, 'no-match')
    assert.equal(r.minPhashDistance, 64)
  })

  test('empty known: no match, max distance', async () => {
    const r = await call({
      candidate: { phash: 'abcdef0123456789', ariaHash: 'x' },
      known: [],
    })
    assert.equal(r.matched, false)
    assert.equal(r.reason, 'no-match')
    assert.equal(r.matchedIndex, -1)
    assert.equal(r.minPhashDistance, 64)
  })

  test('known passed as JSON string parses correctly (regression)', async () => {
    // Past bug: compare_phash crashed when `known` arrived as a JSON string
    // because BigInt('0x[') threw. Confirm compare_fingerprint handles both.
    const r = await call({
      candidate: { phash: '0000000000000000', ariaHash: 'x' },
      known: JSON.stringify([{ phash: '0000000000000000', ariaHash: 'x' }]),
    })
    assert.equal(r.matched, true)
    assert.equal(r.reason, 'aria-identical')
  })

  test('candidate passed as JSON string parses correctly', async () => {
    const r = await call({
      candidate: JSON.stringify({ phash: '0000000000000000', ariaHash: 'z' }),
      known: [{ phash: '0000000000000000', ariaHash: 'z' }],
    })
    assert.equal(r.matched, true)
    assert.equal(r.reason, 'aria-identical')
  })

  test('default threshold is 10', async () => {
    const r = await call({
      // 0x3ff = 10 bits set → exactly at default threshold
      candidate: { phash: '00000000000003ff', ariaHash: 'x' },
      known: [{ phash: '0000000000000000', ariaHash: 'y' }],
    })
    assert.equal(r.matched, true)
    assert.equal(r.minPhashDistance, 10)
  })

  test('returns minimum across multiple known entries', async () => {
    const r = await call({
      candidate: { phash: '0000000000000001', ariaHash: 'x' },
      known: [
        { phash: 'ffffffffffffffff', ariaHash: 'far' },
        { phash: '0000000000000003', ariaHash: 'near' }, // distance 1
        { phash: '00000000000000ff', ariaHash: 'mid' },
      ],
    })
    assert.equal(r.matchedIndex, 1)
    assert.equal(r.minPhashDistance, 1)
  })
})

describe('compare_fingerprint same-template', () => {
  const HOST = 'https://app.example.com'

  test('same structuralHash + same URL template (different id) is same-template', async () => {
    const r = await call({
      candidate: { phash: 'ffffffffffffffff', ariaHash: 'detail-456', structuralHash: 'skel-detail', url: `${HOST}/devices/456` },
      known: [{ phash: '0000000000000000', ariaHash: 'detail-123', structuralHash: 'skel-detail', url: `${HOST}/devices/123` }],
    })
    assert.equal(r.matched, true)
    assert.equal(r.reason, 'same-template')
    assert.equal(r.matchedIndex, 0)
    assert.equal(r.urlTemplate, `${HOST}/devices/:id`)
  })

  test('aria-identical takes priority over same-template', async () => {
    const r = await call({
      candidate: { phash: 'ffffffffffffffff', ariaHash: 'same', structuralHash: 'skel', url: `${HOST}/devices/456` },
      known: [{ phash: '0000000000000000', ariaHash: 'same', structuralHash: 'skel', url: `${HOST}/devices/123` }],
    })
    assert.equal(r.reason, 'aria-identical')
  })

  test('same structuralHash but DIFFERENT URL path is NOT same-template (Devices vs Users)', async () => {
    const r = await call({
      candidate: { phash: 'ffffffffffffffff', ariaHash: 'users', structuralHash: 'skel-table', url: `${HOST}/users` },
      known: [{ phash: '0000000000000000', ariaHash: 'devices', structuralHash: 'skel-table', url: `${HOST}/devices` }],
    })
    assert.equal(r.matched, false)
    assert.equal(r.reason, 'no-match')
  })

  test('same URL template but DIFFERENT structuralHash is NOT same-template', async () => {
    const r = await call({
      candidate: { phash: 'ffffffffffffffff', ariaHash: 'a', structuralHash: 'skel-A', url: `${HOST}/devices/456` },
      known: [{ phash: '0000000000000000', ariaHash: 'b', structuralHash: 'skel-B', url: `${HOST}/devices/123` }],
    })
    assert.equal(r.matched, false)
    assert.equal(r.reason, 'no-match')
  })

  test('semantic sibling segments do not collapse (settings/general vs settings/billing)', async () => {
    const r = await call({
      candidate: { phash: 'ffffffffffffffff', ariaHash: 'billing', structuralHash: 'skel-form', url: `${HOST}/settings/billing` },
      known: [{ phash: '0000000000000000', ariaHash: 'general', structuralHash: 'skel-form', url: `${HOST}/settings/general` }],
    })
    assert.equal(r.matched, false)
    assert.equal(r.reason, 'no-match')
  })

  test('missing structuralHash/url falls back to phash-close (back-compat)', async () => {
    const r = await call({
      candidate: { phash: '0000000000000001', ariaHash: 'x' },
      known: [{ phash: '0000000000000000', ariaHash: 'y' }],
    })
    assert.equal(r.reason, 'phash-close')
  })
})
