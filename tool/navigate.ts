import type { Tool, ToolContext } from './tool.js'

export const navigate: Tool = {
  name: 'navigate',
  description: 'Navigate the browser to a URL. Returns the page title and final URL after navigation.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to navigate to' },
    },
    required: ['url'],
  },
  async execute(input, ctx: ToolContext): Promise<string> {
    const url = input.url as string
    await ctx.page.goto(url, { waitUntil: 'domcontentloaded' })
    return JSON.stringify({ title: await ctx.page.title(), url: ctx.page.url() })
  },
}
