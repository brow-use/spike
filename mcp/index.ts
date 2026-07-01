import fs from 'fs'
import http from 'http'
import path from 'path'
import { randomUUID } from 'crypto'
import { chromium } from 'playwright'
import type { Browser, BrowserContext, Page } from 'playwright'
import { WebSocketServer } from 'ws'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  isInitializeRequest,
} from '@modelcontextprotocol/sdk/types.js'
import type { Tool } from '../tool/tool.js'
import type { ToolContext, ToolResultContent } from '../tool/tool.js'
import { CrxClient } from './crx-client.js'
import { log } from './logger.js'
import { buildHealthStatus } from './health.js'
import { TimingStats } from './timing.js'
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
import { pageFingerprint, ariaHash as computeAriaHash, structuralHash as computeStructuralHash } from '../tool/page-fingerprint.js'
import { compareFingerprint } from '../tool/compare-fingerprint.js'
import { writeFeatureDoc } from '../tool/write-feature-doc.js'
import { saveScreenshot } from '../tool/save-screenshot.js'
import { writeExplorationLog } from '../tool/write-exploration-log.js'
import { writeSkippedLog } from '../tool/write-skipped-log.js'
import { writeDocsIndex } from '../tool/write-docs-index.js'
import { enumerateInteractiveElements, parseInteractive, applyEnumerationFilters } from '../tool/enumerate-interactive-elements.js'
import { writeResult } from '../tool/write-result.js'
import { readPomSummary } from '../tool/read-pom-summary.js'
import { readObservedEdges } from '../tool/read-observed-edges.js'
import { recordRun } from '../tool/record-run.js'
import { logReasoning } from '../tool/log-reasoning.js'
import { dhash } from '../tool/phash.js'
import { recordTraceAction } from '../tool/trace-session.js'
import { ModeRepository } from '../repository/mode-repository.js'
const OUTPUT_DIR = path.resolve(process.cwd(), 'output')
const SERVER_START = Date.now()
const WS_PORT = 3456
const WS_BIND_RETRIES = 5
const WS_BIND_RETRY_DELAY_MS = 1000
const PID_FILE = path.resolve(process.cwd(), '.brow-use/mcp.pid')
const MCP_HTTP_PATH = '/mcp'
const DEFAULT_MCP_HTTP_PORT = 3457

const browserTools: Tool[] = [
  navigate, click, typeTool, snapshot, getAccessibilityTree,
  startTrace, stopTrace, writePageObject, writeWorkflow, writeTest, clearSession,
  pageFingerprint, compareFingerprint, writeFeatureDoc, saveScreenshot,
  writeExplorationLog, writeSkippedLog, writeDocsIndex, enumerateInteractiveElements,
  writeResult, readPomSummary, readObservedEdges, recordRun, logReasoning,
]

function ensureOutputDirs(): void {
  for (const dir of ['page', 'workflow', 'trace', 'docs', 'exploration', 'reasoning']) {
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
    name: 'create_tab',
    description: 'Open a new Chrome tab (session mode only). Automatically pins automation to the new tab. Returns the new tab id and url.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'URL to open. Defaults to about:blank.' },
        active: { type: 'boolean', description: 'Whether to make the new tab active. Defaults to true.' },
      },
      required: [],
    },
  },
  {
    name: 'health_check',
    description: 'Verify the MCP server, Chrome extension, and their connection are healthy. Call this before long-running commands that depend on the browser. Returns structured JSON with mode, extension status, browser status, per-tool timing stats, and a list of issues each with a remedy. Pass heal:true to also attempt automatic recovery (drops a dead extension socket so the extension reconnects, then re-checks).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        heal: { type: 'boolean', description: 'Attempt automatic recovery of a hung extension connection before reporting. Default false.' },
      },
      required: [],
    },
  },
]

const crxClient = new CrxClient(OUTPUT_DIR, { onLog: log })
const timing = new TimingStats()

let activeWss: WebSocketServer | null = null
let activeHttpServer: http.Server | null = null
let httpTransport: StreamableHTTPServerTransport | null = null

function readPortHolderPid(): string {
  try {
    return fs.readFileSync(PID_FILE, 'utf-8').trim() || 'unknown'
  } catch {
    return 'unknown'
  }
}

function cleanupPidFile(): void {
  try {
    if (fs.readFileSync(PID_FILE, 'utf-8').trim() === String(process.pid)) fs.unlinkSync(PID_FILE)
  } catch {}
}

