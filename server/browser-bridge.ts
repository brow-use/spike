import { randomUUID } from 'crypto'
import type { ExtensionWsServer } from './ws-server.js'

export type CommandType = 'click' | 'type' | 'scroll' | 'read_dom' | 'highlight'

export interface BrowserCommand {
  id: string
  type: CommandType
  payload: Record<string, unknown>
}

export interface CommandResult {
  id: string
  success: boolean
  data?: unknown
  error?: string
}

const COMMAND_TIMEOUT_MS = 15_000

export class BrowserBridge {
  constructor(private wsServer: ExtensionWsServer) {}

  isExtensionConnected(): boolean {
    return this.wsServer.isConnected()
  }

  sendCommand(type: CommandType, payload: Record<string, unknown>): Promise<CommandResult> {
    if (!this.isExtensionConnected()) {
      throw new Error('Chrome extension is not connected. Load the extension and ensure it is connected.')
    }

    const cmd: BrowserCommand = { id: randomUUID(), type, payload }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.wsServer.removeAllListeners(`result:${cmd.id}`)
        reject(new Error(`Command ${type} timed out after ${COMMAND_TIMEOUT_MS}ms`))
      }, COMMAND_TIMEOUT_MS)

      this.wsServer.once(`result:${cmd.id}`, (result: CommandResult) => {
        clearTimeout(timer)
        resolve(result)
      })

      this.wsServer.send(cmd)
    })
  }
}
