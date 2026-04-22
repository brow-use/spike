import type { Tool } from './tool.js'
import { hamming } from './phash.js'

interface Fingerprint {
  phash: string
  ariaHash: string
}

export const compareFingerprint: Tool = {
  name: 'compare_fingerprint',
  description: 'Check whether a candidate page fingerprint matches any previously-seen one. Primary match is exact ariaHash equality ("same interactive state"). Secondary match is phash Hamming distance <= phashThreshold (default 10) for visual-similarity tiebreak. Returns {matched, reason, matchedIndex, minPhashDistance} where reason is "aria-identical" | "phash-close" | "no-match".',
  inputSchema: {
    type: 'object',
    properties: {
      candidate: {
        type: 'object',
        properties: {
          phash: { type: 'string' },
          ariaHash: { type: 'string' },
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
