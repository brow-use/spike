import path from 'path'
import fs from 'fs'
import type { Tool } from './tool.js'

interface RunEntry {
  sessionId: string
  command: string
  startedAt: string
  endedAt: string
  appId: string | null
  mode?: 'crx' | 'playwright'
  artifacts?: Record<string, string>
  [k: string]: unknown
}

interface RunsFile {
  runs: RunEntry[]
}

const RUNS_PATH = path.resolve(process.cwd(), '.brow-use', 'runs.json')

function readRuns(): RunsFile {
  if (!fs.existsSync(RUNS_PATH)) return { runs: [] }
  try {
    return JSON.parse(fs.readFileSync(RUNS_PATH, 'utf-8')) as RunsFile
  } catch {
    return { runs: [] }
  }
}

function writeRuns(data: RunsFile): void {
  fs.mkdirSync(path.dirname(RUNS_PATH), { recursive: true })
  fs.writeFileSync(RUNS_PATH, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

export const recordRun: Tool = {
  name: 'record_run',
  description: 'Append a completed run to .brow-use/runs.json — the database of every brow-use command invocation that produced persistent output. Call this exactly once, at the end of each supported command (explore, explore-guided, run-instruction). If an entry with the same sessionId already exists it is replaced. Returns {path, total}.',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: 'Unique session id (e.g. explore-<unix-ms>, explore-guided-<unix-ms>, run-instruction-<unix-ms>).' },
      command: {
        type: 'string',
        enum: ['explore', 'explore-guided', 'run-instruction'],
        description: 'Which brow-use command produced this run.',
      },
      startedAt: { type: 'string', description: 'ISO timestamp when the run began.' },
      endedAt: { type: 'string', description: 'ISO timestamp when the run ended.' },
      appId: { type: 'string', description: 'currentAppId from .brow-use/apps.json at run time. null if none was set.' },
      mode: { type: 'string', enum: ['crx', 'playwright'], description: 'Browser execution mode used.' },
      artifacts: {
        type: 'object',
        description: 'Map of artifact labels to file or directory paths. Labels by command: tracePath, ariaLog (explore); tracePath, ariaLog (explore-guided); tracePath, resultPath, howPath (run-instruction).',
      },
      pagesVisited: { type: 'number', description: 'Explore only: visited.length at termination.' },
      terminationReason: { type: 'string', description: 'Explore only: "frontier-empty" | "maxSteps" | "maxLoopHits" | "error".' },
      intent: { type: 'string', description: 'run-instruction / explore-guided: the plain-text user intent for this run.' },
      format: { type: 'string', description: 'run-instruction only: output format requested (markdown|csv|json|txt).' },
      recordsExtracted: { type: 'number', description: 'run-instruction only: number of records in the result file (0 if none).' },
      sourceExploreId: { type: 'string', description: 'run-instruction only: the explore run id this run was grounded in. Omit if the run was ungrounded.' },
    },
    required: ['sessionId', 'command', 'startedAt', 'endedAt'],
  },
  async execute(input): Promise<string> {
    const entry: RunEntry = {
      sessionId: input.sessionId as string,
      command: input.command as string,
      startedAt: input.startedAt as string,
      endedAt: input.endedAt as string,
      appId: (input.appId as string | null | undefined) ?? null,
    }

    if (input.mode !== undefined) entry.mode = input.mode as 'crx' | 'playwright'

    if (input.artifacts !== undefined) {
      entry.artifacts = (typeof input.artifacts === 'string'
        ? JSON.parse(input.artifacts as string)
        : input.artifacts) as Record<string, string>
    }

    const copyIfDefined = (key: string) => {
      if (input[key] !== undefined) entry[key] = input[key]
    }
    copyIfDefined('pagesVisited')
    copyIfDefined('terminationReason')
    copyIfDefined('intent')
    copyIfDefined('format')
    copyIfDefined('recordsExtracted')
    copyIfDefined('sourceExploreId')

    const data = readRuns()
    const existingIndex = data.runs.findIndex(r => r.sessionId === entry.sessionId)
    if (existingIndex >= 0) {
      data.runs[existingIndex] = entry
    } else {
      data.runs.push(entry)
    }
    writeRuns(data)

    return JSON.stringify({ path: RUNS_PATH, total: data.runs.length })
  },
}
