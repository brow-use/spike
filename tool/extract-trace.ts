import path from 'path'
import fs from 'fs'
import yauzl from 'yauzl'
import type { Tool, ToolContext } from './tool.js'

interface TraceEvent {
  type?: string
  callId?: string
  startTime?: number
  endTime?: number
  method?: string
  class?: string
  params?: Record<string, unknown>
  result?: Record<string, unknown>
  snapshot?: Record<string, unknown>
  pageId?: string
}

interface ScreencastFrame { sha1: string; timestamp: number }

interface AriaSnapshotCall {
  callId: string
  endTime: number
  ariaTree: string
  frameUrl: string
}

interface ActionEntry {
  t: number
  name: 'navigate' | 'click' | 'type'
  selector?: string
  url?: string
  text?: string
}

export interface ParsedTrace {
  ariaCalls: AriaSnapshotCall[]
  screencastFrames: ScreencastFrame[]
  actions: ActionEntry[]
}

export function isRealUrl(url: string | undefined | null): url is string {
  return !!url && url !== 'about:blank' && /^https?:\/\//i.test(url)
}

export function parseTraceEvents(events: TraceEvent[], navigatedUrls: Set<string>): ParsedTrace {
  const frameUrlByCall = new Map<string, string>()
  const screencastFrames: ScreencastFrame[] = []
  const ariaBefore = new Map<string, TraceEvent>()
  const ariaAfter = new Map<string, TraceEvent>()
  const currentMainUrlByCall = new Map<string, string>()
  const actions: ActionEntry[] = []
  let currentMainUrl = ''

  for (const e of events) {
    if (e.type === 'screencast-frame') {
      const frame = e as unknown as { sha1?: string; timestamp?: number }
      if (frame.sha1 && typeof frame.timestamp === 'number') {
        screencastFrames.push({ sha1: frame.sha1, timestamp: frame.timestamp })
      }
    } else if (e.type === 'frame-snapshot' && e.snapshot) {
      const s = e.snapshot as { callId?: string; snapshotName?: string; frameUrl?: string }
      if (s.callId && s.snapshotName && s.frameUrl) {
        frameUrlByCall.set(`${s.callId}:${s.snapshotName}`, s.frameUrl)
      }
      if (isRealUrl(s.frameUrl) && (navigatedUrls.size === 0 || navigatedUrls.has(s.frameUrl))) {
        currentMainUrl = s.frameUrl
      }
    } else if (e.type === 'before' && e.callId) {
      if (e.method === 'ariaSnapshot') ariaBefore.set(e.callId, e)
      else if (e.method === 'goto') {
        actions.push({ t: Math.round((e.startTime ?? 0) * 1000), name: 'navigate', url: (e.params?.url as string) })
      } else if (e.method === 'click' || e.method === 'tap') {
        actions.push({ t: Math.round((e.startTime ?? 0) * 1000), name: 'click', selector: (e.params?.selector as string) })
      } else if (e.method === 'fill' || e.method === 'type' || e.method === 'press') {
        actions.push({
          t: Math.round((e.startTime ?? 0) * 1000),
          name: 'type',
          selector: (e.params?.selector as string),
          text: (e.params?.value as string) ?? (e.params?.text as string),
        })
      }
    } else if (e.type === 'after' && e.callId && ariaBefore.has(e.callId)) {
      ariaAfter.set(e.callId, e)
      currentMainUrlByCall.set(e.callId, currentMainUrl)
    }
  }

  const ariaCalls: AriaSnapshotCall[] = []
  for (const [callId, after] of ariaAfter) {
    const snapshot = (after.result as { snapshot?: string } | undefined)?.snapshot
    if (typeof snapshot !== 'string') continue
    const byCall = frameUrlByCall.get(`${callId}:after@${callId}`) ?? frameUrlByCall.get(`${callId}:before@${callId}`)
    const url = isRealUrl(byCall) ? byCall : (currentMainUrlByCall.get(callId) ?? '')
    ariaCalls.push({ callId, endTime: after.endTime ?? 0, ariaTree: snapshot, frameUrl: url })
  }
  ariaCalls.sort((a, b) => a.endTime - b.endTime)

  return { ariaCalls, screencastFrames, actions }
}

function readNavigatedUrls(actionsPath: string): Set<string> {
  const urls = new Set<string>()
  if (!fs.existsSync(actionsPath)) return urls
  for (const line of fs.readFileSync(actionsPath, 'utf-8').split('\n')) {
    if (!line.trim()) continue
    try {
      const a = JSON.parse(line) as { name?: string; url?: string }
      if ((a.name === 'navigate' || a.name === 'goto') && a.url) urls.add(a.url)
    } catch { continue }
  }
  return urls
}

