import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import yauzl from 'yauzl'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const OUTPUT = path.join(ROOT, 'output')
const BROW_USE = path.join(ROOT, '.brow-use')
// Written under viewer/public/data/ so Vite (with root=viewer) serves it
// at /data/* automatically. Keep this in sync with .gitignore.
const DATA_DIR = path.join(ROOT, 'viewer', 'public', 'data')

type EventKind =
  | 'agent-reasoning'
  | 'run-start' | 'run-end'
  | 'visited-page'
  | 'screenshot-saved'
  | 'doc-write' | 'result-write'
  | 'trace-action' | 'trace-network' | 'trace-console'

type Lane = 'agent' | 'browser' | 'trace' | 'files'

interface TimelineEvent {
  sessionId: string
  t: number
  kind: EventKind
  lane: Lane
  label: string
  detail?: unknown
  duration?: number
  tool?: string
  links?: {
    screenshot?: string
    doc?: string
    resultFile?: string
    ariaFingerprint?: { phash: string; ariaHash: string }
  }
}

interface App {
  id: string
  name: string
  description: string
  url: string
  createdAt: string
}

interface Run {
  sessionId: string
  command: 'explore-and-document' | 'do' | 'record-page-objects' | 'record-workflow'
  startedAt: string
  endedAt: string
  appId: string | null
  mode?: 'crx' | 'playwright'
  artifacts?: Record<string, string>
  // Per-command fields we pass through to the index:
  pagesVisited?: number
  terminationReason?: string
  intent?: string
  format?: string
  recordsExtracted?: number
  sourceExploreId?: string
  scenario?: string
  pageObjectFiles?: string[]
  workflowName?: string
  workflowPath?: string
  inputs?: string[]
}

interface IndexEntry {
  sessionId: string
  command: string
  startedAt: string
  endedAt: string
  appId: string | null
  appName: string | null
  appUrl: string | null
  hasTimeline: boolean
  pagesVisited?: number
  terminationReason?: string
  intent?: string
  format?: string
  recordsExtracted?: number
  scenario?: string
  workflowName?: string
  eventCount?: number
}

interface Bundle {
  sessionId: string
  command: string
  startedAt: string
  endedAt: string
  runStartMs: number
  runEndMs: number
  appId: string | null
  app: App | null
  stats: {
    eventsByKind: Record<string, number>
  }
  events: TimelineEvent[]
}

// ---------- helpers ----------

function readJson<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T
  } catch {
    return null
  }
}

function writeJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

function readJsonl<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return []
  return fs.readFileSync(filePath, 'utf-8')
    .split('\n')
    .filter(l => l.trim().length > 0)
    .map(l => {
      try { return JSON.parse(l) as T } catch { return null }
    })
    .filter((x): x is T => x !== null)
}

function isoToMs(s: string | undefined): number {
  if (!s) return 0
  const t = Date.parse(s)
  return Number.isNaN(t) ? 0 : t
}

function resolveArtifact(rel: string): string {
  if (path.isAbsolute(rel)) return rel
  return path.resolve(ROOT, rel)
}

function copyFileSafe(src: string, dest: string): void {
  if (!fs.existsSync(src)) return
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
}

// ---------- trace zip parsing ----------

interface TraceEvent {
  type: string
  callId?: string
  startTime?: number
  endTime?: number
  apiName?: string
  class?: string
  method?: string
  params?: Record<string, unknown>
  sdkLanguage?: string
  // console events
  text?: string
  messageType?: string
  // url events
  url?: string
  // catch-all
  [k: string]: unknown
}

interface TraceParsed {
  actions: { callId: string; method: string; startMs: number; endMs: number; params?: unknown }[]
  consoles: { t: number; level: string; text: string }[]
}

async function openZip(filePath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) {
        reject(err ?? new Error('no zip'))
        return
      }
      resolve(zip)
    })
  })
}

async function readZipEntryText(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<string> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (err, stream) => {
      if (err || !stream) {
        reject(err ?? new Error('no stream'))
        return
      }
      const chunks: Buffer[] = []
      stream.on('data', (c: Buffer) => chunks.push(c))
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
      stream.on('error', reject)
    })
  })
}

