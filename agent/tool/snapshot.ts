import type { Tool, ToolContext } from './tool.js'
import type { ContentBlock } from '../model/model.js'

export const snapshot: Tool = {
  name: 'snapshot',
  description: 'Take a screenshot of the current browser page and return it as an image.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  async execute(_input, ctx: ToolContext): Promise<ContentBlock[]> {
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
