import type { TimingStats, TimingSummary } from './timing.js'
import { withTimeout } from '../domain/with-timeout.js'

export interface HealthIssue {
  kind: string
  message: string
  remedy: string
}

export interface BrowserState {
  launched: boolean
  currentUrl: string | null
  currentTitle: string | null
}

export interface CrxConnection {
  connected: boolean
  ping(): Promise<unknown>
  dropSocket(): void
}

export interface HealthDeps {
  mode: 'playwright' | 'crx'
  serverStart: number
  crx: CrxConnection
  getBrowserState(): Promise<BrowserState>
  timing: TimingStats
}

export interface HealthOptions {
  heal?: boolean
  pingTimeoutMs?: number
  healWaitMs?: number
  healPollMs?: number
}

export interface HealthStatus {
  ok: boolean
  mode: 'playwright' | 'crx'
  mcp: { uptimeSec: number; pid: number }
  extension: Record<string, unknown>
  browser: BrowserState
  issues: HealthIssue[]
  timings: TimingSummary[]
  healed?: boolean
}

interface ExtensionPong {
  version?: string
  selectedTabId?: number | null
  currentTabUrl?: string | null
  currentTabTitle?: string | null
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

async function waitFor(predicate: () => boolean, totalMs: number, pollMs: number): Promise<boolean> {
  const deadline = Date.now() + totalMs
  while (Date.now() < deadline) {
    if (predicate()) return true
    await sleep(pollMs)
  }
  return predicate()
}

async function pingExtension(deps: HealthDeps, pingTimeoutMs: number): Promise<{ block: Record<string, unknown>; issue: HealthIssue | null }> {
  const start = Date.now()
  try {
    const pong = await withTimeout(deps.crx.ping(), pingTimeoutMs, `timeout after ${pingTimeoutMs}ms`) as ExtensionPong
    const block: Record<string, unknown> = {
      required: true,
      connected: true,
      pingRoundTripMs: Date.now() - start,
      version: pong.version ?? 'unknown',
      selectedTabId: pong.selectedTabId ?? null,
      currentTabUrl: pong.currentTabUrl ?? null,
      currentTabTitle: pong.currentTabTitle ?? null,
    }
    if (pong.selectedTabId == null) {
      return {
        block,
        issue: {
          kind: 'no-selected-tab',
          message: 'Extension is connected but no tab has been pinned for automation.',
          remedy: 'Run /bu:use-session and pick a tab.',
        },
      }
    }
    return { block, issue: null }
  } catch (err) {
    return {
      block: { required: true, connected: true, pingFailed: String(err) },
      issue: {
        kind: 'extension-ping-timeout',
        message: `Extension is connected but did not respond to ping within ${pingTimeoutMs}ms.`,
        remedy: 'Reload the extension at chrome://extensions (click the refresh icon) and try again.',
      },
    }
  }
}

export async function buildHealthStatus(deps: HealthDeps, opts: HealthOptions = {}): Promise<HealthStatus> {
  const pingTimeoutMs = opts.pingTimeoutMs ?? 3000
  const healWaitMs = opts.healWaitMs ?? 5000
  const healPollMs = opts.healPollMs ?? 250

  const issues: HealthIssue[] = []
  const mcp = { uptimeSec: Math.round((Date.now() - deps.serverStart) / 1000), pid: process.pid }
  let healed: boolean | undefined

  let extensionBlock: Record<string, unknown>
  if (deps.mode === 'crx') {
    if (!deps.crx.connected) {
      extensionBlock = { required: true, connected: false }
      issues.push({
        kind: 'extension-disconnected',
        message: 'Chrome extension is not connected to the MCP WebSocket server.',
        remedy: 'Load the brow-use extension at chrome://extensions (Load unpacked → dist/extension/), then /mcp → reconnect bu.',
      })
    } else {
      let result = await pingExtension(deps, pingTimeoutMs)
      if (result.issue?.kind === 'extension-ping-timeout' && opts.heal) {
        deps.crx.dropSocket()
        const reconnected = await waitFor(() => deps.crx.connected, healWaitMs, healPollMs)
        if (reconnected) {
          result = await pingExtension(deps, pingTimeoutMs)
        }
        healed = result.issue?.kind !== 'extension-ping-timeout'
      }
      extensionBlock = result.block
      if (result.issue) issues.push(result.issue)
    }
  } else {
    extensionBlock = { required: false }
  }

  return {
    ok: issues.length === 0,
    mode: deps.mode,
    mcp,
    extension: extensionBlock,
    browser: await deps.getBrowserState(),
    issues,
    timings: deps.timing.summary().slice(0, 10),
    ...(healed !== undefined ? { healed } : {}),
  }
}
