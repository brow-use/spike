import type { Tool, ToolContext } from './tool.js'

export const startTrace: Tool = {
  name: 'start_trace',
  description: 'Start recording a Playwright trace. Always call this before beginning a workflow recording. Captures screenshots, DOM snapshots, and network activity.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  async execute(_input, ctx: ToolContext): Promise<string> {
    await ctx.context.tracing.start({ screenshots: true, snapshots: true, sources: true })
    return 'Trace recording started'
  },
}
