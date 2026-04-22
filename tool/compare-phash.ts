import type { Tool } from './tool.js'
import { hamming } from './phash.js'

export const comparePhash: Tool = {
  name: 'compare_phash',
  description: 'Compute the minimum Hamming distance between a candidate 64-bit dHash (16-char hex) and a list of previously-seen hashes. Returns {matched, minDistance, matchedIndex}. matched is true when minDistance <= threshold (default 10). Use after visual_fingerprint to decide whether the current page was already visited.',
  inputSchema: {
    type: 'object',
    properties: {
      candidate: { type: 'string', description: '16-char hex dHash from visual_fingerprint' },
      known: { type: 'array', items: { type: 'string' }, description: 'Previously seen dHashes' },
      threshold: { type: 'number', description: 'Match if minDistance <= threshold. Default 10.' },
    },
    required: ['candidate', 'known'],
  },
  async execute(input): Promise<string> {
    const candidate = input.candidate as string
    const known = (input.known as string[]) ?? []
    const threshold = (input.threshold as number | undefined) ?? 10

    let minDistance = 64
    let matchedIndex = -1
    for (let i = 0; i < known.length; i++) {
      const d = hamming(candidate, known[i])
      if (d < minDistance) {
        minDistance = d
        matchedIndex = i
      }
    }

    const matched = matchedIndex !== -1 && minDistance <= threshold
    return JSON.stringify({ matched, minDistance, matchedIndex })
  },
}
