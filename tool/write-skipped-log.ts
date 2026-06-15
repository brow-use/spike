import path from 'path'
import fs from 'fs'
import type { Tool, ToolContext } from './tool.js'

export const writeSkippedLog: Tool = {
  name: 'write_skipped_log',
  description: 'Record pages that exploration deliberately skipped as repeats of an already-sampled page archetype (compare_fingerprint reason "same-template"), to output/exploration/<sessionId>-skipped.jsonl. These are not novel pages and are not explored, but they are kept so the run is auditable and the viewer can show "this list/detail template had N instances, sampled once". Takes an `entries` array (or a JSON string of one); each element becomes one JSON line. With append:true (default) entries are appended so /bu:explore can persist each skip the moment it happens. Each entry should include url, urlTemplate, structuralHash, representativeStepId, representativeUrl, title, reason, timestamp.',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: 'Exploration session id' },
      entries: {
        type: 'array',
        description: 'Array of skipped-page entries. Each entry should include url, urlTemplate, structuralHash, representativeStepId, representativeUrl, title, reason, timestamp.',
        items: { type: 'object' },
      },
      append: {
        type: 'boolean',
        description: 'When true (default), append the entries to the existing skipped log instead of overwriting.',
      },
    },
    required: ['sessionId', 'entries'],
  },
  async execute(input, ctx: ToolContext): Promise<string> {
    const sessionId = input.sessionId as string
    const append = input.append !== false
    const rawEntries = input.entries
    const entries: Record<string, unknown>[] = Array.isArray(rawEntries)
      ? rawEntries as Record<string, unknown>[]
      : typeof rawEntries === 'string'
        ? (JSON.parse(rawEntries) as Record<string, unknown>[])
        : []

    const dir = path.join(ctx.outputDir, 'exploration')
    fs.mkdirSync(dir, { recursive: true })
    const filePath = path.join(dir, `${sessionId}-skipped.jsonl`)
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
