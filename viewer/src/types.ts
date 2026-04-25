export type EventKind =
  | 'agent-reasoning'
  | 'run-start' | 'run-end'
  | 'visited-page'
  | 'screenshot-saved'
  | 'doc-write' | 'result-write'
  | 'trace-action' | 'trace-network' | 'trace-console'

export type Lane = 'agent' | 'browser' | 'trace' | 'files'

export interface TimelineEvent {
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
    linkedTraceEventIdx?: number      // visited-page → index of matching goto trace-action
    linkedVisitedPageEventIdx?: number // trace-action (goto) → index of matching visited-page
  }
}

export interface App {
  id: string
  name: string
  description: string
  url: string
  createdAt: string
}

export interface Edge {
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

export interface DocEntry {
  slug: string
  title: string
  summary: string
  content: string
}

export interface DocsBundle {
  readme: string
  entries: DocEntry[]
}

export interface Bundle {
  sessionId: string
  command: string
  startedAt: string
  endedAt: string
  runStartMs: number
  runEndMs: number
  appId: string | null
  app: App | null
  stats: { eventsByKind: Record<string, number> }
  events: TimelineEvent[]
  edges: Edge[]
  docs: DocsBundle | null
}

export interface IndexEntry {
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
