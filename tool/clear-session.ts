import type { Tool, ToolContext } from './tool.js'

export const clearSession: Tool = {
  name: 'clear_session',
  description: 'Clear browser session data — cookies, localStorage, and sessionStorage.',
  inputSchema: { type: 'object', properties: {} },
  async execute(_input, ctx: ToolContext): Promise<string> {
    await ctx.context.clearCookies()
    await ctx.page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
    })
    return 'Session cleared: cookies, localStorage, and sessionStorage removed'
  },
}
