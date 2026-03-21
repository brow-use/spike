import type { Tool, ToolContext } from './tool.js'
import type { CommandType } from '../../server/browser-bridge.js'

export const sendToExtension: Tool = {
  name: 'send_to_extension',
  description: 'Send a command to the Chrome extension to execute in the real browser. Use this when you need to interact with the user\'s actual browser session rather than the Playwright browser. Requires the extension to be connected.',
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['click', 'type', 'scroll', 'read_dom', 'highlight'],
        description: 'Command type to execute in the browser',
      },
      payload: {
        type: 'object',
        description: 'Command-specific payload (e.g. { selector, text } for type)',
      },
    },
    required: ['type', 'payload'],
  },
  async execute(input, ctx: ToolContext): Promise<string> {
    const result = await ctx.bridge.sendCommand(
      input.type as CommandType,
      input.payload as Record<string, unknown>
    )
    if (!result.success) throw new Error(result.error ?? 'Extension command failed')
    return JSON.stringify(result.data ?? { ok: true })
  },
}
