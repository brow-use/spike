import path from 'path'
import fs from 'fs'
import type { Tool, ToolContext } from './tool.js'

interface IndexEntry {
  slug: string
  title: string
  summary: string
}

export const writeDocsIndex: Tool = {
  name: 'write_docs_index',
  description: 'Write the README.md index for a session under output/docs/<sessionId>/README.md. Takes session metadata (app name/url/description/sessionId) and an array of feature entries ({slug, title, summary}) and renders a Markdown TOC + the standard "How this was generated" footer. Replaces the manual write_feature_doc(name="README", ...) path where the model had to hand-format the table and footer.',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      appName: { type: 'string' },
      appUrl: { type: 'string' },
      appDescription: { type: 'string' },
      entries: {
        type: 'array',
        description: 'Ordered list of {slug, title, summary} for each feature doc written this run. slug matches the doc filename without .md.',
        items: {
          type: 'object',
          properties: {
            slug: { type: 'string' },
            title: { type: 'string' },
            summary: { type: 'string' },
          },
          required: ['slug', 'title', 'summary'],
        },
      },
      stats: {
        type: 'object',
        description: 'Optional run summary stats to include in the footer — e.g. { pagesVisited: 23, terminationReason: "maxLoopHits" }.',
        properties: {
          pagesVisited: { type: 'number' },
          terminationReason: { type: 'string' },
        },
      },
    },
    required: ['sessionId', 'appName', 'appUrl', 'entries'],
  },
  async execute(input, ctx: ToolContext): Promise<string> {
    const sessionId = input.sessionId as string
    const appName = input.appName as string
    const appUrl = input.appUrl as string
    const appDescription = (input.appDescription as string | undefined) ?? ''
    const rawEntries = input.entries
    const entries: IndexEntry[] = Array.isArray(rawEntries)
      ? rawEntries as IndexEntry[]
      : typeof rawEntries === 'string'
        ? (JSON.parse(rawEntries) as IndexEntry[])
        : []
    const stats = (input.stats as { pagesVisited?: number; terminationReason?: string } | undefined) ?? {}

    const dir = path.join(ctx.outputDir, 'docs', sessionId)
    fs.mkdirSync(dir, { recursive: true })
    const filePath = path.join(dir, 'README.md')

    const lines: string[] = []
    lines.push(`# ${appName} — User Guide`)
    lines.push('')
    lines.push(`**App:** ${appName}`)
    lines.push(`**URL:** ${appUrl}`)
    lines.push(`**Exploration session:** \`${sessionId}\``)
    if (appDescription) {
      lines.push('')
      lines.push(`**What the app is:** ${appDescription}`)
    }
    lines.push('')
    lines.push('This guide was produced from a single automated exploration run. It covers what an end user can do in each area of the app.')
    lines.push('')
    lines.push('## Features')
    lines.push('')
    lines.push('| Feature | What it covers |')
    lines.push('|---|---|')
    for (const e of entries) {
      lines.push(`| [${e.title}](./${e.slug}.md) | ${e.summary} |`)
    }
    lines.push('')
    lines.push('## How this guide was generated')
    lines.push('')
    lines.push(`An automated agent walked the app via the \`brow-use\` plugin for Claude Code, breadth-first across all top-level modules and then deeper into areas matching the app description.`)
    if (stats.pagesVisited != null || stats.terminationReason) {
      lines.push('')
      const parts: string[] = []
      if (stats.pagesVisited != null) parts.push(`Visited ${stats.pagesVisited} pages`)
      if (stats.terminationReason) parts.push(`terminated on ${stats.terminationReason}`)
      lines.push(parts.join(', ') + '.')
    }
    lines.push('')
    lines.push('The full audit trail for this run lives in this repository:')
    lines.push('')
    lines.push(`- **Trace zip** — replay every action with before/after screenshots, DOM snapshots, network and source: \`output/trace/${sessionId}-*.zip\``)
    lines.push(`  Open with: \`npx playwright show-trace output/trace/${sessionId}-*.zip\``)
    lines.push(`- **Aria-tree log** — one JSON line per visited page, including the full accessibility tree the agent saw: \`output/exploration/${sessionId}.jsonl\``)
    lines.push(`- **Screenshots** — images embedded in the feature docs above: \`output/exploration/${sessionId}/\``)
    lines.push('')
    lines.push('To reproduce on your own, run `/bu:explore` followed by `/bu:document` with the brow-use plugin. Each run is scoped under its own `sessionId` so this guide will not be overwritten.')
    lines.push('')

    fs.writeFileSync(filePath, lines.join('\n'), 'utf-8')
    return JSON.stringify({ path: filePath, entries: entries.length })
  },
}
