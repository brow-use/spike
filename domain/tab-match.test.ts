import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { matchTab } from './tab-match.js'

const tabs = [
  { id: 1, url: 'https://app.example.com/orders?page=2', active: false },
  { id: 2, url: 'https://app.example.com/orders', active: false },
  { id: 3, url: 'https://app.example.com/settings', active: true },
  { id: 4, url: 'https://other.example.com/orders', active: false },
]

describe('matchTab', () => {
  test('exact url wins', () => {
    assert.equal(matchTab(tabs, 'https://app.example.com/orders?page=2')?.id, 1)
  })

  test('same origin+path beats same origin even when another tab is active', () => {
    assert.equal(matchTab(tabs, 'https://app.example.com/orders?page=9')?.id, 1)
  })

  test('falls back to same origin, preferring the active tab', () => {
    assert.equal(matchTab(tabs, 'https://app.example.com/unknown-path')?.id, 3)
  })

  test('no match across origins', () => {
    assert.equal(matchTab(tabs, 'https://elsewhere.com/'), null)
  })

  test('null lastKnownUrl gives null', () => {
    assert.equal(matchTab(tabs, null), null)
  })

  test('unparseable lastKnownUrl gives null', () => {
    assert.equal(matchTab(tabs, 'not a url'), null)
  })

  test('tabs with unparseable urls are skipped, not fatal', () => {
    const mixed = [
      { id: 1, url: '', active: false },
      { id: 2, url: 'https://app.example.com/orders', active: false },
    ]
    assert.equal(matchTab(mixed, 'https://app.example.com/orders')?.id, 2)
  })
})
