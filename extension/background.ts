import { crx } from 'playwright-crx'
import type { BrowserContext, Page } from 'playwright-crx'

interface BrowserCommand {
  id: string
  type: string
  payload: Record<string, unknown>
}

interface CommandResult {
  id: string
  success: boolean
  data?: unknown
  error?: string
}

const WS_URL = 'ws://localhost:3456'
const RECONNECT_DELAY_MS = 3000

export interface CommandEvent {
  kind: 'brow_use_command'
  tabId: number | null
  command: string
  status: 'start' | 'done' | 'error'
  payload?: Record<string, unknown>
  error?: string
  timestamp: number
}

export interface LogEntry {
  kind: 'brow_use_log'
  level: 'info' | 'warn' | 'error'
  source: 'background' | 'content'
  message: string
  tabId: number | null
  timestamp: number
}

const LOG_BUFFER_MAX = 500
const logBuffer: LogEntry[] = []

function stringifyArg(arg: unknown): string {
  if (typeof arg === 'string') return arg
  if (arg instanceof Error) return arg.stack ?? arg.message
  try {
    return JSON.stringify(arg)
  } catch {
    return String(arg)
  }
}

function recordLog(entry: LogEntry): void {
  logBuffer.push(entry)
  if (logBuffer.length > LOG_BUFFER_MAX) logBuffer.shift()
  try {
    chrome.runtime.sendMessage(entry).catch(() => {})
  } catch {}
}

function installConsoleCapture(): void {
  const levels: Array<['log' | 'info' | 'warn' | 'error', LogEntry['level']]> = [
    ['log', 'info'],
    ['info', 'info'],
    ['warn', 'warn'],
    ['error', 'error'],
  ]
  for (const [method, level] of levels) {
    const original = console[method].bind(console)
    console[method] = (...args: unknown[]) => {
      original(...args)
      recordLog({
        kind: 'brow_use_log',
        level,
        source: 'background',
        message: args.map(stringifyArg).join(' '),
        tabId: selectedTabId,
        timestamp: Date.now(),
      })
    }
  }
}

let ws: WebSocket | null = null
let crxApp: Awaited<ReturnType<typeof crx.start>> | null = null
let tracingContext: BrowserContext | null = null
let selectedTabId: number | null = null

installConsoleCapture()

self.addEventListener('error', (e: ErrorEvent) => {
  recordLog({
    kind: 'brow_use_log',
    level: 'error',
    source: 'background',
    message: e.error instanceof Error ? (e.error.stack ?? e.error.message) : e.message,
    tabId: selectedTabId,
    timestamp: Date.now(),
  })
})

self.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
  recordLog({
    kind: 'brow_use_log',
    level: 'error',
    source: 'background',
    message: `Unhandled rejection: ${stringifyArg(e.reason)}`,
    tabId: selectedTabId,
    timestamp: Date.now(),
  })
})

chrome.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
  const m = msg as { kind?: string }
  if (m?.kind === 'brow_use_get_logs') {
    sendResponse(logBuffer)
    return false
  }
  if (m?.kind === 'brow_use_content_log') {
    const c = msg as { level: LogEntry['level']; message: string; timestamp: number }
    recordLog({
      kind: 'brow_use_log',
      level: c.level,
      source: 'content',
      message: c.message,
      tabId: sender.tab?.id ?? null,
      timestamp: c.timestamp,
    })
    return false
  }
  return false
})

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {})

async function getCurrentTabId(): Promise<number | null> {
  if (selectedTabId !== null) return selectedTabId
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  return tabs[0]?.id ?? null
}

function broadcast(event: CommandEvent): void {
  chrome.runtime.sendMessage(event).catch(() => {})
}

async function ensureCrxApp() {
  if (!crxApp) {
    crxApp = await crx.start()
  }
  return crxApp
}

async function getActivePage(): Promise<Page> {
  let tabId: number
  if (selectedTabId !== null) {
    tabId = selectedTabId
  } else {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    const tab = tabs[0]
    if (!tab?.id) throw new Error('No active tab found')
    tabId = tab.id
  }
  const app = await ensureCrxApp()
  return app.attach(tabId)
}

