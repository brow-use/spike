import fs from 'fs'
import path from 'path'
import { chromium } from 'playwright'
import type { Browser, BrowserContext, Page } from 'playwright'
import { WebSocketServer } from 'ws'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import type { Tool, ToolContext } from '../tool/tool.js'
import { CrxClient } from './crx-client.js'
import { navigate } from '../tool/navigate.js'
import { click } from '../tool/click.js'
import { type as typeTool } from '../tool/type.js'
import { snapshot } from '../tool/snapshot.js'
import { getAccessibilityTree } from '../tool/get-accessibility-tree.js'
import { startTrace } from '../tool/start-trace.js'
import { stopTrace } from '../tool/stop-trace.js'
import { writePageObject } from '../tool/write-page-object.js'
import { writeWorkflow } from '../tool/write-workflow.js'
import { writeTest } from '../tool/write-test.js'
import { clearSession } from '../tool/clear-session.js'
import { AppRepository } from '../repository/app-repository.js'

const OUTPUT_DIR = path.resolve(process.cwd(), 'output')

const browserTools: Tool[] = [
  navigate, click, typeTool, snapshot, getAccessibilityTree,
  startTrace, stopTrace, writePageObject, writeWorkflow, writeTest, clearSession,
]

const appTools = [
  {
    name: 'create_app',
    description: 'Create a new app with a name, description, and URL.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'App name' },
        description: { type: 'string', description: 'What the app does' },
        url: { type: 'string', description: 'Base URL of the app' },
      },
      required: ['name', 'description', 'url'],
    },
  },
  {
    name: 'update_app',
    description: 'Update an existing app by id.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'App id' },
        name: { type: 'string', description: 'New name' },
        description: { type: 'string', description: 'New description' },
        url: { type: 'string', description: 'New URL' },
      },
      required: ['id', 'name', 'description', 'url'],
    },
  },
  {
    name: 'delete_app',
    description: 'Delete an app by id.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'App id' },
      },
      required: ['id'],
    },
  },
  {
    name: 'set_current_app',
    description: 'Set the active app by id and navigate the browser to its URL.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'App id' },
      },
      required: ['id'],
    },
  },
  {
    name: 'set_mode',
    description: 'Switch execution mode. Use "playwright" for a fresh Chromium instance (default), or "crx" to automate the user\'s real Chrome session via the brow-use extension.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        mode: { type: 'string', enum: ['playwright', 'crx'], description: 'Execution mode' },
      },
      required: ['mode'],
    },
  },
  {
    name: 'list_tabs',
    description: 'List all open Chrome tabs (session mode only). Returns id, title, url, and active flag for each tab.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'select_tab',
    description: 'Pin session-mode automation to a specific tab by its id. Call list_tabs first to find the id.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tabId: { type: 'number', description: 'Tab id from list_tabs' },
      },
      required: ['tabId'],
    },
  },
]

const appRepo = new AppRepository()
const crxClient = new CrxClient(OUTPUT_DIR)

const wss = new WebSocketServer({ port: 3456 })
wss.on('connection', (socket) => {
  crxClient.attachSocket(socket)
})

let executionMode: 'playwright' | 'crx' = 'playwright'

let browser: Browser | null = null
let browserContext: BrowserContext | null = null
let page: Page | null = null

async function ensureBrowser(): Promise<ToolContext> {
  if (!page || page.isClosed()) {
    await browserContext?.close().catch(() => {})
    await browser?.close().catch(() => {})
    for (const dir of ['page', 'workflow', 'trace']) {
      fs.mkdirSync(path.join(OUTPUT_DIR, dir), { recursive: true })
    }
    browser = await chromium.launch({ headless: false })
    browserContext = await browser.newContext()
    page = await browserContext.newPage()
  }
  return { page: page!, context: browserContext!, outputDir: OUTPUT_DIR }
}

