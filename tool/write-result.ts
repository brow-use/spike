import path from 'path'
import fs from 'fs'
import type { Tool, ToolContext } from './tool.js'

function csvEscape(v: unknown): string {
  if (v == null) return ''
  const s = String(v)
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

function renderCsv(records: unknown, columns?: string[]): string {
  if (!Array.isArray(records) || records.length === 0) return ''
  const cols = columns ?? Object.keys(records[0] as Record<string, unknown>)
  const lines: string[] = [cols.map(csvEscape).join(',')]
  for (const rec of records) {
    const row = rec as Record<string, unknown>
    lines.push(cols.map(c => csvEscape(row[c])).join(','))
  }
  return lines.join('\n') + '\n'
}

function renderMarkdown(records: unknown, columns?: string[], title?: string): string {
  const lines: string[] = []
  if (title) {
    lines.push(`# ${title}`)
    lines.push('')
  }
  if (!Array.isArray(records)) {
    lines.push('```json')
    lines.push(JSON.stringify(records, null, 2))
    lines.push('```')
    return lines.join('\n') + '\n'
  }
  if (records.length === 0) {
    lines.push('_No records._')
    return lines.join('\n') + '\n'
  }
  if (records.every(r => typeof r !== 'object' || r === null)) {
    for (const r of records) lines.push(`- ${String(r)}`)
    return lines.join('\n') + '\n'
  }
  const cols = columns ?? Object.keys(records[0] as Record<string, unknown>)
  lines.push('| ' + cols.join(' | ') + ' |')
  lines.push('|' + cols.map(() => '---').join('|') + '|')
  for (const rec of records) {
    const row = rec as Record<string, unknown>
    lines.push('| ' + cols.map(c => String(row[c] ?? '').replace(/\|/g, '\\|')).join(' | ') + ' |')
  }
  return lines.join('\n') + '\n'
}

export const writeResult: Tool = {
  name: 'write_result',
  description: 'Write the extracted result from a /bu:do run to output/results/<sessionId>/result.<ext>. Pass structured records plus a format spec and the tool handles CSV quoting, JSON indentation, and Markdown table alignment. Use this instead of hand-formatting the result file via Write — eliminates escape bugs and format drift. Returns {path, format, records}.',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: 'Run session id, e.g. do-<unix-ms>' },
      format: { type: 'string', enum: ['markdown', 'csv', 'json', 'txt'] },
      records: {
        description: 'Array (most formats) or object. For csv/markdown each record should be a flat object keyed by column name. For json, any JSON-serialisable value. For txt, an array of strings (or a single string).',
      },
      columns: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional column order for csv and markdown. If omitted, inferred from the first record.',
      },
      title: { type: 'string', description: 'Optional heading for markdown format.' },
    },
    required: ['sessionId', 'format', 'records'],
  },
  async execute(input, ctx: ToolContext): Promise<string> {
    const sessionId = input.sessionId as string
    const format = input.format as string
    const rawRecords = input.records
    let records: unknown = rawRecords
    if (typeof rawRecords === 'string') {
      try {
        records = JSON.parse(rawRecords)
      } catch {
        records = rawRecords
      }
    }
    const columns = input.columns as string[] | undefined
    const title = input.title as string | undefined

    const dir = path.join(ctx.outputDir, 'results', sessionId)
    fs.mkdirSync(dir, { recursive: true })

    let content: string
    let ext: string
    switch (format) {
      case 'json':
        content = JSON.stringify(records, null, 2) + '\n'
        ext = 'json'
        break
      case 'csv':
        content = renderCsv(records, columns)
        ext = 'csv'
        break
      case 'markdown':
        content = renderMarkdown(records, columns, title)
        ext = 'md'
        break
      case 'txt':
        content = Array.isArray(records)
          ? records.map(r => String(r)).join('\n') + '\n'
          : String(records) + '\n'
        ext = 'txt'
        break
      default:
        throw new Error(`Unknown format: ${format}`)
    }

    const filePath = path.join(dir, `result.${ext}`)
    fs.writeFileSync(filePath, content, 'utf-8')
    const count = Array.isArray(records) ? records.length : 1
    return JSON.stringify({ path: filePath, format, records: count })
  },
}
