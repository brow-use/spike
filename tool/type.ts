import type { Tool, ToolContext } from './tool.js'
import { healSelector } from './selector-heal.js'

const ACTION_TIMEOUT_MS = 8000

export const type: Tool = {
  name: 'type',
  description: 'Type text into an input field. Clears existing content before typing. If the selector no longer matches, the tool attempts to heal it against the accessibility tree and reports the substitution.',
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
    try {
      await ctx.page.fill(selector, text, { timeout: ACTION_TIMEOUT_MS })
      return `Typed "${text}" into: ${selector}`
    } catch (err) {
      const tree = await ctx.page.locator('body').ariaSnapshot()
      const candidate = healSelector(tree, selector)
      if (!candidate) throw err
      await ctx.page.fill(candidate.selector, text, { timeout: ACTION_TIMEOUT_MS })
      return `Typed "${text}" into: ${candidate.selector} (healed from: ${selector})`
    }
  },
}
