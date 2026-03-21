import 'dotenv/config'
import { ExtensionWsServer } from './ws-server.js'
import { BrowserBridge } from './browser-bridge.js'

const port = parseInt(process.env.WS_PORT ?? '3456', 10)

const wsServer = new ExtensionWsServer(port)
export const bridge = new BrowserBridge(wsServer)

wsServer.on('extension:connected', () => console.log('[server] Chrome extension connected'))
wsServer.on('extension:disconnected', () => console.log('[server] Chrome extension disconnected'))
wsServer.on('extension:error', (err: Error) => console.error('[server] Extension error:', err.message))

console.log(`[server] WebSocket server listening on ws://localhost:${port}`)

export { wsServer }