async function parseTraceZip(zipPath: string): Promise<TraceParsed> {
  const result: TraceParsed = { actions: [], consoles: [] }
  if (!fs.existsSync(zipPath)) return result

  const zip = await openZip(zipPath)
  const traceTextParts: string[] = []
  const networkTextParts: string[] = []

  await new Promise<void>((resolve, reject) => {
    zip.on('entry', (entry: yauzl.Entry) => {
      const name = entry.fileName
      if (name === 'trace.trace' || name === 'trace.network') {
        readZipEntryText(zip, entry).then(text => {
          if (name === 'trace.trace') traceTextParts.push(text)
          else networkTextParts.push(text)
          zip.readEntry()
        }).catch(reject)
      } else {
        zip.readEntry()
      }
    })
    zip.on('end', resolve)
    zip.on('error', reject)
    zip.readEntry()
  })

  // Aggregate before/after pairs into single action events.
  const pending = new Map<string, { method: string; startMs: number; params?: unknown }>()

  const allLines = [...traceTextParts, ...networkTextParts]
    .flatMap(t => t.split('\n'))
    .filter(l => l.trim().length > 0)

  for (const line of allLines) {
    let ev: TraceEvent
    try { ev = JSON.parse(line) as TraceEvent } catch { continue }

    if (ev.type === 'before' && ev.callId) {
      const method = ev.apiName ?? ev.method ?? 'unknown'
      const startMs = typeof ev.startTime === 'number' ? ev.startTime : 0
      pending.set(ev.callId, { method, startMs, params: ev.params })
    } else if (ev.type === 'after' && ev.callId) {
      const started = pending.get(ev.callId)
      if (started) {
        const endMs = typeof ev.endTime === 'number' ? ev.endTime : started.startMs
        result.actions.push({
          callId: ev.callId,
          method: started.method,
          startMs: started.startMs,
          endMs,
          params: started.params,
        })
        pending.delete(ev.callId)
      }
    } else if (ev.type === 'console') {
      const t = typeof ev.time === 'number' ? ev.time
        : typeof ev.timestamp === 'number' ? ev.timestamp
        : 0
      result.consoles.push({
        t,
        level: ev.messageType ?? 'log',
        text: typeof ev.text === 'string' ? ev.text : JSON.stringify(ev.text ?? ''),
      })
    }
  }

  return result
}

// ---------- per-run builders ----------

function buildRunStartEnd(run: Run): TimelineEvent[] {
  const label = run.command === 'explore-and-document'
    ? `Start explore — ${run.sessionId}`
    : run.command === 'do'
      ? `Start do — "${run.intent ?? ''}"`
      : `Start ${run.command}`
  const endLabel = run.command === 'explore-and-document'
    ? `End — ${run.terminationReason ?? 'complete'} (${run.pagesVisited ?? 0} pages)`
    : run.command === 'do'
      ? `End — ${run.recordsExtracted ?? 0} records`
      : `End ${run.command}`

  return [
    {
      sessionId: run.sessionId,
      t: isoToMs(run.startedAt),
      kind: 'run-start',
      lane: 'agent',
      label,
      detail: { mode: run.mode, intent: run.intent, scenario: run.scenario, workflowName: run.workflowName },
    },
    {
      sessionId: run.sessionId,
      t: isoToMs(run.endedAt),
      kind: 'run-end',
      lane: 'agent',
      label: endLabel,
      detail: {
        pagesVisited: run.pagesVisited,
        terminationReason: run.terminationReason,
        recordsExtracted: run.recordsExtracted,
      },
    },
  ]
}

function buildReasoningEvents(run: Run): TimelineEvent[] {
  const filePath = path.join(OUTPUT, 'reasoning', `${run.sessionId}.jsonl`)
  const lines = readJsonl<{ t: string; kind: string; text: string }>(filePath)
  return lines.map(l => ({
    sessionId: run.sessionId,
    t: isoToMs(l.t),
    kind: 'agent-reasoning',
    lane: 'agent',
    label: `[${l.kind}] ${l.text.slice(0, 80)}${l.text.length > 80 ? '…' : ''}`,
    detail: { kind: l.kind, text: l.text },
  }))
}

function buildVisitedPageEvents(run: Run): TimelineEvent[] {
  if (run.command !== 'explore-and-document') return []
  const ariaLog = run.artifacts?.ariaLog
  if (!ariaLog) return []
  const filePath = resolveArtifact(ariaLog)
  const lines = readJsonl<{
    stepId: string
    phash: string
    ariaHash: string
    url: string
    title: string
    ariaSummary: string
    ariaTree: string
    timestamp?: string
  }>(filePath)
  return lines.map(l => ({
    sessionId: run.sessionId,
    t: isoToMs(l.timestamp),
    kind: 'visited-page',
    lane: 'browser',
    label: `${l.stepId} · ${l.title || l.url}`,
    detail: {
      stepId: l.stepId,
      url: l.url,
      title: l.title,
      ariaSummary: l.ariaSummary,
      ariaTree: l.ariaTree,
    },
    links: { ariaFingerprint: { phash: l.phash, ariaHash: l.ariaHash } },
  }))
}

