import path from 'path'
import fs from 'fs'
import type { Tool, ToolContext } from './tool.js'

interface PageObjectSource {
  stepId?: string
  url?: string
  tab?: string
}

export const writePageObject: Tool = {
  name: 'write_page_object',
  description: 'Write a Playwright Page Object Model (POM) TypeScript file to output/page/. The content should be a complete TypeScript class. Pass sessionId and sources to record provenance: which explore run and which captured steps (including tab panels) the class was generated from. This is written to a sibling output/page/<name>.meta.json and lets the viewer link the page object back to its screenshots, aria trees, and tab panels.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'File name without extension (e.g. login-page)' },
      content: { type: 'string', description: 'Complete TypeScript source code for the page object' },
      sessionId: { type: 'string', description: 'Explore run sessionId this page object was generated from. Required for the viewer to associate the class with that run.' },
      sources: {
        type: 'array',
        description: 'Captured steps this page object was built from. One entry per deduplicated page plus one per tab panel. Each: { stepId, url, tab? }. stepId is the zero-padded index from the aria log (e.g. "0004", or "0004-1" for a tab panel); url is the recorded page url; tab is the panel name when the source is a tab panel.',
        items: { type: 'object' },
      },
    },
    required: ['name', 'content'],
  },
  async execute(input, ctx: ToolContext): Promise<string> {
    const name = input.name as string
    const content = input.content as string
    const sessionId = input.sessionId as string | undefined
    const rawSources = input.sources
    const sources: PageObjectSource[] = Array.isArray(rawSources)
      ? rawSources as PageObjectSource[]
      : typeof rawSources === 'string'
        ? (JSON.parse(rawSources) as PageObjectSource[])
        : []

    const pageDir = path.join(ctx.outputDir, 'page')
    fs.mkdirSync(pageDir, { recursive: true })
    const filePath = path.join(pageDir, `${name}.ts`)
    fs.writeFileSync(filePath, content, 'utf-8')

    if (sessionId) {
      const metaPath = path.join(pageDir, `${name}.meta.json`)
      const meta = { name: `${name}.ts`, sessionId, sources, generatedAt: new Date().toISOString() }
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8')
    }

    return `Page object written to: ${filePath}`
  },
}
