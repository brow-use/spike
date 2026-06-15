export interface RunEntry {
  sessionId: string
  command?: string
  startedAt?: string
  endedAt?: string
  url?: string
  intent?: string
  mode?: string
  pagesVisited?: number
  recordsExtracted?: number
  terminationReason?: string
  artifacts?: Record<string, string>
  [k: string]: unknown
}

export const ARTIFACT_DIRS = [
  'output/trace',
  'output/exploration',
  'output/reasoning',
  'output/docs',
  'output/results',
  'viewer/public/data',
  'viewer/data',
]

export const INDEX_FILES = [
  'viewer/public/data/_index.json',
  'viewer/data/_index.json',
]

export function matchesSession(name: string, sessionId: string): boolean {
  return (
    name === sessionId ||
    name.startsWith(`${sessionId}.`) ||
    name.startsWith(`${sessionId}-`)
  )
}

export function planRunDeletion(
  run: RunEntry,
  dirListings: Record<string, string[]>,
): string[] {
  const paths = new Set<string>()

  for (const dir of Object.keys(dirListings)) {
    for (const name of dirListings[dir]) {
      if (matchesSession(name, run.sessionId)) {
        paths.add(`${dir}/${name}`)
      }
    }
  }

  for (const p of Object.values(run.artifacts ?? {})) {
    if (p) paths.add(p)
  }

  return [...paths].sort()
}
