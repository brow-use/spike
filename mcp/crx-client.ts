import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import type { WebSocket } from 'ws'
import type { ToolResultContent } from '../tool/tool.js'

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

export class CrxClient {
  private socket: WebSocket | null = null
  private pending = new Map<string, { resolve: (data: unknown) => void; reject: (err: Error) => void }>()
  private outputDir: string

  constructor(outputDir: string) {
    this.outputDir = outputDir
  }

  attachSocket(socket: WebSocket): void {
    this.socket = socket
    socket.on('message', (data) => {
      const result = JSON.parse(data.toString()) as CommandResult
      const pending = this.pending.get(result.id)
      if (!pending) return
      this.pending.delete(result.id)
      if (result.success) {
        pending.resolve(result.data)
      } else {
        pending.reject(new Error(result.error ?? 'Command failed'))
      }
    })
    socket.on('close', () => {
      this.socket = null
      for (const { reject } of this.pending.values()) {
        reject(new Error('Extension disconnected'))
      }
      this.pending.clear()
    })
  }

  get connected(): boolean {
    return this.socket?.readyState === 1
  }

  private send(type: string, payload: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.connected) {
      return Promise.reject(new Error('Extension not connected. Load the brow-use extension in Chrome and ensure the server is running.'))
    }
    const id = crypto.randomUUID()
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.socket!.send(JSON.stringify({ id, type, payload } satisfies BrowserCommand))
    })
  }

  async execute(toolName: string, args: Record<string, unknown>): Promise<string | ToolResultContent[]> {
    switch (toolName) {
      case 'navigate': {
        const result = await this.send('navigate', { url: args.url }) as { title: string; url: string }
        return JSON.stringify(result)
      }
      case 'click': {
        await this.send('click', { selector: args.selector })
        return `Clicked: ${args.selector}`
      }
      case 'type': {
        await this.send('type', { selector: args.selector, text: args.text })
        return `Typed into: ${args.selector}`
      }
      case 'get_accessibility_tree': {
        const tree = await this.send('get_accessibility_tree') as string
        return tree
      }
      case 'snapshot': {
        const base64 = await this.send('snapshot') as string
        return [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64 } }]
      }
      case 'start_trace': {
        await this.send('start_trace')
        return 'Trace started (extension mode)'
      }
      case 'stop_trace': {
        const base64 = await this.send('stop_trace') as string
        const traceDir = path.join(this.outputDir, 'trace')
        fs.mkdirSync(traceDir, { recursive: true })
        const tracePath = path.join(traceDir, `${args.name}-${Date.now()}.zip`)
        fs.writeFileSync(tracePath, Buffer.from(base64, 'base64'))
        return `Trace saved to: ${tracePath}`
      }
      case 'clear_session': {
        await this.send('clear_session')
        return 'Session cleared (extension mode)'
      }
      default:
        throw new Error(`Tool "${toolName}" is not supported in extension mode`)
    }
  }
}
