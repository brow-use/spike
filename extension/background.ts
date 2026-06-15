import { crx } from 'playwright-crx'
import type { BrowserContext, Page } from 'playwright-crx'
import { createCommandQueue } from '../domain/command-queue'
import { matchTab } from '../domain/tab-match'
import { encodeBinaryFrame } from '../domain/ws-frame'
import { CommandError, classifyErrorMessage } from '../domain/command-error'
import { withTimeout, TimeoutError } from '../domain/with-timeout'
import { reconnectDelayMs } from '../domain/reconnect-backoff'

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
  code?: string
}

const WS_URL = 'ws://localhost:3456'
const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30000
const KEEPALIVE_INTERVAL_MS = 20000
const RECONNECT_ALARM = 'brow-use-reconnect'
const DEFAULT_ACTION_TIMEOUT_MS = 8000
const TRACE_OP_TIMEOUT_MS = 10000
const TRACE_START_OPTIONS = { screenshots: true, snapshots: true, sources: true }

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
let lastKnownUrl: string | null = null
let activeTraceName: string | null = null
let panelTabId: number | null = null

async function restoreState(): Promise<void> {
  const stored = await chrome.storage.session.get(['selectedTabId', 'lastKnownUrl', 'activeTraceName', 'panelTabId'])
  selectedTabId = (stored.selectedTabId as number | undefined) ?? null
  lastKnownUrl = (stored.lastKnownUrl as string | undefined) ?? null
  activeTraceName = (stored.activeTraceName as string | undefined) ?? null
  panelTabId = (stored.panelTabId as number | undefined) ?? null
}

function persistState(): void {
  void chrome.storage.session.set({ selectedTabId, lastKnownUrl, activeTraceName, panelTabId })
}

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

async function showPanelExclusivelyOn(tabId: number): Promise<void> {
  if (panelTabId !== null && panelTabId !== tabId) {
    await chrome.sidePanel.setOptions({ tabId: panelTabId, enabled: false }).catch(() => {})
  }
  await chrome.sidePanel.setOptions({ tabId, enabled: true, path: 'sidepanel.html' }).catch(() => {})
  panelTabId = tabId
  persistState()
}

chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined) return
  const tabId = tab.id
  void (async () => {
    await showPanelExclusivelyOn(tabId)
    await chrome.sidePanel.open({ tabId }).catch(() => {})
  })()
})

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === panelTabId) {
    panelTabId = null
    persistState()
  }
})

chrome.alarms.create(RECONNECT_ALARM, { periodInMinutes: 0.5 })
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RECONNECT_ALARM && ws === null) scheduleReconnect()
})

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

async function resolveTabId(): Promise<number> {
  if (selectedTabId !== null) {
    const tab = await chrome.tabs.get(selectedTabId).catch(() => null)
    if (tab?.id !== undefined) return tab.id
    const all = await chrome.tabs.query({})
    const candidates = all
      .filter(t => t.id !== undefined && t.url !== undefined)
      .map(t => ({ id: t.id!, url: t.url!, active: t.active ?? false }))
    const replacement = matchTab(candidates, lastKnownUrl)
    if (replacement) {
      console.log(`[brow-use] Pinned tab ${selectedTabId} is gone; re-pinned tab ${replacement.id} (${replacement.url})`)
      selectedTabId = replacement.id
      persistState()
      return replacement.id
    }
    selectedTabId = null
    persistState()
    throw new CommandError('tab-gone', 'Pinned tab is gone and no open tab matches its last known URL. Run list_tabs and select_tab again.')
  }
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  const tab = tabs[0]
  if (!tab?.id) throw new Error('No active tab found')
  return tab.id
}

async function getActivePage(): Promise<Page> {
  const tabId = await resolveTabId()
  const app = await ensureCrxApp()
  return app.attach(tabId)
}

async function hardResetCrx(): Promise<void> {
  tracingContext = null
  activeTraceName = null
  persistState()
  const app = crxApp
  crxApp = null
  if (app) {
    try {
      await withTimeout(app.close(), TRACE_OP_TIMEOUT_MS, 'crx close timed out')
    } catch (err) {
      console.warn('[brow-use] crx close during hard reset failed:', stringifyArg(err))
    }
  }
}

async function traceOp<T>(op: Promise<T>): Promise<T> {
  try {
    return await withTimeout(op, TRACE_OP_TIMEOUT_MS, `trace operation timed out after ${TRACE_OP_TIMEOUT_MS}ms`)
  } catch (err) {
    if (err instanceof TimeoutError) {
      console.error('[brow-use] Trace operation hung; force-resetting crx')
      await hardResetCrx()
      throw new CommandError('trace-lost', 'Trace operation hung and tracing was force-reset; chunks flushed earlier are preserved on disk. Start a new trace.')
    }
    throw err
  }
}

