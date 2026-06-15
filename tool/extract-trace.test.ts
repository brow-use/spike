import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { extractTrace, parseTraceEvents, isRealUrl } from './extract-trace.js'

const REAL_TRACE = '/Users/viveksingh/projects/brow-use/spike/output/trace/explore-1745385600000-1776920691136.zip'

const APP = 'https://app-staging.mobilock.in/cloud/dashboard'

function frameSnapshot(callId: string, snapshotName: string, frameUrl: string) {
  return { type: 'frame-snapshot', snapshot: { callId, snapshotName, frameUrl } }
}
function ariaBefore(callId: string, startTime = 1) {
  return { type: 'before', callId, method: 'ariaSnapshot', startTime }
}
function ariaAfter(callId: string, tree: string, endTime: number) {
  return { type: 'after', callId, endTime, result: { snapshot: tree } }
}

describe('parseTraceEvents — CRX about:blank URL fallback', () => {
  test('recovers the navigated URL when the call frame snapshot is about:blank', () => {
    const events = [
      frameSnapshot('c1', 'main', `${APP}/airthink`),
      frameSnapshot('c1', `before@c1`, 'about:blank'),
      ariaBefore('c1'),
      frameSnapshot('c1', `after@c1`, 'about:blank'),
      ariaAfter('c1', '- heading "AirThink"', 100),
    ] as never[]

    const { ariaCalls } = parseTraceEvents(events, new Set([`${APP}/airthink`]))
    assert.equal(ariaCalls.length, 1)
    assert.equal(ariaCalls[0].frameUrl, `${APP}/airthink`)
  })

  test('prefers the per-call frame URL when it is real (Playwright mode)', () => {
    const events = [
      frameSnapshot('c1', 'main', `${APP}/airthink`),
      ariaBefore('c1'),
      frameSnapshot('c1', `after@c1`, `${APP}/workflows`),
      ariaAfter('c1', '- heading "Workflows"', 100),
    ] as never[]

    const { ariaCalls } = parseTraceEvents(events, new Set([`${APP}/airthink`, `${APP}/workflows`]))
    assert.equal(ariaCalls[0].frameUrl, `${APP}/workflows`)
  })

  test('ignores third-party iframe URLs not in the navigated set', () => {
    const events = [
      frameSnapshot('c1', 'main', `${APP}/webhooks`),
      frameSnapshot('f', 'sub', 'https://m.stripe.network/inner.html#x'),
      ariaBefore('c1'),
      frameSnapshot('c1', `after@c1`, 'about:blank'),
      ariaAfter('c1', '- heading "Webhooks"', 100),
    ] as never[]

    const { ariaCalls } = parseTraceEvents(events, new Set([`${APP}/webhooks`]))
    assert.equal(ariaCalls[0].frameUrl, `${APP}/webhooks`)
  })

  test('tracks the most recent navigated URL across multiple pages', () => {
    const events = [
      frameSnapshot('n', 'm', `${APP}/airthink`),
      ariaBefore('c1'), frameSnapshot('c1', `after@c1`, 'about:blank'), ariaAfter('c1', '- heading "A"', 100),
      frameSnapshot('n', 'm', `${APP}/compliance`),
      ariaBefore('c2'), frameSnapshot('c2', `after@c2`, 'about:blank'), ariaAfter('c2', '- heading "C"', 200),
    ] as never[]

    const { ariaCalls } = parseTraceEvents(events, new Set([`${APP}/airthink`, `${APP}/compliance`]))
    assert.deepEqual(ariaCalls.map(c => c.frameUrl), [`${APP}/airthink`, `${APP}/compliance`])
  })

  test('with no sidecar (empty navigated set) accepts any http(s) URL', () => {
    const events = [
      frameSnapshot('n', 'm', `${APP}/geofences`),
      ariaBefore('c1'), frameSnapshot('c1', `after@c1`, 'about:blank'), ariaAfter('c1', '- heading "G"', 100),
    ] as never[]

    const { ariaCalls } = parseTraceEvents(events, new Set())
    assert.equal(ariaCalls[0].frameUrl, `${APP}/geofences`)
  })

  test('falls back to empty string when no real URL is ever seen', () => {
    const events = [
      ariaBefore('c1'), frameSnapshot('c1', `after@c1`, 'about:blank'), ariaAfter('c1', '- heading "X"', 100),
    ] as never[]

    const { ariaCalls } = parseTraceEvents(events, new Set([`${APP}/airthink`]))
    assert.equal(ariaCalls[0].frameUrl, '')
  })

  test('reconstructs navigate/click/type actions from before events', () => {
    const events = [
      { type: 'before', callId: 'a', method: 'goto', startTime: 1, params: { url: `${APP}/devices` } },
      { type: 'before', callId: 'b', method: 'click', startTime: 2, params: { selector: 'role=link[name="X"]' } },
      { type: 'before', callId: 'd', method: 'fill', startTime: 3, params: { selector: 'role=textbox', value: 'hi' } },
    ] as never[]

    const { actions } = parseTraceEvents(events, new Set())
    assert.deepEqual(actions, [
      { t: 1000, name: 'navigate', url: `${APP}/devices` },
      { t: 2000, name: 'click', selector: 'role=link[name="X"]' },
      { t: 3000, name: 'type', selector: 'role=textbox', text: 'hi' },
    ])
  })
})

