import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { encodeBinaryFrame, decodeBinaryFrame } from './ws-frame.js'

describe('ws-frame', () => {
  test('roundtrip preserves header and payload bytes', () => {
    const payload = new Uint8Array([0, 1, 2, 255, 254, 127])
    const frame = encodeBinaryFrame({ id: 'abc', success: true }, payload)
    const decoded = decodeBinaryFrame(frame)
    assert.deepEqual(decoded.header, { id: 'abc', success: true })
    assert.deepEqual([...decoded.payload], [0, 1, 2, 255, 254, 127])
  })

  test('roundtrip with empty payload', () => {
    const frame = encodeBinaryFrame({ id: 'x', success: false, error: 'boom', code: 'timeout' }, new Uint8Array(0))
    const decoded = decodeBinaryFrame(frame)
    assert.deepEqual(decoded.header, { id: 'x', success: false, error: 'boom', code: 'timeout' })
    assert.equal(decoded.payload.length, 0)
  })

  test('decode works on a subarray view with nonzero byteOffset', () => {
    const payload = new Uint8Array([9, 8, 7])
    const frame = encodeBinaryFrame({ id: 'view', success: true }, payload)
    const padded = new Uint8Array(frame.length + 10)
    padded.set(frame, 10)
    const view = padded.subarray(10)
    const decoded = decodeBinaryFrame(view)
    assert.equal(decoded.header.id, 'view')
    assert.deepEqual([...decoded.payload], [9, 8, 7])
  })

  test('large payload survives roundtrip', () => {
    const payload = new Uint8Array(1 << 20)
    for (let i = 0; i < payload.length; i++) payload[i] = i % 251
    const frame = encodeBinaryFrame({ id: 'big', success: true }, payload)
    const decoded = decodeBinaryFrame(frame)
    assert.equal(decoded.payload.length, payload.length)
    assert.equal(decoded.payload[1000003 % payload.length], payload[1000003 % payload.length])
    assert.deepEqual(Buffer.from(decoded.payload), Buffer.from(payload))
  })
})
