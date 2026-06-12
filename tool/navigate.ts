import type { Tool, ToolContext } from './tool.js'

export const navigate: Tool = {
  name: 'navigate',
  description: 'Navigate the browser to a URL. Returns the page title and final URL after navigation.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to navigate to' },
      waitUntil: {
        type: 'string',
        enum: ['domcontentloaded', 'load', 'networkidle'],
        description: 'Navigation readiness to wait for. Default domcontentloaded; use networkidle for SPAs that keep rendering after load.',
      },
    },
    required: ['url'],
  },
  async execute(input, ctx: ToolContext): Promise<string> {
    const url = input.url as string
    const waitUntil = (input.waitUntil as 'domcontentloaded' | 'load' | 'networkidle' | undefined) ?? 'domcontentloaded'
    await ctx.page.goto(url, { waitUntil })
    return JSON.stringify({ title: await ctx.page.title(), url: ctx.page.url() })
  },
}
