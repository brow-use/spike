import path from 'path'
import type { Tool, ToolContext } from './tool.js'

export const stopTrace: Tool = {
  name: 'stop_trace',
  description: 'Stop the current Playwright trace recording and save it to a file. Returns the path of the saved trace.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name for the trace file (without extension)' },
    },
    required: ['name'],
  },
  async execute(input, ctx: ToolContext): Promise<string> {
    const name = input.name as string
    const tracePath = path.join(ctx.outputDir, 'trace', `${name}-${Date.now()}.zip`)
    await ctx.context.tracing.stop({ path: tracePath })
    return `Trace saved to: ${tracePath}`
  },
}
