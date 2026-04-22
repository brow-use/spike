import fs from 'fs'
import path from 'path'
import { chromium } from 'playwright'
import type { Browser, BrowserContext, Page } from 'playwright'
import { WebSocketServer } from 'ws'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import type { Tool, ToolContext } from '../tool/tool.js'
import { CrxClient } from './crx-client.js'
import { log } from './logger.js'
import { navigate } from '../tool/navigate.js'
import { click } from '../tool/click.js'
import { type as typeTool } from '../tool/type.js'
import { snapshot } from '../tool/snapshot.js'
import { getAccessibilityTree } from '../tool/get-accessibility-tree.js'
import { startTrace } from '../tool/start-trace.js'
import { stopTrace } from '../tool/stop-trace.js'
import { writePageObject } from '../tool/write-page-object.js'
import { writeWorkflow } from '../tool/write-workflow.js'
import { writeTest } from '../tool/write-test.js'
import { clearSession } from '../tool/clear-session.js'
import { pageFingerprint, ariaHash as computeAriaHash } from '../tool/page-fingerprint.js'
import { compareFingerprint } from '../tool/compare-fingerprint.js'
import { writeFeatureDoc } from '../tool/write-feature-doc.js'
import { saveScreenshot } from '../tool/save-screenshot.js'
import { dhash } from '../tool/phash.js'
const OUTPUT_DIR = path.resolve(process.cwd(), 'output')
const SERVER_START = Date.now()

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)),
  ])
}

const browserTools: Tool[] = [
  navigate, click, typeTool, snapshot, getAccessibilityTree,
  startTrace, stopTrace, writePageObject, writeWorkflow, writeTest, clearSession,
  pageFingerprint, compareFingerprint, writeFeatureDoc, saveScreenshot,
]

function ensureOutputDirs(): void {
  for (const dir of ['page', 'workflow', 'trace', 'docs', 'exploration']) {
    fs.mkdirSync(path.join(OUTPUT_DIR, dir), { recursive: true })
  }
}
ensureOutputDirs()

const appTools = [
  {
    name: 'set_mode',
    description: 'Switch execution mode. Use "playwright" for a fresh Chromium instance (default), or "crx" to automate the user\'s real Chrome session via the brow-use extension.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        mode: { type: 'string', enum: ['playwright', 'crx'], description: 'Execution mode' },
      },
      required: ['mode'],
    },
  },
  {
    name: 'list_tabs',
    description: 'List all open Chrome tabs (session mode only). Returns id, title, url, and active flag for each tab.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'select_tab',
    description: 'Pin session-mode automation to a specific tab by its id. Call list_tabs first to find the id.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tabId: { type: 'number', description: 'Tab id from list_tabs' },
      },
      required: ['tabId'],
    },
  },
  {
    name: 'health_check',
    description: 'Verify the MCP server, Chrome extension, and their connection are healthy. Call this before long-running commands that depend on the browser. Returns structured JSON with mode, extension status, browser status, and a list of issues each with a remedy.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
]

const crxClient = new CrxClient(OUTPUT_DIR)

const wss = new WebSocketServer({ port: 3456 })
wss.on('connection', (socket) => {
  log('extension connected')
  crxClient.attachSocket(socket)
  socket.on('close', () => log('extension disconnected'))
})

let executionMode: 'playwright' | 'crx' = 'playwright'

let browser: Browser | null = null
let browserContext: BrowserContext | null = null
let page: Page | null = null

interface HealthIssue { kind: string; message: string; remedy: string }

async function buildHealthStatus() {
  const issues: HealthIssue[] = []
  const mcp = { uptimeSec: Math.round((Date.now() - SERVER_START) / 1000), pid: process.pid }

  let extensionBlock: Record<string, unknown>
  if (executionMode === 'crx') {
    if (!crxClient.connected) {
      extensionBlock = { required: true, connected: false }
      issues.push({
        kind: 'extension-disconnected',
        message: 'Chrome extension is not connected to the MCP WebSocket server.',
        remedy: 'Load the brow-use extension at chrome://extensions (Load unpacked → dist/extension/), then /mcp → reconnect bu.',
      })
    } else {
      const start = Date.now()
      try {
        const pong = await withTimeout(crxClient.ping(), 3000) as {
          version?: string
          selectedTabId?: number | null
          currentTabUrl?: string | null
          currentTabTitle?: string | null
        }
        const rtt = Date.now() - start
        extensionBlock = {
          required: true,
          connected: true,
          pingRoundTripMs: rtt,
          version: pong.version ?? 'unknown',
          selectedTabId: pong.selectedTabId ?? null,
          currentTabUrl: pong.currentTabUrl ?? null,
          currentTabTitle: pong.currentTabTitle ?? null,
        }
        if (pong.selectedTabId == null) {
          issues.push({
            kind: 'no-selected-tab',
            message: 'Extension is connected but no tab has been pinned for automation.',
            remedy: 'Run /bu:use-session and pick a tab.',
          })
        }
      } catch (err) {
        extensionBlock = { required: true, connected: true, pingFailed: String(err) }
        issues.push({
          kind: 'extension-ping-timeout',
          message: 'Extension is connected but did not respond to ping within 3s.',
          remedy: 'Reload the extension at chrome://extensions (click the refresh icon) and try again.',
        })
      }
    }
  } else {
    extensionBlock = { required: false }
  }

  const browserBlock = page && !page.isClosed()
    ? { launched: true, currentUrl: page.url(), currentTitle: await page.title() }
    : { launched: false, currentUrl: null, currentTitle: null }

  return {
    ok: issues.length === 0,
    mode: executionMode,
    mcp,
    extension: extensionBlock,
    browser: browserBlock,
    issues,
  }
}

