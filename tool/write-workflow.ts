import path from 'path'
import fs from 'fs'
import type { Tool, ToolContext } from './tool.js'

export const writeWorkflow: Tool = {
  name: 'write_workflow',
  description: 'Write a reusable Playwright workflow TypeScript file to output/workflow/. The content should be a complete TypeScript function or module.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'File name without extension (e.g. login-workflow)' },
      content: { type: 'string', description: 'Complete TypeScript source code for the workflow' },
    },
    required: ['name', 'content'],
  },
  async execute(input, ctx: ToolContext): Promise<string> {
    const name = input.name as string
    const content = input.content as string
    const filePath = path.join(ctx.outputDir, 'workflow', `${name}.ts`)
    fs.writeFileSync(filePath, content, 'utf-8')
    return `Workflow written to: ${filePath}`
  },
}
