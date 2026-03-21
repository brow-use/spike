import type { Tool, ToolContext } from './tool.js'

export const getAccessibilityTree: Tool = {
  name: 'get_accessibility_tree',
  description: 'Get the accessibility tree of the current page. Use this to understand the page structure, find interactive elements, and determine selectors for click/type operations.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  async execute(_input, ctx: ToolContext): Promise<string> {
    const tree = await ctx.page.evaluate(() => {
      function nodeToObj(node: Element): unknown {
        return {
          role: node.getAttribute('role') ?? node.tagName.toLowerCase(),
          name: (node as HTMLElement).innerText?.slice(0, 100) ?? node.getAttribute('aria-label') ?? '',
          children: Array.from(node.children).map(nodeToObj),
        }
      }
      return nodeToObj(document.body)
    })
    return JSON.stringify(tree, null, 2)
  },
}
