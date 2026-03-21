import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import type { Message, ContentBlock } from './model/model.js'

const DB_DIR = path.resolve(process.cwd(), '.brow-use')
const DB_PATH = path.join(DB_DIR, 'session.db')
const MAX_MESSAGES = 50

function stripImages(content: string | ContentBlock[]): string | ContentBlock[] {
  if (typeof content === 'string') return content
  return content.map(block => {
    if (block.type === 'image') {
      return { type: 'text' as const, text: '[screenshot]' }
    }
    return block
  })
}

export class Session {
  private db: Database.Database
  private sessionId: string

  constructor() {
    fs.mkdirSync(DB_DIR, { recursive: true })
    this.db = new Database(DB_PATH)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );
    `)
    this.sessionId = this.loadOrCreateSession()
  }

  private loadOrCreateSession(): string {
    const row = this.db.prepare('SELECT id FROM sessions ORDER BY created_at DESC LIMIT 1').get() as { id: string } | undefined
    if (row) return row.id
    return this.createSession()
  }

  private createSession(): string {
    const id = `session-${Date.now()}`
    this.db.prepare('INSERT INTO sessions (id, created_at) VALUES (?, ?)').run(id, Date.now())
    return id
  }

  currentId(): string {
    return this.sessionId
  }

  load(): Message[] {
    const rows = this.db
      .prepare('SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC')
      .all(this.sessionId) as Array<{ role: string; content: string }>
    return rows.map(row => ({
      role: row.role as Message['role'],
      content: JSON.parse(row.content) as Message['content'],
    }))
  }

  append(messages: Message[]): void {
    const insert = this.db.prepare(
      'INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)'
    )
    const insertMany = this.db.transaction((msgs: Message[]) => {
      for (const msg of msgs) {
        const stripped: Message = { role: msg.role, content: stripImages(msg.content) }
        insert.run(this.sessionId, stripped.role, JSON.stringify(stripped.content), Date.now())
      }
    })
    insertMany(messages)
    this.enforceRollingWindow()
  }

  private enforceRollingWindow(): void {
    const count = (
      this.db
        .prepare('SELECT COUNT(*) as cnt FROM messages WHERE session_id = ?')
        .get(this.sessionId) as { cnt: number }
    ).cnt
    if (count > MAX_MESSAGES) {
      const excess = count - MAX_MESSAGES
      this.db.prepare(`
        DELETE FROM messages WHERE id IN (
          SELECT id FROM messages WHERE session_id = ? ORDER BY created_at ASC LIMIT ?
        )
      `).run(this.sessionId, excess)
    }
  }

  reset(): void {
    this.db.prepare('DELETE FROM messages WHERE session_id = ?').run(this.sessionId)
    this.sessionId = this.createSession()
  }
}
