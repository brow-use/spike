import type { Tool, ToolContext } from './tool.js'

export const getAccessibilityTree: Tool = {
  name: 'get_accessibility_tree',
  description: 'Get the accessibility tree of the current page. Use this to understand the page structure, find interactive elements, and determine selectors for click/type operations.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  async execute(_input, ctx: ToolContext): Promise<string> {
    return ctx.page.locator('body').ariaSnapshot()
  },
}
