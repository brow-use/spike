import fs from 'fs'
import path from 'path'

const MAX_ENTRIES = 500

export class HistoryRepository {
  private filePath: string

  constructor() {
    const dir = path.resolve(process.cwd(), '.brow-use')
    fs.mkdirSync(dir, { recursive: true })
    this.filePath = path.join(dir, 'history.json')
  }

  load(): string[] {
    if (!fs.existsSync(this.filePath)) return []
    return JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as string[]
  }

  append(entry: string): void {
    const entries = this.load().filter(e => e !== entry)
    entries.unshift(entry)
    fs.writeFileSync(this.filePath, JSON.stringify(entries.slice(0, MAX_ENTRIES), null, 2))
  }
}
