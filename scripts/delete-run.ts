import path from 'path'
import fs from 'fs'
import {
  ARTIFACT_DIRS,
  INDEX_FILES,
  planRunDeletion,
  type RunEntry,
} from '../domain/run-artifacts.js'

const ROOT = process.cwd()
const RUNS_PATH = path.join(ROOT, '.brow-use', 'runs.json')

interface RunsFile {
  runs: RunEntry[]
}

interface Footprint {
  paths: string[]
  bytes: number
}

function readRuns(): RunsFile {
  if (!fs.existsSync(RUNS_PATH)) return { runs: [] }
  return JSON.parse(fs.readFileSync(RUNS_PATH, 'utf-8')) as RunsFile
}

function writeRuns(data: RunsFile): void {
  fs.writeFileSync(RUNS_PATH, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

function listDir(rel: string): string[] {
  const abs = path.join(ROOT, rel)
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) return []
  return fs.readdirSync(abs)
}

function dirListings(): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const dir of ARTIFACT_DIRS) out[dir] = listDir(dir)
  return out
}

function diskBytes(abs: string): number {
  if (!fs.existsSync(abs)) return 0
  const stat = fs.statSync(abs)
  if (stat.isFile()) return stat.size
  if (!stat.isDirectory()) return 0
  return fs.readdirSync(abs).reduce((sum, name) => sum + diskBytes(path.join(abs, name)), 0)
}

function footprint(run: RunEntry, listings: Record<string, string[]>): Footprint {
  const paths = planRunDeletion(run, listings)
  const bytes = paths.reduce((sum, rel) => sum + diskBytes(path.join(ROOT, rel)), 0)
  return { paths, bytes }
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let v = bytes / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(1)} ${units[i]}`
}

function localTime(iso: string | undefined): string {
  if (!iso) return '(no time)'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const base = d.toLocaleString('sv-SE')
  const tz = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
    .formatToParts(d).find(p => p.type === 'timeZoneName')?.value
  return tz ? `${base} ${tz}` : base
}

function describe(run: RunEntry): string {
  if (run.command === 'run-instruction' || run.command === 'explore-guided') {
    const intent = run.intent ? `"${run.intent}"` : '(no intent)'
    const records = run.recordsExtracted != null ? ` · ${run.recordsExtracted} records` : ''
    return `${intent}${records}`
  }
  const url = run.url ? run.url : '(no url)'
  const pages = run.pagesVisited != null ? ` · ${run.pagesVisited} pages` : ''
  const reason = run.terminationReason ? ` · ${run.terminationReason}` : ''
  return `${url}${pages}${reason}`
}

function cmdList(asJson: boolean): void {
  const { runs } = readRuns()
  const listings = dirListings()
  const rows = runs.map(run => {
    const fp = footprint(run, listings)
    return { run, fp }
  })

  if (asJson) {
    console.log(JSON.stringify(
      rows.map(({ run, fp }) => ({
        sessionId: run.sessionId,
        command: run.command,
        startedAtLocal: localTime(run.startedAt),
        summary: describe(run),
        artifactCount: fp.paths.length,
        sizeBytes: fp.bytes,
        sizeHuman: humanSize(fp.bytes),
        paths: fp.paths,
      })),
      null, 2,
    ))
    return
  }

  if (rows.length === 0) {
    console.log('No runs recorded in .brow-use/runs.json.')
    return
  }

  for (const { run, fp } of rows) {
    console.log(`${run.sessionId}  [${run.command}]  ${localTime(run.startedAt)}`)
    console.log(`   ${describe(run)}`)
    console.log(`   ${fp.paths.length} artifact path(s) · ${humanSize(fp.bytes)}`)
    for (const p of fp.paths) console.log(`     ${p}`)
    console.log('')
  }
}

function pruneIndexEntry(sessionId: string): void {
  for (const rel of INDEX_FILES) {
    const abs = path.join(ROOT, rel)
    if (!fs.existsSync(abs)) continue
    let entries: { sessionId?: string }[]
    try {
      entries = JSON.parse(fs.readFileSync(abs, 'utf-8'))
    } catch {
      continue
    }
    if (!Array.isArray(entries)) continue
    const kept = entries.filter(e => e.sessionId !== sessionId)
    if (kept.length !== entries.length) {
      fs.writeFileSync(abs, JSON.stringify(kept, null, 2), 'utf-8')
      console.log(`updated ${rel} (removed index entry)`)
    }
  }
}

function cmdDelete(sessionId: string, dryRun: boolean): void {
  const data = readRuns()
  const run = data.runs.find(r => r.sessionId === sessionId)
  if (!run) {
    console.error(`No run with sessionId "${sessionId}" in .brow-use/runs.json.`)
    console.error('Run "npx tsx scripts/delete-run.ts list" to see available runs.')
    process.exit(1)
  }

  const fp = footprint(run, dirListings())

  console.log(`${dryRun ? 'Would delete' : 'Deleting'} run ${sessionId} [${run.command}] — ${localTime(run.startedAt)}`)
  console.log(`   ${describe(run)}`)
  console.log(`   ${fp.paths.length} artifact path(s) · ${humanSize(fp.bytes)}`)
  for (const p of fp.paths) console.log(`     ${p}`)

  if (dryRun) {
    console.log('\nDry run — nothing deleted. Re-run without --dry-run to apply.')
    return
  }

  for (const rel of fp.paths) {
    const abs = path.join(ROOT, rel)
    if (fs.existsSync(abs)) fs.rmSync(abs, { recursive: true, force: true })
  }

  data.runs = data.runs.filter(r => r.sessionId !== sessionId)
  writeRuns(data)
  console.log(`\nremoved run entry from .brow-use/runs.json (${data.runs.length} remaining)`)

  pruneIndexEntry(sessionId)
  console.log('Done.')
}

function main(): void {
  const args = process.argv.slice(2)
  const asJson = args.includes('--json')
  const dryRun = args.includes('--dry-run')
  const positional = args.filter(a => !a.startsWith('--'))
  const command = positional[0] ?? 'list'

  if (command === 'list') {
    cmdList(asJson)
    return
  }

  if (command === 'delete') {
    const sessionId = positional[1]
    if (!sessionId) {
      console.error('usage: delete-run delete <sessionId> [--dry-run]')
      process.exit(2)
    }
    cmdDelete(sessionId, dryRun)
    return
  }

  console.error('usage: delete-run [list [--json] | delete <sessionId> [--dry-run]]')
  process.exit(2)
}

main()
