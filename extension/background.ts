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

let ws: WebSocket | null = null
let crxApp: Awaited<ReturnType<typeof crx.start>> | null = null
let tracingContext: BrowserContext | null = null

async function ensureCrxApp() {
  if (!crxApp) {
    crxApp = await crx.start()
  }
  return crxApp
}

async function getActivePage(): Promise<Page> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  const tab = tabs[0]
  if (!tab?.id) throw new Error('No active tab found')
  const app = await ensureCrxApp()
  return app.attach(tab.id)
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
      const root = await navigator.storage.getDirectory()
      const fileHandle = await root.getFileHandle('trace.zip')
      const file = await fileHandle.getFile()
      const buffer = await file.arrayBuffer()
      await root.removeEntry('trace.zip').catch(() => {})
      return toBase64(new Uint8Array(buffer))
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

function connect(): void {
  ws = new WebSocket(WS_URL)

  ws.onopen = () => {
    console.log('[brow-use] Connected to server')
  }

  ws.onmessage = async (event: MessageEvent) => {
    const cmd = JSON.parse(event.data as string) as BrowserCommand
    try {
      const data = await handleCommand(cmd)
      sendResult({ id: cmd.id, success: true, data })
    } catch (err) {
      sendResult({ id: cmd.id, success: false, error: String(err) })
    }
  }

  ws.onclose = () => {
    console.log('[brow-use] Disconnected. Reconnecting...')
    ws = null
    setTimeout(connect, RECONNECT_DELAY_MS)
  }

  ws.onerror = () => {
    ws?.close()
  }
}

connect()