async function handleCommand(cmd: BrowserCommand): Promise<unknown> {
  const { type, payload } = cmd

  if (type === 'list_tabs') {
    const tabs = await chrome.tabs.query({})
    return tabs.map(t => ({ id: t.id, title: t.title, url: t.url, active: t.active }))
  }
  if (type === 'select_tab') {
    selectedTabId = payload.tabId as number
    const tab = await chrome.tabs.get(selectedTabId).catch(() => null)
    lastKnownUrl = tab?.url ?? null
    persistState()
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

  if ((type === 'flush_trace_chunk' || type === 'stop_trace') && !tracingContext && activeTraceName !== null) {
    activeTraceName = null
    persistState()
    throw new CommandError('trace-lost', 'Trace recording was lost when the extension service worker restarted; chunks flushed before the restart are preserved on disk.')
  }

  const page = await getActivePage()
  const context = page.context()

  switch (type) {
    case 'navigate': {
      const waitUntil = (payload.waitUntil as 'domcontentloaded' | 'load' | 'networkidle' | undefined) ?? 'domcontentloaded'
      await page.goto(payload.url as string, { waitUntil })
      lastKnownUrl = page.url()
      persistState()
      return { title: await page.title(), url: page.url() }
    }
    case 'click': {
      await page.click(payload.selector as string, { timeout: (payload.timeoutMs as number | undefined) ?? DEFAULT_ACTION_TIMEOUT_MS })
      return null
    }
    case 'type': {
      await page.fill(payload.selector as string, payload.text as string, { timeout: (payload.timeoutMs as number | undefined) ?? DEFAULT_ACTION_TIMEOUT_MS })
      return null
    }
    case 'get_accessibility_tree': {
      return page.locator('body').ariaSnapshot()
    }
    case 'snapshot': {
      const data = await page.screenshot({ type: 'png' })
      return data as unknown as Uint8Array
    }
    case 'start_trace': {
      let ctx = context
      try {
        await ctx.tracing.start(TRACE_START_OPTIONS)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (!/already.*started/i.test(message)) throw err
        console.warn('[brow-use] Orphaned tracing session found; recovering')
        try {
          await withTimeout(ctx.tracing.stop(), TRACE_OP_TIMEOUT_MS, 'tracing.stop timed out')
        } catch {
          await hardResetCrx()
          const page = await getActivePage()
          ctx = page.context()
        }
        await ctx.tracing.start(TRACE_START_OPTIONS)
      }
      await ctx.tracing.startChunk()
      tracingContext = ctx
      activeTraceName = (payload.name as string | undefined) ?? 'unnamed'
      persistState()
      return null
    }
    case 'flush_trace_chunk': {
      const ctx = tracingContext ?? context
      await traceOp(ctx.tracing.stopChunk({ path: 'chunk.zip' }))
      const buffer = crx.fs.readFileSync('chunk.zip') as Uint8Array
      try { crx.fs.unlinkSync('chunk.zip') } catch {}
      await traceOp(ctx.tracing.startChunk())
      return buffer
    }
    case 'stop_trace': {
      const ctx = tracingContext ?? context
      await traceOp(ctx.tracing.stopChunk({ path: 'chunk.zip' }))
      await traceOp(ctx.tracing.stop())
      tracingContext = null
      activeTraceName = null
      persistState()
      const buffer = crx.fs.readFileSync('chunk.zip') as Uint8Array
      try { crx.fs.unlinkSync('chunk.zip') } catch {}
      return buffer
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

function sendBinaryResult(id: string, payload: Uint8Array): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(encodeBinaryFrame({ id, success: true }, payload))
  }
}

const enqueue = createCommandQueue()

async function runCommand(cmd: BrowserCommand): Promise<void> {
  const tabId = await getCurrentTabId()
  broadcast({ kind: 'brow_use_command', tabId, command: cmd.type, status: 'start', payload: cmd.payload, timestamp: Date.now() })
  try {
    const data = await handleCommand(cmd)
    broadcast({ kind: 'brow_use_command', tabId, command: cmd.type, status: 'done', timestamp: Date.now() })
    if (data instanceof Uint8Array) {
      sendBinaryResult(cmd.id, data)
    } else {
      sendResult({ id: cmd.id, success: true, data })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const code = err instanceof CommandError ? err.code : classifyErrorMessage(message, cmd.type)
    broadcast({ kind: 'brow_use_command', tabId, command: cmd.type, status: 'error', error: message, timestamp: Date.now() })
    sendResult({ id: cmd.id, success: false, error: message, code })
  }
}

let reconnectCount = 0
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

function scheduleReconnect(): void {
  if (ws !== null || reconnectTimer !== null) return
  const delay = reconnectDelayMs(reconnectCount, { baseMs: RECONNECT_BASE_MS, maxMs: RECONNECT_MAX_MS })
  console.log(`[brow-use] Disconnected. Reconnecting in ${delay}ms (attempt ${reconnectCount + 1})`)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, delay)
}

function connect(): void {
  if (ws !== null) return
  console.log(`[brow-use] Connecting to ${WS_URL}${reconnectCount > 0 ? ` (attempt ${reconnectCount + 1})` : ''}`)
  ws = new WebSocket(WS_URL)
  let keepalive: ReturnType<typeof setInterval> | null = null

  ws.onopen = () => {
    console.log('[brow-use] Connected to server')
    reconnectCount = 0
    keepalive = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ id: 'keepalive', success: true }))
      }
    }, KEEPALIVE_INTERVAL_MS)
  }

  ws.onmessage = (event: MessageEvent) => {
    let cmd: BrowserCommand
    try {
      cmd = JSON.parse(event.data as string) as BrowserCommand
    } catch {
      return
    }
    void enqueue(() => runCommand(cmd))
  }

  ws.onclose = () => {
    reconnectCount++
    if (keepalive !== null) clearInterval(keepalive)
    ws = null
    scheduleReconnect()
  }

  ws.onerror = (err) => {
    console.log('[brow-use] WebSocket error:', err)
    ws?.close()
  }
}

void restoreState().then(async () => {
  await chrome.sidePanel.setOptions({ enabled: false }).catch(() => {})
  if (panelTabId !== null) {
    await chrome.sidePanel.setOptions({ tabId: panelTabId, enabled: true, path: 'sidepanel.html' }).catch(() => {})
  }
  connect()
})
