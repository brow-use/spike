import type { Tool, ToolContext } from './tool.js'
import { startTraceSession } from './trace-session.js'

export const startTrace: Tool = {
  name: 'start_trace',
  description: 'Start recording a Playwright trace for the named session. Always call this before beginning a workflow recording. Captures screenshots, DOM snapshots, and network activity. The trace is flushed to disk after every action in chunks under output/trace/<name>/ so a mid-run crash loses at most the last in-flight action.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Session id the trace belongs to (e.g. explore-<unix-ms>). Chunks are written to output/trace/<name>/' },
    },
    required: ['name'],
  },
  async execute(input, ctx: ToolContext): Promise<string> {
    const dir = await startTraceSession(ctx.context, ctx.outputDir, input.name as string)
    return `Trace recording started — chunks will be flushed to ${dir}`
  },
}