function buildScreenshotEvents(run: Run, sessionDataDir: string): TimelineEvent[] {
  // Explore: output/exploration/<sessionId>/*.png
  // Do: output/exploration/<sessionId>/*.png (same dir; save_screenshot uses it for both)
  const srcDir = path.join(OUTPUT, 'exploration', run.sessionId)
  if (!fs.existsSync(srcDir)) return []

  const destDir = path.join(sessionDataDir, 'screenshots')
  fs.mkdirSync(destDir, { recursive: true })

  const out: TimelineEvent[] = []
  for (const name of fs.readdirSync(srcDir)) {
    if (!name.endsWith('.png')) continue
    const src = path.join(srcDir, name)
    const dest = path.join(destDir, name)
    copyFileSafe(src, dest)
    const stat = fs.statSync(src)
    out.push({
      sessionId: run.sessionId,
      t: stat.mtimeMs,
      kind: 'screenshot-saved',
      lane: 'browser',
      label: `screenshot: ${name}`,
      detail: { name },
      links: { screenshot: `/data/${run.sessionId}/screenshots/${name}` },
    })
  }
  return out
}

function buildDocWriteEvents(run: Run, sessionDataDir: string): TimelineEvent[] {
  if (run.command !== 'explore-and-document') return []
  const docsDir = run.artifacts?.docsDir
  if (!docsDir) return []
  const srcDir = resolveArtifact(docsDir)
  if (!fs.existsSync(srcDir)) return []

  const destDir = path.join(sessionDataDir, 'docs')
  fs.mkdirSync(destDir, { recursive: true })

  const out: TimelineEvent[] = []
  for (const name of fs.readdirSync(srcDir)) {
    if (!name.endsWith('.md')) continue
    const src = path.join(srcDir, name)
    const dest = path.join(destDir, name)
    copyFileSafe(src, dest)
    const stat = fs.statSync(src)
    const content = fs.readFileSync(src, 'utf-8')
    out.push({
      sessionId: run.sessionId,
      t: stat.mtimeMs,
      kind: 'doc-write',
      lane: 'files',
      label: `doc: ${name}`,
      detail: { name, content },
      links: { doc: `/data/${run.sessionId}/docs/${name}` },
    })
  }
  return out
}

function buildResultWriteEvents(run: Run, sessionDataDir: string): TimelineEvent[] {
  if (run.command !== 'do') return []
  const resultsDir = path.join(OUTPUT, 'results', run.sessionId)
  if (!fs.existsSync(resultsDir)) return []

  const destDir = path.join(sessionDataDir, 'results')
  fs.mkdirSync(destDir, { recursive: true })

  const out: TimelineEvent[] = []
  for (const name of fs.readdirSync(resultsDir)) {
    const src = path.join(resultsDir, name)
    const stat = fs.statSync(src)
    if (!stat.isFile()) continue
    const dest = path.join(destDir, name)
    copyFileSafe(src, dest)
    const content = fs.readFileSync(src, 'utf-8')
    out.push({
      sessionId: run.sessionId,
      t: stat.mtimeMs,
      kind: 'result-write',
      lane: 'files',
      label: `result: ${name}`,
      detail: { name, content },
      links: { resultFile: `/data/${run.sessionId}/results/${name}` },
    })
  }
  return out
}

