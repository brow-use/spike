interface CommandEvent {
  kind: 'brow_use_command'
  tabId: number | null
  command: string
  status: 'start' | 'done' | 'error'
  payload?: Record<string, unknown>
  error?: string
  timestamp: number
}

interface LogEntry {
  kind: 'brow_use_log'
  level: 'info' | 'warn' | 'error'
  source: 'background' | 'content'
  message: string
  tabId: number | null
  timestamp: number
}

const tabLog = new Map<number, CommandEvent[]>()
let currentTabId: number | null = null

let logs: LogEntry[] = []
let logLevel: 'all' | 'info' | 'warn' | 'error' = 'all'

const tabInfoEl = document.getElementById('tab-info')!
const logEl = document.getElementById('log')!
const logsEl = document.getElementById('logs')!
const activityViewEl = document.getElementById('activity-view')!
const logsViewEl = document.getElementById('logs-view')!
const tabActivityEl = document.getElementById('tab-activity')!
const tabLogsEl = document.getElementById('tab-logs')!
const logLevelEl = document.getElementById('log-level') as HTMLSelectElement
const logClearEl = document.getElementById('log-clear')!

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString([], {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

const LEVEL_RANK: Record<LogEntry['level'], number> = { info: 0, warn: 1, error: 2 }

function renderLogs(): void {
  const visible = logs.filter(l =>
    logLevel === 'all' ? true : LEVEL_RANK[l.level] >= LEVEL_RANK[logLevel],
  )

  if (visible.length === 0) {
    logsEl.innerHTML = '<div class="empty">No logs yet.</div>'
    return
  }

  logsEl.innerHTML = visible.map(l => `
    <div class="log-entry level-${l.level}">
      <span class="log-time">${formatTime(l.timestamp)}</span>
      <span class="log-level">${l.level}</span>
      <span class="log-source">${l.source}</span>
      <span class="log-message">${escapeHtml(l.message)}</span>
    </div>
  `).join('')

  logsEl.scrollTop = logsEl.scrollHeight
}

function addLog(entry: LogEntry): void {
  logs.push(entry)
  if (logs.length > 500) logs.shift()
  if (!logsViewEl.classList.contains('hidden')) renderLogs()
}

function showView(view: 'activity' | 'logs'): void {
  const showLogs = view === 'logs'
  logsViewEl.classList.toggle('hidden', !showLogs)
  activityViewEl.classList.toggle('hidden', showLogs)
  tabLogsEl.classList.toggle('active', showLogs)
  tabActivityEl.classList.toggle('active', !showLogs)
  if (showLogs) renderLogs()
  else render()
}

tabActivityEl.addEventListener('click', () => showView('activity'))
tabLogsEl.addEventListener('click', () => showView('logs'))
logLevelEl.addEventListener('change', () => {
  logLevel = logLevelEl.value as typeof logLevel
  renderLogs()
})
logClearEl.addEventListener('click', () => {
  logs = []
  renderLogs()
})

chrome.runtime.sendMessage({ kind: 'brow_use_get_logs' }).then((buffered: unknown) => {
  if (Array.isArray(buffered)) {
    logs = buffered as LogEntry[]
    if (!logsViewEl.classList.contains('hidden')) renderLogs()
  }
}).catch(() => {})

async function setCurrentTab(tabId: number): Promise<void> {
  currentTabId = tabId
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  const tab = tabs.find(t => t.id === tabId) ?? tabs[0]
  tabInfoEl.textContent = tab?.url ?? tab?.title ?? `Tab ${tabId}`
  render()
}

chrome.runtime.onMessage.addListener((msg: unknown) => {
  const kind = (msg as { kind?: string }).kind
  if (kind === 'brow_use_log') {
    addLog(msg as LogEntry)
    return
  }

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
