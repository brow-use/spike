import type { Tool, ToolContext, ToolResultContent } from './tool.js'

export const snapshot: Tool = {
  name: 'snapshot',
  description: 'Take a screenshot of the current browser page and return it as an image.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  async execute(_input, ctx: ToolContext): Promise<ToolResultContent[]> {
    const buffer = await ctx.page.screenshot({ type: 'png' })
    return [
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: buffer.toString('base64'),
        },
      },
    ]
  },
}
