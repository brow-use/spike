import type { Tool, ToolContext } from './tool.js'
import { stopTraceSession } from './trace-session.js'

export const stopTrace: Tool = {
  name: 'stop_trace',
  description: 'Stop the current Playwright trace recording, flushing the final chunk. Returns the directory containing the chunked trace.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name for the trace file (without extension)' },
    },
    required: ['name'],
  },
  async execute(_input, ctx: ToolContext): Promise<string> {
    const dir = await stopTraceSession(ctx.context)
    return `Trace saved to: ${dir}`
  },
}
