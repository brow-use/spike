import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { writeExplorationLog } from './write-exploration-log.js'
import type { ToolContext } from './tool.js'

let outputDir: string

before(() => {
  outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brow-use-explog-'))
})

after(() => {
  fs.rmSync(outputDir, { recursive: true, force: true })
})

async function run(input: Record<string, unknown>) {
  const out = await writeExplorationLog.execute(input, {
    page: null as never,
    context: null as never,
    outputDir,
  } as ToolContext)
  return JSON.parse(out as string)
}

function readFile(sessionId: string): string {
  return fs.readFileSync(path.join(outputDir, 'exploration', `${sessionId}.jsonl`), 'utf-8')
}

describe('write_exploration_log', () => {
  test('entries array → one JSON per line', async () => {
    await run({
      sessionId: 'arr',
      entries: [
        { stepId: '0000', url: 'a', ariaSummary: 'x' },
        { stepId: '0001', url: 'b', ariaSummary: 'y' },
      ],
    })
    const content = readFile('arr')
    const lines = content.trim().split('\n')
    assert.equal(lines.length, 2)
    assert.deepEqual(JSON.parse(lines[0]), { stepId: '0000', url: 'a', ariaSummary: 'x' })
    assert.deepEqual(JSON.parse(lines[1]), { stepId: '0001', url: 'b', ariaSummary: 'y' })
  })

  test('entries passed as JSON string are parsed', async () => {
    await run({
      sessionId: 'str',
      entries: JSON.stringify([{ stepId: '0000', k: 'v' }]),
    })
    const content = readFile('str')
    assert.deepEqual(JSON.parse(content.trim()), { stepId: '0000', k: 'v' })
  })

  test('empty entries array → empty-ish file', async () => {
    await run({ sessionId: 'empty', entries: [] })
    const content = readFile('empty')
    assert.equal(content.trim(), '')
  })

  test('round-trip: written lines parse back to identical objects', async () => {
    const entries = [
      { stepId: '0000', phash: 'deadbeefdeadbeef', ariaHash: 'abc', url: '/', title: 'Home', nested: { a: 1 } },
      { stepId: '0001', phash: 'cafef00dcafef00d', ariaHash: 'def', url: '/about', title: 'About', nested: null },
    ]
    await run({ sessionId: 'rt', entries })
    const lines = readFile('rt').trim().split('\n')
    const parsed = lines.map(l => JSON.parse(l))
    assert.deepEqual(parsed, entries)
  })

  test('return payload reports path + count', async () => {
    const r = await run({ sessionId: 'retval', entries: [{ a: 1 }, { b: 2 }, { c: 3 }] })
    assert.equal(r.entries, 3)
    assert.ok(r.path.endsWith('retval.jsonl'))
  })

  test('embedded newlines in string fields are escaped (JSON guarantee)', async () => {
    await run({
      sessionId: 'newline',
      entries: [{ ariaTree: 'line1\nline2\nline3' }],
    })
    const content = readFile('newline')
    // Should be a single JSONL line despite the embedded newlines in the payload.
    const lines = content.trim().split('\n')
    assert.equal(lines.length, 1)
    const parsed = JSON.parse(lines[0])
    assert.equal(parsed.ariaTree, 'line1\nline2\nline3')
  })
})