async function buildTraceEvents(run: Run, runStartMs: number): Promise<TimelineEvent[]> {
  const tracePath = run.artifacts?.tracePath
  if (!tracePath) return []
  const abs = resolveArtifact(tracePath)
  if (!fs.existsSync(abs)) return []

  const parsed = await parseTraceZip(abs)
  const out: TimelineEvent[] = []

  // Playwright trace event times are millis since monotonic boot, not wall clock.
  // Anchor them: offset = runStartMs - <earliest trace event time> so the first
  // trace event lines up with run-start on the merged timeline.
  const firstTraceT = Math.min(
    parsed.actions.length ? parsed.actions[0].startMs : Infinity,
    parsed.consoles.length ? parsed.consoles[0].t : Infinity,
  )
  const offset = Number.isFinite(firstTraceT) ? runStartMs - firstTraceT : 0

  for (const a of parsed.actions) {
    out.push({
      sessionId: run.sessionId,
      t: a.startMs + offset,
      kind: 'trace-action',
      lane: 'trace',
      label: a.method,
      duration: Math.max(0, a.endMs - a.startMs),
      detail: { callId: a.callId, method: a.method, params: a.params },
    })
  }

  for (const c of parsed.consoles) {
    out.push({
      sessionId: run.sessionId,
      t: c.t + offset,
      kind: 'trace-console',
      lane: 'trace',
      label: `[${c.level}] ${c.text.slice(0, 80)}${c.text.length > 80 ? '…' : ''}`,
      detail: { level: c.level, text: c.text },
    })
  }

  return out
}

// ---------- orchestration ----------

async function buildBundle(run: Run, apps: App[]): Promise<Bundle> {
  const app = apps.find(a => a.id === run.appId) ?? null
  const sessionDataDir = path.join(DATA_DIR, run.sessionId)
  const runStartMs = isoToMs(run.startedAt)

  const events: TimelineEvent[] = [
    ...buildRunStartEnd(run),
    ...buildReasoningEvents(run),
    ...buildVisitedPageEvents(run),
    ...buildScreenshotEvents(run, sessionDataDir),
    ...buildDocWriteEvents(run, sessionDataDir),
    ...buildResultWriteEvents(run, sessionDataDir),
    ...(await buildTraceEvents(run, runStartMs)),
  ]

  // Sort by time; preserve insertion order for ties.
  events.sort((a, b) => a.t - b.t)

  const eventsByKind: Record<string, number> = {}
  for (const e of events) eventsByKind[e.kind] = (eventsByKind[e.kind] ?? 0) + 1

  return {
    sessionId: run.sessionId,
    command: run.command,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    runStartMs: isoToMs(run.startedAt),
    runEndMs: isoToMs(run.endedAt),
    appId: run.appId,
    app,
    stats: { eventsByKind },
    events,
  }
}

function toIndexEntry(run: Run, apps: App[], eventCount: number | undefined): IndexEntry {
  const app = apps.find(a => a.id === run.appId) ?? null
  const hasTimeline = run.command === 'explore-and-document' || run.command === 'do'
  return {
    sessionId: run.sessionId,
    command: run.command,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    appId: run.appId,
    appName: app?.name ?? null,
    appUrl: app?.url ?? null,
    hasTimeline,
    pagesVisited: run.pagesVisited,
    terminationReason: run.terminationReason,
    intent: run.intent,
    format: run.format,
    recordsExtracted: run.recordsExtracted,
    scenario: run.scenario,
    workflowName: run.workflowName,
    eventCount,
  }
}

async function main(): Promise<void> {
  const runsFile = readJson<{ runs: Run[] }>(path.join(BROW_USE, 'runs.json'))
  const appsFile = readJson<{ apps: App[] }>(path.join(BROW_USE, 'apps.json'))

  if (!runsFile) {
    console.error(`No runs file at ${path.join(BROW_USE, 'runs.json')}. Nothing to ingest.`)
    process.exitCode = 1
    return
  }

  const apps = appsFile?.apps ?? []
  fs.mkdirSync(DATA_DIR, { recursive: true })

  const index: IndexEntry[] = []
  let bundlesWritten = 0

  for (const run of runsFile.runs) {
    let eventCount: number | undefined
    if (run.command === 'explore-and-document' || run.command === 'do') {
      const bundle = await buildBundle(run, apps)
      writeJson(path.join(DATA_DIR, `${run.sessionId}.json`), bundle)
      eventCount = bundle.events.length
      bundlesWritten++
    }
    index.push(toIndexEntry(run, apps, eventCount))
  }

  writeJson(path.join(DATA_DIR, '_index.json'), index)

  console.log(`Ingested ${index.length} run(s); wrote ${bundlesWritten} timeline bundle(s).`)
  for (const e of index) {
    const tag = e.hasTimeline ? '✓' : '·'
    console.log(`  ${tag} ${e.sessionId} (${e.command})${e.eventCount != null ? ` — ${e.eventCount} events` : ''}`)
  }
}

main().catch(err => {
  console.error('ingest failed:', err)
  process.exitCode = 1
})
