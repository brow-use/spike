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
  }
}

export interface App {
  id: string
  name: string
  description: string
  url: string
  createdAt: string
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
