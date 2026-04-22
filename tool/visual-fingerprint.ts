import type { Tool, ToolContext } from './tool.js'
import { dhash } from './phash.js'

export const visualFingerprint: Tool = {
  name: 'visual_fingerprint',
  description: 'Capture a perceptual fingerprint of the current page for loop detection during autonomous exploration. Returns a 64-bit dHash as hex plus url and title. Does not write to disk and does not return the image — the running Playwright trace captures the visual.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  async execute(_input, ctx: ToolContext): Promise<string> {
    const buffer = await ctx.page.screenshot({ type: 'png' })
    const phash = dhash(buffer)
    const url = ctx.page.url()
    const title = await ctx.page.title()
    return JSON.stringify({ phash, url, title })
  },
}
