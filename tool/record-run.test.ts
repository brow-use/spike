import { describe, test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { ToolContext } from './tool.js'

let tmpRoot: string
let originalCwd: string
let recordRunModule: typeof import('./record-run.js')

before(async () => {
  originalCwd = process.cwd()
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'brow-use-record-run-'))
  process.chdir(tmpRoot)
  // Import AFTER chdir so RUNS_PATH resolves against the temp dir.
  recordRunModule = await import('./record-run.js')
})

beforeEach(() => {
  // Start each test with a clean runs database.
  const runsPath = path.join(tmpRoot, '.brow-use', 'runs.json')
  if (fs.existsSync(runsPath)) fs.unlinkSync(runsPath)
})

after(() => {
  process.chdir(originalCwd)
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

async function call(input: Record<string, unknown>) {
  const out = await recordRunModule.recordRun.execute(input, {} as ToolContext)
  return JSON.parse(out as string)
}

function readRuns(): { runs: Array<Record<string, unknown>> } {
  return JSON.parse(fs.readFileSync(path.join(tmpRoot, '.brow-use', 'runs.json'), 'utf-8'))
}

describe('record_run', () => {
  test('first call creates the file + appends the entry', async () => {
    const r = await call({
      sessionId: 'explore-1',
      command: 'explore',
      startedAt: '2026-04-22T10:00:00.000Z',
      endedAt: '2026-04-22T10:05:00.000Z',
      appId: 'app-1',
      mode: 'crx',
      pagesVisited: 23,
      terminationReason: 'maxLoopHits',
      artifacts: {
        tracePath: 'output/trace/explore-1-1.zip',
        docsDir: 'output/docs/explore-1/',
      },
    })
    assert.equal(r.total, 1)
    const data = readRuns()
    assert.equal(data.runs.length, 1)
    assert.equal(data.runs[0].sessionId, 'explore-1')
    assert.equal(data.runs[0].pagesVisited, 23)
    assert.equal(data.runs[0].terminationReason, 'maxLoopHits')
    assert.deepEqual(data.runs[0].artifacts, {
      tracePath: 'output/trace/explore-1-1.zip',
      docsDir: 'output/docs/explore-1/',
    })
  })

  test('second call with different sessionId appends', async () => {
    await call({
      sessionId: 'explore-1',
      command: 'explore',
      startedAt: '2026-04-22T10:00:00.000Z',
      endedAt: '2026-04-22T10:05:00.000Z',
      appId: 'app-1',
    })
    const r = await call({
      sessionId: 'do-1',
      command: 'do',
      startedAt: '2026-04-22T11:00:00.000Z',
      endedAt: '2026-04-22T11:01:00.000Z',
      appId: 'app-1',
      intent: 'Get list of X',
      format: 'csv',
      recordsExtracted: 5,
      sourceExploreId: '1',
    })
    assert.equal(r.total, 2)
    const data = readRuns()
    assert.equal(data.runs.length, 2)
    assert.equal(data.runs[1].command, 'do')
    assert.equal(data.runs[1].intent, 'Get list of X')
  })

  test('same sessionId replaces the existing entry', async () => {
    await call({
      sessionId: 'explore-1',
      command: 'explore',
      startedAt: '2026-04-22T10:00:00.000Z',
      endedAt: '2026-04-22T10:05:00.000Z',
      appId: 'app-1',
      pagesVisited: 10,
    })
    await call({
      sessionId: 'explore-1',
      command: 'explore',
      startedAt: '2026-04-22T10:00:00.000Z',
      endedAt: '2026-04-22T10:15:00.000Z',
      appId: 'app-1',
      pagesVisited: 40,
    })
    const data = readRuns()
    assert.equal(data.runs.length, 1)
    assert.equal(data.runs[0].pagesVisited, 40)
  })

  test('appId is null when not provided', async () => {
    await call({
      sessionId: 'wf-1',
      command: 'record-workflow',
      startedAt: 't',
      endedAt: 't',
    })
    const data = readRuns()
    assert.equal(data.runs[0].appId, null)
  })

  test('unknown fields are included but with no validation', async () => {
    // Documented contract: the tool copies known per-command fields verbatim.
    await call({
      sessionId: 'rpo-1',
      command: 'record-page-objects',
      startedAt: 't',
      endedAt: 't',
      appId: 'app-1',
      scenario: 'Login and click create',
      pageObjectFiles: ['output/page/login-page.ts', 'output/page/home-page.ts'],
    })
    const data = readRuns()
    assert.equal(data.runs[0].scenario, 'Login and click create')
    assert.deepEqual(data.runs[0].pageObjectFiles, ['output/page/login-page.ts', 'output/page/home-page.ts'])
  })

  test('artifacts passed as JSON string are parsed', async () => {
    await call({
      sessionId: 'do-str',
      command: 'do',
      startedAt: 't',
      endedAt: 't',
      appId: 'app-1',
      artifacts: JSON.stringify({ tracePath: '/a.zip', resultPath: '/r.csv' }),
    })
    const data = readRuns()
    assert.deepEqual(data.runs[0].artifacts, { tracePath: '/a.zip', resultPath: '/r.csv' })
  })

  test('return payload includes path and running total', async () => {
    await call({
      sessionId: 'explore-a',
      command: 'explore',
      startedAt: 't',
      endedAt: 't',
    })
    const r = await call({
      sessionId: 'explore-b',
      command: 'explore',
      startedAt: 't',
      endedAt: 't',
    })
    assert.equal(r.total, 2)
    assert.ok(r.path.endsWith(path.join('.brow-use', 'runs.json')))
  })

  test('preserves existing entries when called against a file with prior runs', async () => {
    // Seed a file with an entry not produced by this tool instance.
    fs.mkdirSync(path.join(tmpRoot, '.brow-use'), { recursive: true })
    fs.writeFileSync(
      path.join(tmpRoot, '.brow-use', 'runs.json'),
      JSON.stringify({ runs: [{ sessionId: 'pre-existing', command: 'do', startedAt: 't', endedAt: 't', appId: null }] }),
    )
    await call({
      sessionId: 'new',
      command: 'do',
      startedAt: 't',
      endedAt: 't',
      appId: 'app-1',
    })
    const data = readRuns()
    assert.equal(data.runs.length, 2)
    assert.equal(data.runs[0].sessionId, 'pre-existing')
    assert.equal(data.runs[1].sessionId, 'new')
  })

  test('run command is persisted with tracePath + ariaLog artifacts', async () => {
    await call({
      sessionId: 'run-1',
      command: 'run',
      startedAt: '2026-04-23T10:00:00.000Z',
      endedAt: '2026-04-23T10:02:00.000Z',
      appId: 'app-1',
      mode: 'crx',
      intent: 'open the login page',
      artifacts: {
        tracePath: 'output/trace/run-1-1.zip',
        ariaLog: 'output/exploration/run-1.jsonl',
      },
    })
    const data = readRuns()
    assert.equal(data.runs.length, 1)
    assert.equal(data.runs[0].sessionId, 'run-1')
    assert.equal(data.runs[0].command, 'run')
    assert.equal(data.runs[0].intent, 'open the login page')
    assert.deepEqual(data.runs[0].artifacts, {
      tracePath: 'output/trace/run-1-1.zip',
      ariaLog: 'output/exploration/run-1.jsonl',
    })
  })

  test('corrupt runs.json is recovered as empty (does not lose new entry)', async () => {
    fs.mkdirSync(path.join(tmpRoot, '.brow-use'), { recursive: true })
    fs.writeFileSync(path.join(tmpRoot, '.brow-use', 'runs.json'), '{ this is not JSON')
    await call({
      sessionId: 'after-corrupt',
      command: 'do',
      startedAt: 't',
      endedAt: 't',
      appId: 'app-1',
    })
    const data = readRuns()
    assert.equal(data.runs.length, 1)
    assert.equal(data.runs[0].sessionId, 'after-corrupt')
  })
})
