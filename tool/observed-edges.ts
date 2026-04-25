import fs from 'fs'
import path from 'path'

export interface AriaPage {
  stepId: string
  url: string
  title?: string
  ariaSummary?: string
  ariaTree: string
  traceEndMs?: number
}

export interface SidecarAction {
  t: number
  name: string
  selector?: string
  url?: string
  text?: string
}

export interface EdgeTrigger {
  method: string
  role: 'link' | 'button' | null
  name: string | null
  selector: string | null
  text: string | null
  url: string | null
}

export interface ObservedEdge {
  fromStepId: string
  fromUrl: string
  fromTitle: string | null
  toStepId: string
  toUrl: string
  toTitle: string | null
  trigger: EdgeTrigger
  phrasing: string
  confidence: 'high' | 'medium' | 'low'
  source: 'sidecar' | 'aria-heuristic' | 'none'
}

export interface ObservedEdgesResult {
  edges: ObservedEdge[]
  sidecarFound: boolean
  sidecarActions: number
  ariaPages: number
  counts: { high: number; medium: number; low: number; total: number }
}

function readJsonl<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return []
  return fs.readFileSync(filePath, 'utf-8')
    .split('\n')
    .filter(l => l.trim().length > 0)
    .map(l => { try { return JSON.parse(l) as T } catch { return null } })
    .filter((x): x is T => x !== null)
}

function normalizeUrl(u: string | undefined): string {
  if (!u) return ''
  return u.toLowerCase()
}

// Extract the meaningful path portion of a URL: hash fragment if present
// (SPA hash routing), otherwise the pathname. Lowercased for case tolerance.
function pathTail(u: string | undefined): string | null {
  if (!u) return null
  try {
    const url = new URL(u)
    const hash = url.hash.replace(/^#/, '')
    if (hash) return hash.toLowerCase()
    return url.pathname.toLowerCase()
  } catch {
    return u.toLowerCase()
  }
}

// Score how well nav-URL matches aria-URL. Higher = more specific.
// Requires boundary match (next char is "/", "?", "#", or end) so the bare
// "/" from a root navigate doesn't spuriously match "/home", "/app", etc.
function matchScore(navUrl: string | undefined, ariaUrl: string): number {
  const n = pathTail(navUrl)
  const a = pathTail(ariaUrl)
  if (!n || !a) return 0
  if (n === a) return 10000 + n.length
  if (a.startsWith(n)) {
    const next = a.charAt(n.length)
    if (next === '' || next === '/' || next === '?' || next === '#') return n.length
  }
  return 0
}

interface AriaItem { role: string; name: string; url?: string }

// Parse `- role "name":` lines and their `/url: ...` follow-ups.
function parseAriaTree(tree: string): AriaItem[] {
  const items: AriaItem[] = []
  const lines = tree.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*-\s+(link|button|menuitem|tab|searchbox)\s+"([^"]+)"/)
    if (!m) continue
    const role = m[1]
    const name = m[2]
    let url: string | undefined
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      const um = lines[j].match(/^\s*-?\s*\/url:\s*"?([^"\s]+)"?/)
      if (um) { url = um[1]; break }
      if (/^\s*-\s+\w+\s+"/.test(lines[j])) break  // next sibling — no url
    }
    items.push({ role, name, url })
  }
  return items
}

function parseTriggerFromSidecar(action: SidecarAction): EdgeTrigger {
  const sel = action.selector
  let role: EdgeTrigger['role'] = null
  let name: string | null = null
  if (sel) {
    const rm = sel.match(/role=(\w+)/)
    if (rm && (rm[1] === 'link' || rm[1] === 'button')) role = rm[1]
    const nm = sel.match(/name="([^"]+)"/) ?? sel.match(/name=([^\]]+)/)
    if (nm) name = nm[1]
  }
  return {
    method: action.name,
    role,
    name,
    selector: sel ?? null,
    text: action.text ?? null,
    url: action.url ?? null,
  }
}

function phrasingFromAction(trigger: EdgeTrigger): string {
  if (trigger.method === 'navigate' || trigger.method === 'goto') {
    return trigger.url ? `open ${trigger.url}` : 'navigate'
  }
  if (trigger.method === 'click') {
    if (trigger.name) return `select ${trigger.name}`
    if (trigger.selector) return `click ${trigger.selector}`
    return 'click'
  }
  if (trigger.method === 'type' || trigger.method === 'fill') {
    if (trigger.name) return `enter text into ${trigger.name}`
    return 'enter text'
  }
  if (trigger.method === 'press') return trigger.text ? `press ${trigger.text}` : 'press key'
  return trigger.method
}

function makeEdge(
  prev: AriaPage,
  curr: AriaPage,
  trigger: EdgeTrigger,
  phrasing: string,
  confidence: ObservedEdge['confidence'],
  source: ObservedEdge['source'],
): ObservedEdge {
  return {
    fromStepId: prev.stepId,
    fromUrl: prev.url,
    fromTitle: prev.title ?? null,
    toStepId: curr.stepId,
    toUrl: curr.url,
    toTitle: curr.title ?? null,
    trigger,
    phrasing,
    confidence,
    source,
  }
}

