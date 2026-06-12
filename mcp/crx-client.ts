import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import type { WebSocket } from 'ws'
import type { ToolResultContent } from '../tool/tool.js'
import { chunkFileName, FLUSH_EVERY } from '../tool/trace-session.js'
import { CommandError, type CommandErrorCode } from '../domain/command-error.js'
import { decodeBinaryFrame } from '../domain/ws-frame.js'
import { healSelector } from '../tool/selector-heal.js'

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
  code?: CommandErrorCode
}

interface ActionEntry {
  t: number
  name: string
  selector?: string
  url?: string
  text?: string
}

interface CrxTraceSession {
  name: string
  dir: string
  actionsPath: string
  chunkIndex: number
  actionsSinceFlush: number
}

interface PendingCommand {
  resolve: (data: unknown) => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout
}

interface QueuedCommand {
  type: string
  payload: Record<string, unknown>
  resolve: (data: unknown) => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout
}

export interface CrxClientOptions {
  commandTimeoutMs?: number
  reconnectGraceMs?: number
  heartbeatIntervalMs?: number
}

export const ACTION_TIMEOUT_MS = 8000

const NOT_CONNECTED_MESSAGE = 'Extension not connected. Load the brow-use extension in Chrome and ensure the server is running.'

export class CrxClient {
  private socket: WebSocket | null = null
  private pending = new Map<string, PendingCommand>()
  private queued: QueuedCommand[] = []
  private outputDir: string
  private traceSession: CrxTraceSession | null = null
  private ariaCache: string | null = null
  private commandTimeoutMs: number
  private reconnectGraceMs: number
  private heartbeatIntervalMs: number

  constructor(outputDir: string, options: CrxClientOptions = {}) {
    this.outputDir = outputDir
    this.commandTimeoutMs = options.commandTimeoutMs ?? 35000
    this.reconnectGraceMs = options.reconnectGraceMs ?? 10000
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 15000
  }

  attachSocket(socket: WebSocket): void {
    const old = this.socket
    this.socket = socket
    this.ariaCache = null
    if (old) {
      this.rejectAllPending(new CommandError('extension-disconnected', 'Extension reconnected; in-flight command abandoned'))
      old.terminate()
    }

    let alive = true
    socket.on('pong', () => { alive = true })
    const heartbeat = setInterval(() => {
      if (!alive) {
        socket.terminate()
        return
      }
      alive = false
      socket.ping()
    }, this.heartbeatIntervalMs)
    heartbeat.unref?.()

    socket.on('message', (data, isBinary) => {
      if (this.socket !== socket) return
      this.handleMessage(data as Buffer, Boolean(isBinary))
    })
    socket.on('close', () => {
      clearInterval(heartbeat)
      if (this.socket !== socket) return
      this.socket = null
      this.rejectAllPending(new CommandError('extension-disconnected', 'Extension disconnected'))
    })

    this.flushQueued()
  }

  dropSocket(): void {
    this.socket?.terminate()
  }

  get connected(): boolean {
    return this.socket?.readyState === 1
  }

  ping(): Promise<unknown> {
    if (!this.connected) {
      return Promise.reject(new CommandError('extension-disconnected', NOT_CONNECTED_MESSAGE))
    }
    return this.sendNow('ping', {})
  }

