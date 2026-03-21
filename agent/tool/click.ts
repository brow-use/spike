import type { Tool, ToolContext } from './tool.js'

export const click: Tool = {
  name: 'click',
  description: 'Click an element on the page using a CSS selector or text. Use the accessibility tree to find the right selector.',
  inputSchema: {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'CSS selector or text to click' },
    },
    required: ['selector'],
  },
  async execute(input, ctx: ToolContext): Promise<string> {
    const selector = input.selector as string
    await ctx.page.click(selector)
    return `Clicked: ${selector}`
  },
}