// Aria-tree-only inference used when the sidecar has no matching action.
function inferFromAria(prev: AriaPage, curr: AriaPage): ObservedEdge {
  const items = parseAriaTree(prev.ariaTree)
  const currUrl = normalizeUrl(curr.url)

  // Rule 1: link with an explicit /url: that matches the landing page's URL.
  const urlMatch = items.find(it => {
    if (it.role !== 'link' || !it.url) return false
    const itUrl = normalizeUrl(it.url)
    return itUrl === currUrl || currUrl.endsWith(itUrl) || currUrl.endsWith(itUrl.replace(/^#\//, '/#/'))
  })
  if (urlMatch) {
    const trigger: EdgeTrigger = {
      method: 'click', role: 'link', name: urlMatch.name,
      selector: null, text: null, url: urlMatch.url ?? null,
    }
    return makeEdge(prev, curr, trigger, `select ${urlMatch.name}`, 'high', 'aria-heuristic')
  }

  // Rule 2: a link/button name that appears in the landing page's title.
  const titleLc = (curr.title ?? '').toLowerCase()
  const nameMatch = titleLc
    ? items.find(it => (it.role === 'link' || it.role === 'button') && titleLc.includes(it.name.toLowerCase()))
    : null
  if (nameMatch) {
    const trigger: EdgeTrigger = {
      method: 'click', role: nameMatch.role === 'link' ? 'link' : 'button', name: nameMatch.name,
      selector: null, text: null, url: null,
    }
    return makeEdge(prev, curr, trigger, `select ${nameMatch.name}`, 'medium', 'aria-heuristic')
  }

  // Rule 3: neutral fallback.
  const trigger: EdgeTrigger = {
    method: 'unknown', role: null, name: null,
    selector: null, text: null, url: null,
  }
  return makeEdge(prev, curr, trigger, 'go to the next screen', 'low', 'none')
}

export function computeObservedEdges(sessionId: string, outputDir: string): ObservedEdgesResult {
  const ariaPath = path.join(outputDir, 'exploration', `${sessionId}.jsonl`)
  const sidecarPath = path.join(outputDir, 'trace', `${sessionId}-actions.jsonl`)

  const aria = readJsonl<AriaPage>(ariaPath)
  const sidecar = readJsonl<SidecarAction>(sidecarPath)
  const sidecarFound = fs.existsSync(sidecarPath) && sidecar.length > 0

  if (aria.length < 2) {
    return {
      edges: [],
      sidecarFound,
      sidecarActions: sidecar.length,
      ariaPages: aria.length,
      counts: { high: 0, medium: 0, low: 0, total: 0 },
    }
  }
  aria.sort((a, b) => a.stepId.localeCompare(b.stepId))

  // Step 1: forward walk through sidecar navigates; first boundary-aware URL
  // match wins. Unmatched aria pages (same-URL repeats, click-only transitions)
  // leave sIdx in place so later aria pages can still match.
  const navToPair = new Map<number, number>()  // ariaIdx (>=1) → sidecar idx
  let sIdx = 0
  for (let ai = 1; ai < aria.length; ai++) {
    let candidateIdx = sIdx
    while (candidateIdx < sidecar.length) {
      const s = sidecar[candidateIdx]
      if ((s.name === 'navigate' || s.name === 'goto') && matchScore(s.url, aria[ai].url) > 0) {
        navToPair.set(ai, candidateIdx)
        sIdx = candidateIdx + 1
        break
      }
      candidateIdx++
    }
  }

  const edges: ObservedEdge[] = []
  for (let ai = 1; ai < aria.length; ai++) {
    const prev = aria[ai - 1]
    const curr = aria[ai]

    if (navToPair.has(ai)) {
      const action = sidecar[navToPair.get(ai)!]
      const trigger = parseTriggerFromSidecar(action)
      edges.push(makeEdge(prev, curr, trigger, phrasingFromAction(trigger), 'high', 'sidecar'))
      continue
    }

    // Step 2: look for click/type/press between surrounding matched navigates.
    if (sidecarFound) {
      let prevBound = -1
      for (let p = ai - 1; p >= 1; p--) { if (navToPair.has(p)) { prevBound = navToPair.get(p)!; break } }
      let nextBound = sidecar.length
      for (let n = ai + 1; n < aria.length; n++) { if (navToPair.has(n)) { nextBound = navToPair.get(n)!; break } }
      let picked: SidecarAction | null = null
      for (let k = prevBound + 1; k < nextBound; k++) {
        const s = sidecar[k]
        if (s.name === 'click' || s.name === 'type' || s.name === 'fill' || s.name === 'press') picked = s
      }
      if (picked) {
        const trigger = parseTriggerFromSidecar(picked)
        edges.push(makeEdge(prev, curr, trigger, phrasingFromAction(trigger), 'high', 'sidecar'))
        continue
      }
    }

    // Step 3: aria-heuristic fallback.
    edges.push(inferFromAria(prev, curr))
  }

  const counts = { high: 0, medium: 0, low: 0, total: edges.length }
  for (const e of edges) counts[e.confidence]++

  return { edges, sidecarFound, sidecarActions: sidecar.length, ariaPages: aria.length, counts }
}
