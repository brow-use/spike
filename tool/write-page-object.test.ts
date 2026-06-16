import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { writePageObject } from './write-page-object.js'
import type { ToolContext } from './tool.js'

let outputDir: string

before(() => {
  outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brow-use-pom-'))
})

after(() => {
  fs.rmSync(outputDir, { recursive: true, force: true })
})

async function run(input: Record<string, unknown>) {
  return writePageObject.execute(input, {
    page: null as never,
    context: null as never,
    outputDir,
  } as ToolContext)
}

function readMeta(name: string) {
  return JSON.parse(fs.readFileSync(path.join(outputDir, 'page', `${name}.meta.json`), 'utf-8'))
}

function metaExists(name: string): boolean {
  return fs.existsSync(path.join(outputDir, 'page', `${name}.meta.json`))
}

describe('write_page_object', () => {
  test('writes the .ts file', async () => {
    await run({ name: 'login-page', content: 'export class LoginPage {}' })
    const ts = fs.readFileSync(path.join(outputDir, 'page', 'login-page.ts'), 'utf-8')
    assert.equal(ts, 'export class LoginPage {}')
  })

  test('no sessionId → no meta sidecar (back-compat)', async () => {
    await run({ name: 'no-meta', content: 'x' })
    assert.equal(metaExists('no-meta'), false)
  })

  test('sessionId + sources → meta sidecar with provenance', async () => {
    await run({
      name: 'apps-mlp-page',
      content: 'export class AppsMlpPage {}',
      sessionId: 'explore-123',
      sources: [
        { stepId: '0004', url: 'https://app/apps/mlp' },
        { stepId: '0004-1', url: 'https://app/apps/mlp#tab=apple', tab: 'Apple Apps' },
      ],
    })
    const meta = readMeta('apps-mlp-page')
    assert.equal(meta.name, 'apps-mlp-page.ts')
    assert.equal(meta.sessionId, 'explore-123')
    assert.equal(meta.sources.length, 2)
    assert.equal(meta.sources[1].tab, 'Apple Apps')
    assert.ok(typeof meta.generatedAt === 'string')
  })

  test('sources passed as a JSON string are parsed', async () => {
    await run({
      name: 'str-sources',
      content: 'x',
      sessionId: 'explore-9',
      sources: JSON.stringify([{ stepId: '0000', url: '/' }]),
    })
    const meta = readMeta('str-sources')
    assert.deepEqual(meta.sources, [{ stepId: '0000', url: '/' }])
  })

  test('sessionId without sources → meta with empty sources', async () => {
    await run({ name: 'no-sources', content: 'x', sessionId: 'explore-7' })
    assert.deepEqual(readMeta('no-sources').sources, [])
  })
})
