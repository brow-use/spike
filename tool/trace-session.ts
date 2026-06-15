import path from 'path'
import fs from 'fs'
import type { BrowserContext } from 'playwright'

export const FLUSH_EVERY = 1

interface ActiveSession {
  name: string
  dir: string
  chunkIndex: number
  actionsSinceFlush: number
}

let session: ActiveSession | null = null

export function traceSessionDir(outputDir: string, name: string): string {
  return path.join(outputDir, 'trace', name)
}

export function chunkFileName(index: number): string {
  return `chunk-${String(index).padStart(4, '0')}.zip`
}

export async function startTraceSession(context: BrowserContext, outputDir: string, name: string): Promise<string> {
  const dir = traceSessionDir(outputDir, name)
  fs.mkdirSync(dir, { recursive: true })
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true })
  await context.tracing.startChunk()
  session = { name, dir, chunkIndex: 0, actionsSinceFlush: 0 }
  return dir
}

export async function flushTraceChunk(context: BrowserContext): Promise<string | null> {
  if (!session) return null
  const chunkPath = path.join(session.dir, chunkFileName(session.chunkIndex))
  await context.tracing.stopChunk({ path: chunkPath })
  session.chunkIndex += 1
  session.actionsSinceFlush = 0
  await context.tracing.startChunk()
  return chunkPath
}

export async function recordTraceAction(context: BrowserContext): Promise<void> {
  if (!session) return
  session.actionsSinceFlush += 1
  if (session.actionsSinceFlush >= FLUSH_EVERY) {
    await flushTraceChunk(context)
  }
}

export async function stopTraceSession(context: BrowserContext): Promise<string> {
  if (!session) throw new Error('No active trace session — call start_trace first')
  const finalChunkPath = path.join(session.dir, chunkFileName(session.chunkIndex))
  const dir = session.dir
  session = null
  await context.tracing.stopChunk({ path: finalChunkPath })
  await context.tracing.stop()
  return dir
}

export function hasActiveTraceSession(): boolean {
  return session !== null
}
