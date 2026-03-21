import { WebSocketServer, WebSocket } from 'ws'
import { EventEmitter } from 'events'
import type { BrowserCommand, CommandResult } from './browser-bridge.js'

export class ExtensionWsServer extends EventEmitter {
  private wss: WebSocketServer
  private socket: WebSocket | null = null

  constructor(port: number) {
    super()
    this.wss = new WebSocketServer({ port })
    this.wss.on('connection', (ws) => {
      this.socket = ws
      this.emit('extension:connected')

      ws.on('message', (data) => {
        const result = JSON.parse(data.toString()) as CommandResult
        this.emit(`result:${result.id}`, result)
      })

      ws.on('close', () => {
        this.socket = null
        this.emit('extension:disconnected')
      })

      ws.on('error', (err) => {
        this.emit('extension:error', err)
      })
    })
  }

  isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN
  }

  send(cmd: BrowserCommand): void {
    if (!this.isConnected()) throw new Error('Chrome extension is not connected')
    this.socket!.send(JSON.stringify(cmd))
  }

  close(): void {
    this.wss.close()
  }
}
