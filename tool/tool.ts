import type { BrowserContext, Page } from 'playwright'

export interface ImageBlock {
  type: 'image'
  source: {
    type: 'base64'
    media_type: 'image/png' | 'image/jpeg' | 'image/webp'
    data: string
  }
}

export interface TextBlock {
  type: 'text'
  text: string
}

export type ToolResultContent = TextBlock | ImageBlock

export interface ToolContext {
  page: Page
  context: BrowserContext
  outputDir: string
}

export interface Tool {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
  execute(input: Record<string, unknown>, ctx: ToolContext): Promise<string | ToolResultContent[]>
}
