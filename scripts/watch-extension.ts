import { watch } from 'fs'
import { execSync } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import WebSocket from 'ws'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CDP_PORT = 9222
const DEBOUNCE_MS = 300

interface CdpTarget {
  type: string
  url: string
  webSocketDebuggerUrl: string
}

async function findExtensionTarget(): Promise<CdpTarget | undefined> {
  const res = await fetch(`http://localhost:${CDP_PORT}/json`)
  const targets: CdpTarget[] = await res.json()
  return targets.find(t => t.type === 'service_worker' && t.url.startsWith('chrome-extension://'))
}

async function reloadExtension(): Promise<void> {
  const target = await findExtensionTarget()
  if (!target) {
    console.log('[brow-use] No extension target found — reload manually at chrome://extensions')
    return
  }
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(target.webSocketDebuggerUrl)
    ws.on('open', () => {
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: 'chrome.runtime.reload()' } }))
    })
    ws.on('message', () => { ws.close(); resolve() })
    ws.on('error', reject)
  })
  console.log('[brow-use] Extension reloaded')
}

function build(): void {
  console.log('[brow-use] Building extension...')
  execSync('npm run build:extension', { cwd: ROOT, stdio: 'inherit' })
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null

function onChange() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(async () => {
    try {
      build()
      await reloadExtension()
    } catch (err) {
      console.error('[brow-use] Error:', err)
    }
  }, DEBOUNCE_MS)
}

watch(resolve(ROOT, 'extension'), { recursive: true }, (_, filename) => {
  if (filename?.endsWith('.ts')) onChange()
})

console.log('[brow-use] Watching extension/ for changes... (Chrome must run with --remote-debugging-port=9222)')
