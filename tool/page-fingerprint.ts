import crypto from 'crypto'
import type { Tool, ToolContext } from './tool.js'
import { dhash } from './phash.js'

function normalizeAria(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function ariaHash(text: string): string {
  return crypto.createHash('sha1').update(normalizeAria(text)).digest('hex')
}

export const pageFingerprint: Tool = {
  name: 'page_fingerprint',
  description: 'Capture a combined fingerprint of the current page for loop detection. Returns {phash, ariaHash, url, title}. ariaHash is a SHA-1 of the normalized accessibility tree — exact equality means "same interactive state". phash is a 64-bit perceptual image hash for visual tiebreak.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  async execute(_input, ctx: ToolContext): Promise<string> {
    const [buffer, ariaText, title] = await Promise.all([
      ctx.page.screenshot({ type: 'png' }),
      ctx.page.locator('body').ariaSnapshot(),
      ctx.page.title(),
    ])
    const phash = dhash(buffer)
    return JSON.stringify({
      phash,
      ariaHash: ariaHash(ariaText),
      url: ctx.page.url(),
      title,
    })
  },
}
