import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveBaseStepId, isPanelStep, groupVisitedByBase } from './tab-panel.js'

describe('deriveBaseStepId', () => {
  test('base step returns itself', () => {
    assert.equal(deriveBaseStepId('0004'), '0004')
  })

  test('panel step strips the panel suffix', () => {
    assert.equal(deriveBaseStepId('0004-1'), '0004')
    assert.equal(deriveBaseStepId('0004-12'), '0004')
  })

  test('non-panel hyphenated ids are left intact', () => {
    assert.equal(deriveBaseStepId('home'), 'home')
    assert.equal(deriveBaseStepId('0004-1-extra'), '0004-1-extra')
  })
})

describe('isPanelStep', () => {
  test('true only for <digits>-<digits>', () => {
    assert.equal(isPanelStep({ stepId: '0004-1' }), true)
    assert.equal(isPanelStep({ stepId: '0004' }), false)
    assert.equal(isPanelStep({ stepId: 'home' }), false)
  })
})

describe('groupVisitedByBase', () => {
  test('collapses panels under their base, preserving first-seen order', () => {
    const steps = [
      { stepId: '0001' },
      { stepId: '0004' },
      { stepId: '0004-1', tab: 'Apple Apps' },
      { stepId: '0004-2', tab: 'Enterprise Store' },
      { stepId: '0005' },
    ]
    const groups = groupVisitedByBase(steps)
    assert.equal(groups.length, 3)
    assert.deepEqual(groups.map(g => g.baseStepId), ['0001', '0004', '0005'])
    const tabbed = groups[1]
    assert.equal(tabbed.base.stepId, '0004')
    assert.deepEqual(tabbed.panels.map(p => p.tab), ['Apple Apps', 'Enterprise Store'])
  })

  test('a base with no panels yields a group with empty panels', () => {
    const groups = groupVisitedByBase([{ stepId: '0001' }])
    assert.equal(groups.length, 1)
    assert.deepEqual(groups[0].panels, [])
  })

  test('a panel without its base falls back to the first member as base', () => {
    const groups = groupVisitedByBase([{ stepId: '0004-1', tab: 'Apple' }])
    assert.equal(groups.length, 1)
    assert.equal(groups[0].baseStepId, '0004')
    assert.equal(groups[0].base.stepId, '0004-1')
    assert.deepEqual(groups[0].panels, [])
  })
})