const server = new Server(
  { name: 'brow-use', version: '0.1.0' },
  { capabilities: { tools: {}, resources: {} } },
)

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: 'apps://list',
      name: 'Apps',
      description: 'All saved web applications',
      mimeType: 'application/json',
    },
    {
      uri: 'apps://current',
      name: 'Current App',
      description: 'The currently selected web application',
      mimeType: 'application/json',
    },
  ],
}))

server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  const { uri } = req.params
  if (uri === 'apps://list') {
    return {
      contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(appRepo.listApps(), null, 2) }],
    }
  }
  if (uri === 'apps://current') {
    return {
      contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(appRepo.getCurrentApp() ?? null, null, 2) }],
    }
  }
  throw new Error(`Unknown resource: ${uri}`)
})

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    ...browserTools.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
    ...appTools,
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params

  const appTool = appTools.find(t => t.name === name)
  if (appTool) {
    try {
      if (name === 'create_app') {
        const app = appRepo.createApp(args.name as string, args.description as string, args.url as string)
        return { content: [{ type: 'text', text: JSON.stringify(app, null, 2) }] }
      }
      if (name === 'update_app') {
        const app = appRepo.updateApp(args.id as string, args.name as string, args.description as string, args.url as string)
        if (!app) return { content: [{ type: 'text', text: `App not found: ${args.id}` }], isError: true }
        return { content: [{ type: 'text', text: JSON.stringify(app, null, 2) }] }
      }
      if (name === 'delete_app') {
        const deleted = appRepo.deleteApp(args.id as string)
        if (!deleted) return { content: [{ type: 'text', text: `App not found: ${args.id}` }], isError: true }
        return { content: [{ type: 'text', text: `Deleted app: ${args.id}` }] }
      }
      if (name === 'set_current_app') {
        const app = appRepo.setCurrentApp(args.id as string)
        if (!app) return { content: [{ type: 'text', text: `App not found: ${args.id}` }], isError: true }
        const ctx = await ensureBrowser()
        await ctx.page.goto(app.url, { waitUntil: 'domcontentloaded' })
        return { content: [{ type: 'text', text: `Switched to "${app.name}" and navigated to ${app.url}` }] }
      }
      if (name === 'set_mode') {
        executionMode = args.mode as 'playwright' | 'crx'
        return { content: [{ type: 'text', text: `Execution mode set to: ${executionMode}` }] }
      }
      if (name === 'list_tabs' || name === 'select_tab') {
        const result = await crxClient.execute(name, args)
        if (typeof result === 'string') {
          return { content: [{ type: 'text', text: result }] }
        }
        return { content: result.map(block => block.type === 'image'
          ? { type: 'image' as const, data: block.source.data, mimeType: block.source.media_type }
          : { type: 'text' as const, text: block.text }) }
      }
    } catch (err) {
      return { content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }], isError: true }
    }
  }

  const browserTool = browserTools.find(t => t.name === name)
  if (!browserTool) {
    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true }
  }

  const fileOnlyTools = new Set(['write_page_object', 'write_workflow', 'write_test'])

  try {
    let result: string | import('../tool/tool.js').ToolResultContent[]
    if (executionMode === 'crx' && !fileOnlyTools.has(name)) {
      result = await crxClient.execute(name, args)
    } else {
      const ctx = await ensureBrowser()
      result = await browserTool.execute(args, ctx)
    }
    if (typeof result === 'string') {
      return { content: [{ type: 'text', text: result }] }
    }
    return {
      content: result.map(block => {
        if (block.type === 'image') {
          return { type: 'image' as const, data: block.source.data, mimeType: block.source.media_type }
        }
        return { type: 'text' as const, text: block.text }
      }),
    }
  } catch (err) {
    return {
      content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }],
      isError: true,
    }
  }
})

process.on('SIGTERM', async () => {
  wss.close()
  await browserContext?.close()
  await browser?.close()
  process.exit(0)
})

const transport = new StdioServerTransport()
await server.connect(transport)
