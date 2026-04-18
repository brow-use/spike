interface CommandEvent {
  kind: 'brow_use_command'
  tabId: number | null
  command: string
  status: 'start' | 'done' | 'error'
  payload?: Record<string, unknown>
  error?: string
  timestamp: number
}

const tabLog = new Map<number, CommandEvent[]>()
let currentTabId: number | null = null

const tabInfoEl = document.getElementById('tab-info')!
const logEl = document.getElementById('log')!

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function summaryFor(event: CommandEvent): string {
  const p = event.payload ?? {}
  if (p.url) return `→ ${p.url}`
  if (p.selector) return `→ ${p.selector}`
  if (p.tabId) return `→ tab ${p.tabId}`
  return ''
}

function statusIcon(status: CommandEvent['status']): string {
  if (status === 'start') return '<span class="spinning">↻</span>'
  if (status === 'done') return '✓'
  return '✗'
}

function render(): void {
  const events = currentTabId !== null ? (tabLog.get(currentTabId) ?? []) : []

  if (events.length === 0) {
    logEl.innerHTML = '<div class="empty">No commands yet for this tab.</div>'
    return
  }

  logEl.innerHTML = events.map(e => `
    <div class="entry status-${e.status}">
      <div class="status-icon">${statusIcon(e.status)}</div>
      <div class="entry-body">
        <div class="command-name">${e.command}</div>
        ${summaryFor(e) ? `<div class="command-detail">${summaryFor(e)}</div>` : ''}
        ${e.error ? `<div class="error-msg">${e.error}</div>` : ''}
      </div>
      <div class="timestamp">${formatTime(e.timestamp)}</div>
    </div>
  `).join('')

  logEl.scrollTop = logEl.scrollHeight
}

async function setCurrentTab(tabId: number): Promise<void> {
  currentTabId = tabId
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  const tab = tabs.find(t => t.id === tabId) ?? tabs[0]
  tabInfoEl.textContent = tab?.url ?? tab?.title ?? `Tab ${tabId}`
  render()
}

chrome.runtime.onMessage.addListener((msg: unknown) => {
  const event = msg as CommandEvent
  if (event.kind !== 'brow_use_command') return
  const tabId = event.tabId
  if (tabId === null) return

  const entries = tabLog.get(tabId) ?? []

  if (event.status === 'start') {
    entries.push(event)
  } else {
    const last = [...entries].reverse().find(e => e.command === event.command && e.status === 'start')
    if (last) {
      last.status = event.status
      if (event.error) last.error = event.error
    }
  }

  tabLog.set(tabId, entries)

  if (tabId === currentTabId) render()
})

chrome.tabs.onActivated.addListener(({ tabId }) => {
  setCurrentTab(tabId)
})

chrome.tabs.query({ active: true, currentWindow: true }).then(tabs => {
  if (tabs[0]?.id !== undefined) setCurrentTab(tabs[0].id)
})
