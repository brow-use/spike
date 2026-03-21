import path from 'path'
import fs from 'fs'
import type { Tool, ToolContext } from './tool.js'

export const writeTest: Tool = {
  name: 'write_test',
  description: 'Write a Playwright test TypeScript file to output/test/. The content should use @playwright/test and be a complete test file.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'File name without extension (e.g. login)' },
      content: { type: 'string', description: 'Complete TypeScript source code for the Playwright test' },
    },
    required: ['name', 'content'],
  },
  async execute(input, ctx: ToolContext): Promise<string> {
    const name = input.name as string
    const content = input.content as string
    const filePath = path.join(ctx.outputDir, 'test', `${name}.spec.ts`)
    fs.writeFileSync(filePath, content, 'utf-8')
    return `Test written to: ${filePath}`
  },
}
