import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { writeSkippedLog } from './write-skipped-log.js'
import type { ToolContext } from './tool.js'

function ctxWithTempDir(): { ctx: ToolContext; outputDir: string } {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skipped-log-'))
  return { ctx: { page: null as never, context: null as never, outputDir }, outputDir }
}

const entry = {
  url: 'https://app.example.com/devices/456',
  urlTemplate: 'https://app.example.com/devices/:id',
  structuralHash: 'skel-detail',
  representativeStepId: '0003',
  representativeUrl: 'https://app.example.com/devices/123',
  title: 'MacBook Pro',
  reason: 'same-template',
  timestamp: '2026-06-15T00:00:00.000Z',
}

describe('write_skipped_log', () => {
  test('appends entries across calls and reports running total', async () => {
    const { ctx, outputDir } = ctxWithTempDir()
    const first = JSON.parse(await writeSkippedLog.execute({ sessionId: 'explore-1', entries: [entry] }, ctx) as string)
    assert.equal(first.entries, 1)
    assert.equal(first.appended, true)
    assert.equal(first.total, 1)

    const second = JSON.parse(await writeSkippedLog.execute({ sessionId: 'explore-1', entries: [entry, entry] }, ctx) as string)
    assert.equal(second.total, 3)

    const lines = fs.readFileSync(path.join(outputDir, 'exploration', 'explore-1-skipped.jsonl'), 'utf-8')
      .split('\n').filter(Boolean)
    assert.equal(lines.length, 3)
    assert.deepEqual(JSON.parse(lines[0]), entry)
  })

  test('entries accepted as a JSON string', async () => {
    const { ctx } = ctxWithTempDir()
    const res = JSON.parse(await writeSkippedLog.execute({ sessionId: 'explore-2', entries: JSON.stringify([entry]) }, ctx) as string)
    assert.equal(res.total, 1)
  })

  test('append:false overwrites', async () => {
    const { ctx } = ctxWithTempDir()
    await writeSkippedLog.execute({ sessionId: 'explore-3', entries: [entry, entry] }, ctx)
    const res = JSON.parse(await writeSkippedLog.execute({ sessionId: 'explore-3', entries: [entry], append: false }, ctx) as string)
    assert.equal(res.total, 1)
  })
})