function startWebSocketServer(attemptsLeft: number): void {
  const wss = new WebSocketServer({
    port: WS_PORT,
    host: '127.0.0.1',
    verifyClient: (info: { origin?: string }) => (info.origin ?? '').startsWith('chrome-extension://'),
  })
  wss.on('error', (err) => {
    log('wss error', err)
    if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      wss.close()
      if (attemptsLeft > 0) {
        log(`port ${WS_PORT} in use — retrying in ${WS_BIND_RETRY_DELAY_MS}ms (${attemptsLeft} attempts left)`)
        setTimeout(() => startWebSocketServer(attemptsLeft - 1), WS_BIND_RETRY_DELAY_MS)
      } else {
        const holder = readPortHolderPid()
        log(`port ${WS_PORT} still in use by another mcp server (pid ${holder}) — stop it (kill ${holder}) and restart`)
        process.exit(1)
      }
    }
  })
  wss.on('listening', () => {
    activeWss = wss
    try { fs.writeFileSync(PID_FILE, String(process.pid)) } catch {}
    log(`ws server listening on 127.0.0.1:${WS_PORT} (pid ${process.pid})`)
  })
  wss.on('connection', (socket) => {
    log('extension connected')
    crxClient.attachSocket(socket)
    socket.on('close', (code, reason) => {
      const r = reason && reason.length > 0 ? ` reason="${reason.toString()}"` : ''
      log(`extension disconnected code=${code}${r}`)
    })
  })
}
startWebSocketServer(WS_BIND_RETRIES)

const modeRepository = new ModeRepository()
let executionMode: 'playwright' | 'crx' = modeRepository.getCurrentMode() ?? 'playwright'

let browser: Browser | null = null
let browserContext: BrowserContext | null = null
let page: Page | null = null

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

function toMcpContent(result: string | ToolResultContent[]) {
  if (typeof result === 'string') {
    return { content: [{ type: 'text' as const, text: result }] }
  }
  return {
    content: result.map(block => block.type === 'image'
      ? { type: 'image' as const, data: block.source.data, mimeType: block.source.media_type }
      : { type: 'text' as const, text: block.text }),
  }
}

async function handleToolCall(name: string, args: Record<string, unknown>) {
  const appTool = appTools.find(t => t.name === name)
  if (appTool) {
    try {
      if (name === 'set_mode') {
        executionMode = args.mode as 'playwright' | 'crx'
        modeRepository.setCurrentMode(executionMode)
        log('mode', executionMode)
        return { content: [{ type: 'text' as const, text: `Execution mode set to: ${executionMode}` }] }
      }
      if (name === 'health_check') {
        const status = await buildHealthStatus({
          mode: executionMode,
          serverStart: SERVER_START,
          crx: crxClient,
          getBrowserState: async () => page && !page.isClosed()
            ? { launched: true, currentUrl: page.url(), currentTitle: await page.title() }
            : { launched: false, currentUrl: null, currentTitle: null },
          timing,
        }, { heal: args.heal === true })
        log('health', status.ok ? 'ok' : 'issues', status.issues.length)
        return { content: [{ type: 'text' as const, text: JSON.stringify(status) }] }
      }
      const result = await crxClient.execute(name, args)
      log('result', name, typeof result === 'string' ? result.slice(0, 200) : `[${result.length} blocks]`)
      return toMcpContent(result)
    } catch (err) {
      log('error', name, err)
      return { content: [{ type: 'text' as const, text: err instanceof Error ? err.message : String(err) }], isError: true }
    }
  }

  const browserTool = browserTools.find(t => t.name === name)
  if (!browserTool) {
    return { content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }], isError: true }
  }

  const fileOnlyTools = new Set(['write_page_object', 'write_workflow', 'write_test', 'write_feature_doc', 'write_exploration_log', 'write_skipped_log', 'write_docs_index', 'write_result', 'read_pom_summary', 'read_observed_edges', 'record_run', 'log_reasoning'])
  const pureComputeTools = new Set(['compare_fingerprint'])

  try {
    let result: string | ToolResultContent[]
    if (pureComputeTools.has(name) || fileOnlyTools.has(name)) {
      result = await browserTool.execute(args, { page: null as unknown as Page, context: null as unknown as BrowserContext, outputDir: OUTPUT_DIR })
    } else if (executionMode === 'crx' && name === 'page_fingerprint') {
      const [snapBuffer, ariaText] = await Promise.all([
        crxClient.fetchSnapshotBuffer(),
        crxClient.fetchAriaTree(),
      ])
      result = JSON.stringify({
        phash: dhash(snapBuffer),
        ariaHash: computeAriaHash(ariaText),
        structuralHash: computeStructuralHash(ariaText),
      })
    } else if (executionMode === 'crx' && name === 'save_screenshot') {
      const sessionId = args.sessionId as string
      const shotName = args.name as string
      const alt = (args.alt as string | undefined) ?? shotName.replace(/-/g, ' ')
      const snapBuffer = await crxClient.fetchSnapshotBuffer()
      const dir = path.join(OUTPUT_DIR, 'exploration', sessionId)
      fs.mkdirSync(dir, { recursive: true })
      const filePath = path.join(dir, `${shotName}.png`)
      fs.writeFileSync(filePath, snapBuffer)
      const relToDocs = path.join('..', '..', 'exploration', sessionId, `${shotName}.png`)
      const markdownSnippet = `![${alt}](${relToDocs})`
      result = JSON.stringify({ absolutePath: filePath, relativeToDocs: relToDocs, markdownSnippet })
    } else if (executionMode === 'crx' && name === 'enumerate_interactive_elements') {
      const ariaText = await crxClient.fetchAriaTree()
      const items = applyEnumerationFilters(parseInteractive(ariaText), {
        topLevelOnly: (args.topLevelOnly as boolean | undefined) ?? false,
        rolesFilter: args.rolesFilter as string[] | undefined,
        includeDestructive: (args.includeDestructive as boolean | undefined) ?? false,
      })
      result = JSON.stringify(items)
    } else if (executionMode === 'crx' && !fileOnlyTools.has(name)) {
      result = await crxClient.execute(name, args)
    } else {
      const ctx = await ensureBrowser()
      result = await browserTool.execute(args, ctx)
      if (name === 'navigate' || name === 'click' || name === 'type') {
        await recordTraceAction(ctx.context)
      }
    }
    log('result', name, typeof result === 'string' ? result.slice(0, 200) : `[${result.length} blocks]`)
    return toMcpContent(result)
  } catch (err) {
    log('error', name, err)
    return {
      content: [{ type: 'text' as const, text: err instanceof Error ? err.message : String(err) }],
      isError: true,
    }
  }
}

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params
  log('call', name, args)
  const t0 = Date.now()
  try {
    return await handleToolCall(name, args)
  } finally {
    timing.record(name, Date.now() - t0)
  }
})

