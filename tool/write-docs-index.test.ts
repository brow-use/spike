import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { writeDocsIndex } from './write-docs-index.js'
import type { ToolContext } from './tool.js'

let outputDir: string

before(() => {
  outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brow-use-docs-index-'))
})

after(() => {
  fs.rmSync(outputDir, { recursive: true, force: true })
})

async function run(input: Record<string, unknown>) {
  const out = await writeDocsIndex.execute(input, {
    page: null as never,
    context: null as never,
    outputDir,
  } as ToolContext)
  return JSON.parse(out as string)
}

function readReadme(sessionId: string): string {
  return fs.readFileSync(path.join(outputDir, 'docs', sessionId, 'README.md'), 'utf-8')
}

describe('write_docs_index', () => {
  const baseInput = {
    sessionId: 'explore-12345',
    appName: 'Demo App',
    appUrl: 'https://demo.example.com/',
    appDescription: 'A demo CRM.',
    entries: [
      { slug: 'getting-around', title: 'Getting around', summary: 'Home hub navigation.' },
      { slug: 'recording-a-visit', title: 'Recording a visit', summary: 'Dated encounter flow.' },
    ],
  }

  test('renders heading, app metadata, TOC rows', async () => {
    await run(baseInput)
    const content = readReadme('explore-12345')
    assert.match(content, /^# Demo App — User Guide/)
    assert.ok(content.includes('**App:** Demo App'))
    assert.ok(content.includes('**URL:** https://demo.example.com/'))
    assert.ok(content.includes('`explore-12345`'))
    assert.ok(content.includes('**What the app is:** A demo CRM.'))
    assert.ok(content.includes('| [Getting around](./getting-around.md) | Home hub navigation. |'))
    assert.ok(content.includes('| [Recording a visit](./recording-a-visit.md) | Dated encounter flow. |'))
  })

  test('TOC links use relative ./slug.md paths', async () => {
    await run(baseInput)
    const content = readReadme('explore-12345')
    for (const e of baseInput.entries) {
      assert.match(content, new RegExp(`\\[${e.title}\\]\\(\\./${e.slug}\\.md\\)`))
    }
  })

  test('missing appDescription skips that section', async () => {
    await run({ ...baseInput, sessionId: 'no-desc', appDescription: undefined })
    const content = readReadme('no-desc')
    assert.ok(!content.includes('**What the app is:**'))
    // TOC still present
    assert.ok(content.includes('[Getting around]'))
  })

  test('stats block is rendered when provided', async () => {
    await run({
      ...baseInput,
      sessionId: 'with-stats',
      stats: { pagesVisited: 23, terminationReason: 'maxLoopHits' },
    })
    const content = readReadme('with-stats')
    assert.match(content, /Visited 23 pages/)
    assert.match(content, /terminated on maxLoopHits/)
  })

  test('footer references trace zip, jsonl, and screenshots paths', async () => {
    await run(baseInput)
    const content = readReadme('explore-12345')
    assert.ok(content.includes('output/trace/explore-12345-*.zip'))
    assert.ok(content.includes('output/exploration/explore-12345.jsonl'))
    assert.ok(content.includes('output/exploration/explore-12345/'))
    assert.ok(content.includes('npx playwright show-trace'))
  })

  test('entries passed as JSON string are parsed', async () => {
    await run({
      ...baseInput,
      sessionId: 'str-entries',
      entries: JSON.stringify(baseInput.entries),
    })
    const content = readReadme('str-entries')
    assert.ok(content.includes('| [Getting around]'))
  })

  test('return payload reports path + entry count', async () => {
    const r = await run({ ...baseInput, sessionId: 'retval' })
    assert.equal(r.entries, 2)
    assert.ok(r.path.endsWith(path.join('retval', 'README.md')))
  })
})
