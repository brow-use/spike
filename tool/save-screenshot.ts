import path from 'path'
import fs from 'fs'
import type { Tool, ToolContext } from './tool.js'

export const saveScreenshot: Tool = {
  name: 'save_screenshot',
  description: 'Capture a screenshot of the current page and save it as a PNG to output/exploration/<sessionId>/<name>.png. Returns {absolutePath, relativeToDocs, markdownSnippet}. relativeToDocs is the path a feature doc at output/docs/<sessionId>/*.md should use to reference this image. markdownSnippet is a ready-to-embed Markdown image tag — paste it verbatim into a feature doc to avoid hand-typing the path.',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: 'Exploration session id; one folder per run' },
      name: { type: 'string', description: 'Kebab-case file name without extension' },
      alt: { type: 'string', description: 'Optional alt text for the markdownSnippet. Defaults to a title-cased version of name.' },
    },
    required: ['sessionId', 'name'],
  },
  async execute(input, ctx: ToolContext): Promise<string> {
    const sessionId = input.sessionId as string
    const name = input.name as string
    const alt = (input.alt as string | undefined) ?? name.replace(/-/g, ' ')
    const dir = path.join(ctx.outputDir, 'exploration', sessionId)
    fs.mkdirSync(dir, { recursive: true })
    const filePath = path.join(dir, `${name}.png`)
    const buffer = await ctx.page.screenshot({ type: 'png' })
    fs.writeFileSync(filePath, buffer)
    const relToDocs = path.join('..', '..', 'exploration', sessionId, `${name}.png`)
    const markdownSnippet = `![${alt}](${relToDocs})`
    return JSON.stringify({ absolutePath: filePath, relativeToDocs: relToDocs, markdownSnippet })
  },
}
