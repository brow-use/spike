import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { computeObservedEdges } from './observed-edges.js'

const SESSION = 'explore-1777025000000'
const REAL_ARIA = `/Users/viveksingh/projects/brow-use/spike/output/exploration/${SESSION}.jsonl`
const REAL_SIDECAR = `/Users/viveksingh/projects/brow-use/spike/output/trace/${SESSION}-actions.jsonl`

test('computeObservedEdges matches navigates and the Completed Visits click for the real run', (t) => {
  if (!fs.existsSync(REAL_ARIA) || !fs.existsSync(REAL_SIDECAR)) {
    t.skip('reference explore run artifacts not present')
    return
  }

  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'observed-edges-'))
  fs.mkdirSync(path.join(outputDir, 'exploration'), { recursive: true })
  fs.mkdirSync(path.join(outputDir, 'trace'), { recursive: true })
  fs.symlinkSync(REAL_ARIA, path.join(outputDir, 'exploration', `${SESSION}.jsonl`))
  fs.symlinkSync(REAL_SIDECAR, path.join(outputDir, 'trace', `${SESSION}-actions.jsonl`))

  const result = computeObservedEdges(SESSION, outputDir)

  assert.equal(result.sidecarFound, true)
  assert.equal(result.ariaPages, 16)
  assert.equal(result.edges.length, 15, 'one edge per consecutive aria pair')

  // Most edges should be sidecar-sourced and high-confidence.
  assert.ok(result.counts.high >= 13, `expected at least 13 high-confidence edges, got ${result.counts.high}`)

  // The Completed Visits click (pair aria[11]→aria[12]) must be attributed to the observed click, not a heuristic.
  const completedVisits = result.edges.find(e => e.fromStepId === '0011' && e.toStepId === '0012')
  assert.ok(completedVisits, 'edge 0011→0012 exists')
  assert.equal(completedVisits!.source, 'sidecar')
  assert.equal(completedVisits!.trigger.method, 'click')
  assert.equal(completedVisits!.trigger.role, 'button')
  assert.equal(completedVisits!.trigger.name, 'Completed Visits')
  assert.equal(completedVisits!.phrasing, 'select Completed Visits')

  // A same-URL transition with no sidecar trigger (aria[7]→aria[8], both /#/translations) should fall back to aria heuristic.
  const translationsSelf = result.edges.find(e => e.fromStepId === '0007' && e.toStepId === '0008')
  assert.ok(translationsSelf, 'edge 0007→0008 exists')
  assert.notEqual(translationsSelf!.source, 'sidecar', 'no sidecar trigger for same-url same-url transition')

  // Navigate-driven edge: /home → /app must be sidecar-sourced with url preserved.
  const homeToApp = result.edges.find(e => e.fromStepId === '0000' && e.toStepId === '0001')
  assert.ok(homeToApp)
  assert.equal(homeToApp!.source, 'sidecar')
  assert.equal(homeToApp!.trigger.method, 'navigate')
  assert.ok(homeToApp!.trigger.url?.includes('/#/app'))

  // Case-insensitive URL match: sidecar navigate→/#/appdesigner/encounterType should match aria /#/appDesigner/encounterType.
  const encounterTypes = result.edges.find(e => e.fromStepId === '0014' && e.toStepId === '0015')
  assert.ok(encounterTypes)
  assert.equal(encounterTypes!.source, 'sidecar')
})

test('computeObservedEdges falls back to aria heuristic when no sidecar is present', (t) => {
  if (!fs.existsSync(REAL_ARIA)) {
    t.skip('reference explore aria log not present')
    return
  }

  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'observed-edges-nosidecar-'))
  fs.mkdirSync(path.join(outputDir, 'exploration'), { recursive: true })
  fs.mkdirSync(path.join(outputDir, 'trace'), { recursive: true })
  fs.symlinkSync(REAL_ARIA, path.join(outputDir, 'exploration', `${SESSION}.jsonl`))
  // No sidecar.

  const result = computeObservedEdges(SESSION, outputDir)
  assert.equal(result.sidecarFound, false)
  assert.equal(result.edges.length, 15)
  // No edges should be marked as sidecar-sourced.
  for (const e of result.edges) {
    assert.notEqual(e.source, 'sidecar')
  }
})
