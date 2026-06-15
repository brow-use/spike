import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { structuralHash, structuralSkeleton, urlTemplate, ariaHash } from './page-fingerprint.js'

describe('structuralHash', () => {
  const deviceA = `- main:
  - heading "OnePlus 9" [level=1]
  - tablist:
    - tab "Overview"
    - tab "Apps"
  - table:
    - row "Battery" "82%"
    - row "OS" "Android 13"`

  const deviceB = `- main:
  - heading "MacBook Pro" [level=1]
  - tablist:
    - tab "Overview"
    - tab "Apps"
  - table:
    - row "Battery" "100%"
    - row "OS" "macOS 14"`

  test('same skeleton, different text and values → same structuralHash', () => {
    assert.equal(structuralHash(deviceA), structuralHash(deviceB))
  })

  test('content ariaHash still differs for those two pages', () => {
    assert.notEqual(ariaHash(deviceA), ariaHash(deviceB))
  })

  test('different nesting → different structuralHash', () => {
    const flat = `- main:
  - heading "OnePlus 9"
  - table:
    - row "Battery" "82%"`
    assert.notEqual(structuralHash(deviceA), structuralHash(flat))
  })

  test('skeleton strips quoted names and bracket attributes but keeps roles + indent', () => {
    assert.equal(
      structuralSkeleton(`- heading "Title" [level=2]\n  - link "Devices"`),
      `- heading\n  - link`,
    )
  })
})

describe('urlTemplate', () => {
  const HOST = 'https://app.example.com'

  test('numeric id segment collapses to :id', () => {
    assert.equal(urlTemplate(`${HOST}/devices/123`), `${HOST}/devices/:id`)
    assert.equal(urlTemplate(`${HOST}/devices/123`), urlTemplate(`${HOST}/devices/456`))
  })

  test('uuid segment collapses to :id', () => {
    assert.equal(
      urlTemplate(`${HOST}/u/3f2504e0-4f89-11d3-9a0c-0305e82c3301/profile`),
      `${HOST}/u/:id/profile`,
    )
  })

  test('long hex token collapses to :id', () => {
    assert.equal(urlTemplate(`${HOST}/x/a1b2c3d4e5f6`), `${HOST}/x/:id`)
  })

  test('semantic segments are preserved (general vs billing stay distinct)', () => {
    assert.notEqual(urlTemplate(`${HOST}/settings/general`), urlTemplate(`${HOST}/settings/billing`))
  })

  test('sibling list pages stay distinct (devices vs users)', () => {
    assert.notEqual(urlTemplate(`${HOST}/devices`), urlTemplate(`${HOST}/users`))
  })

  test('query string and hash are ignored', () => {
    assert.equal(urlTemplate(`${HOST}/devices/123?tab=apps#top`), `${HOST}/devices/:id`)
  })

  test('non-url input is returned unchanged', () => {
    assert.equal(urlTemplate('not a url'), 'not a url')
  })
})
