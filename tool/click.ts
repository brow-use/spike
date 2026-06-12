import type { Tool, ToolContext } from './tool.js'
import { healSelector } from './selector-heal.js'

const ACTION_TIMEOUT_MS = 8000

export const click: Tool = {
  name: 'click',
  description: 'Click an element on the page using a CSS selector or text. Use the accessibility tree to find the right selector. If the selector no longer matches, the tool attempts to heal it against the accessibility tree and reports the substitution.',
  inputSchema: {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'CSS selector or text to click' },
    },
    required: ['selector'],
  },
  async execute(input, ctx: ToolContext): Promise<string> {
    const selector = input.selector as string
    try {
      await ctx.page.click(selector, { timeout: ACTION_TIMEOUT_MS })
      return `Clicked: ${selector}`
    } catch (err) {
      const tree = await ctx.page.locator('body').ariaSnapshot()
      const candidate = healSelector(tree, selector)
      if (!candidate) throw err
      await ctx.page.click(candidate.selector, { timeout: ACTION_TIMEOUT_MS })
      return `Clicked: ${candidate.selector} (healed from: ${selector})`
    }
  },
}
