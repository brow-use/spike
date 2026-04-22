import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseInteractive,
  filterDestructive,
  applyEnumerationFilters,
  DESTRUCTIVE_REGEX,
} from './enumerate-interactive-elements.js'

describe('parseInteractive', () => {
  test('extracts link with url from aria snapshot', () => {
    const aria = `- link "Admin":
  - /url: /#/admin`
    const items = parseInteractive(aria)
    assert.equal(items.length, 1)
    assert.deepEqual(items[0], {
      role: 'link',
      name: 'Admin',
      depth: 0,
      selector: 'role=link[name="Admin"]',
      url: '/#/admin',
    })
  })

  test('extracts multiple interactive roles', () => {
    const aria = `- button "Save"
- textbox "Email"
- checkbox "Remember me"
- combobox "Country"`
    const roles = parseInteractive(aria).map(e => e.role)
    assert.deepEqual(roles.sort(), ['button', 'checkbox', 'combobox', 'textbox'])
  })

  test('ignores non-interactive roles', () => {
    const aria = `- banner:
  - heading "Title" [level=1]
  - text: Some body text
  - paragraph: More text
  - button "Go"`
    const items = parseInteractive(aria)
    assert.equal(items.length, 1)
    assert.equal(items[0].role, 'button')
    assert.equal(items[0].name, 'Go')
  })

  test('depth reflects aria indentation', () => {
    const aria = `- link "Top" :
- banner:
  - button "Inner"
  - navigation:
    - link "Deep":
      - /url: /deep`
    const items = parseInteractive(aria)
    const byName = Object.fromEntries(items.map(e => [e.name, e.depth]))
    assert.equal(byName['Top'], 0)
    assert.equal(byName['Inner'], 1)
    assert.equal(byName['Deep'], 2)
  })

  test('empty input returns empty array', () => {
    assert.deepEqual(parseInteractive(''), [])
  })

  test('/url lines after non-link items do not attach', () => {
    const aria = `- button "Save":
  - /url: /should-not-attach`
    const items = parseInteractive(aria)
    assert.equal(items.length, 1)
    assert.equal(items[0].role, 'button')
    assert.equal(items[0].url, undefined)
  })
})

describe('DESTRUCTIVE_REGEX', () => {
  test('matches explicit destructive verbs', () => {
    for (const word of ['Delete', 'delete', 'DELETE', 'Remove', 'Drop', 'Destroy', 'Deactivate', 'Erase']) {
      assert.ok(DESTRUCTIVE_REGEX.test(word), `expected '${word}' to match`)
    }
  })

  test('matches multi-word phrases', () => {
    assert.ok(DESTRUCTIVE_REGEX.test('Cancel account'))
    assert.ok(DESTRUCTIVE_REGEX.test('Close account'))
    assert.ok(DESTRUCTIVE_REGEX.test('Delete invoice 42'))
    assert.ok(DESTRUCTIVE_REGEX.test('Remove user'))
  })

  test('does not match words that contain a destructive verb as substring', () => {
    // Word boundaries must prevent substring matches.
    assert.ok(!DESTRUCTIVE_REGEX.test('Undelete'))
    assert.ok(!DESTRUCTIVE_REGEX.test('Removeable'))
    assert.ok(!DESTRUCTIVE_REGEX.test('Dropdown'))
    assert.ok(!DESTRUCTIVE_REGEX.test('Eraser'))
    assert.ok(!DESTRUCTIVE_REGEX.test('Destroyer'))
  })

  test('"Cancel" alone is safe; only "Cancel account" is destructive', () => {
    assert.ok(!DESTRUCTIVE_REGEX.test('Cancel'))
    assert.ok(!DESTRUCTIVE_REGEX.test('Cancel subscription'))
    assert.ok(DESTRUCTIVE_REGEX.test('Cancel account'))
  })
})

describe('filterDestructive', () => {
  test('strips destructive items', () => {
    const items = parseInteractive(`- button "Delete everything"
- button "Remove user"
- button "Save"
- link "Admin":
  - /url: /#/admin`)
    const safe = filterDestructive(items)
    const names = safe.map(e => e.name)
    assert.deepEqual(names.sort(), ['Admin', 'Save'])
  })

  test('empty input returns empty array', () => {
    assert.deepEqual(filterDestructive([]), [])
  })
})

describe('applyEnumerationFilters', () => {
  const aria = `- link "Admin":
  - /url: /#/admin
- button "Delete user"
- button "Save"
- banner:
  - button "Inner"
  - navigation:
    - link "Deep":
      - /url: /deep`
  const items = parseInteractive(aria)

  test('defaults strip destructive and return all depths', () => {
    const out = applyEnumerationFilters(items, {})
    const names = out.map(e => e.name).sort()
    assert.deepEqual(names, ['Admin', 'Deep', 'Inner', 'Save'])
    // destructive flag not set when not requested
    assert.ok(out.every(e => e.destructive === undefined))
  })

  test('includeDestructive returns all items flagged', () => {
    const out = applyEnumerationFilters(items, { includeDestructive: true })
    const destructiveItems = out.filter(e => e.destructive)
    assert.equal(destructiveItems.length, 1)
    assert.equal(destructiveItems[0].name, 'Delete user')
    assert.ok(out.every(e => typeof e.destructive === 'boolean'))
  })

  test('topLevelOnly restricts to depth <= 1', () => {
    const out = applyEnumerationFilters(items, { topLevelOnly: true })
    assert.ok(out.every(e => e.depth <= 1))
    assert.ok(!out.some(e => e.name === 'Deep'))
  })

  test('rolesFilter restricts to named roles', () => {
    const out = applyEnumerationFilters(items, { rolesFilter: ['link'] })
    assert.ok(out.every(e => e.role === 'link'))
    const names = out.map(e => e.name).sort()
    assert.deepEqual(names, ['Admin', 'Deep'])
  })

  test('filters compose', () => {
    const out = applyEnumerationFilters(items, {
      topLevelOnly: true,
      rolesFilter: ['link'],
      includeDestructive: true,
    })
    assert.equal(out.length, 1)
    assert.equal(out[0].name, 'Admin')
    assert.equal(out[0].depth, 0)
  })
})
