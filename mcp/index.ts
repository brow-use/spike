import fs from 'fs'
import path from 'path'
import { chromium } from 'playwright'
import type { Browser, BrowserContext, Page } from 'playwright'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import type { Tool, ToolContext } from '../tool/tool.js'
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

const OUTPUT_DIR = path.resolve(process.cwd(), 'output')

const tools: Tool[] = [
  navigate, click, typeTool, snapshot, getAccessibilityTree,
  startTrace, stopTrace, writePageObject, writeWorkflow, writeTest,
]

let browser: Browser | null = null
let browserContext: BrowserContext | null = null
let page: Page | null = null

async function ensureBrowser(): Promise<ToolContext> {
  if (!browser) {
    for (const dir of ['page', 'workflow', 'test', 'trace']) {
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
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map(t => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = tools.find(t => t.name === req.params.name)
  if (!tool) {
    return {
      content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }],
      isError: true,
    }
  }

  const ctx = await ensureBrowser()
  try {
    const result = await tool.execute(req.params.arguments ?? {}, ctx)
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
  await browserContext?.close()
  await browser?.close()
  process.exit(0)
})

const transport = new StdioServerTransport()
await server.connect(transport)