function toBase64(data: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < data.byteLength; i++) {
    binary += String.fromCharCode(data[i])
  }
  return btoa(binary)
}

async function handleCommand(cmd: BrowserCommand): Promise<unknown> {
  const { type, payload } = cmd

  if (type === 'list_tabs') {
    const tabs = await chrome.tabs.query({})
    return tabs.map(t => ({ id: t.id, title: t.title, url: t.url, active: t.active }))
  }
  if (type === 'select_tab') {
    selectedTabId = payload.tabId as number
    return { tabId: selectedTabId }
  }
  if (type === 'ping') {
    const tab = selectedTabId !== null
      ? await chrome.tabs.get(selectedTabId).catch(() => null)
      : null
    return {
      pong: true,
      version: chrome.runtime.getManifest().version,
      selectedTabId,
      currentTabUrl: tab?.url ?? null,
      currentTabTitle: tab?.title ?? null,
    }
  }

  const page = await getActivePage()
  const context = page.context()

  switch (type) {
    case 'navigate': {
      await page.goto(payload.url as string, { waitUntil: 'domcontentloaded' })
      return { title: await page.title(), url: page.url() }
    }
    case 'click': {
      await page.click(payload.selector as string)
      return null
    }
    case 'type': {
      await page.fill(payload.selector as string, payload.text as string)
      return null
    }
    case 'get_accessibility_tree': {
      return page.locator('body').ariaSnapshot()
    }
    case 'snapshot': {
      const data = await page.screenshot({ type: 'png' })
      return toBase64(data as unknown as Uint8Array)
    }
    case 'start_trace': {
      await context.tracing.start({ screenshots: true, snapshots: true, sources: true })
      tracingContext = context
      return null
    }
    case 'stop_trace': {
      const ctx = tracingContext ?? context
      await ctx.tracing.stop({ path: 'trace.zip' })
      tracingContext = null
      const buffer = crx.fs.readFileSync('trace.zip') as Uint8Array
      try { crx.fs.unlinkSync('trace.zip') } catch {}
      return toBase64(buffer)
    }
    case 'clear_session': {
      await context.clearCookies()
      await page.evaluate(() => {
        localStorage.clear()
        sessionStorage.clear()
      })
      return null
    }
    default:
      throw new Error(`Unknown command type: ${type}`)
  }
}

function sendResult(result: CommandResult): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(result))
  }
}

let reconnectCount = 0

function connect(): void {
  console.log(`[brow-use] Connecting to ${WS_URL}${reconnectCount > 0 ? ` (attempt ${reconnectCount + 1})` : ''}`)
  ws = new WebSocket(WS_URL)

  ws.onopen = () => {
    console.log('[brow-use] Connected to server')
    reconnectCount = 0
  }

  ws.onmessage = async (event: MessageEvent) => {
    const cmd = JSON.parse(event.data as string) as BrowserCommand
    const tabId = await getCurrentTabId()
    broadcast({ kind: 'brow_use_command', tabId, command: cmd.type, status: 'start', payload: cmd.payload, timestamp: Date.now() })
    try {
      const data = await handleCommand(cmd)
      broadcast({ kind: 'brow_use_command', tabId, command: cmd.type, status: 'done', timestamp: Date.now() })
      sendResult({ id: cmd.id, success: true, data })
    } catch (err) {
      broadcast({ kind: 'brow_use_command', tabId, command: cmd.type, status: 'error', error: String(err), timestamp: Date.now() })
      sendResult({ id: cmd.id, success: false, error: String(err) })
    }
  }

  ws.onclose = () => {
    reconnectCount++
    console.log(`[brow-use] Disconnected. Retrying in ${RECONNECT_DELAY_MS}ms...`)
    ws = null
    setTimeout(connect, RECONNECT_DELAY_MS)
  }

  ws.onerror = (err) => {
    console.log('[brow-use] WebSocket error:', err)
    ws?.close()
  }
}

connect()