describe('isRealUrl', () => {
  test('rejects about:blank, empty, and non-http', () => {
    assert.equal(isRealUrl('about:blank'), false)
    assert.equal(isRealUrl(''), false)
    assert.equal(isRealUrl(undefined), false)
    assert.equal(isRealUrl('chrome://newtab'), false)
  })
  test('accepts http(s) URLs', () => {
    assert.equal(isRealUrl('https://example.com/x'), true)
    assert.equal(isRealUrl('http://example.com'), true)
  })
})

test('extract_trace produces aria log + per-step screenshots + action sidecar', async (t) => {
  if (!fs.existsSync(REAL_TRACE)) {
    t.skip(`reference trace not present: ${REAL_TRACE}`)
    return
  }

  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'extract-trace-'))
  fs.mkdirSync(path.join(outputDir, 'trace'), { recursive: true })
  const sessionId = 'explore-1745385600000'
  fs.symlinkSync(REAL_TRACE, path.join(outputDir, 'trace', path.basename(REAL_TRACE)))

  const raw = await extractTrace.execute({ sessionId }, {
    page: null as never, context: null as never, outputDir,
  })
  const res = JSON.parse(raw as string)

  assert.equal(res.entries, 10, 'dedupes consecutive identical aria trees to 10 novel pages')
  assert.equal(res.screenshotsWritten, 10, 'one screenshot per deduped page')
  assert.equal(res.actionsWritten, 10, 'reconstructs navigate actions from before/goto events')

  const jsonl = fs.readFileSync(res.ariaLogPath, 'utf-8').split('\n').filter(Boolean)
  assert.equal(jsonl.length, 10)
  const first = JSON.parse(jsonl[0])
  assert.equal(first.stepId, '0000')
  assert.match(first.url, /app\.avniproject\.org/)
  assert.ok(first.title, 'title extracted from aria heading')
  assert.ok(first.ariaSummary.length > 0, 'ariaSummary derived from aria tree')
  assert.ok(first.ariaTree.length > 100, 'full aria tree preserved')
  assert.equal(typeof first.traceEndMs, 'number', 'traceEndMs preserved from trace')
  assert.ok(first.traceEndMs > 0, 'traceEndMs is a non-zero monotonic timestamp')

  const shotFiles = fs.readdirSync(res.screenshotsDir).sort()
  assert.equal(shotFiles.length, 10)
  assert.equal(shotFiles[0], 'page-0000.jpg')
  assert.equal(shotFiles[9], 'page-0009.jpg')
})

test('extract_trace does not overwrite an existing action sidecar (CRX-mode sidecar wins)', async (t) => {
  if (!fs.existsSync(REAL_TRACE)) {
    t.skip(`reference trace not present: ${REAL_TRACE}`)
    return
  }

  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'extract-trace-'))
  fs.mkdirSync(path.join(outputDir, 'trace'), { recursive: true })
  const sessionId = 'explore-1745385600000'
  fs.symlinkSync(REAL_TRACE, path.join(outputDir, 'trace', path.basename(REAL_TRACE)))
  const preExisting = path.join(outputDir, 'trace', `${sessionId}-actions.jsonl`)
  fs.writeFileSync(preExisting, '{"t":1,"name":"click","selector":"text=Custom"}\n')

  const raw = await extractTrace.execute({ sessionId }, {
    page: null as never, context: null as never, outputDir,
  })
  const res = JSON.parse(raw as string)

  assert.equal(res.actionsWritten, 0, 'does not overwrite existing sidecar')
  assert.equal(res.actionsPath, null)
  const keptContent = fs.readFileSync(preExisting, 'utf-8')
  assert.match(keptContent, /Custom/, 'pre-existing CRX sidecar preserved verbatim')
})

test('extract_trace preserves an aria log already written incrementally by the run', async (t) => {
  if (!fs.existsSync(REAL_TRACE)) {
    t.skip(`reference trace not present: ${REAL_TRACE}`)
    return
  }

  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'extract-trace-'))
  fs.mkdirSync(path.join(outputDir, 'trace'), { recursive: true })
  fs.mkdirSync(path.join(outputDir, 'exploration'), { recursive: true })
  const sessionId = 'explore-1745385600000'
  fs.symlinkSync(REAL_TRACE, path.join(outputDir, 'trace', path.basename(REAL_TRACE)))

  const ariaLogPath = path.join(outputDir, 'exploration', `${sessionId}.jsonl`)
  const incremental = [
    { stepId: '0000', url: 'https://app.example.com/a', title: 'A', ariaSummary: 's', ariaTree: '- heading "A"', timestamp: 't' },
    { stepId: '0001', url: 'https://app.example.com/b', title: 'B', ariaSummary: 's', ariaTree: '- heading "B"', timestamp: 't' },
  ]
  fs.writeFileSync(ariaLogPath, incremental.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf-8')

  const raw = await extractTrace.execute({ sessionId }, {
    page: null as never, context: null as never, outputDir,
  })
  const res = JSON.parse(raw as string)

  assert.equal(res.ariaLogPreserved, true, 'flags the existing log as preserved')
  assert.equal(res.entries, 2, 'reports the count from the preserved file, not the trace')
  assert.equal(res.screenshotsWritten, 0, 'does not extract misaligned screenshots when the log is preserved — live capture owns them')
  assert.equal(fs.existsSync(res.screenshotsDir), false, 'no screenshot dir created when log is preserved')
  const kept = fs.readFileSync(ariaLogPath, 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  assert.deepEqual(kept, incremental, 'incremental aria log left untouched')
})
