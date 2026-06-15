import path from 'path'
import fs from 'fs'
import type { Tool, ToolContext } from './tool.js'

export const writeExplorationLog: Tool = {
  name: 'write_exploration_log',
  description: 'Write the aria-tree audit log for an exploration run to output/exploration/<sessionId>.jsonl. Takes a `visited` array (or a JSON string of one); each element becomes one JSON line. With append:false (default) the file is overwritten with exactly these entries. With append:true the entries are appended, so /bu:explore can persist each novel page the moment it is discovered — the log survives an extension service-worker restart that would drop the in-memory trace. Each entry should include stepId, phash, ariaHash, url, title, ariaSummary, ariaTree, timestamp.',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: 'Exploration session id' },
      entries: {
        type: 'array',
        description: 'Array of visited entries. Each entry must include stepId, phash, ariaHash, url, title, ariaSummary, ariaTree, timestamp.',
        items: { type: 'object' },
      },
      append: {
        type: 'boolean',
        description: 'When true, append the entries to the existing log instead of overwriting. Use this to persist pages one at a time during a run. Default false.',
      },
    },
    required: ['sessionId', 'entries'],
  },
  async execute(input, ctx: ToolContext): Promise<string> {
    const sessionId = input.sessionId as string
    const append = input.append === true
    const rawEntries = input.entries
    const entries: Record<string, unknown>[] = Array.isArray(rawEntries)
      ? rawEntries as Record<string, unknown>[]
      : typeof rawEntries === 'string'
        ? (JSON.parse(rawEntries) as Record<string, unknown>[])
        : []

    const dir = path.join(ctx.outputDir, 'exploration')
    fs.mkdirSync(dir, { recursive: true })
    const filePath = path.join(dir, `${sessionId}.jsonl`)
    const body = entries.length ? entries.map(e => JSON.stringify(e)).join('\n') + '\n' : ''

    if (append) {
      if (body) fs.appendFileSync(filePath, body, 'utf-8')
      else if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '', 'utf-8')
    } else {
      fs.writeFileSync(filePath, body, 'utf-8')
    }

    const total = fs.existsSync(filePath)
      ? fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean).length
      : 0
    return JSON.stringify({ path: filePath, entries: entries.length, appended: append, total })
  },
}
