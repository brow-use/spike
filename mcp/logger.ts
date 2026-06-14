import fs from 'fs'
import path from 'path'
import { formatLogTimestamp } from '../domain/log-timestamp.js'

const LOG_FILE = path.resolve(process.cwd(), '.brow-use/mcp.log')
fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true })
const stream = fs.createWriteStream(LOG_FILE, { flags: 'a' })

function format(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === 'string') return a
      if (a instanceof Error) return `${a.message}\n${a.stack ?? ''}`
      try { return JSON.stringify(a) } catch { return String(a) }
    })
    .join(' ')
}

export function log(...args: unknown[]): void {
  const now = new Date()
  stream.write(`[${formatLogTimestamp(now, -now.getTimezoneOffset())}] ${format(args)}\n`)
}

log('--- mcp server started pid=' + process.pid + ' ---')
