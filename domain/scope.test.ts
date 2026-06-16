import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { isWithinScope, toPath } from './scope.js'

describe('toPath', () => {
  test('extracts pathname from an absolute url', () => {
    assert.equal(toPath('https://app.example.com/cloud/dashboard/devices?q=1#x'), '/cloud/dashboard/devices')
  })

  test('strips query and hash from a relative path', () => {
    assert.equal(toPath('/cloud/dashboard/devices?tab=2'), '/cloud/dashboard/devices')
  })

  test('returns a bare path unchanged', () => {
    assert.equal(toPath('/cloud/dashboard/devices'), '/cloud/dashboard/devices')
  })
})

describe('isWithinScope', () => {
  const scope = '/cloud/dashboard/devices'

  test('matches the scope root exactly', () => {
    assert.equal(isWithinScope('/cloud/dashboard/devices', scope), true)
  })

  test('matches a descendant path', () => {
    assert.equal(isWithinScope('/cloud/dashboard/devices/123/details', scope), true)
  })

  test('matches an absolute url under scope', () => {
    assert.equal(isWithinScope('https://app.example.com/cloud/dashboard/devices/123?x=1', scope), true)
  })

  test('rejects a sibling path that shares a prefix string', () => {
    assert.equal(isWithinScope('/cloud/dashboard/devices-archive', scope), false)
  })

  test('rejects an unrelated path', () => {
    assert.equal(isWithinScope('/cloud/dashboard/users', scope), false)
  })

  test('rejects a parent of the scope', () => {
    assert.equal(isWithinScope('/cloud/dashboard', scope), false)
  })

  test('tolerates a trailing slash on the scope', () => {
    assert.equal(isWithinScope('/cloud/dashboard/devices/1', '/cloud/dashboard/devices/'), true)
  })

  test('accepts a full-url scope and matches by path', () => {
    assert.equal(isWithinScope('/cloud/dashboard/devices/1', 'https://app.example.com/cloud/dashboard/devices'), true)
  })

  test('an empty scope matches everything', () => {
    assert.equal(isWithinScope('/anything/at/all', ''), true)
  })
})
