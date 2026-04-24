import path from 'path'
import { extractTrace } from '../tool/extract-trace.js'
import type { Page, BrowserContext } from 'playwright'

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const sessionId = args.find(a => !a.startsWith('--'))
  const traceFlag = args.find(a => a.startsWith('--trace='))
  const tracePath = traceFlag ? traceFlag.slice('--trace='.length) : undefined

  if (!sessionId) {
    console.error('usage: extract-trace <sessionId> [--trace=<tracePath>]')
    console.error('')
    console.error('  sessionId   e.g. explore-1745385600000 or run-1746000000000')
    console.error('  --trace     optional explicit trace zip path; otherwise the newest')
    console.error('              output/trace/<sessionId>-*.zip is used')
    process.exit(2)
  }

  const outputDir = path.resolve(process.cwd(), 'output')
  const ctx = {
    page: null as unknown as Page,
    context: null as unknown as BrowserContext,
    outputDir,
  }

  const input: Record<string, unknown> = { sessionId }
  if (tracePath) input.tracePath = tracePath

  const raw = await extractTrace.execute(input, ctx)
  const res = JSON.parse(raw as string)

  console.log(`trace          ${res.tracePath}`)
  console.log(`aria log       ${res.ariaLogPath}  (${res.entries} entries)`)
  console.log(`screenshots    ${res.screenshotsDir}  (${res.screenshotsWritten} files)`)
  if (res.actionsPath) {
    console.log(`actions        ${res.actionsPath}  (${res.actionsWritten} entries)`)
  } else {
    console.log(`actions        (existing sidecar preserved — CRX-mode wins)`)
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
