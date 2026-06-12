import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { extractHintTokens, healSelector } from './selector-heal.js'

const tree = [
  '- banner:',
  '  - link "Home"',
  '- main:',
  '  - button "Submit order"',
  '  - button "Cancel"',
  '  - textbox "Email address"',
  '  - link "Order history"',
].join('\n')

describe('extractHintTokens', () => {
  test('id selector splits on punctuation', () => {
    assert.deepEqual(extractHintTokens('#submit-order-btn'), ['submit', 'order', 'btn'])
  })

  test('text selector uses its text', () => {
    assert.deepEqual(extractHintTokens('text=Submit order'), ['submit', 'order'])
  })

  test('quoted attribute values win over surrounding syntax', () => {
    assert.deepEqual(extractHintTokens('button[aria-label="Submit order"]'), ['submit', 'order'])
  })

  test('role selector extracts the accessible name', () => {
    assert.deepEqual(extractHintTokens('role=button[name="Submit order"]'), ['submit', 'order'])
  })
})

describe('healSelector', () => {
  test('heals an id selector to the matching button', () => {
    const healed = healSelector(tree, '#submit-order')
    assert.equal(healed?.selector, 'role=button[name="Submit order"]')
    assert.equal(healed?.role, 'button')
  })

  test('heals a stale role selector when the name drifted', () => {
    const healed = healSelector(tree, 'role=button[name="Submit your order"]')
    assert.equal(healed?.name, 'Submit order')
  })

  test('role hint breaks ties toward the same role', () => {
    const ambiguous = [
      '- link "Order history"',
      '- button "Order"',
    ].join('\n')
    const healed = healSelector(ambiguous, 'role=button[name="Order"]')
    assert.equal(healed?.role, 'button')
  })

  test('returns null when nothing crosses the score threshold', () => {
    assert.equal(healSelector(tree, '#totally-unrelated-widget'), null)
  })

  test('returns null when the selector has no usable tokens', () => {
    assert.equal(healSelector(tree, '>>'), null)
  })

  test('input fields heal to textbox candidates', () => {
    const healed = healSelector(tree, 'input[name="email-address"]')
    assert.equal(healed?.selector, 'role=textbox[name="Email address"]')
  })
})
