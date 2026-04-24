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
  command: 'explore' | 'do' | 'record-page-objects' | 'record-workflow' | 'run'
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

interface Edge {
  fromStepId: string | null
  fromUrl: string | null
  fromTitle: string | null
  fromEventIdx: number | null
  toStepId: string
  toUrl: string
  toTitle: string | null
  toEventIdx: number
  via: {
    method: string
    selector?: string
    text?: string
    url?: string
  }
  t: number
  traceEventIdx: number | null
  isRevisit: boolean
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
  edges: Edge[]
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
  pageId?: string
  sdkLanguage?: string
  // console events
  text?: string
  messageType?: string
  // screencast-frame
  sha1?: string
  timestamp?: number
  // catch-all
  [k: string]: unknown
}

interface ActionRecord {
  callId: string
  method: string
  startMs: number
  endMs: number
  params?: unknown
  pageId?: string
}

interface ScreencastFrame {
  timestamp: number
  sha1: string
  pageId: string
}

interface TraceParsed {
  actions: ActionRecord[]
  consoles: { t: number; level: string; text: string }[]
  screencastFrames: ScreencastFrame[]
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
      if (err || !stream) { reject(err ?? new Error('no stream')); return }
      const chunks: Buffer[] = []
      stream.on('data', (c: Buffer) => chunks.push(c))
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
      stream.on('error', reject)
    })
  })
}

async function readZipEntryBuffer(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (err, stream) => {
      if (err || !stream) { reject(err ?? new Error('no stream')); return }
      const chunks: Buffer[] = []
      stream.on('data', (c: Buffer) => chunks.push(c))
      stream.on('end', () => resolve(Buffer.concat(chunks)))
      stream.on('error', reject)
    })
  })
}

