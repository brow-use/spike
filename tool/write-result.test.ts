import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { writeResult } from './write-result.js'
import type { ToolContext } from './tool.js'

let outputDir: string

before(() => {
  outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brow-use-write-result-'))
})

after(() => {
  fs.rmSync(outputDir, { recursive: true, force: true })
})

function ctx(): ToolContext {
  return { page: null as never, context: null as never, outputDir }
}

async function run(input: Record<string, unknown>) {
  const out = await writeResult.execute(input, ctx())
  return JSON.parse(out as string)
}

function readResult(sessionId: string, ext: string): string {
  return fs.readFileSync(path.join(outputDir, 'results', sessionId, `result.${ext}`), 'utf-8')
}

describe('write_result — CSV', () => {
  test('basic records produce header + rows', async () => {
    await run({
      sessionId: 's-csv-basic',
      format: 'csv',
      records: [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ],
    })
    const content = readResult('s-csv-basic', 'csv')
    assert.equal(content, 'name,age\nAlice,30\nBob,25\n')
  })

  test('quotes, commas, and newlines are RFC-4180 escaped', async () => {
    await run({
      sessionId: 's-csv-escape',
      format: 'csv',
      records: [
        { field: 'has "quotes" and, a comma' },
        { field: 'multi\nline' },
        { field: 'plain' },
      ],
    })
    const content = readResult('s-csv-escape', 'csv')
    assert.match(content, /"has ""quotes"" and, a comma"/)
    assert.match(content, /"multi\nline"/)
    assert.match(content, /\nplain\n/)
  })

  test('null and undefined render as empty cells', async () => {
    await run({
      sessionId: 's-csv-nulls',
      format: 'csv',
      records: [{ a: null, b: undefined, c: 'x' }],
    })
    const content = readResult('s-csv-nulls', 'csv')
    const lines = content.trim().split('\n')
    assert.equal(lines[0], 'a,b,c')
    assert.equal(lines[1], ',,x')
  })

  test('explicit column order is respected', async () => {
    await run({
      sessionId: 's-csv-cols',
      format: 'csv',
      records: [{ a: 1, b: 2, c: 3 }],
      columns: ['c', 'a'],
    })
    const content = readResult('s-csv-cols', 'csv')
    assert.equal(content, 'c,a\n3,1\n')
  })

  test('empty records array produces empty string', async () => {
    await run({
      sessionId: 's-csv-empty',
      format: 'csv',
      records: [],
    })
    const content = readResult('s-csv-empty', 'csv')
    assert.equal(content, '')
  })
})

describe('write_result — Markdown', () => {
  test('object records render as a table', async () => {
    await run({
      sessionId: 's-md-table',
      format: 'markdown',
      records: [
        { name: 'Alice', role: 'admin' },
        { name: 'Bob', role: 'user' },
      ],
    })
    const content = readResult('s-md-table', 'md')
    assert.match(content, /\| name \| role \|/)
    assert.match(content, /\|---\|---\|/)
    assert.match(content, /\| Alice \| admin \|/)
  })

  test('title is rendered as a heading', async () => {
    await run({
      sessionId: 's-md-title',
      format: 'markdown',
      records: [{ x: 1 }],
      title: 'Report',
    })
    const content = readResult('s-md-title', 'md')
    assert.ok(content.startsWith('# Report\n'))
  })

  test('pipe character in cell is escaped', async () => {
    await run({
      sessionId: 's-md-pipe',
      format: 'markdown',
      records: [{ formula: 'a | b' }],
    })
    const content = readResult('s-md-pipe', 'md')
    assert.match(content, /\| a \\\| b \|/)
  })

  test('primitive records render as a bulleted list', async () => {
    await run({
      sessionId: 's-md-list',
      format: 'markdown',
      records: ['First', 'Second', 'Third'],
    })
    const content = readResult('s-md-list', 'md')
    assert.ok(content.includes('- First\n'))
    assert.ok(content.includes('- Second\n'))
    assert.ok(content.includes('- Third\n'))
  })

  test('empty records produces "No records" placeholder', async () => {
    await run({
      sessionId: 's-md-empty',
      format: 'markdown',
      records: [],
    })
    const content = readResult('s-md-empty', 'md')
    assert.match(content, /_No records\._/)
  })

  test('non-array records fall through to JSON block', async () => {
    await run({
      sessionId: 's-md-object',
      format: 'markdown',
      records: { total: 42, status: 'ok' },
    })
    const content = readResult('s-md-object', 'md')
    assert.ok(content.includes('"total": 42'))
  })
})

describe('write_result — JSON', () => {
  test('array records serialised with 2-space indent', async () => {
    await run({
      sessionId: 's-json-arr',
      format: 'json',
      records: [{ a: 1 }, { a: 2 }],
    })
    const content = readResult('s-json-arr', 'json')
    assert.equal(content, '[\n  {\n    "a": 1\n  },\n  {\n    "a": 2\n  }\n]\n')
  })

  test('non-array preserved as single object', async () => {
    await run({
      sessionId: 's-json-obj',
      format: 'json',
      records: { status: 'ok', count: 3 },
    })
    const content = readResult('s-json-obj', 'json')
    const parsed = JSON.parse(content)
    assert.deepEqual(parsed, { status: 'ok', count: 3 })
  })
})

describe('write_result — txt', () => {
  test('array joined with newlines', async () => {
    await run({
      sessionId: 's-txt-arr',
      format: 'txt',
      records: ['line one', 'line two', 'line three'],
    })
    const content = readResult('s-txt-arr', 'txt')
    assert.equal(content, 'line one\nline two\nline three\n')
  })

  test('single string produces single line', async () => {
    await run({
      sessionId: 's-txt-str',
      format: 'txt',
      records: 'hello',
    })
    const content = readResult('s-txt-str', 'txt')
    assert.equal(content, 'hello\n')
  })
})

describe('write_result — misc', () => {
  test('records passed as JSON string are parsed', async () => {
    await run({
      sessionId: 's-json-string-input',
      format: 'csv',
      records: JSON.stringify([{ name: 'Carol' }]),
    })
    const content = readResult('s-json-string-input', 'csv')
    assert.equal(content, 'name\nCarol\n')
  })

  test('unknown format throws', async () => {
    await assert.rejects(
      () => run({ sessionId: 's-bad', format: 'pdf', records: [] }),
      /Unknown format/,
    )
  })

  test('return payload reports path, format, record count', async () => {
    const out = await run({
      sessionId: 's-return',
      format: 'json',
      records: [1, 2, 3],
    })
    assert.equal(out.format, 'json')
    assert.equal(out.records, 3)
    assert.ok(out.path.endsWith('result.json'))
  })
})
