import crypto from 'crypto'
import type { Tool, ToolContext } from './tool.js'
import { dhash } from './phash.js'

function normalizeAria(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function ariaHash(text: string): string {
  return crypto.createHash('sha1').update(normalizeAria(text)).digest('hex')
}

export function structuralSkeleton(text: string): string {
  return text
    .split('\n')
    .map(line => {
      const indent = (line.match(/^[ \t]*/)?.[0] ?? '').replace(/\t/g, '  ')
      const body = line
        .trimStart()
        .replace(/"(?:[^"\\]|\\.)*"/g, '')
        .replace(/\[[^\]]*\]/g, '')
        .replace(/[ \t]+/g, ' ')
        .trim()
      return body ? indent + body : ''
    })
    .filter(line => line.length > 0)
    .join('\n')
}

export function structuralHash(text: string): string {
  return crypto.createHash('sha1').update(structuralSkeleton(text)).digest('hex')
}

const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isIdSegment(seg: string): boolean {
  return /^\d+$/.test(seg) || /^[0-9a-f]{12,}$/i.test(seg) || UUID_SEGMENT.test(seg)
}

export function urlTemplate(rawUrl: string): string {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return rawUrl
  }
  const segments = parsed.pathname.split('/').map(seg => (isIdSegment(seg) ? ':id' : seg))
  return parsed.origin + segments.join('/')
}

export const pageFingerprint: Tool = {
  name: 'page_fingerprint',
  description: 'Capture a combined fingerprint of the current page for loop and template detection. Returns {phash, ariaHash, structuralHash, url, title}. ariaHash is a SHA-1 of the normalized accessibility tree — exact equality means "same interactive state" (true loop). structuralHash is a SHA-1 of the same tree with all text/values stripped — equality means "same page skeleton" regardless of data, used together with the URL template to recognise repeated instances of one page archetype (e.g. list rows). phash is a 64-bit perceptual image hash for visual tiebreak.',
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
      structuralHash: structuralHash(ariaText),
      url: ctx.page.url(),
      title,
    })
  },
}
