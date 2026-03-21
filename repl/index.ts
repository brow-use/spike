import 'dotenv/config'
import readline from 'readline'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { Agent } from '../agent/index.js'
import { ExtensionWsServer } from '../server/ws-server.js'
import { BrowserBridge } from '../server/browser-bridge.js'

const WS_PORT = parseInt(process.env.WS_PORT ?? '3456', 10)
const CONFIG_PATH = path.resolve(process.cwd(), 'config', 'app.json')

async function main() {
  const wsServer = new ExtensionWsServer(WS_PORT)
  const bridge = new BrowserBridge(wsServer)

  wsServer.on('extension:connected', () => console.log('\n[brow-use] Chrome extension connected\n> '))
  wsServer.on('extension:disconnected', () => console.log('\n[brow-use] Chrome extension disconnected\n> '))

  const agent = new Agent(bridge)
  await agent.init()

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
  })

  console.log('brow-use — browser automation agent')
  console.log('Type /help for available commands\n')
  rl.prompt()

  rl.on('line', async (line) => {
    const input = line.trim()
    if (!input) { rl.prompt(); return }

    if (input.startsWith('/')) {
      handleSlashCommand(input, agent, rl)
    } else {
      try {
        await agent.run(input)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[error] ${msg}`)
      }
    }

    rl.prompt()
  })

  rl.on('close', async () => {
    console.log('\nGoodbye')
    await agent.close()
    wsServer.close()
    process.exit(0)
  })
}

function handleSlashCommand(input: string, agent: Agent, rl: readline.Interface): void {
  const [command, ...args] = input.split(' ')

  switch (command) {
    case '/help':
      console.log(`
Commands:
  /help              Show this help message
  /status            Show connection and session status
  /config            Show current app configuration
  /config set        Open config/app.json in your editor (set $EDITOR)
  /reset             Reset conversation session (browser state preserved)
  /clear             Clear the terminal screen
`)
      break

    case '/status':
      console.log(`
Session:   ${agent.sessionId()}
Extension: ${agent.isExtensionConnected() ? 'connected' : 'disconnected'}
Config:    ${CONFIG_PATH}
`)
      break

    case '/config':
      if (args[0] === 'set') {
        const editor = process.env.EDITOR ?? 'vi'
        try {
          execSync(`${editor} ${CONFIG_PATH}`, { stdio: 'inherit' })
        } catch {
          console.log(`Could not open editor. Edit manually: ${CONFIG_PATH}`)
        }
      } else {
        const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
        console.log('\nApp configuration:')
        console.log(JSON.stringify(config, null, 2))
        console.log()
      }
      break

    case '/reset':
      agent.resetSession()
      console.log('Session reset. Browser state preserved.')
      break

    case '/clear':
      process.stdout.write('\x1Bc')
      break

    default:
      console.log(`Unknown command: ${command}. Type /help for available commands.`)
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
