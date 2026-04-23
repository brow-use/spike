import path from 'path'
import fs from 'fs'
import type { Tool, ToolContext } from './tool.js'

type ReasoningKind = 'plan' | 'observation' | 'decision' | 'error'

function isReasoningKind(v: unknown): v is ReasoningKind {
  return v === 'plan' || v === 'observation' || v === 'decision' || v === 'error'
}

export const logReasoning: Tool = {
  name: 'log_reasoning',
  description: 'Append one line of agent reasoning to output/reasoning/<sessionId>.jsonl. Use sparingly at non-obvious decision points: the initial plan, bias deviations, loop-detection skips, back-navigation from leaves, termination observations, and errors. This is an audit trail, not a narrator — do NOT call on every step. Each call appends {t, kind, text} as a single JSON line.',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: 'The current run session id' },
      text: { type: 'string', description: 'Short reasoning text — one or two sentences, end-user-agnostic' },
      kind: {
        type: 'string',
        enum: ['plan', 'observation', 'decision', 'error'],
        description: 'Category of the reasoning. Defaults to "decision".',
      },
    },
    required: ['sessionId', 'text'],
  },
  async execute(input, ctx: ToolContext): Promise<string> {
    const sessionId = input.sessionId as string
    const text = input.text as string
    const kind: ReasoningKind = isReasoningKind(input.kind) ? input.kind : 'decision'

    const dir = path.join(ctx.outputDir, 'reasoning')
    fs.mkdirSync(dir, { recursive: true })
    const filePath = path.join(dir, `${sessionId}.jsonl`)
    const line = JSON.stringify({ t: new Date().toISOString(), kind, text }) + '\n'
    fs.appendFileSync(filePath, line, 'utf-8')

    const linesTotal = fs.readFileSync(filePath, 'utf-8')
      .split('\n')
      .filter(l => l.length > 0)
      .length

    return JSON.stringify({ path: filePath, linesTotal })
  },
}
