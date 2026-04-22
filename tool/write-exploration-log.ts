import path from 'path'
import fs from 'fs'
import type { Tool, ToolContext } from './tool.js'

export const writeExplorationLog: Tool = {
  name: 'write_exploration_log',
  description: 'Write the aria-tree audit log for an exploration run to output/exploration/<sessionId>.jsonl. Takes the full `visited` array as a JSON string or array; each element becomes one JSON line. Replaces the manual Write-tool approach that required the model to emit the entire JSONL content as output tokens.',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: 'Exploration session id' },
      entries: {
        type: 'array',
        description: 'Array of visited entries. Each entry must include stepId, phash, ariaHash, url, title, ariaSummary, ariaTree, timestamp.',
        items: { type: 'object' },
      },
    },
    required: ['sessionId', 'entries'],
  },
  async execute(input, ctx: ToolContext): Promise<string> {
    const sessionId = input.sessionId as string
    const rawEntries = input.entries
    const entries: Record<string, unknown>[] = Array.isArray(rawEntries)
      ? rawEntries as Record<string, unknown>[]
      : typeof rawEntries === 'string'
        ? (JSON.parse(rawEntries) as Record<string, unknown>[])
        : []

    const dir = path.join(ctx.outputDir, 'exploration')
    fs.mkdirSync(dir, { recursive: true })
    const filePath = path.join(dir, `${sessionId}.jsonl`)
    const body = entries.map(e => JSON.stringify(e)).join('\n') + '\n'
    fs.writeFileSync(filePath, body, 'utf-8')
    return JSON.stringify({ path: filePath, entries: entries.length })
  },
}