async function parseTraceZip(
  zipPath: string,
  resourcesDestDir: string | null,  // null = don't extract
): Promise<TraceParsed> {
  const result: TraceParsed = { actions: [], consoles: [], screencastFrames: [] }
  if (!fs.existsSync(zipPath)) return result

  const zip = await openZip(zipPath)
  const traceTextParts: string[] = []

  await new Promise<void>((resolve, reject) => {
    zip.on('entry', (entry: yauzl.Entry) => {
      const name = entry.fileName

      if (name === 'trace.trace' || name === 'trace.network') {
        readZipEntryText(zip, entry).then(text => {
          traceTextParts.push(text)
          zip.readEntry()
        }).catch(reject)
      } else if (
        resourcesDestDir &&
        name.startsWith('resources/') &&
        (name.endsWith('.jpeg') || name.endsWith('.jpg') || name.endsWith('.png'))
      ) {
        // Extract screenshot resources for in-browser display.
        const sha1 = name.split('/').pop()!
        const dest = path.join(resourcesDestDir, sha1)
        readZipEntryBuffer(zip, entry).then(buf => {
          fs.mkdirSync(resourcesDestDir, { recursive: true })
          fs.writeFileSync(dest, buf)
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

  // Parse events from trace.trace.
  const pending = new Map<string, { method: string; startMs: number; params?: unknown; pageId?: string }>()

  for (const text of traceTextParts) {
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      let ev: TraceEvent
      try { ev = JSON.parse(line) as TraceEvent } catch { continue }

      if (ev.type === 'before' && ev.callId) {
        const method = ev.apiName ?? ev.method ?? 'unknown'
        const startMs = typeof ev.startTime === 'number' ? ev.startTime : 0
        pending.set(ev.callId, { method, startMs, params: ev.params, pageId: ev.pageId })
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
            pageId: started.pageId,
          })
          pending.delete(ev.callId)
        }
      } else if (ev.type === 'screencast-frame' && ev.sha1 && ev.pageId) {
        const ts = typeof ev.timestamp === 'number' ? ev.timestamp : 0
        result.screencastFrames.push({ timestamp: ts, sha1: ev.sha1, pageId: ev.pageId })
      } else if (ev.type === 'console') {
        const t = typeof ev.time === 'number' ? ev.time
          : typeof ev.timestamp === 'number' ? ev.timestamp : 0
        result.consoles.push({
          t,
          level: ev.messageType ?? 'log',
          text: typeof ev.text === 'string' ? ev.text : JSON.stringify(ev.text ?? ''),
        })
      }
    }
  }

  // Sort frames ascending by timestamp for binary-search-style lookup.
  result.screencastFrames.sort((a, b) => a.timestamp - b.timestamp)
  return result
}

// Find the last screencast frame captured within [startMs - 100ms, endMs + 3000ms]
// for the given pageId. Falls back to any frame near the action if pageId doesn't match.
function findActionScreenshot(
  action: ActionRecord,
  frames: ScreencastFrame[],
  sessionId: string,
): string | undefined {
  if (frames.length === 0) return undefined
  const window = frames.filter(
    f => f.timestamp >= action.startMs - 100 && f.timestamp <= action.endMs + 3000,
  )
  // Prefer frames matching the action's pageId, fall back to any frame in window.
  const candidates = action.pageId
    ? (window.filter(f => f.pageId === action.pageId).length > 0
        ? window.filter(f => f.pageId === action.pageId)
        : window)
    : window
  if (candidates.length === 0) return undefined
  const frame = candidates[candidates.length - 1]  // latest in the window
  return `/data/${sessionId}/trace-resources/${frame.sha1}`
}

// ---------- per-run builders ----------

function buildRunStartEnd(run: Run): TimelineEvent[] {
  const label = run.command === 'explore'
    ? `Start explore — ${run.sessionId}`
    : run.command === 'do'
      ? `Start do — "${run.intent ?? ''}"`
      : run.command === 'run'
        ? `Start run — "${run.intent ?? ''}"`
        : `Start ${run.command}`
  const endLabel = run.command === 'explore'
    ? `End — ${run.terminationReason ?? 'complete'} (${run.pagesVisited ?? 0} pages)`
    : run.command === 'do'
      ? `End — ${run.recordsExtracted ?? 0} records`
      : run.command === 'run'
        ? `End run`
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

// Match a page URL to the best-fit screenshot by scoring URL path words against
// screenshot filename words. Returns the matched viewer URL or undefined.
function wordMatchScore(urlWord: string, nameWord: string): number {
  if (nameWord === urlWord) return 4                              // exact
  if (nameWord.length >= 5 && nameWord.includes(urlWord)) return 3  // name contains url-word
  if (urlWord.length >= 5 && urlWord.includes(nameWord)) return 3   // url-word contains name-word
  if (urlWord.startsWith(nameWord) || nameWord.startsWith(urlWord)) return 1  // prefix
  return 0
}

function matchScreenshotToUrl(url: string, screenshots: TimelineEvent[]): string | undefined {
  let fragment = ''
  try {
    fragment = new URL(url).hash.replace(/^#\//, '')
  } catch {
    return undefined
  }
  if (!fragment || screenshots.length === 0) return undefined

  // Only use URL path words that are at least 4 chars (prevents "app" matching everything).
  const urlWords = fragment.split(/[/?&=_-]/).filter(w => w.length >= 4)
  if (urlWords.length === 0) return undefined

  let bestScore = 0
  let bestMatch: TimelineEvent | null = null

  for (const ss of screenshots) {
    const name = (ss.detail as { name?: string } | undefined)?.name ?? ''
    const nameWords = name.split('-')
    let score = 0
    for (const uw of urlWords) {
      for (const nw of nameWords) {
        score += wordMatchScore(uw, nw)
      }
    }
    if (score > bestScore) {
      bestScore = score
      bestMatch = ss
    }
  }

  // Require a minimum score to avoid spurious matches.
  return bestScore >= 2 ? bestMatch?.links?.screenshot : undefined
}

function buildVisitedPageEvents(run: Run, screenshots: TimelineEvent[]): TimelineEvent[] {
  if (run.command !== 'explore' && run.command !== 'run') return []
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
  return lines.map(l => {
    const matchedScreenshot = matchScreenshotToUrl(l.url, screenshots)
    return {
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
      links: {
        ariaFingerprint: { phash: l.phash, ariaHash: l.ariaHash },
        ...(matchedScreenshot ? { screenshot: matchedScreenshot } : {}),
      },
    }
  })
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
  if (run.command !== 'explore') return []
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

async function buildTraceEvents(
  run: Run,
  runStartMs: number,
  sessionDataDir: string,
): Promise<TimelineEvent[]> {
  const tracePath = run.artifacts?.tracePath
  if (!tracePath) return []
  const abs = resolveArtifact(tracePath)
  if (!fs.existsSync(abs)) return []

  const resourcesDestDir = path.join(sessionDataDir, 'trace-resources')
  const parsed = await parseTraceZip(abs, resourcesDestDir)
  const out: TimelineEvent[] = []

  // Anchor monotonic trace timestamps to wall-clock run-start.
  const allTs = [
    ...parsed.actions.map(a => a.startMs),
    ...parsed.consoles.map(c => c.t),
    ...parsed.screencastFrames.map(f => f.timestamp),
  ].filter(t => t > 0)
  const firstTraceT = allTs.length ? Math.min(...allTs) : 0
  const offset = firstTraceT > 0 ? runStartMs - firstTraceT : 0

  for (const a of parsed.actions) {
    const screenshotUrl = findActionScreenshot(a, parsed.screencastFrames, run.sessionId)
    out.push({
      sessionId: run.sessionId,
      t: a.startMs + offset,
      kind: 'trace-action',
      lane: 'trace',
      label: a.method,
      duration: Math.max(0, a.endMs - a.startMs),
      detail: { callId: a.callId, method: a.method, params: a.params },
      ...(screenshotUrl ? { links: { screenshot: screenshotUrl } } : {}),
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

// ---------- edge extraction ----------

const ACTION_METHODS = new Set(['click', 'goto', 'type', 'fill', 'press', 'check', 'uncheck', 'selectOption'])

interface ActionParams {
  selector?: string
  text?: string
  value?: string
  url?: string
}

function readParams(event: TimelineEvent): ActionParams {
  const d = event.detail as { params?: unknown } | undefined
  const p = d?.params
  if (!p || typeof p !== 'object') return {}
  return p as ActionParams
}

function readMethod(event: TimelineEvent): string | undefined {
  const d = event.detail as { method?: string } | undefined
  return d?.method
}

function buildEdges(events: TimelineEvent[]): Edge[] {
  const visited: { e: TimelineEvent; i: number }[] = []
  const actions: { e: TimelineEvent; i: number }[] = []
  for (let i = 0; i < events.length; i++) {
    const e = events[i]
    if (e.kind === 'visited-page') visited.push({ e, i })
    else if (e.kind === 'trace-action') {
      const m = readMethod(e)
      if (m && ACTION_METHODS.has(m)) actions.push({ e, i })
    }
  }

  // First occurrence per URL → used to resolve any goto-target to a stepId.
  const urlToVisited = new Map<string, { e: TimelineEvent; i: number }>()
  for (const v of visited) {
    const url = (v.e.detail as { url?: string } | undefined)?.url
    if (url && !urlToVisited.has(url)) urlToVisited.set(url, v)
  }

  const edges: Edge[] = []
  const seen = new Set<string>()
  function push(edge: Edge): void {
    const key = `${edge.fromStepId ?? '∅'}|${edge.toStepId}|${edge.via.method}|${edge.via.selector ?? ''}|${edge.via.url ?? ''}|${edge.via.text ?? ''}`
    if (seen.has(key)) return
    seen.add(key)
    edges.push(edge)
  }

  // Pass 1: consecutive visited-page pairs — the last matching action between them is the trigger.
  for (let vi = 0; vi < visited.length - 1; vi++) {
    const prev = visited[vi]
    const curr = visited[vi + 1]
    let trigger: { e: TimelineEvent; i: number } | null = null
    for (const a of actions) {
      if (a.e.t > prev.e.t && a.e.t <= curr.e.t) trigger = a
      else if (a.e.t > curr.e.t) break
    }
    const prevD = prev.e.detail as { stepId?: string; url?: string; title?: string } | undefined
    const currD = curr.e.detail as { stepId?: string; url?: string; title?: string } | undefined
    if (!currD?.stepId || !currD.url) continue
    const params = trigger ? readParams(trigger.e) : {}
    push({
      fromStepId: prevD?.stepId ?? null,
      fromUrl: prevD?.url ?? null,
      fromTitle: prevD?.title ?? null,
      fromEventIdx: prev.i,
      toStepId: currD.stepId,
      toUrl: currD.url,
      toTitle: currD.title ?? null,
      toEventIdx: curr.i,
      via: {
        method: trigger ? (readMethod(trigger.e) ?? 'unknown') : 'unknown',
        selector: params.selector,
        text: params.text ?? params.value,
        url: params.url,
      },
      t: trigger ? trigger.e.t : curr.e.t,
      traceEventIdx: trigger?.i ?? null,
      isRevisit: false,
    })
  }

  // Pass 2: goto actions whose target URL matches a known visited page.
  // Captures "revisit" edges — cases where the agent jumped back to a known page without appending a new visited entry.
  for (const a of actions) {
    if (readMethod(a.e) !== 'goto') continue
    const params = readParams(a.e)
    const targetUrl = params.url
    if (!targetUrl) continue
    const target = urlToVisited.get(targetUrl)
    if (!target) continue
    let fromPage: { e: TimelineEvent; i: number } | null = null
    for (const v of visited) {
      if (v.e.t <= a.e.t) fromPage = v
      else break
    }
    const fromD = fromPage ? fromPage.e.detail as { stepId?: string; url?: string; title?: string } | undefined : undefined
    const targetD = target.e.detail as { stepId?: string; url?: string; title?: string } | undefined
    if (!targetD?.stepId || !targetD.url) continue
    if (fromD?.stepId === targetD.stepId) continue  // same-page goto, no-op
    push({
      fromStepId: fromD?.stepId ?? null,
      fromUrl: fromD?.url ?? null,
      fromTitle: fromD?.title ?? null,
      fromEventIdx: fromPage?.i ?? null,
      toStepId: targetD.stepId,
      toUrl: targetD.url,
      toTitle: targetD.title ?? null,
      toEventIdx: target.i,
      via: { method: 'goto', url: targetUrl },
      t: a.e.t,
      traceEventIdx: a.i,
      isRevisit: a.e.t > target.e.t,
    })
  }

  return edges
}

// ---------- orchestration ----------

async function buildBundle(run: Run, apps: App[]): Promise<Bundle> {
  const app = apps.find(a => a.id === run.appId) ?? null
  const sessionDataDir = path.join(DATA_DIR, run.sessionId)
  const runStartMs = isoToMs(run.startedAt)

  // Build screenshots first so we can cross-link them into visited-page events.
  const screenshots = buildScreenshotEvents(run, sessionDataDir)

  const events: TimelineEvent[] = [
    ...buildRunStartEnd(run),
    ...buildReasoningEvents(run),
    ...buildVisitedPageEvents(run, screenshots),
    ...screenshots,
    ...buildDocWriteEvents(run, sessionDataDir),
    ...buildResultWriteEvents(run, sessionDataDir),
    ...(await buildTraceEvents(run, runStartMs, sessionDataDir)),
  ]

  // Sort by time; preserve insertion order for ties.
  events.sort((a, b) => a.t - b.t)

  // Cross-link visited-page events to their matching goto trace-action, by URL.
  // After sorting, each event has a stable index in the array.
  const gotoActionsByUrl = new Map<string, number>()  // url → index in events[]
  for (let i = 0; i < events.length; i++) {
    const e = events[i]
    if (e.kind === 'trace-action') {
      const d = e.detail as { method?: string; params?: { url?: string } } | undefined
      if (d?.method === 'goto' && d.params?.url) {
        // Keep the first match per URL (chronological order).
        if (!gotoActionsByUrl.has(d.params.url)) {
          gotoActionsByUrl.set(d.params.url, i)
        }
      }
    }
  }
  for (let i = 0; i < events.length; i++) {
    const e = events[i]
    if (e.kind === 'visited-page') {
      const url = (e.detail as { url?: string } | undefined)?.url
      if (url && gotoActionsByUrl.has(url)) {
        const traceIdx = gotoActionsByUrl.get(url)!
        e.links = { ...e.links, linkedTraceEventIdx: traceIdx }
        // Back-link: the goto trace-action → this visited-page.
        const traceEvent = events[traceIdx]
        traceEvent.links = { ...(traceEvent.links ?? {}), linkedVisitedPageEventIdx: i }
      }
    }
  }

  const edges = buildEdges(events)

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
    edges,
  }
}

function toIndexEntry(run: Run, apps: App[], eventCount: number | undefined): IndexEntry {
  const app = apps.find(a => a.id === run.appId) ?? null
  const hasTimeline = run.command === 'explore' || run.command === 'do' || run.command === 'run'
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
    if (run.command === 'explore' || run.command === 'do' || run.command === 'run') {
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
