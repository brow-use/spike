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

interface ContentResponse {
  id: string
  success: boolean
  data?: unknown
  error?: string
}

const WS_URL = 'ws://localhost:3456'
const RECONNECT_DELAY_MS = 3000

let ws: WebSocket | null = null

function connect(): void {
  ws = new WebSocket(WS_URL)

  ws.onopen = () => {
    console.log('[brow-use] Connected to server')
  }

  ws.onmessage = async (event: MessageEvent) => {
    const cmd = JSON.parse(event.data as string) as BrowserCommand

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    const tab = tabs[0]

    if (!tab?.id) {
      sendResult({ id: cmd.id, success: false, error: 'No active tab found' })
      return
    }

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: dispatchCommand,
        args: [cmd],
      })
      const result = results[0]?.result as ContentResponse | undefined
      sendResult(result ?? { id: cmd.id, success: false, error: 'No result from content script' })
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

function sendResult(result: CommandResult): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(result))
  }
}

function dispatchCommand(cmd: BrowserCommand): ContentResponse {
  const { id, type, payload } = cmd

  try {
    if (type === 'click') {
      const el = document.querySelector(payload.selector as string) as HTMLElement | null
      if (!el) return { id, success: false, error: `Element not found: ${payload.selector}` }
      el.click()
      return { id, success: true }
    }

    if (type === 'type') {
      const el = document.querySelector(payload.selector as string) as HTMLInputElement | null
      if (!el) return { id, success: false, error: `Element not found: ${payload.selector}` }
      el.focus()
      el.value = payload.text as string
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      return { id, success: true }
    }

    if (type === 'scroll') {
      window.scrollBy(payload.x as number ?? 0, payload.y as number ?? 0)
      return { id, success: true }
    }

    if (type === 'read_dom') {
      const selector = payload.selector as string | undefined
      const el = selector ? document.querySelector(selector) : document.body
      return { id, success: true, data: el?.innerHTML ?? '' }
    }

    if (type === 'highlight') {
      const el = document.querySelector(payload.selector as string) as HTMLElement | null
      if (!el) return { id, success: false, error: `Element not found: ${payload.selector}` }
      const prev = el.style.outline
      el.style.outline = '3px solid red'
      setTimeout(() => { el.style.outline = prev }, 2000)
      return { id, success: true }
    }

    return { id, success: false, error: `Unknown command type: ${type}` }
  } catch (err) {
    return { id, success: false, error: String(err) }
  }
}

connect()