async function openZip(zipPath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) { reject(err ?? new Error('no zip')); return }
      resolve(zip)
    })
  })
}

async function readEntryText(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<string> {
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

async function readEntryBuffer(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<Buffer> {
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

function findTraceZipsForSession(traceDir: string, sessionId: string): string[] {
  const chunkDir = path.join(traceDir, sessionId)
  if (fs.existsSync(chunkDir) && fs.statSync(chunkDir).isDirectory()) {
    const chunks = fs.readdirSync(chunkDir)
      .filter(n => n.startsWith('chunk-') && n.endsWith('.zip'))
      .sort()
      .map(n => path.join(chunkDir, n))
    if (chunks.length > 0) return chunks
  }
  if (!fs.existsSync(traceDir)) return []
  const matches = fs.readdirSync(traceDir)
    .filter(n => n.startsWith(`${sessionId}-`) && n.endsWith('.zip'))
    .map(n => ({ name: n, mtime: fs.statSync(path.join(traceDir, n)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
  return matches.length > 0 ? [path.join(traceDir, matches[0].name)] : []
}

function resolveTraceZips(traceDir: string, sessionId: string, explicitPath: string | undefined): string[] {
  if (!explicitPath) return findTraceZipsForSession(traceDir, sessionId)
  if (fs.existsSync(explicitPath) && fs.statSync(explicitPath).isDirectory()) {
    return fs.readdirSync(explicitPath)
      .filter(n => n.endsWith('.zip'))
      .sort()
      .map(n => path.join(explicitPath, n))
  }
  return fs.existsSync(explicitPath) ? [explicitPath] : []
}

function summariseAriaTree(tree: string): string {
  const lines = tree.split('\n').map(l => l.trim()).filter(Boolean)
  const firstHeading = lines.find(l => /^- heading\b/.test(l))?.match(/"([^"]+)"/)?.[1]
  const rolesCounts = new Map<string, number>()
  for (const l of lines) {
    const m = l.match(/^- (\w+)\b/)
    if (m) rolesCounts.set(m[1], (rolesCounts.get(m[1]) ?? 0) + 1)
  }
  const interesting = ['button', 'link', 'textbox', 'combobox', 'checkbox', 'tab', 'searchbox', 'heading']
  const parts = interesting
    .filter(r => rolesCounts.has(r))
    .map(r => `${rolesCounts.get(r)} ${r}${rolesCounts.get(r)! > 1 ? 's' : ''}`)
  const head = firstHeading ? `${firstHeading}: ` : ''
  return (head + parts.join(', ')).slice(0, 240)
}

function extractTitle(tree: string): string {
  const lines = tree.split('\n').map(l => l.trim()).filter(Boolean)
  for (const l of lines.slice(0, 20)) {
    const m = l.match(/^- heading "([^"]+)"/)
    if (m) return m[1]
  }
  return ''
}

function pickClosestFrame(frames: ScreencastFrame[], endTime: number): ScreencastFrame | null {
  if (frames.length === 0) return null
  let best = frames[0]
  let bestDiff = Math.abs(best.timestamp - endTime)
  for (const f of frames) {
    const d = Math.abs(f.timestamp - endTime)
    if (d < bestDiff) { best = f; bestDiff = d }
  }
  return best
}

export const extractTrace: Tool = {
  name: 'extract_trace',
  description: 'Post-process a Playwright trace zip to produce the downstream artifacts /bu:document, /bu:generate-page-objects, /bu:run-instruction, and the viewer consume: output/exploration/<sessionId>.jsonl (aria log) and output/exploration/<sessionId>/page-<stepId>.{jpg|png} (per-step screenshots) — both only written when the aria log is absent, since trace-derived stepIds align only with a log this tool also authored; when /bu:explore already wrote the log and step-aligned screenshots live, they are left untouched. Always (re)writes output/trace/<sessionId>-actions.jsonl (action sidecar, only if not already present — CRX mode writes its own). Call this once at the end of /bu:explore and /bu:explore-guided, after stop_trace. No browser needed.',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: 'Run session id; used to locate the chunked trace at output/trace/<sessionId>/ (falling back to legacy output/trace/<sessionId>-*.zip) and to name the output files.' },
      tracePath: { type: 'string', description: 'Optional explicit path to a trace zip or a directory of chunk zips. Overrides the sessionId-based lookup.' },
    },
    required: ['sessionId'],
  },
  async execute(input, ctx: ToolContext): Promise<string> {
    const sessionId = input.sessionId as string
    const traceZips = resolveTraceZips(
      path.join(ctx.outputDir, 'trace'), sessionId, input.tracePath as string | undefined,
    )
    if (traceZips.length === 0) {
      throw new Error(`No trace found for sessionId "${sessionId}" under output/trace/`)
    }

    const traceTextParts: string[] = []
    const resourceBuffers = new Map<string, Buffer>()

    for (const zipPath of traceZips) {
      try {
        const zip = await openZip(zipPath)
        await new Promise<void>((resolve, reject) => {
          zip.on('entry', (entry: yauzl.Entry) => {
            const name = entry.fileName
            if (name === 'trace.trace') {
              readEntryText(zip, entry).then(t => { traceTextParts.push(t); zip.readEntry() }).catch(reject)
            } else if (name.startsWith('resources/')) {
              const sha1 = name.split('/').pop()!
              readEntryBuffer(zip, entry).then(b => { resourceBuffers.set(sha1, b); zip.readEntry() }).catch(reject)
            } else {
              zip.readEntry()
            }
          })
          zip.on('end', resolve)
          zip.on('error', reject)
          zip.readEntry()
        })
      } catch (err) {
        process.stderr.write(`warning: skipping truncated chunk ${path.basename(zipPath)}: ${err}\n`)
      }
    }

    const events: TraceEvent[] = traceTextParts.join('\n').split('\n')
      .filter(Boolean).map(l => JSON.parse(l) as TraceEvent)

    const actionsPath = path.join(ctx.outputDir, 'trace', `${sessionId}-actions.jsonl`)
    const navigatedUrls = readNavigatedUrls(actionsPath)
    const { ariaCalls, screencastFrames, actions } = parseTraceEvents(events, navigatedUrls)

    const dedupedCalls: AriaSnapshotCall[] = []
    for (const c of ariaCalls) {
      const prev = dedupedCalls[dedupedCalls.length - 1]
      if (prev && prev.ariaTree === c.ariaTree && prev.frameUrl === c.frameUrl) continue
      dedupedCalls.push(c)
    }

    const exploreDir = path.join(ctx.outputDir, 'exploration')
    const shotDir = path.join(exploreDir, sessionId)

    const ariaLogPath = path.join(exploreDir, `${sessionId}.jsonl`)
    const ariaLogExisted = fs.existsSync(ariaLogPath)
      && fs.readFileSync(ariaLogPath, 'utf-8').trim().length > 0

    const jsonlLines: string[] = []
    const writtenShots: string[] = []
    if (!ariaLogExisted) {
      fs.mkdirSync(shotDir, { recursive: true })
      let stepCounter = 0
      for (const c of dedupedCalls) {
        const stepId = String(stepCounter++).padStart(4, '0')
        const title = extractTitle(c.ariaTree)
        const ariaSummary = summariseAriaTree(c.ariaTree)
        const timestamp = new Date().toISOString()
        jsonlLines.push(JSON.stringify({
          stepId, url: c.frameUrl, title, ariaSummary, ariaTree: c.ariaTree,
          timestamp, traceEndMs: c.endTime,
        }))

        const frame = pickClosestFrame(screencastFrames, c.endTime)
        if (frame) {
          const buf = resourceBuffers.get(frame.sha1)
          if (buf) {
            const ext = frame.sha1.endsWith('.jpeg') || frame.sha1.endsWith('.jpg') ? 'jpg' : 'png'
            const shotPath = path.join(shotDir, `page-${stepId}.${ext}`)
            fs.writeFileSync(shotPath, buf)
            writtenShots.push(shotPath)
          }
        }
      }
      fs.writeFileSync(ariaLogPath, jsonlLines.join('\n') + (jsonlLines.length ? '\n' : ''), 'utf-8')
    }
    const entries = ariaLogExisted
      ? fs.readFileSync(ariaLogPath, 'utf-8').split('\n').filter(Boolean).length
      : jsonlLines.length

    let actionsWritten = 0
    if (!fs.existsSync(actionsPath) && actions.length > 0) {
      fs.writeFileSync(actionsPath, actions.map(a => JSON.stringify(a)).join('\n') + '\n', 'utf-8')
      actionsWritten = actions.length
    }

    return JSON.stringify({
      tracePath: traceZips.length === 1 ? traceZips[0] : path.dirname(traceZips[0]),
      traceChunks: traceZips.length,
      ariaLogPath,
      ariaLogPreserved: ariaLogExisted,
      entries,
      screenshotsWritten: writtenShots.length,
      screenshotsDir: shotDir,
      actionsPath: actionsWritten > 0 ? actionsPath : null,
      actionsWritten,
    })
  },
}
