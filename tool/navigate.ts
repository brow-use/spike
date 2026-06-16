import type { Tool, ToolContext } from './tool.js'
import { isWithinScope } from '../domain/scope.js'

export const navigate: Tool = {
  name: 'navigate',
  description: 'Navigate the browser to a URL. Returns the page title and final URL after navigation. When urlPrefix is set, an out-of-scope target is rejected without navigating (returns rejected:true) — the hard backstop for scoped exploration.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to navigate to' },
      waitUntil: {
        type: 'string',
        enum: ['domcontentloaded', 'load', 'networkidle'],
        description: 'Navigation readiness to wait for. Default domcontentloaded; use networkidle for SPAs that keep rendering after load.',
      },
      urlPrefix: {
        type: 'string',
        description: 'Optional scope restriction. When set, navigation is rejected (no page load, returns rejected:true) if the target path is not within this prefix (e.g. "/cloud/dashboard/devices").',
      },
    },
    required: ['url'],
  },
  async execute(input, ctx: ToolContext): Promise<string> {
    const url = input.url as string
    const urlPrefix = input.urlPrefix as string | undefined
    if (urlPrefix && !isWithinScope(url, urlPrefix)) {
      return JSON.stringify({ rejected: true, reason: 'out-of-scope', url, scope: urlPrefix })
    }
    const waitUntil = (input.waitUntil as 'domcontentloaded' | 'load' | 'networkidle' | undefined) ?? 'domcontentloaded'
    await ctx.page.goto(url, { waitUntil })
    return JSON.stringify({ title: await ctx.page.title(), url: ctx.page.url() })
  },
}
