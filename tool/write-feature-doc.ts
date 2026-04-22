import path from 'path'
import fs from 'fs'
import type { Tool, ToolContext } from './tool.js'

export const writeFeatureDoc: Tool = {
  name: 'write_feature_doc',
  description: 'Write an end-user-facing Markdown doc to output/docs/<sessionId>/<name>.md — docs are scoped per exploration run so previous runs are never overwritten. Use name "README" for the run\'s index. Content should be plain-language documentation for end users of the app (not developers).',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: 'Exploration session id; docs are written under output/docs/<sessionId>/' },
      name: { type: 'string', description: 'File name without extension, kebab-case (e.g. creating-an-invoice). Use "README" for the index.' },
      content: { type: 'string', description: 'Full Markdown content' },
    },
    required: ['sessionId', 'name', 'content'],
  },
  async execute(input, ctx: ToolContext): Promise<string> {
    const sessionId = input.sessionId as string
    const name = input.name as string
    const content = input.content as string
    const dir = path.join(ctx.outputDir, 'docs', sessionId)
    fs.mkdirSync(dir, { recursive: true })
    const filePath = path.join(dir, `${name}.md`)
    fs.writeFileSync(filePath, content, 'utf-8')
    return `Feature doc written to: ${filePath}`
  },
}
