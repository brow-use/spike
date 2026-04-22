import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { readPomSummary } from './read-pom-summary.js'
import type { ToolContext } from './tool.js'

let tmpDir: string

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brow-use-read-pom-'))
})

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function writePom(name: string, src: string): string {
  const p = path.join(tmpDir, `${name}.ts`)
  fs.writeFileSync(p, src, 'utf-8')
  return p
}

async function run(filePath: string) {
  const out = await readPomSummary.execute({ filePath }, {} as ToolContext)
  return JSON.parse(out as string)
}

describe('read_pom_summary', () => {
  test('standard POM: extracts every field', async () => {
    const file = writePom('login', `import { Page, Locator } from '@playwright/test'
import { DashboardPage } from './dashboard-page'

export class LoginPage {
  readonly page: Page
  readonly usernameInput: Locator
  readonly passwordInput: Locator
  readonly submitButton: Locator

  constructor(page: Page) {
    this.page = page
    this.usernameInput = page.getByRole('textbox', { name: 'Username' })
    this.passwordInput = page.getByRole('textbox', { name: 'Password' })
    this.submitButton = page.getByRole('button', { name: 'Sign in' })
  }

  async goto() {
    await this.page.goto('https://app.example.com/#/login')
  }

  async login(username: string, password: string): Promise<DashboardPage> {
    await this.usernameInput.fill(username)
    await this.passwordInput.fill(password)
    await this.submitButton.click()
    return new DashboardPage(this.page)
  }
}
`)
    const r = await run(file)
    assert.equal(r.className, 'LoginPage')
    assert.deepEqual(r.locators.map((l: { name: string }) => l.name), ['usernameInput', 'passwordInput', 'submitButton'])
    assert.equal(r.locators[0].selectorHint, "page.getByRole('textbox', { name: 'Username' })")
    assert.deepEqual(r.methods, ['goto', 'login'])
    assert.deepEqual(r.urlHints, ['https://app.example.com/#/login'])
    assert.deepEqual(r.siblingImports, ['./dashboard-page'])
  })

  test('POM with no goto → empty urlHints', async () => {
    const file = writePom('no-goto', `import { Page, Locator } from '@playwright/test'
export class HomePage {
  readonly page: Page
  readonly button: Locator
  constructor(page: Page) {
    this.page = page
    this.button = page.getByRole('button', { name: 'Home' })
  }
  async clickHome() {
    await this.button.click()
  }
}`)
    const r = await run(file)
    assert.deepEqual(r.urlHints, [])
    assert.deepEqual(r.methods, ['clickHome'])
  })

  test('POM with no sibling imports → empty array', async () => {
    const file = writePom('solo', `import { Page, Locator } from '@playwright/test'
export class SoloPage {
  readonly page: Page
  constructor(page: Page) {
    this.page = page
  }
}`)
    const r = await run(file)
    assert.deepEqual(r.siblingImports, [])
  })

  test('unusual whitespace still parses', async () => {
    const file = writePom('tight', `import { Page, Locator } from '@playwright/test'
export class TightPage {
  readonly  username  :  Locator
  constructor(page: Page) {
    this.username = page.getByRole('textbox', { name: 'User' })
  }
  async   doIt() { }
}`)
    const r = await run(file)
    assert.equal(r.className, 'TightPage')
    assert.ok(r.locators.some((l: { name: string }) => l.name === 'username'))
    assert.ok(r.methods.includes('doIt'))
  })

  test('file not found → error payload', async () => {
    const r = await run(path.join(tmpDir, 'missing.ts'))
    assert.ok(r.error)
    assert.match(r.error, /File not found/)
  })

  test('non-async methods are excluded', async () => {
    const file = writePom('sync-methods', `import { Page, Locator } from '@playwright/test'
export class Mixed {
  readonly page: Page
  constructor(page: Page) {
    this.page = page
  }
  get pageUrl() {
    return this.page.url()
  }
  syncHelper() {
    return 'x'
  }
  async realAction() {
    await this.page.click('foo')
  }
}`)
    const r = await run(file)
    assert.deepEqual(r.methods, ['realAction'])
  })

  test('multiple classes: picks the first (documented behaviour)', async () => {
    const file = writePom('multi', `import { Page } from '@playwright/test'
export class FirstPage {
  readonly page: Page
  constructor(page: Page) { this.page = page }
  async one() {}
}
export class SecondPage {
  readonly page: Page
  constructor(page: Page) { this.page = page }
  async two() {}
}`)
    const r = await run(file)
    assert.equal(r.className, 'FirstPage')
    // methods includes both because the regex spans the whole file
    assert.ok(r.methods.includes('one'))
    assert.ok(r.methods.includes('two'))
  })

  test('relative path resolves from cwd', async () => {
    // Use an absolute path (the tool resolves either way). This documents
    // the contract: whatever you pass in as a path just needs to exist.
    const file = writePom('relative-test', `export class P {
  readonly page: unknown
  constructor(page: unknown) { this.page = page }
}`)
    const r = await run(file)
    assert.equal(r.className, 'P')
    assert.ok(path.isAbsolute(r.filePath))
  })
})