  private rejectAllPending(err: Error): void {
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer)
      reject(err)
    }
    this.pending.clear()
  }

  private handleMessage(data: Buffer, isBinary: boolean): void {
    let result: CommandResult
    let payload: Uint8Array | null = null
    if (isBinary) {
      try {
        const frame = decodeBinaryFrame(new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
        result = frame.header as CommandResult
        payload = frame.payload
      } catch {
        return
      }
    } else {
      try {
        result = JSON.parse(data.toString()) as CommandResult
      } catch {
        return
      }
    }
    const pending = this.pending.get(result.id)
    if (!pending) return
    this.pending.delete(result.id)
    clearTimeout(pending.timer)
    if (result.success) {
      pending.resolve(payload ?? result.data)
    } else {
      pending.reject(new CommandError(result.code ?? 'unknown', result.error ?? 'Command failed'))
    }
  }

  private send(type: string, payload: Record<string, unknown> = {}): Promise<unknown> {
    if (this.connected) return this.sendNow(type, payload)
    return new Promise((resolve, reject) => {
      const entry: QueuedCommand = {
        type,
        payload,
        resolve,
        reject,
        timer: setTimeout(() => {
          this.queued = this.queued.filter(q => q !== entry)
          reject(new CommandError('extension-disconnected', NOT_CONNECTED_MESSAGE))
        }, this.reconnectGraceMs),
      }
      this.queued.push(entry)
    })
  }

  private sendNow(type: string, payload: Record<string, unknown>): Promise<unknown> {
    const id = crypto.randomUUID()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new CommandError('timeout', `Command "${type}" timed out after ${this.commandTimeoutMs}ms`))
      }, this.commandTimeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      this.socket!.send(JSON.stringify({ id, type, payload } satisfies BrowserCommand))
    })
  }

  private flushQueued(): void {
    const queued = this.queued
    this.queued = []
    for (const q of queued) {
      clearTimeout(q.timer)
      this.sendNow(q.type, q.payload).then(q.resolve, q.reject)
    }
  }

  private async getAriaTree(): Promise<string> {
    if (this.ariaCache !== null) return this.ariaCache
    const tree = await this.send('get_accessibility_tree') as string
    this.ariaCache = tree
    return tree
  }

  fetchAriaTree(): Promise<string> {
    return this.getAriaTree()
  }

  async fetchSnapshotBuffer(): Promise<Buffer> {
    const data = await this.send('snapshot') as Uint8Array | string
    return typeof data === 'string' ? Buffer.from(data, 'base64') : Buffer.from(data)
  }

  private async actionWithHealing(type: 'click' | 'type', payload: { selector: string; text?: string; timeoutMs: number }): Promise<string | null> {
    try {
      await this.send(type, payload)
      return null
    } catch (err) {
      if (!(err instanceof CommandError) || err.code !== 'element-not-found') throw err
      const tree = await this.getAriaTree()
      const candidate = healSelector(tree, payload.selector)
      if (!candidate) throw err
      await this.send(type, { ...payload, selector: candidate.selector })
      return candidate.selector
    }
  }

  private appendAction(entry: ActionEntry): void {
    if (!this.traceSession) return
    fs.appendFileSync(this.traceSession.actionsPath, JSON.stringify(entry) + '\n', 'utf-8')
    this.traceSession.actionsSinceFlush += 1
  }

  private writeChunk(data: Uint8Array | string): string {
    const s = this.traceSession!
    const chunkPath = path.join(s.dir, chunkFileName(s.chunkIndex))
    const bytes = typeof data === 'string' ? Buffer.from(data, 'base64') : Buffer.from(data)
    fs.writeFileSync(chunkPath, bytes)
    s.chunkIndex += 1
    s.actionsSinceFlush = 0
    return chunkPath
  }

  private async maybeFlushChunk(): Promise<void> {
    if (!this.traceSession || this.traceSession.actionsSinceFlush < FLUSH_EVERY) return
    try {
      const data = await this.send('flush_trace_chunk') as Uint8Array | string
      this.writeChunk(data)
    } catch {
      // flush is best-effort: a failed flush keeps actions in the current extension-side chunk
    }
  }

  async execute(toolName: string, args: Record<string, unknown>): Promise<string | ToolResultContent[]> {
    switch (toolName) {
      case 'navigate': {
        const t = Date.now()
        const result = await this.send('navigate', { url: args.url, waitUntil: args.waitUntil }) as { title: string; url: string }
        this.ariaCache = null
        this.appendAction({ t, name: 'navigate', url: args.url as string })
        await this.maybeFlushChunk()
        return JSON.stringify(result)
      }
      case 'click': {
        const t = Date.now()
        const selector = args.selector as string
        const healed = await this.actionWithHealing('click', { selector, timeoutMs: ACTION_TIMEOUT_MS })
        this.ariaCache = null
        this.appendAction({ t, name: 'click', selector: healed ?? selector })
        await this.maybeFlushChunk()
        return healed ? `Clicked: ${healed} (healed from: ${selector})` : `Clicked: ${selector}`
      }
      case 'type': {
        const t = Date.now()
        const selector = args.selector as string
        const text = args.text as string
        const healed = await this.actionWithHealing('type', { selector, text, timeoutMs: ACTION_TIMEOUT_MS })
        this.ariaCache = null
        this.appendAction({ t, name: 'type', selector: healed ?? selector, text })
        await this.maybeFlushChunk()
        return healed ? `Typed into: ${healed} (healed from: ${selector})` : `Typed into: ${selector}`
      }
      case 'get_accessibility_tree': {
        return this.getAriaTree()
      }
      case 'snapshot': {
        const buffer = await this.fetchSnapshotBuffer()
        return [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: buffer.toString('base64') } }]
      }
      case 'start_trace': {
        const name = args.name as string
        const dir = path.join(this.outputDir, 'trace', name)
        fs.mkdirSync(dir, { recursive: true })
        const actionsPath = path.join(this.outputDir, 'trace', `${name}-actions.jsonl`)
        fs.writeFileSync(actionsPath, '', 'utf-8')
        this.traceSession = { name, dir, actionsPath, chunkIndex: 0, actionsSinceFlush: 0 }
        await this.send('start_trace', { name })
        return `Trace started (extension mode) — chunks will be flushed to ${dir}`
      }
      case 'stop_trace': {
        if (!this.traceSession) {
          const name = args.name as string
          const dir = path.join(this.outputDir, 'trace', name)
          const existing = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.startsWith('chunk-')).length : 0
          if (existing > 0) {
            return `Trace partially saved to: ${dir} (${existing} chunk(s) from before the server restarted; recording was not active in this process)`
          }
          throw new Error('No active trace session — call start_trace first')
        }
        const dir = this.traceSession.dir
        const chunksOnDisk = () => this.traceSession!.chunkIndex
        try {
          const data = await this.send('stop_trace') as Uint8Array | string
          this.writeChunk(data)
        } catch (err) {
          const saved = chunksOnDisk()
          this.traceSession = null
          return `Trace partially saved to: ${dir} (${saved} chunk(s); final chunk lost: ${err instanceof Error ? err.message : String(err)})`
        }
        this.traceSession = null
        return `Trace saved to: ${dir}`
      }
      case 'clear_session': {
        await this.send('clear_session')
        this.ariaCache = null
        return 'Session cleared (extension mode)'
      }
      case 'list_tabs': {
        const tabs = await this.send('list_tabs') as Array<{ id: number; title: string; url: string; active: boolean }>
        return JSON.stringify(tabs, null, 2)
      }
      case 'select_tab': {
        const result = await this.send('select_tab', { tabId: args.tabId }) as { tabId: number }
        this.ariaCache = null
        return `Tab ${result.tabId} selected`
      }
      default:
        throw new Error(`Tool "${toolName}" is not supported in extension mode`)
    }
  }
}
