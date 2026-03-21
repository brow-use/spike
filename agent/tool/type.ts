import type { Tool, ToolContext } from './tool.js'

export const type: Tool = {
  name: 'type',
  description: 'Type text into an input field. Clears existing content before typing.',
  inputSchema: {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'CSS selector of the input field' },
      text: { type: 'string', description: 'Text to type' },
    },
    required: ['selector', 'text'],
  },
  async execute(input, ctx: ToolContext): Promise<string> {
    const selector = input.selector as string
    const text = input.text as string
    await ctx.page.fill(selector, text)
    return `Typed "${text}" into: ${selector}`
  },
}
