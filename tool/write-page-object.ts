import path from 'path'
import fs from 'fs'
import type { Tool, ToolContext } from './tool.js'

export const writePageObject: Tool = {
  name: 'write_page_object',
  description: 'Write a Playwright Page Object Model (POM) TypeScript file to output/page/. The content should be a complete TypeScript class.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'File name without extension (e.g. login-page)' },
      content: { type: 'string', description: 'Complete TypeScript source code for the page object' },
    },
    required: ['name', 'content'],
  },
  async execute(input, ctx: ToolContext): Promise<string> {
    const name = input.name as string
    const content = input.content as string
    const filePath = path.join(ctx.outputDir, 'page', `${name}.ts`)
    fs.writeFileSync(filePath, content, 'utf-8')
    return `Page object written to: ${filePath}`
  },
}
