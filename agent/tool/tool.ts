import type { BrowserContext, Page } from 'playwright'
import type { BrowserBridge } from '../../server/browser-bridge.js'
import type { ContentBlock, ToolDefinition } from '../model/model.js'

export interface ToolContext {
  page: Page
  context: BrowserContext
  bridge: BrowserBridge
  outputDir: string
}

export interface Tool {
  name: string
  description: string
  inputSchema: ToolDefinition['inputSchema']
  execute(input: Record<string, unknown>, ctx: ToolContext): Promise<string | ContentBlock[]>
}
