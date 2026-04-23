import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { logReasoning } from './log-reasoning.js'
import type { ToolContext } from './tool.js'

let outputDir: string

before(() => {
  outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brow-use-reasoning-'))
})

after(() => {
  fs.rmSync(outputDir, { recursive: true, force: true })
})

async function run(input: Record<string, unknown>) {
  const out = await logReasoning.execute(input, {
    page: null as never,
    context: null as never,
    outputDir,
  } as ToolContext)
  return JSON.parse(out as string)
}

function readFile(sessionId: string): string {
  return fs.readFileSync(path.join(outputDir, 'reasoning', `${sessionId}.jsonl`), 'utf-8')
}

describe('log_reasoning', () => {
  test('first call creates file + directory and writes one line', async () => {
    const r = await run({ sessionId: 'first', text: 'hello', kind: 'plan' })
    const content = readFile('first')
    const lines = content.trim().split('\n')
    assert.equal(lines.length, 1)
    const parsed = JSON.parse(lines[0])
    assert.equal(parsed.text, 'hello')
    assert.equal(parsed.kind, 'plan')
    assert.ok(parsed.t)
    assert.equal(r.linesTotal, 1)
    assert.ok(r.path.endsWith(path.join('reasoning', 'first.jsonl')))
  })

  test('subsequent calls append, they do not overwrite', async () => {
    await run({ sessionId: 'append', text: 'one', kind: 'plan' })
    await run({ sessionId: 'append', text: 'two', kind: 'decision' })
    const r = await run({ sessionId: 'append', text: 'three', kind: 'observation' })
    const lines = readFile('append').trim().split('\n')
    assert.equal(lines.length, 3)
    assert.equal(JSON.parse(lines[0]).text, 'one')
    assert.equal(JSON.parse(lines[1]).text, 'two')
    assert.equal(JSON.parse(lines[2]).text, 'three')
    assert.equal(r.linesTotal, 3)
  })

  test('default kind is "decision" when omitted', async () => {
    await run({ sessionId: 'default-kind', text: 'no kind provided' })
    const parsed = JSON.parse(readFile('default-kind').trim())
    assert.equal(parsed.kind, 'decision')
  })

  test('invalid kind falls back to "decision"', async () => {
    await run({ sessionId: 'bad-kind', text: 'whatever', kind: 'gibberish' })
    const parsed = JSON.parse(readFile('bad-kind').trim())
    assert.equal(parsed.kind, 'decision')
  })

  test('each of the four kinds is accepted verbatim', async () => {
    for (const kind of ['plan', 'observation', 'decision', 'error'] as const) {
      await run({ sessionId: `kind-${kind}`, text: `test ${kind}`, kind })
      const parsed = JSON.parse(readFile(`kind-${kind}`).trim())
      assert.equal(parsed.kind, kind)
    }
  })

  test('every written line is valid JSON', async () => {
    await run({ sessionId: 'valid-json', text: 'a' })
    await run({ sessionId: 'valid-json', text: 'b' })
    const lines = readFile('valid-json').trim().split('\n')
    for (const line of lines) {
      assert.doesNotThrow(() => JSON.parse(line))
    }
  })

  test('embedded newlines in text are JSON-escaped so file stays one-line-per-entry', async () => {
    await run({ sessionId: 'multiline', text: 'line one\nline two\nline three' })
    const content = readFile('multiline')
    // Trailing newline from the writer leaves exactly one non-empty line.
    const lines = content.split('\n').filter(l => l.length > 0)
    assert.equal(lines.length, 1)
    const parsed = JSON.parse(lines[0])
    assert.equal(parsed.text, 'line one\nline two\nline three')
  })

  test('timestamp is ISO-8601', async () => {
    await run({ sessionId: 'iso', text: 'x' })
    const parsed = JSON.parse(readFile('iso').trim())
    // Should parse back to a valid Date.
    const d = new Date(parsed.t)
    assert.ok(!isNaN(d.getTime()))
    // And look like an ISO string.
    assert.match(parsed.t, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  test('return payload counts only non-empty lines', async () => {
    const r1 = await run({ sessionId: 'count', text: 'a' })
    assert.equal(r1.linesTotal, 1)
    const r2 = await run({ sessionId: 'count', text: 'b' })
    assert.equal(r2.linesTotal, 2)
  })
})
