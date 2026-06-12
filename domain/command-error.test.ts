import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { CommandError, classifyErrorMessage } from './command-error.js'

describe('CommandError', () => {
  test('carries code and message', () => {
    const err = new CommandError('tab-gone', 'tab closed')
    assert.equal(err.code, 'tab-gone')
    assert.equal(err.message, 'tab closed')
    assert.ok(err instanceof Error)
  })
})

describe('classifyErrorMessage', () => {
  test('element not found message', () => {
    assert.equal(classifyErrorMessage('Element not found: #submit'), 'element-not-found')
  })

  test('strict mode violation', () => {
    assert.equal(classifyErrorMessage('strict mode violation: locator resolved to 3 elements'), 'element-not-found')
  })

  test('playwright timeout on click is element-not-found', () => {
    assert.equal(classifyErrorMessage('page.click: Timeout 8000ms exceeded.', 'click'), 'element-not-found')
  })

  test('playwright timeout on type is element-not-found', () => {
    assert.equal(classifyErrorMessage('page.fill: Timeout 8000ms exceeded.', 'type'), 'element-not-found')
  })

  test('timeout on non-action command is timeout', () => {
    assert.equal(classifyErrorMessage('page.goto: Timeout 30000ms exceeded.', 'navigate'), 'timeout')
  })

  test('timeout without command context is timeout', () => {
    assert.equal(classifyErrorMessage('Timeout 5000ms exceeded.'), 'timeout')
  })

  test('navigation error', () => {
    assert.equal(classifyErrorMessage('page.goto: net::ERR_NAME_NOT_RESOLVED at http://x'), 'navigation-failed')
  })

  test('anything else is unknown', () => {
    assert.equal(classifyErrorMessage('something exploded'), 'unknown')
  })
})
