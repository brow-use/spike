import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { formatLogTimestamp } from './log-timestamp.js'

describe('formatLogTimestamp', () => {
  const date = new Date('2026-06-12T10:28:09.900Z')

  test('positive offset renders local time with +hh:mm followed by UTC', () => {
    assert.equal(
      formatLogTimestamp(date, 330),
      '2026-06-12T15:58:09.900+05:30 | 2026-06-12T10:28:09.900Z',
    )
  })

  test('zero offset renders +00:00 local equal to UTC', () => {
    assert.equal(
      formatLogTimestamp(date, 0),
      '2026-06-12T10:28:09.900+00:00 | 2026-06-12T10:28:09.900Z',
    )
  })

  test('negative offset renders local time with -hh:mm', () => {
    assert.equal(
      formatLogTimestamp(date, -300),
      '2026-06-12T05:28:09.900-05:00 | 2026-06-12T10:28:09.900Z',
    )
  })

  test('single-digit hours and minutes are zero-padded', () => {
    assert.equal(
      formatLogTimestamp(date, 95),
      '2026-06-12T12:03:09.900+01:35 | 2026-06-12T10:28:09.900Z',
    )
  })

  test('local date rolls over past midnight', () => {
    const late = new Date('2026-06-12T23:30:00.000Z')
    assert.equal(
      formatLogTimestamp(late, 330),
      '2026-06-13T05:00:00.000+05:30 | 2026-06-12T23:30:00.000Z',
    )
  })
})