async function ensureBrowser(): Promise<ToolContext> {
  if (!page || page.isClosed()) {
    await browserContext?.close().catch(() => {})
    await browser?.close().catch(() => {})
    browser = await chromium.launch({ headless: false })
    browserContext = await browser.newContext()
    page = await browserContext.newPage()
  }
  return { page: page!, context: browserContext!, outputDir: OUTPUT_DIR }
}

const server = new Server(
  { name: 'brow-use', version: '0.1.0' },
  { capabilities: { tools: {} } },
)


server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    ...browserTools.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
    ...appTools,
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params
  log('call', name, args)

  const appTool = appTools.find(t => t.name === name)
  if (appTool) {
    try {
      if (name === 'set_mode') {
        executionMode = args.mode as 'playwright' | 'crx'
        log('mode', executionMode)
        return { content: [{ type: 'text', text: `Execution mode set to: ${executionMode}` }] }
      }
      if (name === 'health_check') {
        const status = await buildHealthStatus()
        log('health', status.ok ? 'ok' : 'issues', status.issues.length)
        return { content: [{ type: 'text', text: JSON.stringify(status) }] }
      }
      if (name === 'list_tabs' || name === 'select_tab') {
        const result = await crxClient.execute(name, args)
        log('result', name, typeof result === 'string' ? result.slice(0, 200) : `[${result.length} blocks]`)
        if (typeof result === 'string') {
          return { content: [{ type: 'text', text: result }] }
        }
        return { content: result.map(block => block.type === 'image'
          ? { type: 'image' as const, data: block.source.data, mimeType: block.source.media_type }
          : { type: 'text' as const, text: block.text }) }
      }
    } catch (err) {
      log('error', name, err)
      return { content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }], isError: true }
    }
  }

  const browserTool = browserTools.find(t => t.name === name)
  if (!browserTool) {
    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true }
  }

  const fileOnlyTools = new Set(['write_page_object', 'write_workflow', 'write_test', 'write_feature_doc'])
  const pureComputeTools = new Set(['compare_fingerprint'])

  try {
    let result: string | import('../tool/tool.js').ToolResultContent[]
    if (pureComputeTools.has(name) || fileOnlyTools.has(name)) {
      result = await browserTool.execute(args, { page: null as unknown as Page, context: null as unknown as BrowserContext, outputDir: OUTPUT_DIR })
    } else if (executionMode === 'crx' && name === 'page_fingerprint') {
      const [snapResult, ariaResult] = await Promise.all([
        crxClient.execute('snapshot', {}),
        crxClient.execute('get_accessibility_tree', {}),
      ])
      const base64 = Array.isArray(snapResult) ? (snapResult[0] as { source: { data: string } }).source.data : ''
      const phash = dhash(Buffer.from(base64, 'base64'))
      const ariaText = typeof ariaResult === 'string' ? ariaResult : ''
      result = JSON.stringify({ phash, ariaHash: computeAriaHash(ariaText) })
    } else if (executionMode === 'crx' && name === 'save_screenshot') {
      const sessionId = args.sessionId as string
      const shotName = args.name as string
      const snapResult = await crxClient.execute('snapshot', {})
      const base64 = Array.isArray(snapResult) ? (snapResult[0] as { source: { data: string } }).source.data : ''
      const dir = path.join(OUTPUT_DIR, 'exploration', sessionId)
      fs.mkdirSync(dir, { recursive: true })
      const filePath = path.join(dir, `${shotName}.png`)
      fs.writeFileSync(filePath, Buffer.from(base64, 'base64'))
      const relToDocs = path.join('..', 'exploration', sessionId, `${shotName}.png`)
      result = JSON.stringify({ absolutePath: filePath, relativeToDocs: relToDocs })
    } else if (executionMode === 'crx' && !fileOnlyTools.has(name)) {
      result = await crxClient.execute(name, args)
    } else {
      const ctx = await ensureBrowser()
      result = await browserTool.execute(args, ctx)
    }
    log('result', name, typeof result === 'string' ? result.slice(0, 200) : `[${result.length} blocks]`)
    if (typeof result === 'string') {
      return { content: [{ type: 'text', text: result }] }
    }
    return {
      content: result.map(block => {
        if (block.type === 'image') {
          return { type: 'image' as const, data: block.source.data, mimeType: block.source.media_type }
        }
        return { type: 'text' as const, text: block.text }
      }),
    }
  } catch (err) {
    log('error', name, err)
    return {
      content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }],
      isError: true,
    }
  }
})

process.on('SIGTERM', async () => {
  wss.close()
  await browserContext?.close()
  await browser?.close()
  process.exit(0)
})

const transport = new StdioServerTransport()
await server.connect(transport)