process.on('SIGTERM', async () => {
  cleanupPidFile()
  activeWss?.close()
  activeHttpServer?.close()
  await browserContext?.close()
  await browser?.close()
  process.exit(0)
})

async function startStdioTransport(): Promise<void> {
  process.stdin.on('close', () => {
    log('stdin closed — exiting')
    cleanupPidFile()
    activeWss?.close()
    browserContext?.close().catch(() => {})
    browser?.close().catch(() => {})
    process.exit(0)
  })
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  if (chunks.length === 0) return undefined
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : undefined
}

async function startHttpTransport(port: number): Promise<void> {
  const httpServer = http.createServer(async (req, res) => {
    const pathname = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`).pathname
    if (pathname !== MCP_HTTP_PATH) {
      res.writeHead(404).end()
      return
    }
    try {
      const body = req.method === 'POST' ? await readJsonBody(req) : undefined

      if (req.method === 'POST' && isInitializeRequest(body)) {
        if (httpTransport) {
          log('mcp http: replacing existing session with a new initialize')
          await httpTransport.close()
        }
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => log('mcp http session initialized', sid),
        })
        transport.onclose = () => { if (httpTransport === transport) httpTransport = null }
        await server.connect(transport)
        httpTransport = transport
        await transport.handleRequest(req, res, body)
        return
      }

      if (!httpTransport) {
        res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'No active MCP session; send initialize first' },
          id: null,
        }))
        return
      }
      await httpTransport.handleRequest(req, res, body)
    } catch (err) {
      log('http transport error', err)
      if (!res.headersSent) res.writeHead(500).end()
    }
  })
  activeHttpServer = httpServer
  httpServer.listen(port, '127.0.0.1', () => {
    log(`mcp http transport listening on http://127.0.0.1:${port}${MCP_HTTP_PATH} (pid ${process.pid})`)
  })
}

const httpPortEnv = process.env.BROW_USE_MCP_HTTP_PORT
const useHttp = process.argv.includes('--http') || httpPortEnv !== undefined
if (useHttp) {
  await startHttpTransport(httpPortEnv ? Number(httpPortEnv) : DEFAULT_MCP_HTTP_PORT)
} else {
  await startStdioTransport()
}
