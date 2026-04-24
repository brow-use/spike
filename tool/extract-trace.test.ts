import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { extractTrace } from './extract-trace.js'

const REAL_TRACE = '/Users/viveksingh/projects/brow-use/spike/output/trace/explore-1745385600000-1776920691136.zip'

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
