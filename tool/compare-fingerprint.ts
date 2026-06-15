import type { Tool } from './tool.js'
import { hamming } from './phash.js'
import { urlTemplate } from './page-fingerprint.js'

interface Fingerprint {
  phash: string
  ariaHash: string
  structuralHash?: string
  url?: string
}

export const compareFingerprint: Tool = {
  name: 'compare_fingerprint',
  description: 'Check whether a candidate page fingerprint matches any previously-seen one, in priority order. (1) Exact ariaHash equality is a true loop — reason "aria-identical". (2) If structuralHash and url are supplied, a candidate whose structuralHash equals a known page AND whose url collapses to the same URL template (id-like path segments replaced by :id) is a repeat of that page archetype — reason "same-template" — even though its content differs. Use this to sample one representative of a list/detail template and skip the rest. (3) phash Hamming distance <= phashThreshold (default 10) is a visual-similarity tiebreak — reason "phash-close". Returns {matched, reason, matchedIndex, minPhashDistance} where reason is "aria-identical" | "same-template" | "phash-close" | "no-match" and matchedIndex points at the representative in `known`.',
  inputSchema: {
    type: 'object',
    properties: {
      candidate: {
        type: 'object',
        properties: {
          phash: { type: 'string' },
          ariaHash: { type: 'string' },
          structuralHash: { type: 'string' },
          url: { type: 'string' },
        },
        required: ['phash', 'ariaHash'],
      },
      known: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            phash: { type: 'string' },
            ariaHash: { type: 'string' },
            structuralHash: { type: 'string' },
            url: { type: 'string' },
          },
          required: ['phash', 'ariaHash'],
        },
      },
      phashThreshold: { type: 'number', description: 'Default 10' },
    },
    required: ['candidate', 'known'],
  },
  async execute(input): Promise<string> {
    const candidateRaw = input.candidate
    const candidate: Fingerprint = typeof candidateRaw === 'string'
      ? JSON.parse(candidateRaw)
      : candidateRaw as Fingerprint
    const knownRaw = input.known
    const known: Fingerprint[] = Array.isArray(knownRaw)
      ? knownRaw as Fingerprint[]
      : typeof knownRaw === 'string'
        ? (JSON.parse(knownRaw) as Fingerprint[])
        : []
    const threshold = (input.phashThreshold as number | undefined) ?? 10

    for (let i = 0; i < known.length; i++) {
      if (known[i].ariaHash === candidate.ariaHash) {
        return JSON.stringify({
          matched: true,
          reason: 'aria-identical',
          matchedIndex: i,
          minPhashDistance: hamming(candidate.phash, known[i].phash),
        })
      }
    }

    if (candidate.structuralHash && candidate.url) {
      const candidateTemplate = urlTemplate(candidate.url)
      for (let i = 0; i < known.length; i++) {
        const k = known[i]
        if (k.structuralHash && k.url
          && k.structuralHash === candidate.structuralHash
          && urlTemplate(k.url) === candidateTemplate) {
          return JSON.stringify({
            matched: true,
            reason: 'same-template',
            matchedIndex: i,
            urlTemplate: candidateTemplate,
            minPhashDistance: hamming(candidate.phash, k.phash),
          })
        }
      }
    }

    let minPhashDistance = 64
    let matchedIndex = -1
    for (let i = 0; i < known.length; i++) {
      const d = hamming(candidate.phash, known[i].phash)
      if (d < minPhashDistance) {
        minPhashDistance = d
        matchedIndex = i
      }
    }

    if (matchedIndex !== -1 && minPhashDistance <= threshold) {
      return JSON.stringify({
        matched: true,
        reason: 'phash-close',
        matchedIndex,
        minPhashDistance,
      })
    }

    return JSON.stringify({
      matched: false,
      reason: 'no-match',
      matchedIndex: -1,
      minPhashDistance,
    })
  },
}
